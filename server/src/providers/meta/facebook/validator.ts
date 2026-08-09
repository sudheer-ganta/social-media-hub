import { ProviderError } from '../../provider.interface';
import { FACEBOOK_PUBLISH_SCOPE } from './config';
import type { FacebookMediaAsset } from './types';

/**
 * What a Facebook Page will and will not accept, checked before we spend a
 * request on finding out.
 *
 * Pure and provider-local: no HTTP, no database. Same contract as the LinkedIn
 * and Instagram validators — a post that cannot possibly succeed fails here
 * with a message a member can act on, rather than as an opaque Meta error we
 * would have to translate.
 */

/**
 * Facebook's own ceiling for a Page post's message. Absurdly generous compared
 * with every other network, and worth checking anyway: a caption that exceeds
 * it is rejected outright rather than truncated.
 */
export const FACEBOOK_MAX_CAPTION_LENGTH = 63_206;

/**
 * JPEG, PNG and GIF — the same set LinkedIn takes, and a wider one than
 * Instagram's JPEG-only rule.
 *
 * WEBP is deliberately absent even though Facebook's *website* renders it: the
 * `/photos` edge is unreliable with it, and leaving it out means a stored WEBP
 * goes through the media service's existing Cloudinary `f_jpg` transcode
 * instead — a delivery transformation that leaves the uploaded original
 * untouched. That path already exists for LinkedIn and Instagram; this reuses
 * it rather than adding a Facebook-shaped exception.
 */
export const FACEBOOK_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
]);

/**
 * Meta's documented ceiling for a photo is 4MB.
 *
 * Enforced by us as well as by them, because the bytes pass through this
 * process' memory on the way to being validated. Note this is *stricter* than
 * LinkedIn's 10MB: the same image can be publishable to one network and not the
 * other, which is exactly why `Provider.mediaRequirements` is per-provider
 * rather than a constant in the media service.
 */
export const FACEBOOK_MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * One image per post today.
 *
 * A second image needs Facebook's unpublished-photo flow — each photo POSTed to
 * `/{page-id}/photos` with `published=false`, then their ids passed to
 * `/{page-id}/feed` as `attached_media` — which is a different sequence of
 * calls, not a longer array on this one. Named so the day it changes there is
 * one place to change.
 */
export const FACEBOOK_MAX_MEDIA_ITEMS = 1;

/**
 * Checks a caption is publishable.
 *
 * An empty caption is allowed *when there is an image*, and the two are checked
 * together in {@link validatePost}. Unlike Instagram, Facebook does support a
 * genuine text-only post — that is the whole reason this provider has two
 * publishing endpoints rather than one.
 */
export function validateCaption(caption: string | null | undefined): string {
  const text = (caption ?? '').trim();

  if (text.length > FACEBOOK_MAX_CAPTION_LENGTH) {
    throw new ProviderError(
      `Facebook posts are limited to ${FACEBOOK_MAX_CAPTION_LENGTH.toLocaleString()} characters. ` +
        `This one is ${text.length.toLocaleString()} — trim ${(
          text.length - FACEBOOK_MAX_CAPTION_LENGTH
        ).toLocaleString()} and try again.`,
      400,
      'facebook',
    );
  }

  return text;
}

/**
 * Checks attached media is something a Facebook Page will take.
 *
 * The checks run against the bytes the media service downloaded, even though
 * what we send Meta is the URL. That is deliberate and it is the only way to
 * fail fast: Meta fetches the image on its own schedule and reports a format or
 * size problem as a generic edge error, with no indication of which file was at
 * fault.
 */
export function validateMedia(
  media: FacebookMediaAsset[] | undefined,
): FacebookMediaAsset[] {
  if (!media || media.length === 0) return [];

  if (media.length > FACEBOOK_MAX_MEDIA_ITEMS) {
    throw new ProviderError(
      `Facebook posts from FlowPost support ${FACEBOOK_MAX_MEDIA_ITEMS} image today. ` +
        `This post has ${media.length} — remove the extras and try again.`,
      400,
      'facebook',
    );
  }

  return media.map((asset) => {
    if (asset.kind !== 'image') {
      throw new ProviderError(
        `${asset.kind === 'video' ? 'Videos' : 'That media'} can't be published to Facebook from ` +
          'FlowPost yet. Publish this post with an image instead.',
        400,
        'facebook',
      );
    }

    if (!FACEBOOK_IMAGE_MIME_TYPES.has(asset.mimeType)) {
      throw new ProviderError(
        `Facebook accepts JPG, PNG and GIF images. This one is ${
          asset.mimeType || 'an unrecognised format'
        } — convert it and try again.`,
        400,
        'facebook',
      );
    }

    if (asset.byteLength === 0) {
      throw new ProviderError(
        'That image file is empty. Re-upload it and try again.',
        400,
        'facebook',
      );
    }

    if (asset.byteLength > FACEBOOK_MAX_IMAGE_BYTES) {
      throw new ProviderError(
        `That image is ${formatMegabytes(asset.byteLength)}, over Facebook's ` +
          `${formatMegabytes(FACEBOOK_MAX_IMAGE_BYTES)} limit. Compress it and try again.`,
        400,
        'facebook',
      );
    }

    // Meta fetches this URL from its own servers, so it has to be reachable
    // from the public internet, and `/photos` rejects a non-HTTPS address
    // outright.
    if (!/^https:\/\//i.test(asset.sourceUrl)) {
      throw new ProviderError(
        "Facebook needs the image at a public HTTPS address and this post's " +
          'image is not on one. Re-upload the image and try again.',
        400,
        'facebook',
      );
    }

    return asset;
  });
}

/**
 * A whole post, checked in one call.
 *
 * The one rule that spans both halves: a post needs *something* to say. A draft
 * with neither caption nor image has nothing to publish, and `/feed` would
 * reject it as a missing `message` parameter — a worse error than this one.
 */
export function validatePost(input: {
  caption: string | null | undefined;
  media?: FacebookMediaAsset[];
}): { caption: string; media: FacebookMediaAsset[] } {
  const caption = validateCaption(input.caption);
  const media = validateMedia(input.media);

  if (caption.length === 0 && media.length === 0) {
    throw new ProviderError(
      'This post has no caption and no image, so there is nothing to publish to ' +
        'Facebook. Add some text or an image and try again.',
      400,
      'facebook',
    );
  }

  return { caption, media };
}

/**
 * Whether a connection is allowed to publish.
 *
 * An empty scope list means "unknown", not "none": Facebook does not return the
 * granted permissions with the token, and the follow-up `/me/permissions` read
 * is best-effort (see `token.ts`). Those connections are given the benefit of
 * the doubt and allowed through to Meta, which is the authority anyway.
 */
export function canPublish(scopes: string[]): boolean {
  if (scopes.length === 0) return true;
  return scopes.includes(FACEBOOK_PUBLISH_SCOPE);
}

/** "4MB", "2.4MB" — sized for a sentence a member reads, not for precision. */
function formatMegabytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)}MB`;
}

export const facebookValidator = {
  validateCaption,
  validateMedia,
  validatePost,
  canPublish,
  FACEBOOK_MAX_CAPTION_LENGTH,
  FACEBOOK_MAX_IMAGE_BYTES,
  FACEBOOK_MAX_MEDIA_ITEMS,
  FACEBOOK_IMAGE_MIME_TYPES,
};
