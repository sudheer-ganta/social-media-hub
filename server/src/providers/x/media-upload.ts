import axios from 'axios';
import { ProviderError } from '../provider.interface';
import type { ProviderMediaAsset } from '../provider.interface';
import { xConfig } from './config';
import { UPLOAD_TIMEOUT_MS, toProviderError } from './http';
import type { XMediaStatusResponse, XMediaUploadResponse } from './types';

/**
 * Getting bytes to X, which is two different problems wearing one endpoint.
 *
 * A photo is a single multipart POST and has been since Sprint 5.1. A video or
 * an animated GIF is not: X refuses them on the simple upload and requires the
 * four-step chunked protocol, on the same `/2/media/upload` path, distinguished
 * by a `command` parameter.
 *
 *     INIT      declare the total size and category  → media_id
 *     APPEND    one segment at a time, in order      → 2xx, no body
 *     FINALIZE  close it                             → maybe processing_info
 *     STATUS    poll until the transcode finishes    → succeeded | failed
 *
 * ─── Why this is not a Buffer ────────────────────────────────────────────────
 *
 * Because a 512MB video is 512MB of heap, and the publish path runs inside the
 * API process that is also serving everyone else. The asset arrives as
 * {@link ProviderMediaAsset.openStream} — a stream over the stored Cloudinary
 * object — and this file reads it into one {@link CHUNK_BYTES} buffer at a
 * time, ships that segment, and lets it go. Peak memory is a chunk, whatever
 * the video weighs. `x-media-upload.test.ts` asserts that property directly
 * rather than trusting the comment.
 *
 * ─── Nothing is silently dropped ─────────────────────────────────────────────
 *
 * Every failure here throws. A post whose video failed to upload must not go
 * out as a text post that happens to say the same words — the member would see
 * a successful publish and a missing video, on a timeline where fixing it means
 * deleting and reposting. The publish never reports success unless the media id
 * came back and FINALIZE succeeded.
 */

/**
 * How much of the file is in memory at once.
 *
 * X's documented per-segment ceiling is 5MB, so this is the largest legal
 * chunk — which is also the fewest requests, and the number of requests is what
 * a 500MB upload's wall clock is made of.
 */
export const CHUNK_BYTES = 5 * 1024 * 1024;

/**
 * How X is told what the upload is for.
 *
 * Not decoration: the category decides which processing pipeline X runs and
 * whether the media can be attached to a post at all. A video uploaded as
 * `tweet_image` is accepted and then unusable.
 */
function mediaCategoryFor(asset: ProviderMediaAsset): string {
  if (asset.kind === 'video') return 'tweet_video';
  if (asset.mimeType === 'image/gif') return 'tweet_gif';
  return 'tweet_image';
}

/**
 * Uploads one asset and returns the id a post references it by.
 *
 * Routes to the simple or the chunked protocol by what the asset actually is —
 * bytes in hand take the one-shot path, a stream takes the chunked one. The
 * caller does not choose; the transport declared on the content type already
 * did, and this reads the consequence.
 */
export async function uploadMedia(
  accessToken: string,
  asset: ProviderMediaAsset,
): Promise<string> {
  if (asset.kind === 'video' || asset.mimeType === 'image/gif') {
    return uploadChunked(accessToken, asset);
  }
  return uploadSimple(accessToken, asset);
}

/**
 * The one-shot upload. Photos only, and unchanged from Sprint 5.1.
 *
 * A 401 or 403 here is translated rather than passed through. The
 * overwhelmingly likely cause is a connection made before `media.write` was
 * requested, and "X media upload failed (HTTP 403)" tells a member nothing they
 * can act on where "reconnect X" tells them exactly what to do.
 */
export async function uploadSimple(
  accessToken: string,
  asset: ProviderMediaAsset,
): Promise<string> {
  if (!asset.data) {
    throw new ProviderError(
      'That image could not be read for upload. Try again in a moment.',
      400,
      'x',
    );
  }

  const form = new FormData();
  // `new Uint8Array(...)` rather than the Buffer itself: a Buffer is a view
  // over a possibly-shared ArrayBuffer, which is not a BlobPart. This copies
  // nothing — it is a second view over the same memory.
  form.append(
    'media',
    new Blob([new Uint8Array(asset.data)], { type: asset.mimeType }),
  );
  form.append('media_category', mediaCategoryFor(asset));

  let response;
  try {
    response = await axios.post<XMediaUploadResponse>(
      xConfig.mediaUploadUrl,
      form,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: UPLOAD_TIMEOUT_MS,
        // The bytes are already bounded by the validator; axios' own default
        // body cap would reject them a second time.
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      },
    );
  } catch (error) {
    throw toUploadError(error, 'media upload');
  }

  return readMediaId(response.data, response.status);
}

