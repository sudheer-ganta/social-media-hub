import type { ProviderId } from './provider.interface';
// Every ceiling below is *imported* from the code that enforces it. Restating a
// number here would create a second source of truth, and the whole point of this
// file is that there is one — the composer, the media service, the validator and
// the publisher all read the same value.
import {
  LINKEDIN_IMAGE_MIME_TYPES,
  LINKEDIN_MAX_CAPTION_LENGTH,
  LINKEDIN_MAX_IMAGE_BYTES,
  LINKEDIN_MAX_MEDIA_ITEMS,
  LINKEDIN_MAX_VIDEO_BYTES,
  LINKEDIN_MAX_VIDEO_DURATION_MS,
  LINKEDIN_MIN_MULTI_IMAGE_ITEMS,
  LINKEDIN_MIN_VIDEO_DURATION_MS,
  LINKEDIN_VIDEO_MIME_TYPES,
} from './linkedin/validator';
import {
  INSTAGRAM_IMAGE_MIME_TYPES,
  INSTAGRAM_MAX_CAPTION_LENGTH,
  INSTAGRAM_MAX_IMAGE_BYTES,
  INSTAGRAM_MAX_MEDIA_ITEMS,
  INSTAGRAM_MAX_REEL_DURATION_MS,
  INSTAGRAM_MAX_STORY_DURATION_MS,
  INSTAGRAM_MAX_VIDEO_BYTES,
  INSTAGRAM_MIN_CAROUSEL_ITEMS,
  INSTAGRAM_MIN_REEL_DURATION_MS,
  INSTAGRAM_VIDEO_MIME_TYPES,
} from './meta/instagram/validator';
import {
  FACEBOOK_IMAGE_MIME_TYPES,
  FACEBOOK_MAX_CAPTION_LENGTH,
  FACEBOOK_MAX_IMAGE_BYTES,
  FACEBOOK_MAX_MEDIA_ITEMS,
  FACEBOOK_MIN_MULTI_PHOTO_ITEMS,
} from './meta/facebook/validator';
import {
  X_GIF_MIME_TYPES,
  X_IMAGE_MIME_TYPES,
  X_MAX_GIF_BYTES,
  X_MAX_IMAGE_BYTES,
  X_MAX_MEDIA_ITEMS,
  X_MAX_TEXT_LENGTH,
  X_MAX_VIDEO_BYTES,
  X_MAX_VIDEO_DURATION_MS,
  X_MIN_VIDEO_DURATION_MS,
  X_VIDEO_MIME_TYPES,
} from './x/validator';

/**
 * What each network can actually publish, in one declaration.
 *
 * ─── Why this exists ─────────────────────────────────────────────────────────
 *
 * Before it, "can Instagram publish a Reel?" had four different answers in four
 * places: the catalogue's permission list said one thing, the validator enforced
 * another, the composer hardcoded a third and the media service assumed a
 * fourth. This file is the one answer. Everything else reads it.
 *
 * The frontend reads it too — `GET /api/integrations` serves it — which is what
 * keeps the composer from growing an `InstagramRules.ts` beside this one. The
 * browser decides what to *offer* from these values; the backend still
 * validates every publish against them, because a capability the browser
 * respects is a convenience and a capability the server enforces is a rule.
 *
 * ─── Absence is the answer ───────────────────────────────────────────────────
 *
 * A content type with no entry is **unsupported**, full stop. There is no
 * `planned: true`, no `supported: false`, no placeholder that renders greyed out
 * — those are how a roadmap gets mistaken for a feature. Facebook has no REEL
 * entry because FlowPost cannot publish a Facebook Reel: the permission that
 * would authorise it has not been verified against Meta's documentation, so it
 * is not requested, not declared and not offered.
 */

/**
 * What a member is publishing, in provider-neutral terms.
 *
 * Deliberately the same six labels as the publishable members of the `MediaType`
 * database enum — TEXT, IMAGE, CAROUSEL, VIDEO, REEL, STORY — so the *requested*
 * format and the *observed* format speak one vocabulary and can be compared in
 * analytics without a translation table. `OTHER` is absent because it is an
 * analytics answer ("the network reported a format we do not model"), never
 * something a member can ask for.
 *
 * Not to be confused with a media *kind*. An uploaded asset is an image, a GIF
 * or a video; a content type is what the member intends to publish it as. One
 * video can be a REEL, a STORY or a VIDEO, and only the member knows which.
 */
