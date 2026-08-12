import { ProviderError } from '../provider.interface';
import { X_PUBLISH_SCOPE } from './config';
import { validateAgainstCapability } from '../media-rules';
import type { ContentTypeCapability } from '../capabilities';
import type { ProviderMediaAsset } from '../provider.interface';

/*
 * ─── One import rule, and it is load-bearing ─────────────────────────────────
 *
 * This file exports the numbers `providers/capabilities.ts` builds X's
 * capability set from, so it must never import that module back. The capability
 * a check needs is *passed in* by the publisher, which is free to look it up
 * because nothing imports a publisher.
 *
 *     capabilities.ts ──▶ validator.ts ──▶ media-rules.ts
 *            └──────────────────────────▶ publisher.ts ──▶ validator.ts
 *
 * A cycle here would not fail loudly. It would leave `X_MAX_TEXT_LENGTH`
 * undefined for whichever module happened to load second, and a caption ceiling
 * of `undefined` compares false against everything.
 */

/**
 * What X will and will not accept, checked before we spend a request on finding
 * out.
 *
 * Pure and provider-local: no HTTP, no database. Same contract as LinkedIn's and
 * Instagram's validators — a post that cannot possibly succeed fails here with a
 * message a member can act on, rather than as an opaque X error we would have to
 * translate.
 */

/**
 * The standard post ceiling.
 *
 * ponytail: counted in Unicode code points, not X's weighted count (which bills
 * CJK and emoji at 2 and URLs at a flat 23). The two agree for ordinary Latin
 * text, and the weighted count only ever counts *higher* — so this can pass a
 * post X rejects for length, never the reverse. Port twitter-text's weighting if
 * that rejection ever shows up in practice.
 *
 * Also deliberately not 25,000: that ceiling belongs to X Premium accounts, and
 * assuming it for everyone would replace a clear local error with a remote one.
 */
export const X_MAX_TEXT_LENGTH = 280;

/**
 * How many images one post may carry.
 *
 * X's own limit, and it is not a FlowPost ceiling that could be raised later:
 * a post takes up to four photos, or one video, or one GIF, and mixing them is
 * not allowed either.
 */
export const X_MAX_MEDIA_ITEMS = 4;

/**
 * What the upload endpoint accepts for a photo.
 *
 * Wider than Instagram's JPEG-only and wider than LinkedIn's, which is why this
 * is stated per provider — an image the media service would transcode for Meta
 * is uploaded to X untouched.
 */
export const X_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/** X's documented ceiling for a photo upload. */
export const X_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * An animated GIF, which X treats as its own thing rather than as a photo.
 *
 * Not a separate media *kind* — it arrives as `kind: 'image'` with this MIME
 * type, exactly as it always has. What makes it different is stated where it
 * matters and nowhere else: a bigger ceiling ({@link X_MAX_GIF_BYTES}), an
 * upload category of its own, and a rule that it cannot share a post with
 * anything.
 */
export const X_GIF_MIME_TYPES = ['image/gif'] as const;

/** X's documented ceiling for an animated GIF. Three times the photo ceiling. */
export const X_MAX_GIF_BYTES = 15 * 1024 * 1024;

/** What X's chunked upload accepts for video. */
export const X_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;

/**
 * X's documented ceiling for a video upload.
 *
 * Never held in memory — video takes the chunked transport, which streams the
 * asset from Cloudinary through APPEND one chunk at a time. See
 * `capabilities.ts` and `x/media-upload.ts`.
 */
export const X_MAX_VIDEO_BYTES = 512 * 1024 * 1024;

/** X's documented video duration window for a standard post. */
export const X_MIN_VIDEO_DURATION_MS = 500;
export const X_MAX_VIDEO_DURATION_MS = 140_000;

/**
 * True when a connection's *granted* scopes allow publishing.
 *
 * A member can decline a permission on the consent screen and still complete the
 * connection, producing an account that looks healthy and cannot post.
 */