/**
 * The chunked upload. Video and GIF.
 *
 * Reads the stream once, forward only, holding at most one segment. The stream
 * is never rewound and never collected, which is why a failure part-way through
 * aborts rather than retries: re-running APPEND would need the bytes again and
 * the only way to have them again is to have kept them.
 */
export async function uploadChunked(
  accessToken: string,
  asset: ProviderMediaAsset,
): Promise<string> {
  if (!asset.openStream) {
    throw new ProviderError(
      'That video could not be read for upload. Try again in a moment.',
      400,
      'x',
    );
  }

  const mediaId = await initUpload(accessToken, asset);

  let segmentIndex = 0;
  let uploaded = 0;
  const stream = await asset.openStream();

  for await (const chunk of chunkStream(stream, CHUNK_BYTES)) {
    await appendChunk(accessToken, mediaId, segmentIndex, chunk, asset.mimeType);
    uploaded += chunk.byteLength;
    segmentIndex += 1;
  }

  if (segmentIndex === 0) {
    throw new ProviderError(
      'That video file is empty. Re-upload it and try again.',
      400,
      'x',
    );
  }

  console.info('[x] chunked upload finished appending', {
    mediaId,
    segments: segmentIndex,
    // The size, not the bytes. Nothing here logs media content.
    uploadedBytes: uploaded,
  });

  await finalizeUpload(accessToken, mediaId);
  await waitForProcessing(accessToken, mediaId);

  return mediaId;
}

/** Step 1 — declare the upload and get the id every later step names. */
async function initUpload(
  accessToken: string,
  asset: ProviderMediaAsset,
): Promise<string> {
  const form = new FormData();
  form.append('command', 'INIT');
  // X sizes its own buffers from this, so it has to be the real length. It
  // comes from Cloudinary's metadata rather than from counting the stream,
  // because counting the stream would mean reading it twice.
  form.append('total_bytes', String(asset.byteLength));
  form.append('media_type', asset.mimeType);
  form.append('media_category', mediaCategoryFor(asset));

  let response;
  try {
    response = await axios.post<XMediaUploadResponse>(
      xConfig.mediaUploadUrl,
      form,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: UPLOAD_TIMEOUT_MS,
      },
    );
  } catch (error) {
    throw toUploadError(error, 'chunked upload INIT');
  }

  return readMediaId(response.data, response.status);
}

/** Step 2 — one segment. Called once per chunk, in order. */
async function appendChunk(
  accessToken: string,
  mediaId: string,
  segmentIndex: number,
  chunk: Buffer,
  mimeType: string,
): Promise<void> {
  const form = new FormData();
  form.append('command', 'APPEND');
  form.append('media_id', mediaId);
  form.append('segment_index', String(segmentIndex));
  form.append('media', new Blob([new Uint8Array(chunk)], { type: mimeType }));

  try {
    await axios.post(xConfig.mediaUploadUrl, form, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: UPLOAD_TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  } catch (error) {
    throw toUploadError(error, `chunked upload APPEND segment ${segmentIndex}`);
  }
}

/** Step 3 — close the upload. X starts transcoding from here. */
async function finalizeUpload(
  accessToken: string,
  mediaId: string,
): Promise<XMediaUploadResponse> {
  const form = new FormData();
  form.append('command', 'FINALIZE');
  form.append('media_id', mediaId);

  try {
    const response = await axios.post<XMediaUploadResponse>(
      xConfig.mediaUploadUrl,
      form,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: UPLOAD_TIMEOUT_MS,
      },
    );
    return response.data;
  } catch (error) {
    throw toUploadError(error, 'chunked upload FINALIZE');
  }
}

/**
 * How long to wait between STATUS checks, in order. ~60s total.
 *
 * X tells us how long to wait in `check_after_secs` and that value is honoured
 * when it arrives; this is the schedule for when it does not, and the ceiling
 * on how long a publish may sit here in any case. Running out is a failure with
 * a reason, never an unbounded loop on a member's publish.
 */
const STATUS_POLL_DELAYS_MS = [
  1_000, 2_000, 3_000, 4_000, 5_000, 5_000, 5_000, 5_000, 5_000, 5_000, 5_000,
  5_000, 5_000,
];