export const CONTENT_TYPES = [
  'TEXT',
  'IMAGE',
  'CAROUSEL',
  'VIDEO',
  'REEL',
  'STORY',
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export function isContentType(value: unknown): value is ContentType {
  return (
    typeof value === 'string' &&
    (CONTENT_TYPES as readonly string[]).includes(value)
  );
}

/**
 * How the bytes reach the network.
 *
 * The distinction is a memory budget, not a style preference. A 200MB Reel that
 * takes the wrong path here is 200MB of Node heap.
 *
 *  • `url` — the network fetches the asset from our hosted Cloudinary URL. Meta
 *    works this way for every publishing edge it has: `image_url`, `video_url`.
 *    **Nothing is downloaded into this process.** For video that is not an
 *    optimisation, it is the only version that fits in memory.
 *  • `bytes` — the whole asset is read into a Buffer and uploaded in one
 *    request. What LinkedIn and X images have always done, and correct for them:
 *    a 5–10MB ceiling is a Buffer that is fine to hold.
 *  • `chunked` — the asset is streamed from Cloudinary straight through the
 *    network's multi-part upload, one chunk in memory at a time. X video and
 *    GIF, LinkedIn video.
 */
export type MediaTransport = 'url' | 'bytes' | 'chunked';

/**
 * An accepted range of width ÷ height.
 *
 * A range rather than a list because that is how the networks document it:
 * Instagram feed images are "4:5 to 1.91:1", not a set of four blessed sizes.
 * `recommended` is what the composer offers to crop *to* when the uploaded
 * asset sits outside the range — or inside it but far from the ideal shape.
 */
export interface AspectRatioRange {
  /**
   * Narrowest width ÷ height the network will *accept*, e.g. 0.8 for 4:5.
   *
   * A hard limit: outside it the network rejects the post, so FlowPost does
   * too, before spending a request on being told.
   */
  min: number;
  /** Widest accepted width ÷ height, e.g. 1.91 for 1.91:1. */
  max: number;
  /** The shape this format is designed around, e.g. `9:16`. Shown, never enforced. */
  recommended: string;
  /**
   * The window around {@link recommended} that renders full-frame.
   *
   * Soft, and the distinction is the whole reason both exist. Meta *accepts* a
   * Reel from 0.01:1 to 10:1 and letterboxes or crops everything outside 9:16 —
   * so refusing a 16:9 video would be FlowPost inventing a limit, and silently
   * publishing it pillarboxed would be FlowPost hiding one. Outside this window
   * the composer says what will happen and offers the crop. Absent means the
   * accepted range is the only thing worth saying.
   */
  recommendedMin?: number;
  recommendedMax?: number;
}

/** What one kind of file has to be for this content type to accept it. */
export interface MediaConstraints {
  /** Accepted MIME types, lowercased. */
  mimeTypes: readonly string[];
  /** Byte ceiling for one item. */
  maxBytes: number;
  /**
   * MIME types that may only ever appear as the *sole* item.
   *
   * X's animated GIF is the one case: a post takes four photos, or one GIF, or
   * one video, and mixing is not allowed. Expressed here rather than as a
   * separate content type so the vocabulary stays at six.
   */
  soloMimeTypes?: readonly string[];
  /** Byte ceiling for {@link soloMimeTypes}, when the network states its own. */
  soloMaxBytes?: number;
  /** Shortest accepted duration. Video only. */
  minDurationMs?: number;
  /** Longest accepted duration. Video only. */
  maxDurationMs?: number;
  /**
   * Below this, the composer warns that the result will look soft. A warning,
   * never an error — the network accepts it and the member's judgement wins.
   */
  recommendedMinWidth?: number;
  recommendedMinHeight?: number;
}

/** One publishable format on one network. */
export interface ContentTypeCapability {
  /** The member's word for it — "Reel", "Multi-image post", "Story". */
  label: string;
  /** One line under the label in the composer. */
  description: string;
  /** Fewest media items. Zero for TEXT. */
  minItems: number;
  /** Most media items. Zero for TEXT. */
  maxItems: number;
  /** True when the format cannot be published without media. */
  requiresMedia: boolean;
  /** Caption ceiling in Unicode code points, or null for no stated limit. */
  maxCaptionLength: number | null;
  /** Absent when this format takes no still images. */
  image?: MediaConstraints;
  /** Absent when this format takes no video. */
  video?: MediaConstraints;
  /** Absent when the network states no aspect requirement. */
  aspectRatio?: AspectRatioRange;
  transport: MediaTransport;
  /**
   * How long this format's numbers are worth reading, from publication.
   *
   * Present only where the format's *lifetime* differs from the network's own
   * analytics horizon. A Story is gone after 24 hours: polling it on the
   * ordinary weekly tail for the next month is a month of requests against a
   * post that no longer exists. Absent means the network's horizon applies
   * unchanged — see `ProviderAnalytics.postMetricsMaxAgeDays`.
   */
  metricsHorizonMs?: number;
}

/** Every format one network publishes. Absent key = unsupported. */
export type ProviderCapabilities = Partial<
  Record<ContentType, ContentTypeCapability>
>;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Instagram's feed shape: portrait 4:5 through landscape 1.91:1.
 *
 * Genuinely hard — Meta rejects a feed container outside it rather than
 * cropping, which is why there is no soft window here to argue about.
 */
const IG_FEED_ASPECT: AspectRatioRange = { min: 0.8, max: 1.91, recommended: '1:1' };

/**
 * The vertical formats.
 *
 * Meta accepts almost anything on a REELS or STORIES container — 0.01:1 to
 * 10:1 — and crops or letterboxes the rest. So the hard range is Meta's real
 * one, and 9:16 is stated as the shape that fills the screen. A 16:9 video is
 * publishable as a Reel; it is just going to have bars, and the member is told
 * that and offered the crop rather than being refused or surprised.
 */
const IG_VERTICAL_ASPECT: AspectRatioRange = {
  min: 0.01,
  max: 10,
  recommended: '9:16',
  recommendedMin: 0.5,
  recommendedMax: 0.6,
};

const IG_IMAGE: MediaConstraints = {
  mimeTypes: [...INSTAGRAM_IMAGE_MIME_TYPES],
  maxBytes: INSTAGRAM_MAX_IMAGE_BYTES,
  recommendedMinWidth: 1080,
};

const LINKEDIN_IMAGE: MediaConstraints = {
  mimeTypes: [...LINKEDIN_IMAGE_MIME_TYPES],
  maxBytes: LINKEDIN_MAX_IMAGE_BYTES,
  recommendedMinWidth: 1200,
};

const FACEBOOK_IMAGE: MediaConstraints = {
  mimeTypes: [...FACEBOOK_IMAGE_MIME_TYPES],
  maxBytes: FACEBOOK_MAX_IMAGE_BYTES,
  recommendedMinWidth: 1200,
};

/**
 * X's still-image rules, GIF included.
 *
 * A GIF is `image/gif` with a kind of `image` — not a fourth media kind. It
 * differs from a photo in exactly two ways X documents, and both are stated
 * here: a larger byte ceiling and a rule that it cannot share a post.
 */
const X_IMAGE: MediaConstraints = {
  mimeTypes: [...X_IMAGE_MIME_TYPES],
  maxBytes: X_MAX_IMAGE_BYTES,
  soloMimeTypes: [...X_GIF_MIME_TYPES],
  soloMaxBytes: X_MAX_GIF_BYTES,
  recommendedMinWidth: 1200,
};

export const PROVIDER_CAPABILITIES: Record<ProviderId, ProviderCapabilities> = {
  linkedin: {
    TEXT: {
      label: 'Post',
      description: 'Text on your LinkedIn feed.',
      minItems: 0,
      maxItems: 0,
      requiresMedia: false,
      maxCaptionLength: LINKEDIN_MAX_CAPTION_LENGTH,
      transport: 'bytes',
    },
    IMAGE: {
      label: 'Image post',
      description: 'One image with your text.',
      minItems: 1,
      maxItems: 1,
      requiresMedia: true,
      maxCaptionLength: LINKEDIN_MAX_CAPTION_LENGTH,
      image: LINKEDIN_IMAGE,
      transport: 'bytes',
    },
    CAROUSEL: {
      // LinkedIn's own name for it: `content.multiImage`, a different content
      // type from a single image rather than a count of one.
      label: 'Multi-image post',
      description: 'Two or more images in one post.',
      minItems: LINKEDIN_MIN_MULTI_IMAGE_ITEMS,
      maxItems: LINKEDIN_MAX_MEDIA_ITEMS,
      requiresMedia: true,
      maxCaptionLength: LINKEDIN_MAX_CAPTION_LENGTH,
      image: LINKEDIN_IMAGE,
      transport: 'bytes',
    },
    VIDEO: {
      label: 'Video post',
      description: 'One video with your text.',
      minItems: 1,
      maxItems: 1,
      requiresMedia: true,
      maxCaptionLength: LINKEDIN_MAX_CAPTION_LENGTH,
      video: {
        mimeTypes: [...LINKEDIN_VIDEO_MIME_TYPES],
        maxBytes: LINKEDIN_MAX_VIDEO_BYTES,
        minDurationMs: LINKEDIN_MIN_VIDEO_DURATION_MS,
        maxDurationMs: LINKEDIN_MAX_VIDEO_DURATION_MS,
        recommendedMinWidth: 640,
      },
      // Streamed through LinkedIn's multi-part upload. A 500MB Buffer is not a
      // thing this process can hold.
      transport: 'chunked',
    },
  },

  instagram: {
    // No TEXT entry, and that is the rule rather than an omission: Instagram's
    // publishing flow starts with a media container and has no text-only edge.
    IMAGE: {
      label: 'Post',
      description: 'One image on your feed.',
      minItems: 1,
      maxItems: 1,
      requiresMedia: true,
      maxCaptionLength: INSTAGRAM_MAX_CAPTION_LENGTH,
      image: IG_IMAGE,
      aspectRatio: IG_FEED_ASPECT,
      transport: 'url',
    },
    CAROUSEL: {
      label: 'Carousel',
      description: 'Two to ten images your audience swipes through.',
      minItems: INSTAGRAM_MIN_CAROUSEL_ITEMS,
      maxItems: INSTAGRAM_MAX_MEDIA_ITEMS,
      requiresMedia: true,
      maxCaptionLength: INSTAGRAM_MAX_CAPTION_LENGTH,
      image: IG_IMAGE,
      aspectRatio: IG_FEED_ASPECT,
      transport: 'url',
    },
    REEL: {
      label: 'Reel',
      description: 'Short vertical video on Reels and your feed.',
      minItems: 1,
      maxItems: 1,
      requiresMedia: true,
      maxCaptionLength: INSTAGRAM_MAX_CAPTION_LENGTH,
      video: {
        mimeTypes: [...INSTAGRAM_VIDEO_MIME_TYPES],
        maxBytes: INSTAGRAM_MAX_VIDEO_BYTES,
        minDurationMs: INSTAGRAM_MIN_REEL_DURATION_MS,
        maxDurationMs: INSTAGRAM_MAX_REEL_DURATION_MS,
        recommendedMinWidth: 1080,
        recommendedMinHeight: 1920,
      },
      aspectRatio: IG_VERTICAL_ASPECT,
      // Meta pulls `video_url` onto its own servers. Downloading a Reel into
      // Node to hand Meta a URL it could have fetched itself is the exact
      // mistake this transport exists to name.
      transport: 'url',
    },
    STORY: {
      label: 'Story',
      description: 'One image or video, visible for 24 hours.',
      minItems: 1,
      maxItems: 1,
      requiresMedia: true,
      // A Story container takes no caption — text on a Story is burned into the
      // image or added in the app, and Meta ignores a `caption` parameter here.
      maxCaptionLength: 0,
      image: IG_IMAGE,
      video: {
        mimeTypes: [...INSTAGRAM_VIDEO_MIME_TYPES],
        maxBytes: INSTAGRAM_MAX_VIDEO_BYTES,
        maxDurationMs: INSTAGRAM_MAX_STORY_DURATION_MS,
        recommendedMinWidth: 1080,
        recommendedMinHeight: 1920,
      },
      aspectRatio: IG_VERTICAL_ASPECT,
      transport: 'url',
      // The post is gone after a day. Polling it on the ordinary weekly tail
      // for the next month would be a month of requests against something that
      // no longer exists — see `analytics/cadence.ts`.
      metricsHorizonMs: 24 * HOUR_MS,
    },
  },

  facebook: {
    TEXT: {
      label: 'Post',
      description: 'Text on your Page.',
      minItems: 0,
      maxItems: 0,
      requiresMedia: false,
      maxCaptionLength: FACEBOOK_MAX_CAPTION_LENGTH,
      transport: 'url',
    },
    IMAGE: {
      label: 'Photo post',
      description: 'One photo with your text.',
      minItems: 1,
      maxItems: 1,
      requiresMedia: true,
      maxCaptionLength: FACEBOOK_MAX_CAPTION_LENGTH,
      image: FACEBOOK_IMAGE,
      transport: 'url',
    },
    CAROUSEL: {
      label: 'Multi-photo post',
      description: 'Several photos gathered into one Page post.',
      minItems: FACEBOOK_MIN_MULTI_PHOTO_ITEMS,
      maxItems: FACEBOOK_MAX_MEDIA_ITEMS,
      requiresMedia: true,
      maxCaptionLength: FACEBOOK_MAX_CAPTION_LENGTH,
      image: FACEBOOK_IMAGE,
      transport: 'url',
    },
    // No REEL entry. Facebook Reels needs a Meta permission FlowPost has not
    // verified against Meta's own documentation, so it is not requested and not
    // declared. Leaving it out is the honest answer; a greyed-out entry here
    // would read as a feature that is temporarily broken.
  },

  x: {
    TEXT: {
      label: 'Post',
      description: 'Text on your timeline.',
      minItems: 0,
      maxItems: 0,
      requiresMedia: false,
      maxCaptionLength: X_MAX_TEXT_LENGTH,
      transport: 'bytes',
    },
    IMAGE: {
      label: 'Image post',
      description: 'One image or GIF with your text.',
      minItems: 1,
      maxItems: 1,
      requiresMedia: true,
      maxCaptionLength: X_MAX_TEXT_LENGTH,
      image: X_IMAGE,
      transport: 'bytes',
    },
    CAROUSEL: {
      label: 'Up to 4 photos',
      description: 'Two to four images on one post.',
      minItems: 2,
      maxItems: X_MAX_MEDIA_ITEMS,
      requiresMedia: true,
      maxCaptionLength: X_MAX_TEXT_LENGTH,
      // GIF stays in the accepted formats and stays marked solo. Dropping it
      // here would refuse a GIF-plus-photos post with "X doesn't accept GIF",
      // which is not true and is not something a member can act on — the solo
      // rule says the actual problem and the actual fix.
      image: X_IMAGE,
      transport: 'bytes',
    },
    VIDEO: {
      label: 'Video post',
      description: 'One video with your text.',
      minItems: 1,
      maxItems: 1,
      requiresMedia: true,
      maxCaptionLength: X_MAX_TEXT_LENGTH,
      video: {
        mimeTypes: [...X_VIDEO_MIME_TYPES],
        maxBytes: X_MAX_VIDEO_BYTES,
        minDurationMs: X_MIN_VIDEO_DURATION_MS,
        maxDurationMs: X_MAX_VIDEO_DURATION_MS,
        recommendedMinWidth: 720,
      },
      transport: 'chunked',
    },
  },

  // No implementation, so nothing is declared. An empty object is the same
  // statement as a missing key for every consumer: no content type is
  // supported.
  youtube: {},
};

/** What one network can publish. Empty for a network with no implementation. */
export function capabilitiesFor(providerId: string): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[providerId as ProviderId] ?? {};
}

