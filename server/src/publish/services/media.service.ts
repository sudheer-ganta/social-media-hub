import { activeProvider } from '../../ai/providers';
import { generateAltText } from '../../ai/generators/alt-text.generator';
import { fetchImageBytes, ImageFetchError } from '../../ai/vision/image-source';
import { env } from '../../config/env';
import {
  LINKEDIN_IMAGE_MIME_TYPES,
  LINKEDIN_MAX_IMAGE_BYTES,
} from '../../providers/linkedin/validator';
import type { ProviderMediaAsset } from '../../providers';
import type { Post } from '../../generated/prisma/client';

/**
 * Turning a draft into the media that goes out with it.
 *
 * This is the seam between *our* storage and *a network's* upload. Providers
 * receive bytes; deciding which bytes, fetching them safely, and describing
 * them for a screen reader all happen here, once, for every network.
 *
 * ─── Why the provider does not take a URL ────────────────────────────────────
 * `post.image_url` is a member-supplied address, and fetching one of those is a
 * server-side request forgery primitive. The backend has exactly one vetted
 * fetcher for it — `ai/vision/image-source.ts`, which pins DNS results to
 * public addresses at the socket level — and routing every provider through
 * this service is what keeps that one implementation the only one.
 *
 * ─── Today's shape, and tomorrow's ───────────────────────────────────────────
 * A post has a single `image_url` column, so this returns an array of zero or
 * one. The array is not premature: it is the shape the provider interface and
 * `providers/linkedin/media.ts` already speak, so the day `posts` grows a
 * `media` relation the change is {@link resolvePostMedia} reading a different
 * column — not a new argument threaded through four layers.
 */

/**
 * How long the whole media step may take before we give up on the publish.
 *
 * Generous, because it covers a download the member is waiting on. Alt text is
 * *not* under this budget — it has its own, below, because a slow model must
 * never be the reason an image fails to publish.
 */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * The alt-text budget.
 *
 * Short on purpose. This is an enhancement running inline with a publish the
 * member is watching; past a few seconds the accessible thing to do is publish
 * the image without a description rather than keep them waiting for one.
 */
const ALT_TEXT_TIMEOUT_MS = 8_000;

/** Raised when attached media cannot be prepared. Always fails the publish. */
export class MediaResolutionError extends Error {
  constructor(
    message: string,
    /** For the log. May quote a URL or a vendor message. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'MediaResolutionError';
  }
}

/**
 * Resolves every piece of media attached to a post.
 *
 * Returns an empty array for a post with no media — the normal case, and the
 * one that must cost nothing.
 *
 * Throws {@link MediaResolutionError} when media *is* attached and cannot be
 * prepared. That is deliberate, and it is the one judgement call in this file:
 * a member who attached an image and gets a text-only post has been silently
 * given something they did not ask for, on a feed they cannot easily correct.
 * Failing with a reason they can act on is the better answer.
 */
export async function resolvePostMedia(
  post: Post,
  options: { caption?: string } = {},
): Promise<ProviderMediaAsset[]> {
  const imageUrl = post.image_url?.trim();
  if (!imageUrl) return [];

  const asset = await resolveImage(imageUrl, options.caption);
  return [asset];
}

/** Downloads one image, measures it, and describes it. */
async function resolveImage(
  url: string,
  caption?: string,
): Promise<ProviderMediaAsset> {
  let fetched: { mimeType: string; buffer: Buffer };

  try {
    fetched = await download(url);
  } catch (error) {
    if (!(error instanceof ImageFetchError) || error.reason !== 'format') {
      throw toMediaError(error);
    }

    // The format is wrong for this network, but the image itself is fine. If
    // the host can hand us different bytes, that is a far better answer than
    // telling someone their perfectly good photo is unpublishable — the app
    // accepted the upload, so making it work is our problem, not theirs.
    const converted = toJpegDeliveryUrl(url);
    if (!converted) throw toMediaError(error);

    console.info('[publish] converting image to a format LinkedIn accepts', {
      detail: error.detail,
    });

    try {
      fetched = await download(converted);
    } catch (retryError) {
      throw toMediaError(retryError);
    }
  }

  const { mimeType, buffer } = fetched;

  const { width, height } = probeImageSize(buffer, mimeType);

  return {
    kind: 'image',
    mimeType,
    data: buffer,
    byteLength: buffer.byteLength,
    width,
    height,
    altText: await describeImage(buffer, mimeType, caption),
  };
}

/**
 * One guarded download, against the target network's rules.
 *
 * The allow-list is the *network's*, passed down rather than assumed: the AI
 * module happily reads webp and heic, and LinkedIn accepts neither.
 */
function download(url: string) {
  return withTimeout(
    fetchImageBytes(url, {
      allowedMimeTypes: LINKEDIN_IMAGE_MIME_TYPES,
      maxBytes: LINKEDIN_MAX_IMAGE_BYTES,
    }),
    FETCH_TIMEOUT_MS,
    'image download',
  );
}

/** ImageFetchError messages are already written for a member; ours are not. */
function toMediaError(error: unknown): MediaResolutionError {
  return new MediaResolutionError(
    error instanceof ImageFetchError
      ? error.message
      : "That post's image could not be downloaded. Check the link and try again.",
    error instanceof ImageFetchError
      ? error.detail
      : error instanceof Error
        ? error.message
        : String(error),
  );
}

/**
 * Rewrites a Cloudinary delivery URL to ask for JPEG.
 *
 * Every image in this app is uploaded to Cloudinary, and the uploader accepts
 * WEBP — which LinkedIn does not take. Cloudinary will transcode on delivery if
 * asked, so the fix is a URL parameter rather than a decoder in this process:
 *
 *   …/image/upload/v123/photo.webp  →  …/image/upload/f_jpg/v123/photo.webp
 *
 * `f_jpg` and not `f_auto`: auto negotiates against the `Accept` header, and we
 * send `image/*`, so it could hand back the very webp we are trying to escape.
 *
 * Returns null when the URL is not a Cloudinary delivery URL, or already
 * carries a format directive someone chose deliberately. Null means "no second
 * attempt is possible" and the original failure stands.
 */
export function toJpegDeliveryUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!/(^|\.)cloudinary\.com$/i.test(parsed.hostname)) return null;

