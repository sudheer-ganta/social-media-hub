import { ProviderError } from '../provider.interface';
import { validateAgainstCapability } from '../media-rules';
import type { ContentTypeCapability } from '../capabilities';
import type { LinkedInMediaAsset, LinkedInMediaKind } from './types';

/**
 * What LinkedIn will and will not accept, checked before we spend a request on
 * finding out.
 *
 * Pure and provider-local: no HTTP, no database. The point is that a post which
 * cannot possibly succeed fails here — with a message a member can act on —
 * rather than as a 422 from LinkedIn that we would then have to translate.
 *
 * ─── One import rule ─────────────────────────────────────────────────────────
 *
 * This file exports the numbers `providers/capabilities.ts` builds LinkedIn's
 * capability set from, so it must never import that module back — only its
 * types, which erase at compile time. The capability a check needs is passed in
 * by the publisher. See the same note in `providers/x/validator.ts`.
 */

/**
 * LinkedIn's own ceiling for member post commentary.
 *
 * Measured against the *raw* caption, not the escaped one. Escaping can nearly
 * double the length of a caption made mostly of parentheses and asterisks, and
 * rejecting a 1,600-character caption because its escaped form crossed 3,000
 * would be incomprehensible to the person who wrote it. LinkedIn counts the
 * rendered text, which is the raw length.
 */
export const LINKEDIN_MAX_CAPTION_LENGTH = 3000;

/**
 * A validated, ready-to-send text post.
 *
 * The caption here is trimmed but *not* escaped — escaping is the formatter's
 * job, and doing it in two places is how the two get out of step.
 */
export interface ValidatedTextPost {
  caption: string;
}

/**
 * Checks a draft is publishable as a text post.
 *
 * Throws {@link ProviderError} with a 400 and a member-facing message. Those
 * messages are safe to return to the browser — unlike anything LinkedIn says
 * back to us, which the publisher keeps in the log.
 */
export function validateTextPost(input: {
  caption: string | null | undefined;
}): ValidatedTextPost {
  const caption = (input.caption ?? '').trim();

  if (!caption) {
    throw new ProviderError(
      'This post has no caption yet. Write one — or generate it — before publishing.',
      400,
      'linkedin',
    );
  }

  if (caption.length > LINKEDIN_MAX_CAPTION_LENGTH) {
    throw new ProviderError(
      `LinkedIn posts are limited to ${LINKEDIN_MAX_CAPTION_LENGTH.toLocaleString()} characters. ` +
        `This caption is ${caption.length.toLocaleString()} — trim ${(
          caption.length - LINKEDIN_MAX_CAPTION_LENGTH
        ).toLocaleString()} and try again.`,
      400,
      'linkedin',
    );
  }

  return { caption };
}

// ─── Media ───────────────────────────────────────────────────────────────────

/**
 * The image formats LinkedIn's Images API accepts.
 *
 * Narrower than what the AI module can read — no webp, no heic — which is why
 * the fetcher takes its allow-list from the caller. An iPhone photo shared as
 * heic is a real case that has to fail here, with a message about the format,
 * rather than as a 415 from LinkedIn after we have spent the upload.
 */
export const LINKEDIN_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
]);

/** LinkedIn's documented ceiling: images "with less than 36,152,320 pixels". */
export const LINKEDIN_MAX_IMAGE_PIXELS = 36_152_320;

/**
 * Our own byte ceiling, not LinkedIn's.
 *
 * LinkedIn documents a pixel count and no file size. We impose one anyway
 * because the bytes pass through this process' memory twice — once downloaded,
 * once PUT — and an unbounded upload is a way to run the API out of heap.
 */
export const LINKEDIN_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** LinkedIn's own limit. Their guidance is to stay under 120 for screen readers. */
export const LINKEDIN_MAX_ALT_TEXT_LENGTH = 4086;

