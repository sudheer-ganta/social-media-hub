import { engagementOf, exposureOf } from './normalise';
import type { TimingPublication } from './timing';
import type { CaptionedPublication } from '../ai/learning/hashtag-history';
import type { MediaType } from '../generated/prisma/enums';

/**
 * One stored publication, reduced to the few numbers every intelligence surface
 * scores on.
 *
 * Extracted because three consumers need exactly this reduction — the best-time
 * engine, hashtag learning and brand performance learning — and three copies of
 * it would be three places for the null rules to drift. The rules themselves are
 * not restated here: `engagementOf` and `exposureOf` in `normalise.ts` own them,
 * so "a metric the network never reported stays null and the publication is
 * dropped rather than counted as a zero" holds identically everywhere.
 *
 * Pure, and deliberately structural rather than importing Prisma's row type: it
 * accepts anything with these fields, which is what lets a test build one by
 * hand and what keeps `ai/learning` free of the database.
 */

/** As much of a stored snapshot as scoring reads. */
export interface SnapshotLike {
  impressions: number | null;
  reach: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  reposts: number | null;
  saves: number | null;
  clicks: number | null;
  videoViews: number | null;
  watchTimeMs: number | null;
}

/** As much of a stored publication as scoring reads. */
export interface PublicationLike {
  provider: string;
  publishedAt: Date | null;
  mediaType: MediaType | null;
  contentType: MediaType | null;
  /** Newest first, as every analytics read selects it. Only the first is used. */
  metricSnapshots: SnapshotLike[];
  post?: { caption?: string | null } | null;
}

/**
 * The timing view, or null when the publication cannot be placed on a clock.
 *
 * A missing `publishedAt` is the only hard exclusion: a publication with no
 * timestamp cannot be bucketed by hour honestly, and rows written before that
 * column existed carry none. A publication with no snapshot yet *is* included,
 * with both numbers null — it was published and not measured, which is the
 * normal state of anything under an hour old, and the scorers drop it themselves
 * rather than having it filtered out here as though it did not exist.
 */
export function toTimingPublication(
  publication: PublicationLike,
): TimingPublication | null {
  if (!publication.publishedAt) return null;

  const snapshot = publication.metricSnapshots[0] ?? null;

  return {
    provider: publication.provider,
    publishedAt: publication.publishedAt,
    mediaType: publication.mediaType,
    contentType: publication.contentType,
    engagement: snapshot ? engagementOf(snapshot) : null,
    exposure: snapshot ? exposureOf(snapshot) : null,
  };
}

/**
 * The same view with the caption attached, for the two learners that read text.
 *
 * The caption is the *published* one — `posts.caption`, what actually went out —
 * not a generated suggestion. That matters for hashtag learning especially: the
 * tags a member kept are evidence, and the tags a model once offered are not.
 */
export function toCaptionedPublication(
  publication: PublicationLike,
): CaptionedPublication | null {
  const timing = toTimingPublication(publication);
  if (!timing) return null;

  return { ...timing, caption: publication.post?.caption ?? '' };
}

/** Maps a list, dropping whatever cannot be scored. Order is preserved. */
export function toTimingPublications(
  publications: PublicationLike[],
): TimingPublication[] {
  return publications
    .map(toTimingPublication)
    .filter((entry): entry is TimingPublication => entry !== null);
}

export function toCaptionedPublications(
  publications: PublicationLike[],
): CaptionedPublication[] {
  return publications
    .map(toCaptionedPublication)
    .filter((entry): entry is CaptionedPublication => entry !== null);
}