  const marker = '/image/upload/';
  const at = parsed.pathname.indexOf(marker);
  if (at === -1) return null;

  const transformations = parsed.pathname.slice(at + marker.length);
  // Someone already asked for a specific format. Overriding it would be us
  // second-guessing an explicit choice, and we would still not know better.
  if (/(^|\/)f_[^/]+/.test(transformations)) return null;

  parsed.pathname = `${parsed.pathname.slice(0, at + marker.length)}f_jpg/${transformations}`;
  return parsed.toString();
}

/**
 * Asks the vision model what the image shows. Never throws, never blocks long.
 *
 * Returns null on any failure or timeout, which publishes the image with no
 * `altText` attribute — the same outcome as before this existed.
 */
async function describeImage(
  buffer: Buffer,
  mimeType: string,
  caption?: string,
): Promise<string | null> {
  try {
    return await withTimeout(
      generateAltText({
        image: {
          mimeType,
          data: buffer.toString('base64'),
          sizeBytes: buffer.byteLength,
        },
        provider: activeProvider(env.AI_PROVIDER),
        caption,
      }),
      ALT_TEXT_TIMEOUT_MS,
      'alt text',
    );
  } catch {
    // generateAltText already swallows its own failures; this catches only the
    // timeout. Either way the answer is the same and it is not worth a second
    // log line saying so.
    return null;
  }
}

/**
 * Reads an image's pixel dimensions out of its header.
 *
 * Deliberately a header parse rather than a decode. LinkedIn's only documented
 * image limit is a pixel count, and checking it needs width and height — not
 * the picture. Decoding a 30-megapixel JPEG to learn two integers would cost
 * more memory than the upload itself and pull in a native dependency for it.
 *
 * Returns nulls when the header is not one of the three shapes below or is
 * truncated. That is a real answer, not a failure: the validator treats unknown
 * dimensions as "let LinkedIn decide", because our probe failing is not
 * evidence the member's image is wrong.
 */
export function probeImageSize(
  buffer: Buffer,
  mimeType: string,
): { width: number | null; height: number | null } {
  try {
    if (mimeType === 'image/png') return probePng(buffer);
    if (mimeType === 'image/gif') return probeGif(buffer);
    if (mimeType === 'image/jpeg') return probeJpeg(buffer);
  } catch {
    // A malformed or truncated header. Unknown, not invalid.
  }
  return { width: null, height: null };
}

/** PNG: an 8-byte signature, then an IHDR chunk whose payload starts at 16. */
function probePng(buffer: Buffer): { width: number | null; height: number | null } {
  if (buffer.length < 24) return { width: null, height: null };
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') {
    return { width: null, height: null };
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

/** GIF: `GIF87a`/`GIF89a`, then the logical screen size as two LE shorts. */
function probeGif(buffer: Buffer): { width: number | null; height: number | null } {
  if (buffer.length < 10) return { width: null, height: null };
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  };
}

/**
 * JPEG: walk the marker segments to the frame header.
 *
 * The dimensions live in an SOFn marker, which is not at a fixed offset —
 * EXIF, ICC profiles and thumbnails all sit in front of it. So this skips
 * segment by segment, honouring each one's declared length, and reads the first
 * start-of-frame it reaches. The excluded markers are the ones that share the
 * 0xC0–0xCF range without being frame headers.
 */
function probeJpeg(buffer: Buffer): { width: number | null; height: number | null } {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) {
    return { width: null, height: null };
  }

  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      // Not aligned on a marker. Rather than guess, give up — an unknown
      // dimension is handled, a wrong one is not.
      return { width: null, height: null };
    }

    const marker = buffer[offset + 1];

    // Standalone markers: no length, no payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    // Start of scan — image data begins and there is no frame header ahead.
    if (marker === 0xda) return { width: null, height: null };

    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return { width: null, height: null };

    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 && // define Huffman table
      marker !== 0xc8 && // JPEG extension
      marker !== 0xcc; // define arithmetic coding conditioning

    if (isStartOfFrame) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }

  return { width: null, height: null };
}

/** Races a promise against a deadline. Rejects with a named timeout. */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export const mediaService = {
  resolvePostMedia,
  probeImageSize,
  toJpegDeliveryUrl,
};