/**
 * How many images one post may carry.
 *
 * LinkedIn's MultiImage content takes **2 to 20**, and one image uses
 * `content.media` instead — so 20 is the API's ceiling rather than a number we
 * picked. Video still needs the Videos API and is an extension of the layer
 * below, not of this constant.
 */
export const LINKEDIN_MAX_MEDIA_ITEMS = 20;

/** Below this a post uses `content.media`; at or above it, `content.multiImage`. */
export const LINKEDIN_MIN_MULTI_IMAGE_ITEMS = 2;

/**
 * What LinkedIn's Videos API accepts.
 *
 * MP4 only. LinkedIn documents other containers for the Vector/Assets surface
 * this integration does not use, and listing them here would promise a format
 * the upload path cannot actually carry.
 */
export const LINKEDIN_VIDEO_MIME_TYPES = ['video/mp4'] as const;

/**
 * LinkedIn's documented ceiling for a video upload.
 *
 * Unlike {@link LINKEDIN_MAX_IMAGE_BYTES} this is *not* also a heap budget: a
 * video takes the chunked transport and is streamed from Cloudinary through
 * LinkedIn's multi-part upload, so no part of it is ever held whole. See
 * `providers/capabilities.ts`.
 */
export const LINKEDIN_MAX_VIDEO_BYTES = 500 * 1024 * 1024;

/** LinkedIn's documented video duration window. */
export const LINKEDIN_MIN_VIDEO_DURATION_MS = 3_000;
export const LINKEDIN_MAX_VIDEO_DURATION_MS = 30 * 60 * 1000;

/** Kinds `media.ts` can actually upload right now. */
const SUPPORTED_MEDIA_KINDS: ReadonlySet<LinkedInMediaKind> = new Set<LinkedInMediaKind>([
  'image',
  'video',
]);

/** Member-facing names for the kinds we do not upload yet. */
const KIND_LABELS: Record<LinkedInMediaKind, string> = {
  image: 'Images',
  video: 'Videos',
  document: 'Documents',
};

/**
 * Checks attached media is something LinkedIn will take.
 *
 * Everything here is knowable without a network call, which is the whole
 * point: an unsupported format costs a member an instant, actionable message
 * instead of a download, an upload and a 415.
 *
 * Returns the assets unchanged — validation does not transform. Alt text is
 * trimmed to LinkedIn's ceiling rather than rejected, because a caption the
 * member never wrote (see the alt-text generator) must never be the reason
 * their post fails.
 */
