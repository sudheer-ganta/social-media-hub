/**
 * The composer's media list: ordering, framing, and what each network gets.
 *
 * ─── The one idea ────────────────────────────────────────────────────────────
 * A post's media is an **ordered array**, and the order is the only thing that
 * says which image comes first. There is no `order` field to keep in step with
 * the array's own indices — two sources of truth for one fact is how a reorder
 * ends up correct on screen and wrong on the network. Move an item and the
 * array is the move.
 *
 * Framing lives on each item as a `PlatformCrop` (see `crop.ts`), so a crop
 * follows its picture through every reorder without any of this code tracking
 * which position it used to be in.
 *
 * Pure and dependency-free, so `scripts/verify-media.ts` can run it under plain
 * `node` with no test runner.
 */

import {
  computeCrop,
  focusOf,
  withCrop,
  type AspectRatioId,
  type PlatformCrop,
  // Extension included so `scripts/verify-media.ts` can run this file under
  // plain node, exactly as `verify-crop.ts` does. Vite resolves it either way.
} from "./crop.ts";
import type { PostMediaItem } from "@/types";

/**
 * The formats the composer offers, in the order they are shown.
 *
 * `original` is the "Mix" option and is deliberately last: it is the answer for
 * a post whose images genuinely differ, not the default. See {@link applyFormat}
 * for what selecting it actually does — which is less than it looks.
 */
export const COMPOSER_FORMATS: Array<{
  id: AspectRatioId;
  label: string;
  hint: string;
}> = [
  { id: "4:5", label: "Portrait", hint: "4:5" },
  { id: "1:1", label: "Square", hint: "1:1" },
  { id: "1.91:1", label: "Landscape", hint: "1.91:1" },
  { id: "original", label: "Mix", hint: "Original ratios" },
];

/** The source image's own width/height. Falls back to square if unmeasured. */
export function itemAspect(item: PostMediaItem): number {
  return item.width && item.height ? item.width / item.height : 1;
}

/**
 * The shape this item renders as, after its crop.
 *
 * What the preview lays out with. An uncropped item answers its own aspect,
 * which is what makes Mix show a portrait as a portrait and a landscape as a
 * landscape rather than fitting everything to one box.
 */
export function renderedAspect(item: PostMediaItem): number {
  const source = itemAspect(item);
  if (!item.crop) return source;
  // The crop rectangle is expressed as fractions of the source, so its rendered
  // shape is the source's aspect scaled by how much of each axis it keeps.
  return (source * item.crop.w) / item.crop.h;
}

/** The delivery URL for this item — the stored asset plus its framing. */
export function itemUrl(item: PostMediaItem): string {
  return withCrop(item.url, item.crop);
}

/**
 * The format every item is currently on, or null when they disagree.
 *
 * Drives which format button reads as selected. Disagreement is a real state
 * and not an error: cropping one image on its own is exactly how a member gets
 * there, and the honest answer then is that no single format is selected.
 */
export function activeFormat(items: PostMediaItem[]): AspectRatioId | null {
  if (items.length === 0) return null;
  const first = items[0].crop?.ratio ?? "original";
  return items.every((item) => (item.crop?.ratio ?? "original") === first)
    ? first
    : null;
}

/**
 * Puts every item on one format.
 *
 * Each image is recomputed against **its own** dimensions rather than given a
 * copied rectangle: a 4:5 crop of a landscape and a 4:5 crop of a portrait are
 * different rectangles, and copying one onto the other is how "apply to all"
 * silently mangles half a carousel. What travels is the format, and each item's
 * existing zoom and focal point, so a picture already framed on a face stays
 * framed on that face.
 *
 * `original` is the interesting case and it is deliberately not a crop: the
 * computed rectangle covers the whole frame, `isFullFrame` is true of it, and
 * the crop is dropped to null. So Mix does not force a shape onto anything —
 * every image keeps the ratio it was uploaded at, and no transformation is
 * emitted at publish time.
 */
export function applyFormat(
  items: PostMediaItem[],
  ratio: AspectRatioId,
): PostMediaItem[] {
  return items.map((item) => ({ ...item, crop: cropFor(item, ratio) }));
}

/**
 * One item's crop for a format, preserving how it is currently framed.
 *
 * `original` stores **null**, and nothing else does. Null is how "no format was
 * imposed on this picture" is written down — it is the state Mix puts every
 * item in, and the state a freshly uploaded image starts in.
 *
 * Every other format stores a crop record even when its rectangle happens to
 * cover the whole picture, which is what a 1:1 crop of an already-square image
 * is. The record is the member's *choice* of format, and a choice that happens
 * to need no pixels removed is still a choice — dropping it would make the
 * Square button stop reading as selected for a square image. Nothing is
 * transformed as a result: `withCrop` and the backend both emit no directive
 * for a full-frame rectangle.
 */
export function cropFor(
  item: PostMediaItem,
  ratio: AspectRatioId,
): PlatformCrop | null {
  if (ratio === "original") return null;

  const focus = item.crop ? focusOf(item.crop) : { x: 0.5, y: 0.5 };
  return computeCrop(ratio, itemAspect(item), {
    zoom: item.crop?.zoom ?? 1,
    focusX: focus.x,
    focusY: focus.y,
  });
}

/**
 * Moves one item to a new position.
 *
 * Returns a new array; the items themselves are untouched, so ids, urls and
 * crops all survive a reorder by construction rather than by being copied
 * carefully. Out-of-range indices return the list unchanged — a drag that ends
 * outside the rail is a cancelled drag, not an error.
 */
export function reorderMedia(
  items: PostMediaItem[],
  from: number,
  to: number,
): PostMediaItem[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * What one network will actually receive.
 *
 * The composer's honesty check, and the reason it takes the limit as an
 * argument rather than knowing it: the number comes from the API, which takes
 * it from the same validator constants the publisher enforces.
 *
 * `overflow` is the count that would be refused. The publish path fails rather
 * than truncating, so this is a warning about a publish that will not happen —
 * not a note about images that will be quietly left behind.
 */
export interface MediaFit {
  /** How many of the attached images this network takes. */
  delivered: number;
  /** How many are over its ceiling. Zero when the post fits. */
  overflow: number;
  /** True when the network takes no images at all. */
  refusesMedia: boolean;
  /** True when the network needs an image and this post has none. */
  missingMedia: boolean;
}

export function mediaFit(
  count: number,
  capability: { maxItems: number; requiresMedia: boolean },
): MediaFit {
  return {
    delivered: Math.min(count, capability.maxItems),
    overflow: Math.max(0, count - capability.maxItems),
    refusesMedia: capability.maxItems === 0 && count > 0,
    missingMedia: capability.requiresMedia && count === 0,
  };
}

/**
 * A media list rebuilt from a post that predates the `media` column.
 *
 * One image, unframed — its per-network crops stay in `platform_media` and are
 * still applied at publish time. Reopening such a draft in the composer shows
 * the image it has always had rather than an empty uploader.
 */
export function mediaFromImageUrl(
  imageUrl: string,
  dimensions?: { width: number; height: number },
): PostMediaItem[] {
  const url = imageUrl.trim();
  if (!url) return [];
  return [
    {
      id: url,
      url,
      type: "image",
      width: dimensions?.width ?? 0,
      height: dimensions?.height ?? 0,
      crop: null,
    },
  ];
}
