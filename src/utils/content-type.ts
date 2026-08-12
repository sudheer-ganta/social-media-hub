import type {
  ContentType,
  ContentTypeCapability,
  ProviderCapabilities,
} from "@/types/capabilities";
import { CONTENT_TYPES } from "@/types/capabilities";
import type { PostMediaItem } from "@/types";

/**
 * Turning capabilities plus attached media into what the composer may offer.
 *
 * ─── The design principle, in code ───────────────────────────────────────────
 *
 * The member should be thinking "I have this video — what do I want to post?",
 * not "what does Instagram's API require?". So this module answers the first
 * question. It takes what they uploaded and what they selected, and produces a
 * list of things they can press, each either available or disabled with a
 * sentence saying why.
 *
 * Nothing here knows a network's name. Every rule it applies came down the wire
 * in `ProviderCapabilities`, which is the same object the backend validates
 * against — see `src/types/capabilities.ts`.
 */

/** One publishable format, as the composer renders it. */
export interface ContentTypeOption {
  contentType: ContentType;
  capability: ContentTypeCapability;
  /** "Reel", "Carousel" — from the capability, never written here. */
  label: string;
  /** True when the current media satisfies it. */
  available: boolean;
  /**
   * Why it cannot be used right now, in one short sentence.
   *
   * Present only when `available` is false. Always says what would fix it — a
   * disabled button with no reason is a dead end the member has to guess at.
   */
  reason?: string;
  /** "1 video", "2–10 images" — what this format wants, shown beside the label. */
  requirement: string;
}

/**
 * The formats a network offers for the media currently attached.
 *
 * Returns every format the network publishes, in a stable order, rather than
 * only the usable ones. A Reel that is greyed out with "needs a video" teaches
 * the member what a Reel is; a Reel that vanishes when they remove a video is
 * a UI that appears to be broken.
 */
export function optionsFor(
  capabilities: ProviderCapabilities,
  media: PostMediaItem[],
): ContentTypeOption[] {
  return CONTENT_TYPES.filter(
    (contentType) => capabilities[contentType] !== undefined,
  ).map((contentType) => {
    const capability = capabilities[contentType]!;
    const reason = whyUnavailable(capability, media);

    return {
      contentType,
      capability,
      label: capability.label,
      available: reason === null,
      ...(reason !== null && { reason }),
      requirement: describeRequirement(capability),
    };
  });
}

/**
 * Why this format cannot take the attached media, or null when it can.
 *
 * Ordered by what the member most needs to hear. "Add a video" comes before
 * "that file is too big", because a Reel with three photos attached has a
 * count problem and telling them about the format of photo two would be noise.
 */
export function whyUnavailable(
  capability: ContentTypeCapability,
  media: PostMediaItem[],
): string | null {
  const count = media.length;

  if (count === 0) {
    if (!capability.requiresMedia) return null;
    return capability.video && !capability.image
      ? "Add a video."
      : capability.image && !capability.video
        ? `Add ${capability.minItems > 1 ? `${capability.minItems} images` : "an image"}.`
        : "Add an image or a video.";
  }

  if (capability.maxItems === 0) return "Remove the media to post text only.";
  if (count < capability.minItems) {
    return `Needs ${capability.minItems} items — add ${capability.minItems - count} more.`;
  }
  if (count > capability.maxItems) {
    return `Holds ${capability.maxItems} — remove ${count - capability.maxItems}.`;
  }

  for (const item of media) {
    const constraints = item.type === "video" ? capability.video : capability.image;

    if (!constraints) {
      return item.type === "video"
        ? "Doesn't take video."
        : "Needs a video, not an image.";
    }

    if (item.mimeType && !constraints.mimeTypes.includes(item.mimeType)) {
      return `Doesn't accept ${formatName(item.mimeType)}.`;
    }

    if (
      item.mimeType &&
      constraints.soloMimeTypes?.includes(item.mimeType) &&
      count > 1
    ) {
      return `A ${formatName(item.mimeType)} has to be on its own.`;
    }

    const ceiling =
      item.mimeType && constraints.soloMimeTypes?.includes(item.mimeType)
        ? (constraints.soloMaxBytes ?? constraints.maxBytes)
        : constraints.maxBytes;

    if (item.bytes && item.bytes > ceiling) {
      return `That file is over the ${formatBytes(ceiling)} limit.`;
    }

    // Duration only when it was measured. Unknown is not a reason to refuse —
    // the network checks the file itself.
    if (item.durationMs) {
      if (
        constraints.minDurationMs !== undefined &&
        item.durationMs < constraints.minDurationMs
      ) {
        return `Too short — needs ${formatDuration(constraints.minDurationMs)}.`;
      }
      if (
        constraints.maxDurationMs !== undefined &&
        item.durationMs > constraints.maxDurationMs
      ) {
        return `Too long — takes up to ${formatDuration(constraints.maxDurationMs)}.`;
      }
    }

    const range = capability.aspectRatio;
    const ratio = item.width && item.height ? item.width / item.height : null;
    if (range && ratio !== null && (ratio < range.min || ratio > range.max)) {
      return `Crop it to ${range.recommended} first.`;
    }
  }

  return null;
}

/**
 * The default selection for a network, given what is attached.
 *
 * Prefers the first *available* format in the declared order — which puts a
 * plain post ahead of a Story and a Reel, because that is the ordinary thing to
 * want. Never picks a format that is unavailable, and returns null when none
 * is: an unselectable default is worse than none, because it looks chosen.
 *
 * Deliberately *not* "one video means Reel". The member picks; this only avoids
 * making them pick when there is one answer.
 */
export function defaultContentType(
  capabilities: ProviderCapabilities,
  media: PostMediaItem[],
): ContentType | null {
  const options = optionsFor(capabilities, media);
  return options.find((option) => option.available)?.contentType ?? null;
}