export function validateMedia(
  media: LinkedInMediaAsset[] | undefined,
  capability?: ContentTypeCapability,
): LinkedInMediaAsset[] {
  if (!media || media.length === 0) return [];

  if (media.length > LINKEDIN_MAX_MEDIA_ITEMS) {
    throw new ProviderError(
      `A LinkedIn post holds ${LINKEDIN_MAX_MEDIA_ITEMS} images. ` +
        `This post has ${media.length} — remove ${media.length - LINKEDIN_MAX_MEDIA_ITEMS} and try again.`,
      400,
      'linkedin',
    );
  }

  // Format, size and duration, read from the capability rather than restated —
  // see `providers/media-rules.ts`. This is what lets a video post accept MP4
  // and an image post refuse it without either rule existing twice.
  if (capability) {
    validateAgainstCapability(capability, media, 'linkedin', 'LinkedIn');
  }

  return media.map((asset) => {
    if (!SUPPORTED_MEDIA_KINDS.has(asset.kind)) {
      throw new ProviderError(
        `${KIND_LABELS[asset.kind] ?? 'That media'} can't be published to LinkedIn yet. ` +
          'Publish this post with an image or on its own.',
        400,
        'linkedin',
      );
    }

    // The image-only checks. Skipped for video, which the capability above
    // already checked against LinkedIn's video rules — running an image's
    // format allow-list over an MP4 would reject every video ever uploaded.
    if (asset.kind === 'image') {
      if (!capability && !LINKEDIN_IMAGE_MIME_TYPES.has(asset.mimeType)) {
        throw new ProviderError(
          `LinkedIn accepts JPG, PNG and GIF images. This one is ${
            asset.mimeType || 'an unrecognised format'
          } — convert it and try again.`,
          400,
          'linkedin',
        );
      }

      if (asset.byteLength === 0) {
        throw new ProviderError(
          "That image file is empty. Re-upload it and try again.",
          400,
          'linkedin',
        );
      }

      if (asset.byteLength > LINKEDIN_MAX_IMAGE_BYTES) {
        throw new ProviderError(
          `That image is ${formatMegabytes(asset.byteLength)}, over the ` +
            `${formatMegabytes(LINKEDIN_MAX_IMAGE_BYTES)} limit. Compress it and try again.`,
          400,
          'linkedin',
        );
      }

      // Null dimensions mean the header could not be read, not that the image is
      // bad. A GIF with an unusual header should not be blocked by our probe
      // failing — LinkedIn is the authority on its own limit, and it enforces it.
      //
      // LinkedIn's own limit, with no equivalent in the capability model
      // because no other network states one. It stays here rather than becoming
      // a field every other provider would leave undefined.
      if (
        asset.width !== null &&
        asset.height !== null &&
        asset.width * asset.height >= LINKEDIN_MAX_IMAGE_PIXELS
      ) {
        throw new ProviderError(
          `That image is ${asset.width}×${asset.height}, above LinkedIn's ` +
            `${LINKEDIN_MAX_IMAGE_PIXELS.toLocaleString()} pixel limit. Resize it and try again.`,
          400,
          'linkedin',
        );
      }
    }

    const altText = asset.altText?.trim() || null;

    return {
      ...asset,
      altText: altText ? altText.slice(0, LINKEDIN_MAX_ALT_TEXT_LENGTH) : null,
    };
  });
}

/** "10MB", "2.4MB" — sized for a sentence a member reads, not for precision. */
function formatMegabytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)}MB`;
}

/**
 * A whole post, checked in one call.
 *
 * The publisher's single entry point into this module. Caption first: a post
 * with no caption fails the same way whether or not it has an image, and
 * finding that out before we look at 6MB of pixels is free.
 */
export function validatePost(input: {
  caption: string | null | undefined;
  media?: LinkedInMediaAsset[];
  /** LinkedIn's rules for the format being published. Resolved by the publisher. */
  capability?: ContentTypeCapability;
}): { caption: string; media: LinkedInMediaAsset[] } {
  const { caption } = validateTextPost({ caption: input.caption });
  return { caption, media: validateMedia(input.media, input.capability) };
}

/**
 * The scope LinkedIn requires to post on a member's behalf.
 *
 * Checked against what the provider actually *granted*, which can be narrower
 * than what we asked for — a member can decline a permission on the consent
 * screen and still complete the connection.
 */
export const LINKEDIN_PUBLISH_SCOPE = 'w_member_social';

/**
 * Whether a connection is allowed to publish.
 *
 * An empty scope list means "unknown", not "none": connections made before
 * scopes were recorded have nothing stored. Those are given the benefit of the
 * doubt and allowed through to LinkedIn, which is the authority anyway — a
 * genuinely unauthorized token comes back as a 403 and is handled there.
 */
export function canPublish(scopes: string[]): boolean {
  if (scopes.length === 0) return true;
  return scopes.includes(LINKEDIN_PUBLISH_SCOPE);
}

export const linkedinValidator = {
  validateTextPost,
  validateMedia,
  validatePost,
  canPublish,
  LINKEDIN_MAX_CAPTION_LENGTH,
  LINKEDIN_MAX_ALT_TEXT_LENGTH,
  LINKEDIN_MAX_IMAGE_BYTES,
  LINKEDIN_MAX_IMAGE_PIXELS,
  LINKEDIN_MAX_MEDIA_ITEMS,
  LINKEDIN_MIN_MULTI_IMAGE_ITEMS,
  LINKEDIN_IMAGE_MIME_TYPES,
  LINKEDIN_PUBLISH_SCOPE,
};
