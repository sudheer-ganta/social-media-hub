import { MediaType } from '../generated/prisma/enums';
import type {
  NormalizedPostMetrics,
  ProviderMediaType,
} from '../providers/provider.interface';

/**
 * Turning what a network said into what the database stores, and turning stored
 * numbers into answers — without ever inventing one.
 *
 * Every function here has the same defensive shape: **null in, null out**. A
 * metric a network does not report stays null through aggregation, through
 * derivation, and out through the API. The single rule the rest of the feature
 * depends on is that nothing in this file ever substitutes `0` for "unknown".
 */

/**
 * The provider vocabulary mapped onto the database enum.
 *
 * Written as a total `Record` on purpose: adding a member to `ProviderMediaType`
 * or to `MediaType` without deciding how it maps is a typecheck failure here,
 * not a value silently falling through to OTHER at runtime. That is the whole
 * reason providers are allowed their own copy of the union — the two are kept
 * honest by this table rather than by an import that would breach the layering.
 */
const MEDIA_TYPE_BY_PROVIDER_VALUE: Record<ProviderMediaType, MediaType> = {
  TEXT: MediaType.TEXT,
  IMAGE: MediaType.IMAGE,
  VIDEO: MediaType.VIDEO,
  CAROUSEL: MediaType.CAROUSEL,
  REEL: MediaType.REEL,
  STORY: MediaType.STORY,
  OTHER: MediaType.OTHER,
};

/** Null passes through: an unknown format must not become a claimed one. */
export function toMediaType(
  value: ProviderMediaType | null | undefined,
): MediaType | null {
  return value ? MEDIA_TYPE_BY_PROVIDER_VALUE[value] : null;
}

/**
 * One item of a post's `media` JSON column, as much as this module reads.
 *
 * Structural rather than imported: `posts.media` is a JSONB column the browser
 * writes and has been through more than one shape, so anything unexpected in
 * there must yield a null format rather than an exception.
 */
interface StoredMediaItem {
  type?: unknown;
}

/**
 * What a publication *probably* is, from what was uploaded.
 *
 * A fallback, and labelled as one everywhere it is stored:
 * `post_platforms.media_type_from_platform` stays false for anything derived
 * here, so a later sync that hears the real answer from the network is allowed
 * to overwrite it.
 *
 * It has to exist because the network's answer arrives hours later, at the
 * first metric sync, and a post published in between would otherwise have no
 * format at all. It must never be trusted over the network: Instagram files a
 * video as a REEL whatever we called it on the way in, and only Instagram
 * knows that.
 *
 * Returns null when there is nothing to go on — an empty media array on a post
 * with a caption is a TEXT post, but a *malformed* one tells us nothing, and
 * the two must not collapse.
 */
export function inferMediaTypeFromUpload(media: unknown): MediaType | null {
  if (media === null || media === undefined) return null;
  if (!Array.isArray(media)) return null;

  const items = media.filter(
    (item): item is StoredMediaItem => typeof item === 'object' && item !== null,
  );

  if (items.length === 0) return MediaType.TEXT;

  const types = items.map((item) =>
    typeof item.type === 'string' ? item.type.toLowerCase() : 'image',
  );

  if (types.some((type) => type === 'video')) return MediaType.VIDEO;
  if (types.length > 1) return MediaType.CAROUSEL;
  if (types[0] === 'image') return MediaType.IMAGE;

  return MediaType.OTHER;
}

/**
 * A metric summed across many publications, with its coverage.
 *
 * The coverage is not decoration. If twenty posts are in the window and only
 * five have ever been synced, the sum is a real number describing five posts —
 * and rendering it as the window's total would overstate nothing and understate
 * everything. Callers are expected to surface `reported` alongside `value`; the
 * API does.
 */
export interface Aggregate {
  /** Null when nothing reported this metric at all. Never 0 in that case. */
  value: number | null;
  /** How many of the inputs actually carried a number. */
  reported: number;
  /** How many inputs there were. */
  total: number;
}

/**
 * Sums what was reported and counts what was not.
 *
 * The one function this whole feature's honesty rests on. `[null, null]` is
 * `{ value: null }` — not zero — because "nobody told us" and "it was zero"
 * are different facts and only the second belongs in an average.
 */
export function aggregate(values: Array<number | null | undefined>): Aggregate {
  let sum = 0;
  let reported = 0;

  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      sum += value;
      reported += 1;
    }
  }

  return {
    value: reported === 0 ? null : sum,
    reported,
    total: values.length,
  };
}

/** The mean of what was reported, or null when nothing was. */
export function average(values: Array<number | null | undefined>): number | null {
  const totals = aggregate(values);
  return totals.value === null ? null : totals.value / totals.reported;
}

/**
 * The interaction components that make up "engagement".
 *
 * Named explicitly rather than "every numeric field" so that adding a metric
 * column later cannot silently change what engagement means — and so that
 * `impressions` can never wander into it.
 */
const ENGAGEMENT_COMPONENTS = [
  'likes',
  'comments',
  'shares',
  'reposts',
  'saves',
  'clicks',
] as const;

/**
 * Total interactions on one publication.
 *
 * Sums the components the network reported and ignores the ones it did not,
 * returning null only when it reported none of them. That does mean a network
 * which reports likes but not saves yields a smaller engagement figure than one
 * which reports both — which is correct and is exactly why platform comparison
 * is presented per platform rather than as a single blended average. The
 * alternative, treating an unreported save as zero, would make the two look
 * comparable when they are not.
 */
export function engagementOf(metrics: NormalizedPostMetrics): number | null {
  return aggregate(
    ENGAGEMENT_COMPONENTS.map((component) => metrics[component]),
  ).value;
}

/**
 * Engagement as a share of the audience that saw it.
 *
 * **Derived on read, never stored.** A stored rate freezes against the
 * impression count it was computed from, so the next snapshot would leave a
 * number on screen that no longer matches either of its own inputs.
 *
 * Null unless both sides are real. A zero denominator is null rather than
 * Infinity or 0: a post with no recorded impressions has no meaningful rate,
 * and 0% would read as "nobody engaged" when the truth is "we do not know how
 * many saw it".
 */
export function rate(
  numerator: number | null,
  denominator: number | null,
): number | null {
  if (numerator === null || denominator === null) return null;
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/**
 * The best available "how many saw this" for one publication.
 *
 * Impressions first, then views. Never reach — reach is unique people and
 * impressions are appearances, and dividing engagement by whichever happened to
 * be present would produce two different rates under one label. Reach is
 * reported on its own and compared only against itself.
 */
export function exposureOf(metrics: NormalizedPostMetrics): number | null {
  if (typeof metrics.impressions === 'number') return metrics.impressions;
  if (typeof metrics.views === 'number') return metrics.views;
  return null;
}
