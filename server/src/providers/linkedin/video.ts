import axios from 'axios';
import { ProviderError } from '../provider.interface';
import type { ProviderMediaAsset } from '../provider.interface';
import { linkedinConfig } from './config';
import { toProviderError } from './http';
import type { LinkedInUploadedMedia } from './types';

/**
 * Getting a video to LinkedIn.
 *
 * Its own module rather than a branch in `media.ts`, because it is not the same
 * protocol wearing a different content type — it is a different protocol:
 *
 *     POST /rest/videos?action=initializeUpload  → video urn + N upload slots
 *     PUT  {slot.uploadUrl}  «that slot's bytes» → an ETag per slot
 *     POST /rest/videos?action=finalizeUpload    → the urn becomes usable
 *
 * The image flow registers one slot and PUTs one body. This one is handed a
 * *list* of byte ranges and has to fill each with exactly the bytes LinkedIn
 * asked for, then hand back every ETag in order. Finalizing with a part missing
 * or out of order fails, and a video URN that was never finalized cannot be
 * attached to a post.
 *
 * ─── Why it streams ──────────────────────────────────────────────────────────
 *
 * A 500MB Buffer is not something the API process can hold while it is also
 * serving everyone else. The asset arrives as
 * {@link ProviderMediaAsset.openStream} — a stream over the stored Cloudinary
 * object — and this reads it forward once, holding one part at a time.
 * `linkedin-video.test.ts` asserts that peak residency rather than trusting
 * this paragraph.
 *
 * Forward once is also why nothing here retries a failed PUT: replaying a part
 * needs its bytes again, and having them again means having kept them.
 */

/** Where LinkedIn's video upload lives. Same host and version as `/rest/images`. */
const VIDEOS_URL = `${linkedinConfig.imagesUrl.replace(/\/images$/, '')}/videos`;

/** One slot LinkedIn wants filled, as it describes it. */
interface UploadInstruction {
  uploadUrl: string;
  firstByte: number;
  lastByte: number;
}

interface InitializeResponse {
  value?: {
    video?: string;
    uploadToken?: string;
    uploadInstructions?: UploadInstruction[];
  };
}

/**
 * Uploads one video and returns the URN a post attaches it by.
 *
 * Throws {@link ProviderError} on any failure. A failure means nothing usable
 * was created and the caller must not publish a post referencing a URN it did
 * not receive — the same contract `media.ts` holds for images.
 */
export async function uploadVideo(input: {
  accessToken: string;
  ownerUrn: string;
  asset: ProviderMediaAsset;
}): Promise<LinkedInUploadedMedia> {
  const { accessToken, ownerUrn, asset } = input;

  if (!asset.openStream) {
    throw new ProviderError(
      'That video could not be read for upload. Try again in a moment.',
      400,
      'linkedin',
    );
  }

  if (asset.byteLength <= 0) {
    // LinkedIn sizes the upload slots from this number, so a wrong one produces
    // slots that cannot be filled. Better to say so than to fail mid-PUT.
    throw new ProviderError(
      'That video file is empty. Re-upload it and try again.',
      400,
      'linkedin',
    );
  }

  const initialized = await initializeUpload(
    accessToken,
    ownerUrn,
    asset.byteLength,
  );

  const partIds: string[] = [];
  const reader = new StreamReader(await asset.openStream());

  for (const [index, instruction] of initialized.instructions.entries()) {
    const size = instruction.lastByte - instruction.firstByte + 1;
    const part = await reader.read(size);

    if (part.byteLength === 0) {
      throw new ProviderError(
        'That video ended sooner than its recorded size. Re-upload it and try again.',
        400,
        'linkedin',
      );
    }

    partIds.push(
      await putPart(accessToken, instruction.uploadUrl, part, asset.mimeType, index),
    );
  }

  await finalizeUpload(accessToken, {
    video: initialized.urn,
    uploadToken: initialized.uploadToken,
    uploadedPartIds: partIds,
  });

  console.info('[linkedin] video upload finished', {
    parts: partIds.length,
    // The size, not the bytes. Nothing here logs media content.
    bytes: asset.byteLength,
  });

  return {
    kind: 'video',
    urn: initialized.urn,
    altText: asset.altText,
    // Video lives on the versioned surface only. There is no legacy `/v2/assets`
    // equivalent this integration uses, so a post carrying video is always a
    // `/rest/posts` post.
    endpoint: 'images',
  };
}

