/**
 * Per-platform framing, without ever touching the uploaded file.
 *
 * ─── The one idea ────────────────────────────────────────────────────────────
 * A crop here is not an image operation. It is four fractions of the original —
 * `x`, `y`, `w`, `h`, each 0–1 — stored beside the post and turned into a
 * Cloudinary delivery transformation at publish time. The uploaded asset is
 * read, never rewritten, so a member can reframe for Instagram on Tuesday and
 * still have their full-resolution original on Friday.
 *
 * Fractions rather than pixels on purpose: Cloudinary reads `w_0.8,x_0.1` as
 * percentages of the source, so nothing in this file needs to know how big the
 * image actually is, and a crop stays correct even if the same configuration is
 * ever applied to a different rendition.
 *
 * Dependency-free and pure so `scripts/verify-crop.ts` can run it under plain
 * `node` with no test runner.
 */

export type AspectRatioId = "4:5" | "1:1" | "16:9" | "9:16" | "1.91:1";

/** width / height for each ratio the composer offers. */
export const RATIO_VALUE: Record<AspectRatioId, number> = {
  "4:5": 4 / 5,
  "1:1": 1,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1.91:1": 1.91,
};

export const RATIO_LABEL: Record<AspectRatioId, string> = {
  "4:5": "Portrait 4:5",
  "1:1": "Square 1:1",
  "16:9": "Landscape 16:9",
  "9:16": "Vertical 9:16",
  "1.91:1": "Landscape 1.91:1",
};

/**
 * What each network offers, recommended first.
 *
 * These are the shapes each feed actually renders without letterboxing. The
 * first entry is what a post gets if the member never opens the format tabs,
 * which is the whole point — nobody should have to learn Instagram's aspect
 * ratios to publish a photo.
 */
export const PLATFORM_RATIOS: Record<string, AspectRatioId[]> = {
  instagram: ["4:5", "1:1", "16:9", "9:16"],
  linkedin: ["1.91:1", "1:1", "4:5"],
  facebook: ["1.91:1", "1:1", "4:5"],
  x: ["16:9", "1:1"],
  threads: ["4:5", "1:1", "16:9"],
};

/** The ratio a platform gets before anyone chooses otherwise. */
export function recommendedRatio(platform: string): AspectRatioId {
  return PLATFORM_RATIOS[platform]?.[0] ?? "1:1";
}

export function ratiosFor(platform: string): AspectRatioId[] {
  return PLATFORM_RATIOS[platform] ?? ["1:1"];
}

/**
 * One platform's framing of the shared original.
 *
 * Persisted verbatim on the post (`platform_media`), so a draft reopened next
 * week — or a scheduled post published by the backend hours later — frames
 * exactly as it looked when it was set up.
 */
export interface PlatformCrop {
  ratio: AspectRatioId;
  /** Left edge, as a fraction of the original's width. */
  x: number;
  /** Top edge, as a fraction of the original's height. */
  y: number;
  /** Width, as a fraction of the original's width. */
  w: number;
  /** Height, as a fraction of the original's height. */
  h: number;
  /** 1 = the largest area of this ratio that fits. Above 1 crops in tighter. */
  zoom: number;
}

export type PlatformMedia = Record<string, PlatformCrop>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds to 4dp so a stored crop is stable and readable rather than 0.30000000000000004. */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * The crop rectangle for one ratio, centred on a focal point.
 *
 * `imageAspect` is the original's own width/height. The rectangle is the
 * largest one of the requested ratio that fits inside the source — which is
 * what guarantees this can never ask for pixels the image does not have, and
 * therefore can never cause an upscale.
 *
 * `zoom` shrinks the rectangle (tighter framing, fewer source pixels). It never
 * grows it past the fit, for the same reason.
 */
export function computeCrop(
  ratio: AspectRatioId,
  imageAspect: number,
  options: { zoom?: number; focusX?: number; focusY?: number } = {},
): PlatformCrop {
  const zoom = clamp(options.zoom ?? 1, 1, 3);
  const target = RATIO_VALUE[ratio];

  // The largest rectangle of `target` ratio that fits in a source of
  // `imageAspect`. One dimension is always the full extent; the other shrinks.
  let w = 1;
  let h = 1;
  if (imageAspect > target) {
    // Source is wider than the target — full height, narrower width.
    w = target / imageAspect;
  } else {
    // Source is taller — full width, shorter height.
    h = imageAspect / target;
  }

  w = clamp(w / zoom, 0.01, 1);
  h = clamp(h / zoom, 0.01, 1);

  // The focal point is the *centre* of the rectangle, then pushed back inside
  // the image so a focus near an edge produces a valid crop rather than a
  // negative origin.
  const focusX = clamp(options.focusX ?? 0.5, 0, 1);
  const focusY = clamp(options.focusY ?? 0.5, 0, 1);

  const x = clamp(focusX - w / 2, 0, 1 - w);
  const y = clamp(focusY - h / 2, 0, 1 - h);

  return {
    ratio,
    x: round(x),
    y: round(y),
    w: round(w),
    h: round(h),
    zoom: round(zoom),
  };
}

