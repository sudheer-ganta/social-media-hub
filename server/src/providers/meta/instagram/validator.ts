import { ProviderError } from '../../provider.interface';
import { INSTAGRAM_PUBLISH_SCOPE } from './config';
import type { InstagramMediaAsset } from './types';

/**
 * What Instagram will and will not accept, checked before we spend a request on
 * finding out.
 *
 * Pure and provider-local: no HTTP, no database. Same contract as LinkedIn's
 * validator — a post that cannot possibly succeed fails here with a message a
 * member can act on, rather than as an opaque Meta error we would translate.
 */

/** Instagram's own caption ceiling. */
export const INSTAGRAM_MAX_CAPTION_LENGTH = 2200;

/**
 * Instagram's hashtag ceiling. A caption over it is rejected by Meta outright
 * rather than truncated, so it is worth catching here where we can say which
 * ones to remove.
 */
export const INSTAGRAM_MAX_HASHTAGS = 30;

/**
 * **JPEG only.** Meta is explicit: "JPEG is the only image format supported"
 * for feed image containers — no PNG, no GIF, no WEBP, and not the extended
 * JPEG variants (MPO, JPS) either.
 *
 * This is the single biggest behavioural difference from LinkedIn, which takes
 * all three of JPEG, PNG and GIF. It is why the media service takes its
 * allow-list from the provider instead of hardcoding one network's rules.
 */
export const INSTAGRAM_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
]);

/**
 * Meta's documented ceiling for a feed image is 8MB.
 *
 * Enforced by us as well as by them, because the bytes pass through this
 * process' memory on the way to being validated.
 */
export const INSTAGRAM_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * One image per post today.
 *
 * A second image needs Instagram's carousel flow — N child containers, each
 * created with `is_carousel_item`, then a parent container of type CAROUSEL —
 * which is a different sequence of calls, not a longer array on this one. Named
 * so the day it changes there is one place to change.
 */
export const INSTAGRAM_MAX_MEDIA_ITEMS = 1;

/** Meta's ceiling for the `alt_text` field on a container. */
export const INSTAGRAM_MAX_ALT_TEXT_LENGTH = 1000;

/** Account types that may publish. A PERSONAL account cannot use this API. */
export const INSTAGRAM_PUBLISHABLE_ACCOUNT_TYPES: ReadonlySet<string> = new Set([
  'BUSINESS',
  'MEDIA_CREATOR',
  'CREATOR',
]);

/**
 * Counts hashtags the way Instagram does: `#` followed by at least one letter,
 * digit or underscore. A bare `#`, or one inside a URL fragment, is not a tag.
 */