/**
 * One format on one network, or undefined when the network cannot publish it.
 *
 * Undefined is the load-bearing answer here — it is how every caller learns
 * "Facebook cannot publish a Reel" without a list of exceptions.
 */
export function capabilityFor(
  providerId: string,
  contentType: ContentType,
): ContentTypeCapability | undefined {
  return capabilitiesFor(providerId)[contentType];
}

/** The formats one network publishes, in `CONTENT_TYPES` order. */
export function supportedContentTypes(providerId: string): ContentType[] {
  const capabilities = capabilitiesFor(providerId);
  return CONTENT_TYPES.filter((type) => capabilities[type] !== undefined);
}

/** The largest number of items any of a network's formats will carry. */
export function maxItemsFor(providerId: string): number {
  const capabilities = capabilitiesFor(providerId);
  return Math.max(
    0,
    ...CONTENT_TYPES.map((type) => capabilities[type]?.maxItems ?? 0),
  );
}

/**
 * Every MIME type any of a network's formats accepts.
 *
 * What the *uploader* allows, as opposed to what one format allows. A member
 * uploading a video to a post that has Instagram selected should not be stopped
 * before they have said whether it is a Reel or a Story.
 */
export function acceptedMimeTypes(providerId: string): string[] {
  const capabilities = capabilitiesFor(providerId);
  const mimes = new Set<string>();
  for (const type of CONTENT_TYPES) {
    for (const mime of capabilities[type]?.image?.mimeTypes ?? []) {
      mimes.add(mime);
    }
    for (const mime of capabilities[type]?.video?.mimeTypes ?? []) {
      mimes.add(mime);
    }
  }
  return [...mimes];
}