/**
 * The one clock this module reads. Overridable so tests can run the whole
 * poll-until-timeout path without actually sleeping a minute.
 */
export const timing = {
  wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

/**
 * Step 4 — wait for X to finish transcoding.
 *
 * Skipping this is the classic way to get "media not found" from
 * `POST /2/tweets`: FINALIZE returns while the transcode is still running, and
 * a media id that is not `succeeded` cannot be attached yet.
 *
 * A `failed` state throws with X's own reason where it gave one. That reason is
 * the member's problem to fix — an unsupported codec, a corrupt file — so it is
 * the one place a vendor string is worth surfacing, and it is surfaced as part
 * of a sentence rather than as raw JSON.
 */
async function waitForProcessing(
  accessToken: string,
  mediaId: string,
): Promise<void> {
  for (let attempt = 0; attempt < STATUS_POLL_DELAYS_MS.length; attempt++) {
    let data: XMediaStatusResponse;
    try {
      const response = await axios.get<XMediaStatusResponse>(
        xConfig.mediaUploadUrl,
        {
          params: { command: 'STATUS', media_id: mediaId },
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: UPLOAD_TIMEOUT_MS,
        },
      );
      data = response.data;
    } catch (error) {
      throw toUploadError(error, 'chunked upload STATUS');
    }

    const info = data?.data?.processing_info ?? data?.processing_info;

    // No processing_info at all means there is nothing to wait for — a GIF
    // small enough that X handled it inline.
    if (!info) return;
    if (info.state === 'succeeded') return;

    if (info.state === 'failed') {
      const reason = info.error?.message?.trim();
      throw new ProviderError(
        reason
          ? `X couldn't process that video: ${reason}`
          : "X couldn't process that video. Try re-exporting it as an MP4.",
        400,
        'x',
      );
    }

    // X's own advice on when to come back, when it offers one.
    const advisedMs =
      typeof info.check_after_secs === 'number' && info.check_after_secs > 0
        ? info.check_after_secs * 1000
        : STATUS_POLL_DELAYS_MS[attempt];

    await timing.wait(Math.min(advisedMs, 10_000));
  }

  throw new ProviderError(
    'X is still processing that video. Nothing was published — try again in a few minutes.',
    400,
    'x',
  );
}

/**
 * Reads the stream into fixed-size buffers, yielding each one and forgetting it.
 *
 * The whole memory story in one generator. A chunk is assembled from however
 * many pieces the underlying stream happens to emit, handed to the caller, and
 * dropped — `parts` is reset rather than appended to, so nothing accumulates
 * across iterations. Anything that collected these yields into an array would
 * put the file back in memory and undo the point.
 */
export async function* chunkStream(
  stream: NodeJS.ReadableStream,
  chunkBytes: number,
): AsyncGenerator<Buffer> {
  let parts: Buffer[] = [];
  let held = 0;

  for await (const piece of stream) {
    parts.push(Buffer.isBuffer(piece) ? piece : Buffer.from(piece as string));
    held += parts[parts.length - 1].byteLength;

    while (held >= chunkBytes) {
      const joined = Buffer.concat(parts);
      yield joined.subarray(0, chunkBytes);
      const rest = joined.subarray(chunkBytes);
      parts = rest.byteLength > 0 ? [Buffer.from(rest)] : [];
      held = rest.byteLength;
    }
  }

  if (held > 0) yield Buffer.concat(parts);
}

/** The string id, never the numeric one — see the note in `publisher.ts`. */
function readMediaId(data: XMediaUploadResponse, status: number): string {
  const id =
    data?.data?.id?.trim() ||
    data?.data?.media_id_string?.trim() ||
    data?.media_id_string?.trim();

  if (!id) {
    throw new ProviderError(
      'X accepted the media but returned no media id',
      502,
      'x',
      status,
    );
  }

  return id;
}

/**
 * Upload failures, with the one translation worth making.
 *
 * 401 and 403 on an upload almost always mean the connection predates
 * `media.write`, which is a thing the member can fix in thirty seconds if we
 * say so. Everything else goes through the shared mapper.
 */
function toUploadError(error: unknown, step: string): ProviderError {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 401 || status === 403) {
    return new ProviderError(
      'FlowPost needs permission to upload media to X. Reconnect your X ' +
        'account under Integrations, then publish again.',
      400,
      'x',
      status,
    );
  }
  return toProviderError(error, step);
}

export const xMediaUpload = { uploadMedia, uploadSimple, uploadChunked, chunkStream };