export function countHashtags(caption: string): number {
  return caption.match(/(^|\s)#[\wÀ-ɏЀ-ӿ]+/gu)?.length ?? 0;
}

/**
 * Checks a caption is publishable.
 *
 * Unlike LinkedIn, an empty caption is *allowed* — Instagram is an image-first
 * network and a photo with no words is an ordinary post. What is not allowed is
 * a post with neither caption nor image, and that is checked in
 * {@link validatePost} where both are in view.
 */
export function validateCaption(caption: string | null | undefined): string {
  const text = (caption ?? '').trim();

  if (text.length > INSTAGRAM_MAX_CAPTION_LENGTH) {
    throw new ProviderError(
      `Instagram captions are limited to ${INSTAGRAM_MAX_CAPTION_LENGTH.toLocaleString()} characters. ` +
        `This one is ${text.length.toLocaleString()} — trim ${(
          text.length - INSTAGRAM_MAX_CAPTION_LENGTH
        ).toLocaleString()} and try again.`,
      400,
      'instagram',
    );
  }

  const hashtags = countHashtags(text);
  if (hashtags > INSTAGRAM_MAX_HASHTAGS) {
    throw new ProviderError(
      `Instagram allows ${INSTAGRAM_MAX_HASHTAGS} hashtags per post. ` +
        `This caption has ${hashtags} — remove ${hashtags - INSTAGRAM_MAX_HASHTAGS} and try again.`,
      400,
      'instagram',
    );
  }

  return text;
}

/**
 * Checks attached media is something Instagram will take.
 *
 * The checks run against the bytes the media service downloaded, even though
 * what we send Meta is the URL. That is deliberate and it is the only way to
 * fail fast: Meta fetches the image on its own schedule and reports a format
 * problem as a generic container error minutes later, with no indication that
 * the file was a PNG.
 */
export function validateMedia(
  media: InstagramMediaAsset[] | undefined,
): InstagramMediaAsset[] {
  if (!media || media.length === 0) return [];

  if (media.length > INSTAGRAM_MAX_MEDIA_ITEMS) {
    throw new ProviderError(
      `Instagram posts from FlowPost support ${INSTAGRAM_MAX_MEDIA_ITEMS} image today. ` +
        `This post has ${media.length} — remove the extras and try again.`,
      400,
      'instagram',
    );
  }

  return media.map((asset) => {
    if (asset.kind !== 'image') {
      throw new ProviderError(
        `${asset.kind === 'video' ? 'Videos' : 'That media'} can't be published to Instagram from ` +
          'FlowPost yet. Publish this post with an image instead.',
        400,
        'instagram',
      );
    }

    if (!INSTAGRAM_IMAGE_MIME_TYPES.has(asset.mimeType)) {
      throw new ProviderError(
        `Instagram only accepts JPEG images. This one is ${
          asset.mimeType || 'an unrecognised format'
        } — convert it to JPEG and try again.`,
        400,
        'instagram',
      );
    }

    if (asset.byteLength === 0) {
      throw new ProviderError(
        'That image file is empty. Re-upload it and try again.',
        400,
        'instagram',
      );
    }

    if (asset.byteLength > INSTAGRAM_MAX_IMAGE_BYTES) {
      throw new ProviderError(
        `That image is ${formatMegabytes(asset.byteLength)}, over Instagram's ` +
          `${formatMegabytes(INSTAGRAM_MAX_IMAGE_BYTES)} limit. Compress it and try again.`,
        400,
        'instagram',
      );
    }

    // Meta fetches this URL from its own servers, so it has to be reachable
    // from the public internet. A URL we could download from usually is — but
    // a signed or short-lived one may not be by the time Meta gets to it, and
    // a non-HTTPS one is rejected outright.
    if (!/^https:\/\//i.test(asset.sourceUrl)) {
      throw new ProviderError(
        "Instagram needs the image at a public HTTPS address and this post's " +
          'image is not on one. Re-upload the image and try again.',
        400,
        'instagram',
      );
    }

    const altText = asset.altText?.trim() || null;

    return {
      ...asset,
      altText: altText ? altText.slice(0, INSTAGRAM_MAX_ALT_TEXT_LENGTH) : null,
    };
  });
}

/**
 * A whole post, checked in one call.
 *
 * The image requirement is the rule that has no LinkedIn equivalent: Instagram
 * has no text-only post. There is no endpoint for one — the publishing flow
 * *starts* with a media container — so a caption-only draft cannot be sent at
 * all, and saying so here is far better than letting it fail as a missing
 * `image_url` parameter.
 */
export function validatePost(input: {
  caption: string | null | undefined;
  media?: InstagramMediaAsset[];
}): { caption: string; media: InstagramMediaAsset[] } {
  const caption = validateCaption(input.caption);
  const media = validateMedia(input.media);

  if (media.length === 0) {
    throw new ProviderError(
      'Instagram posts need an image. Add one to this post, or publish it to a ' +
        'network that accepts text on its own.',
      400,
      'instagram',
    );
  }

  return { caption, media };
}

/**
 * Whether a connection is allowed to publish.
 *
 * An empty scope list means "unknown", not "none": connections made before
 * scopes were recorded have nothing stored. Those are given the benefit of the
 * doubt and allowed through to Meta, which is the authority anyway.
 */
export function canPublish(scopes: string[]): boolean {
  if (scopes.length === 0) return true;
  return scopes.includes(INSTAGRAM_PUBLISH_SCOPE);
}

/** "8MB", "2.4MB" — sized for a sentence a member reads, not for precision. */
function formatMegabytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)}MB`;
}

export const instagramValidator = {
  validateCaption,
  validateMedia,
  validatePost,
  canPublish,
  countHashtags,
  INSTAGRAM_MAX_CAPTION_LENGTH,
  INSTAGRAM_MAX_HASHTAGS,
  INSTAGRAM_MAX_IMAGE_BYTES,
  INSTAGRAM_MAX_MEDIA_ITEMS,
  INSTAGRAM_IMAGE_MIME_TYPES,
};