/** The focal point a crop is currently centred on. Inverse of {@link computeCrop}. */
export function focusOf(crop: PlatformCrop): { x: number; y: number } {
  return { x: crop.x + crop.w / 2, y: crop.y + crop.h / 2 };
}

/**
 * True when a crop asks for fewer source pixels than the destination renders.
 *
 * Instagram lays a feed image out at 1080px on the short edge. A crop taking
 * 40% of a 1024px-wide upload hands it ~410px, which the network then stretches
 * — the picture goes soft and there is nothing the pipeline can honestly do
 * about it, because fixing it would mean upscaling. So the composer says so
 * instead. See MediaFormatPanel.
 */
export const MIN_DELIVERED_EDGE = 1080;

export function isSoft(
  crop: PlatformCrop,
  originalWidth: number,
  originalHeight: number,
): boolean {
  if (!originalWidth || !originalHeight) return false;
  const deliveredWidth = originalWidth * crop.w;
  const deliveredHeight = originalHeight * crop.h;
  return Math.min(deliveredWidth, deliveredHeight) < MIN_DELIVERED_EDGE;
}

/**
 * Whether a crop actually asks for anything.
 *
 * A rectangle covering the whole source is a no-op, and emitting `c_crop` for
 * it would be a pointless transformation on an image that needs none. Rule 13:
 * transform only when the destination requires it.
 */
export function isFullFrame(crop: PlatformCrop): boolean {
  return crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.999 && crop.h >= 0.999;
}

const CLOUDINARY_MARKER = "/image/upload/";

/**
 * Applies a crop to a Cloudinary delivery URL.
 *
 * Returns the URL untouched when there is no crop, when the crop is the whole
 * frame, or when the host is not Cloudinary — in every one of those cases the
 * honest answer is "deliver the original", not "invent a transformation".
 *
 * The crop component goes in first so it applies to the source; the publish
 * pipeline's format/quality component chains ahead of it later, which
 * Cloudinary applies left to right to produce a cropped image in the format the
 * destination network demands.
 */
export function withCrop(url: string, crop?: PlatformCrop | null): string {
  if (!crop || isFullFrame(crop)) return url;

  const at = url.indexOf(CLOUDINARY_MARKER);
  if (at === -1) return url;

  // Fractional values: Cloudinary reads 0 < n <= 1 as a proportion of the
  // source, so this needs no knowledge of the original's pixel dimensions.
  const directive = [
    "c_crop",
    `w_${crop.w}`,
    `h_${crop.h}`,
    `x_${crop.x}`,
    `y_${crop.y}`,
  ].join(",");

  const head = url.slice(0, at + CLOUDINARY_MARKER.length);
  return `${head}${directive}/${url.slice(at + CLOUDINARY_MARKER.length)}`;
}

/**
 * Fills in any platform that has no crop yet, and drops any that is no longer
 * selected. Existing entries are preserved exactly — deselecting Instagram and
 * reselecting it must not silently rebuild a crop the member had adjusted.
 */
export function reconcileCrops(
  current: PlatformMedia,
  platforms: readonly string[],
  imageAspect: number,
): PlatformMedia {
  const next: PlatformMedia = {};
  for (const platform of platforms) {
    next[platform] =
      current[platform] ??
      computeCrop(recommendedRatio(platform), imageAspect);
  }
  return next;
}

/**
 * Copies one platform's framing to every other selected platform.
 *
 * The *focal point and zoom* travel, not the rectangle: a 4:5 rectangle means
 * nothing on a network that renders 1.91:1, so each destination recomputes its
 * own recommended shape around the same subject. That is what "apply this crop
 * to all" should mean — frame everyone on the same part of the picture — and it
 * is why this cannot simply spread the object.
 */
export function applyCropToAll(
  source: PlatformCrop,
  platforms: readonly string[],
  imageAspect: number,
  from: string,
): PlatformMedia {
  const focus = focusOf(source);
  const next: PlatformMedia = {};

  for (const platform of platforms) {
    next[platform] =
      platform === from
        ? source
        : computeCrop(
            // Keep the destination on a ratio it actually supports; fall back
            // to its recommendation when the source's ratio is not offered.
            ratiosFor(platform).includes(source.ratio)
              ? source.ratio
              : recommendedRatio(platform),
            imageAspect,
            { zoom: source.zoom, focusX: focus.x, focusY: focus.y },
          );
  }

  return next;
}
