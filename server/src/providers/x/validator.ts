import { ProviderError } from '../provider.interface';
import { X_PUBLISH_SCOPE } from './config';
import type { ProviderMediaAsset } from '../provider.interface';

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
}): { text: string; media: ProviderMediaAsset[] } {
  const text = input.caption.trim();
  const media = validateMedia(input.media);

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
): ProviderMediaAsset[] {
  if (!media || media.length === 0) return [];

  if (media.length > X_MAX_MEDIA_ITEMS) {
    throw new ProviderError(
      `An X post holds ${X_MAX_MEDIA_ITEMS} images. ` +
        `This post has ${media.length} — remove ${media.length - X_MAX_MEDIA_ITEMS} and try again.`,
      400,
      'x',
    );
  }

  for (const asset of media) {
    if (asset.kind !== 'image') {
      throw new ProviderError(
        `${asset.kind === 'video' ? 'Videos' : 'That media'} can't be published to X from ` +
          'FlowPost yet. Publish this post with images instead.',
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