/** "1 video", "2–10 images", "Text only" — what a format wants, in three words. */
export function describeRequirement(capability: ContentTypeCapability): string {
  if (capability.maxItems === 0) return "Text only";

  const noun =
    capability.video && !capability.image
      ? "video"
      : capability.image && !capability.video
        ? "image"
        : "item";

  const plural = noun === "video" ? "videos" : `${noun}s`;

  if (capability.minItems === capability.maxItems) {
    return `${capability.minItems} ${capability.minItems === 1 ? noun : plural}`;
  }
  return `${capability.minItems}–${capability.maxItems} ${plural}`;
}

/**
 * What is worth telling the member about quality, without stopping them.
 *
 * Warnings only. A 720p video is soft on a large screen and every network will
 * publish it, so the answer is a sentence and an "Use anyway", not a refusal.
 * Anything a network genuinely rejects is handled by {@link whyUnavailable}.
 */
export interface QualityNote {
  kind: "resolution" | "aspect-ratio";
  message: string;
  /** What the crop would target. Present on framing notes only. */
  suggestedRatio?: string;
}

export function qualityNotes(
  capability: ContentTypeCapability,
  item: PostMediaItem,
): QualityNote[] {
  const notes: QualityNote[] = [];
  const constraints = item.type === "video" ? capability.video : capability.image;
  if (!constraints) return notes;

  const softWidth =
    constraints.recommendedMinWidth !== undefined &&
    item.width > 0 &&
    item.width < constraints.recommendedMinWidth;
  const softHeight =
    constraints.recommendedMinHeight !== undefined &&
    item.height > 0 &&
    item.height < constraints.recommendedMinHeight;

  if (softWidth || softHeight) {
    notes.push({
      kind: "resolution",
      message: "This may look soft on larger screens.",
    });
  }

  const range = capability.aspectRatio;
  const ratio = item.width && item.height ? item.width / item.height : null;
  if (range?.recommendedMin !== undefined && ratio !== null) {
    const outside =
      ratio < range.recommendedMin ||
      (range.recommendedMax !== undefined && ratio > range.recommendedMax);
    if (outside) {
      notes.push({
        kind: "aspect-ratio",
        message: `Your ${item.type} is ${describeRatio(ratio)}. ${capability.label}s work best in ${range.recommended}.`,
        suggestedRatio: range.recommended,
      });
    }
  }

  return notes;
}

/**
 * What to say when several images and a video are attached together.
 *
 * Not "Invalid media". A member who added three photos and a clip has done
 * something perfectly reasonable and there is almost always a way to use it —
 * so this names the actual conflict and hands back the routes out, which the
 * composer renders as buttons.
 */
export interface MixedMediaAdvice {
  /** "You added 3 images and 1 video." */
  summary: string;
  /** "Instagram Carousels use images only." */
  explanation: string;
  /** What the member can press. Never empty when this is returned. */
  actions: MixedMediaAction[];
}

export interface MixedMediaAction {
  label: string;
  /** Keep only these item ids, and publish as this format. */
  keepIds: string[];
  contentType: ContentType;
}

/**
 * Advice for a mixed selection, or null when the mix is fine as it is.
 *
 * Returns null the moment any format can take everything attached — a mixed
 * upload is only a problem if it actually is one, and warning about a Story
 * that happens to hold one video would be inventing a conflict.
 */
export function adviseOnMixedMedia(
  capabilities: ProviderCapabilities,
  media: PostMediaItem[],
  networkName: string,
): MixedMediaAdvice | null {
  const images = media.filter((item) => item.type === "image");
  const videos = media.filter((item) => item.type === "video");
  if (images.length === 0 || videos.length === 0) return null;

  const options = optionsFor(capabilities, media);
  if (options.some((option) => option.available)) return null;

  // What each half could be on its own. Only formats that would actually work.
  const actions: MixedMediaAction[] = [];

  for (const [subset, kindLabel] of [
    [images, images.length === 1 ? "image" : "images"],
    [videos, videos.length === 1 ? "video" : "videos"],
  ] as const) {
    const usable = optionsFor(capabilities, subset).find(
      (option) => option.available,
    );
    if (!usable) continue;
    actions.push({
      label: `Use the ${kindLabel} as ${article(usable.label)} ${usable.label}`,
      keepIds: subset.map((item) => item.id),
      contentType: usable.contentType,
    });
  }

  if (actions.length === 0) return null;

  return {
    summary: `You added ${countOf(images.length, "image")} and ${countOf(videos.length, "video")}.`,
    explanation: `${networkName} can't publish them in one post.`,
    actions,
  };
}

function countOf(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

function article(label: string): string {
  return /^[aeiou]/i.test(label) ? "an" : "a";
}

/** "16:9", "9:16" — the nearest common shape, or a decimal for the rest. */
export function describeRatio(ratio: number): string {
  const common: Array<[string, number]> = [
    ["9:16", 0.5625],
    ["4:5", 0.8],
    ["1:1", 1],
    ["4:3", 4 / 3],
    ["16:9", 16 / 9],
    ["1.91:1", 1.91],
  ];
  for (const [label, value] of common) {
    if (Math.abs(ratio - value) < 0.03) return label;
  }
  return `${ratio.toFixed(2)}:1`;
}

/** "0:18", "1:24" — how a member reads a running time. */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "12.4 MB", "1.2 GB" — sized for a sentence, not for precision. */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

/** `image/jpeg` → `JPEG`, `video/quicktime` → `MOV`. */
export function formatName(mime: string): string {
  const subtype = mime.split("/")[1] ?? mime;
  if (subtype === "quicktime") return "MOV";
  if (subtype === "jpeg") return "JPEG";
  return subtype.toUpperCase();
}