/** Step 1 — declare the file and collect the slots LinkedIn wants filled. */
async function initializeUpload(
  accessToken: string,
  ownerUrn: string,
  fileSizeBytes: number,
): Promise<{ urn: string; uploadToken: string; instructions: UploadInstruction[] }> {
  let response;
  try {
    response = await axios.post<InitializeResponse>(
      `${VIDEOS_URL}?action=initializeUpload`,
      {
        initializeUploadRequest: {
          owner: ownerUrn,
          fileSizeBytes,
          // Neither is something FlowPost produces. Asking for upload slots we
          // would not fill is how a finalize ends up short a part.
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      },
      { headers: videoHeaders(accessToken) },
    );
  } catch (error) {
    throw toProviderError(error, 'video initializeUpload');
  }

  const value = response.data?.value;
  const urn = value?.video?.trim();
  const instructions = value?.uploadInstructions ?? [];

  if (!urn || instructions.length === 0) {
    throw new ProviderError(
      'LinkedIn accepted the video but returned no upload slots',
      502,
      'linkedin',
      response.status,
    );
  }

  return {
    urn,
    // Documented as always present and observed empty on single-part uploads.
    // Empty is a real value LinkedIn expects echoed back, not a missing one.
    uploadToken: value?.uploadToken ?? '',
    instructions,
  };
}

/**
 * Step 2 — one part, and the ETag that proves it landed.
 *
 * The ETag is not optional bookkeeping: `finalizeUpload` is rejected without
 * every part's id, in order, so a response that carries no ETag header is a
 * failed upload however successful its status code looked.
 */
async function putPart(
  accessToken: string,
  uploadUrl: string,
  part: Buffer,
  mimeType: string,
  index: number,
): Promise<string> {
  let response;
  try {
    response = await axios.put(uploadUrl, part, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mimeType,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  } catch (error) {
    throw toProviderError(error, `video upload part ${index}`);
  }

  const etag =
    response.headers?.etag ?? response.headers?.ETag ?? response.headers?.['etag'];

  if (typeof etag !== 'string' || !etag.trim()) {
    throw new ProviderError(
      `LinkedIn returned no ETag for video part ${index}`,
      502,
      'linkedin',
      response.status,
    );
  }

  // LinkedIn quotes its ETags and rejects the quoted form on finalize.
  return etag.trim().replace(/^"|"$/g, '');
}

/** Step 3 — the URN becomes attachable. */
async function finalizeUpload(
  accessToken: string,
  request: { video: string; uploadToken: string; uploadedPartIds: string[] },
): Promise<void> {
  try {
    await axios.post(
      `${VIDEOS_URL}?action=finalizeUpload`,
      { finalizeUploadRequest: request },
      { headers: videoHeaders(accessToken) },
    );
  } catch (error) {
    throw toProviderError(error, 'video finalizeUpload');
  }
}

function videoHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'LinkedIn-Version': linkedinConfig.apiVersion,
    'X-Restli-Protocol-Version': linkedinConfig.restliVersion,
  };
}

/**
 * Reads an exact number of bytes at a time from a stream, forward only.
 *
 * LinkedIn dictates the part sizes and they do not line up with whatever the
 * underlying stream happens to emit, so something has to bridge the two. This
 * is that something, and its whole design constraint is that it must never
 * accumulate: `pending` holds only what has been read past the current part's
 * boundary, which is at most one source chunk.
 *
 * Exported for the memory test, which drives it with a stream far larger than
 * any part and asserts peak residency stays at part size.
 */
export class StreamReader {
  private iterator: AsyncIterator<unknown>;
  private pending: Buffer = Buffer.alloc(0);
  private done = false;

  constructor(stream: NodeJS.ReadableStream) {
    this.iterator = stream[Symbol.asyncIterator]();
  }

  /** The next `size` bytes, or fewer at the end of the stream. */
  async read(size: number): Promise<Buffer> {
    while (this.pending.byteLength < size && !this.done) {
      const next = await this.iterator.next();
      if (next.done) {
        this.done = true;
        break;
      }
      const piece = Buffer.isBuffer(next.value)
        ? next.value
        : Buffer.from(next.value as string);
      this.pending =
        this.pending.byteLength === 0
          ? piece
          : Buffer.concat([this.pending, piece]);
    }

    const taken = this.pending.subarray(0, size);
    // `Buffer.from` rather than keeping the subarray: a subarray is a view over
    // the parent, so holding one would keep the whole concatenated buffer alive
    // and quietly defeat the point of reading in parts.
    this.pending = Buffer.from(this.pending.subarray(size));
    return Buffer.from(taken);
  }
}

export const linkedinVideo = { uploadVideo, StreamReader };