export function canPublish(scopes: string[]): boolean {
  return scopes.includes(X_PUBLISH_SCOPE);
}

/** Counts the way the ceiling above is defined — code points, not UTF-16 units. */
export function countCharacters(text: string): number {
  return [...text].length;
}

/**
 * Checks a post is publishable and returns the text that will be sent.
 *
 * Throws {@link ProviderError} with status 400 and no `upstreamStatus`, which is
 * how the publish service recognises a validation failure it should surface
 * verbatim and leave the post untouched.
 */
export function validatePost(input: {
  caption: string;
  media?: ProviderMediaAsset[];
  /** X's rules for the format being published. Resolved by the publisher. */
  capability?: ContentTypeCapability;
}): { text: string; media: ProviderMediaAsset[] } {
  const text = input.caption.trim();
  const media = validateMedia(input.media, input.capability);

  if (!text && media.length === 0) {
    throw new ProviderError(
      'An X post needs some text or an image.',
      400,
      'x',
    );
  }

  const length = countCharacters(text);
  if (length > X_MAX_TEXT_LENGTH) {
    throw new ProviderError(
      `This post is ${length} characters. X allows ${X_MAX_TEXT_LENGTH} — ` +
        `trim ${length - X_MAX_TEXT_LENGTH}.`,
      400,
      'x',
    );
  }

  return { text, media };
}

/**
 * Checks attached media is something X will take.
 *
 * Runs against the bytes the media service downloaded, which for X are also the
 * bytes that get uploaded — unlike Meta, X does not fetch from a URL. So this is
 * checking the exact file that will be sent, and a rejection here costs the
 * member nothing but the time it took to say so.
 *
 * Anything over the ceiling is refused rather than trimmed to the first four.
 * Publishing a subset of what someone attached, to a feed where fixing it means
 * deleting the post, is the outcome this whole layer exists to prevent.
 */
export function validateMedia(
  media: ProviderMediaAsset[] | undefined,
  capability?: ContentTypeCapability,
): ProviderMediaAsset[] {
  if (!media || media.length === 0) return [];

  // The count rule that is true of *every* X format, checked first so an
  // oversized post fails the same way whether or not a content type was named.
  if (media.length > X_MAX_MEDIA_ITEMS) {
    throw new ProviderError(
      `An X post holds ${X_MAX_MEDIA_ITEMS} images. ` +
        `This post has ${media.length} — remove ${media.length - X_MAX_MEDIA_ITEMS} and try again.`,
      400,
      'x',
    );
  }

  // Format, size, duration and the GIF-cannot-share rule, all read from the
  // capability rather than restated here — see `providers/media-rules.ts`.
  //
  // Absent means a caller that predates content types. It gets the checks that
  // do not depend on which format was chosen, which is the same set the
  // hand-written version of this function enforced.
  if (capability) {
    validateAgainstCapability(capability, media, 'x', 'X');
    return media;
  }

  for (const asset of media) {
    if (asset.kind !== 'image') {
      throw new ProviderError(
        'Choose a format before publishing video to X.',
        400,
        'x',
      );
    }
    if (!X_IMAGE_MIME_TYPES.has(asset.mimeType)) {
      throw new ProviderError(
        `X does not accept ${asset.mimeType || 'that image format'}. ` +
          'Use a JPEG, PNG, WEBP or GIF and try again.',
        400,
        'x',
      );
    }
    if (asset.byteLength === 0) {
      throw new ProviderError(
        'That image file is empty. Re-upload it and try again.',
        400,
        'x',
      );
    }
    if (asset.byteLength > X_MAX_IMAGE_BYTES) {
      throw new ProviderError(
        `That image is ${formatMegabytes(asset.byteLength)}, over X's ` +
          `${formatMegabytes(X_MAX_IMAGE_BYTES)} limit. Compress it and try again.`,
        400,
        'x',
      );
    }
  }

  return media;
}

/** "5MB", "2.4MB" — sized for a sentence a member reads, not for precision. */
function formatMegabytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)}MB`;
}
