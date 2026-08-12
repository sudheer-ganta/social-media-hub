import { analyticsRepository } from '../repositories/analytics.repository';
import { socialAccountRepository } from '../repositories/social-account.repository';
import { getProvider, isKnownProvider } from '../providers';
import { PublishStatus } from '../generated/prisma/enums';
import {
  metricSupportFor,
  type ExposureMetric,
} from '../analytics/metric-support';
import {
  describeMedia,
  describeShape,
  type MediaAssetSummary,
} from '../analytics/media-assets';
import {
  aggregate,
  average,
  engagementOf,
  exposureOf,
  rate,
  type Aggregate,
} from '../analytics/normalise';
import type { AnalyticsScope, WindowDimension } from '../analytics/window';
import type {
  LifetimeOrPeriod,
  PublicationWithMetrics,
} from '../repositories/analytics.repository';
import type { NormalizedPostMetrics } from '../providers/provider.interface';

/**
 * Reading stored analytics back out.
 *
 * Everything here obeys one constraint: **it may only report what was
 * measured.** There is no default, no fallback estimate and no projection
 * anywhere in this file. A metric nothing reported comes back as `null`, and
 * every aggregate carries the count of publications that actually contributed
 * to it — because a reach figure computed from four of twenty posts is a
 * different claim from one computed from twenty, and a caller that cannot tell
 * them apart will present both as the truth.
 *
 * The three time dimensions are honoured as three different queries rather than
 * one parameterised one. See `analytics/window.ts` for why.
 */

/** The metrics a publication carries once its latest snapshot is unwrapped. */
function metricsOf(publication: PublicationWithMetrics): NormalizedPostMetrics {
  const snapshot = publication.metricSnapshots[0];
  if (!snapshot) return {};

  return {
    impressions: snapshot.impressions,
    reach: snapshot.reach,
    views: snapshot.views,
    likes: snapshot.likes,
    comments: snapshot.comments,
    shares: snapshot.shares,
    reposts: snapshot.reposts,
    saves: snapshot.saves,
    clicks: snapshot.clicks,
    videoViews: snapshot.videoViews,
    watchTimeMs: snapshot.watchTimeMs,
  };
}

/** Whether anything has ever been measured for this publication. */
function hasMetrics(publication: PublicationWithMetrics): boolean {
  return publication.metricSnapshots.length > 0;
}

const METRIC_KEYS = [
  'impressions',
  'reach',
  'views',
  'likes',
  'comments',
  'shares',
  'reposts',
  'saves',
  'clicks',
  'videoViews',
  'watchTimeMs',
] as const;

type MetricKey = (typeof METRIC_KEYS)[number];

export type MetricTotals = Record<MetricKey, Aggregate> & {
  engagement: Aggregate;
};

/**
 * Sums every metric across a set of publications, keeping coverage per metric.
 *
 * Per metric rather than per publication, deliberately. A network that reports
 * likes but not saves gives full coverage on one and none on the other, and a
 * single "12 of 20 posts measured" number for the whole block would be wrong
 * for both.
 */
function totalsFor(publications: PublicationWithMetrics[]): MetricTotals {
  const metrics = publications.map(metricsOf);

  const totals = Object.fromEntries(
    METRIC_KEYS.map((key) => [key, aggregate(metrics.map((m) => m[key]))]),
  ) as Record<MetricKey, Aggregate>;

  return {
    ...totals,
    engagement: aggregate(metrics.map(engagementOf)),
  };
}

/**
 * Engagement as a share of exposure, over a set of publications.
 *
 * Computed from the two totals rather than as the mean of each post's own rate.
 * Averaging rates weights a post seen by nine people the same as one seen by
 * nine thousand, which reliably produces a headline percentage that no
 * individual post achieved. Null unless both totals are real.
 */
function engagementRateFor(publications: PublicationWithMetrics[]): number | null {
  const metrics = publications.map(metricsOf);
  const engagement = aggregate(metrics.map(engagementOf));
  const exposure = aggregate(metrics.map(exposureOf));
  return rate(engagement.value, exposure.value);
}

export interface AudiencePoint {
  provider: string;
  providerAccountId: string;
  /** The most recent observation, or null if there has never been one. */
  followers: number | null;
  capturedAt: string | null;
  /** The oldest observation retained — the baseline "since you started". */
  firstFollowers: number | null;
  firstCapturedAt: string | null;
  /** Absolute change between the two. Null unless both ends are real. */
  change: number | null;
  /** Fractional change, e.g. 0.32 for +32%. Null on a zero baseline. */
  changeRate: number | null;
}

/**
 * Audience per connected account, with its growth since the earliest retained
 * observation.
 *
 * **Deliberately not summed into one number.** Followers on Instagram and
 * followers on X are overlapping sets of people, and adding them produces a
 * "total audience" that counts the same person twice and cannot be reconciled
 * with anything either platform reports. Per account is the only honest grain.
 */
async function audienceFor(
  scope: AnalyticsScope,
  dimension: LifetimeOrPeriod,
  provider?: string,
): Promise<AudiencePoint[]> {
  const snapshots = await analyticsRepository.findAccountSnapshots(scope, {
    dimension,
    ...(provider ? { provider } : {}),
  });

  const byAccount = new Map<string, typeof snapshots>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.provider}:${snapshot.providerAccountId}`;
    const existing = byAccount.get(key);
    if (existing) existing.push(snapshot);
    else byAccount.set(key, [snapshot]);
  }

  return [...byAccount.values()].map((series) => {
    // The repository returns them oldest first.
    const withFollowers = series.filter((s) => s.followers !== null);
    const first = withFollowers[0];
    const last = withFollowers[withFollowers.length - 1];
    const head = series[0]!;

    const change =
      first && last && first.followers !== null && last.followers !== null
        ? last.followers - first.followers
        : null;

    return {
      provider: head.provider,
      providerAccountId: head.providerAccountId,
      followers: last?.followers ?? null,
      capturedAt: last?.capturedAt.toISOString() ?? null,
      firstFollowers: first?.followers ?? null,
      firstCapturedAt: first?.capturedAt.toISOString() ?? null,
      change,
      // A baseline of zero has no meaningful percentage — reporting one would
      // mean dividing by zero and calling the result growth.
      changeRate:
        change !== null && first?.followers ? change / first.followers : null,
    };
  });
}

export interface Coverage {
  /** Publications in scope for this answer. */
  publications: number;
  /** How many of them have ever been synced. */
  measured: number;
}

export interface OverviewResult {
  scope: { contextType: string; brandId: string | null };
  dimension: LifetimeOrPeriod;
  postsPublished: number;
  publications: number;
  coverage: Coverage;
  totals: MetricTotals;
  engagementRate: number | null;
  audience: AudiencePoint[];
}

/**
 * The lifetime (or reporting-period) picture for one context.
 *
 * `postsPublished` and `publications` are both reported because they are both
 * true at different grains: one post that went to three networks is one piece
 * of content and three platform results. Picking one would make the other look
 * like an error.
 */
export async function overview(
  scope: AnalyticsScope,
  dimension: LifetimeOrPeriod,
  provider?: string,
): Promise<OverviewResult> {
  const [publications, postsPublished, publicationCount, audience] =
    await Promise.all([
      analyticsRepository.findPublishedPublications(scope, {
        dimension,
        ...(provider ? { provider } : {}),
      }),
      analyticsRepository.countPublishedPosts(scope, {
        dimension,
        ...(provider ? { provider } : {}),
      }),
      analyticsRepository.countPublishedPublications(scope, {
        dimension,
        ...(provider ? { provider } : {}),
      }),
      audienceFor(scope, dimension, provider),
    ]);

  return {
    scope: { contextType: scope.contextType, brandId: scope.brandId },
    dimension,
    postsPublished,
    publications: publicationCount,
    coverage: {
      publications: publications.length,
      measured: publications.filter(hasMetrics).length,
    },
    totals: totalsFor(publications),
    engagementRate: engagementRateFor(publications),
    audience,
  };
}

export interface PlatformBreakdownEntry {
  provider: string;
  publications: number;
  coverage: Coverage;
  totals: MetricTotals;
  engagementRate: number | null;
  /**
   * What this network calls "how many saw it", and what it is.
   *
   * Carried on the breakdown so a caller can label a column *before* any number
   * arrives. Deriving it from which of reach/impressions came back non-null
   * works only once something has — a network still collecting would render
   * under no heading at all, or worse, under the previous network's.
   */
  exposureMetric: ExposureMetric;
  exposureLabel: string | null;
  /**
   * Which metrics this network actually reported for this sample.
   *
   * Present so a comparison can show what is missing rather than showing a gap
   * that reads as a bad result. An empty list means nothing has been synced for
   * this network yet — which is not the same as it performing poorly.
   */
  reportedMetrics: MetricKey[];
}

/**
 * Per-network performance.
 *
 * Grouped, never blended. Two networks' engagement rates are computed from
 * different denominators over different audiences, and averaging them produces
 * a number that describes neither. The API returns them side by side and leaves
 * the comparison to a reader who can see what each one measured.
 */
export async function byPlatform(
  scope: AnalyticsScope,
  dimension: LifetimeOrPeriod | WindowDimension,
): Promise<PlatformBreakdownEntry[]> {
  const publications = await analyticsRepository.findPublishedPublications(
    scope,
    { dimension },
  );

  const byProvider = new Map<string, PublicationWithMetrics[]>();
  for (const publication of publications) {
    const existing = byProvider.get(publication.provider);
    if (existing) existing.push(publication);
    else byProvider.set(publication.provider, [publication]);
  }

  return [...byProvider.entries()]
    .map(([provider, rows]) => {
      const totals = totalsFor(rows);
      const support = metricSupportFor(provider);
      return {
        provider,
        publications: rows.length,
        coverage: {
          publications: rows.length,
          measured: rows.filter(hasMetrics).length,
        },
        totals,
        engagementRate: engagementRateFor(rows),
        exposureMetric: support.exposure,
        exposureLabel: support.exposureLabel,
        reportedMetrics: METRIC_KEYS.filter(
          (key) => totals[key].reported > 0,
        ),
      };
    })
    .sort((a, b) => b.publications - a.publications);
}

export interface MediaTypeBreakdownEntry {
  /** Null is a real bucket: publications whose format is not yet known. */
  mediaType: string | null;
  publications: number;
  coverage: Coverage;
  totals: MetricTotals;
  engagementRate: number | null;
  averageEngagement: number | null;

  /**
   * How many of these publications the *network* confirmed the format of.
   *
   * The provenance the brief calls for, and it is not decoration. A REEL bucket
   * built entirely from what the member *asked for* is a claim about intent; one
   * the network confirmed is a claim about what was published. Instagram files
   * a video as a Reel whatever we called it, so the two genuinely diverge — and
   * "Reels perform best" computed from unconfirmed rows would be a statement
   * about our own labelling.
   */
  confirmed: number;
  /** Publications classified from the member's request, not the network's answer. */
  inferred: number;

  /**
   * Whether there is enough here to say anything strong.
   *
   * Below {@link STRONG_SIGNAL_MIN_PUBLICATIONS} measured publications, a
   * caller must say "Early signal" rather than "your audience prefers Reels" —
   * four posts is a coincidence with a percentage attached. Computed here so
   * the threshold is one number in one place rather than a magic constant in
   * each component that renders a bucket.
   */
  strongSignal: boolean;
}

/**
 * How many *measured* publications a format needs before a claim about it is
 * worth making.
 *
 * Five is a judgement, not a statistic — it is small enough to be reachable in
 * a member's first month and large enough that one viral post cannot define a
 * format. It gates language, never data: the numbers are shown either way, and
 * this only decides whether they are introduced as a finding or as a hint.
 */
export const STRONG_SIGNAL_MIN_PUBLICATIONS = 5;

/**
 * Per-format performance, within the intelligence window.
 *
 * A window rather than lifetime because "what format is working" is a question
 * about now — a member who switched from images to reels three months ago is
 * badly served by an answer averaged over both eras.
 *
 * Publications with an unknown format are their own bucket rather than being
 * dropped. Silently excluding them would make the percentages add up to
 * something less than the window while appearing to describe all of it.
 */
export async function byMediaType(
  scope: AnalyticsScope,
  dimension: WindowDimension,
  provider?: string,
): Promise<MediaTypeBreakdownEntry[]> {
  const publications = await analyticsRepository.findPublishedPublications(
    scope,
    { dimension, ...(provider ? { provider } : {}) },
  );

  const byType = new Map<string | null, PublicationWithMetrics[]>();
  for (const publication of publications) {
    // Observed first, requested second — the same precedence the sync service
    // uses to pick a metrics horizon. Without the fallback every publication
    // sits in the "unknown" bucket until its first sync an hour later, so a
    // member who just published a Reel would be told they had published
    // nothing of any recognised format. Requested is a weaker fact than the
    // network's own answer, which is exactly why it loses to it and is only
    // consulted when there is no answer yet.
    const key = publication.mediaType ?? publication.contentType ?? null;
    const existing = byType.get(key);
    if (existing) existing.push(publication);
    else byType.set(key, [publication]);
  }

  return [...byType.entries()]
    .map(([mediaType, rows]) => ({
      mediaType,
      publications: rows.length,
      coverage: {
        publications: rows.length,
        measured: rows.filter(hasMetrics).length,
      },
      totals: totalsFor(rows),
      engagementRate: engagementRateFor(rows),
      averageEngagement: average(rows.map((row) => engagementOf(metricsOf(row)))),
      confirmed: rows.filter((row) => row.mediaTypeFromPlatform).length,
      inferred: rows.filter((row) => !row.mediaTypeFromPlatform).length,
      // Counted over *measured* rows, not published ones. Twelve Reels of which
      // one has ever been synced is one data point, and gating on the published
      // count would call that a strong signal.
      strongSignal:
        rows.filter(hasMetrics).length >= STRONG_SIGNAL_MIN_PUBLICATIONS,
    }))
    .sort((a, b) => b.publications - a.publications);
}

export interface PostPerformanceRow {
  postId: string;
  postPlatformId: string;
  provider: string;
  platformPostId: string | null;
  permalink: string | null;
  publishedAt: string | null;
  mediaType: string | null;
  mediaTypeConfirmed: boolean;
  title: string;
  /**
   * The caption as published.
   *
   * Carried here because caption intelligence is built on the pairing of text
   * and outcome, and this endpoint is the only place the two meet. Nothing in
   * this phase analyses it — see the Phase 2 note in the audit.
   */
  caption: string;
  metrics: NormalizedPostMetrics;
  engagement: number | null;
  engagementRate: number | null;
  /** False when this publication has never been synced. */
  measured: boolean;
  lastCapturedAt: string | null;
  /**
   * The exposure figure under this network's own name.
   *
   * On the row rather than looked up client-side, for the same reason the
   * platform breakdown carries it: "Reach" and "Impressions" are different
   * measurements, and the only place that knows which one a network reports is
   * `metric-support.ts`. A second copy of that table in the browser would drift.
   */
  exposure: ExposureReading;
  /** Which metrics this network ever reports. Anything else is "—", not zero. */
  reportsMetrics: readonly string[];
  /** First image or video poster on the post, for the feed thumbnail. */
  thumbnailUrl: string | null;
  /** "Video", "3 images", "Text only" — what was attached. */
  mediaShape: string;
}

/**
 * The first frame worth showing for a post.
 *
 * A video's poster before its file, because a `<video>` src in a list is a
 * download per row. Null for a text post, which is a fact and renders as one.
 */
function thumbnailOf(assets: MediaAssetSummary[]): string | null {
  const first = assets[0];
  if (!first) return null;
  return first.posterUrl ?? first.url;
}

/**
 * Every publication in the intelligence window, with its real numbers.
 *
 * The row-level feed the recent-intelligence surfaces read, and the foundation
 * caption analysis will later be correlated against. Unmeasured publications
 * are included with `measured: false` rather than filtered out, so a caller can
 * tell "this post did badly" from "we have not looked yet".
 */
export async function posts(
  scope: AnalyticsScope,
  dimension: WindowDimension,
  provider?: string,
): Promise<PostPerformanceRow[]> {
  const publications = await analyticsRepository.findPublishedPublications(
    scope,
    { dimension, ...(provider ? { provider } : {}) },
  );

  return publications.map((publication) => {
    const metrics = metricsOf(publication);
    const engagement = engagementOf(metrics);
    const snapshot = publication.metricSnapshots[0];
    const support = metricSupportFor(publication.provider);
    const assets = describeMedia(publication.post);

    return {
      postId: publication.post.id,
      postPlatformId: publication.id,
      provider: publication.provider,
      platformPostId: publication.publishedId,
      permalink: publication.permalink,
      publishedAt: publication.publishedAt?.toISOString() ?? null,
      mediaType: publication.mediaType,
      mediaTypeConfirmed: publication.mediaTypeFromPlatform,
      title: publication.post.title,
      caption: publication.post.caption,
      metrics,
      engagement,
      engagementRate: rate(engagement, exposureOf(metrics)),
      measured: hasMetrics(publication),
      lastCapturedAt: snapshot?.capturedAt.toISOString() ?? null,
      exposure: {
        metric: support.exposure,
        label: support.exposureLabel,
        value: support.exposure ? (metrics[support.exposure] ?? null) : null,
      },
      reportsMetrics: support.reports,
      thumbnailUrl: thumbnailOf(assets),
      mediaShape: describeShape(assets),
    };
  });
}

export interface TimeseriesPoint {
  date: string;
  publications: number;
  /** Null when nothing in the bucket reported the metric. */
  value: number | null;
  reported: number;
}

/**
 * One metric bucketed by publish date.
 *
 * Buckets on when a post *went out*, not on when it was measured. "Reach in
 * March" means the reach of what was published in March; bucketing by capture
 * date would move a post's numbers into whichever month the sync happened to
 * run, which is not a fact about anything.
 *
 * Days with no publications are omitted rather than emitted as zero — a day
 * nothing was posted has no performance, and a zero would draw a trough into a
 * chart that means "did not publish", not "did badly".
 */
export async function timeseries(
  scope: AnalyticsScope,
  dimension: LifetimeOrPeriod,
  metric: MetricKey | 'engagement',
  provider?: string,
): Promise<TimeseriesPoint[]> {
  const publications = await analyticsRepository.findPublishedPublications(
    scope,
    { dimension, ...(provider ? { provider } : {}) },
  );

  const byDate = new Map<string, Array<number | null>>();
  for (const publication of publications) {
    if (!publication.publishedAt) continue;
    const date = publication.publishedAt.toISOString().slice(0, 10);
    const metrics = metricsOf(publication);
    const value =
      metric === 'engagement' ? engagementOf(metrics) : (metrics[metric] ?? null);

    const existing = byDate.get(date);
    if (existing) existing.push(value);
    else byDate.set(date, [value]);
  }

  return [...byDate.entries()]
    .map(([date, values]) => {
      const totals = aggregate(values);
      return {
        date,
        publications: values.length,
        value: totals.value,
        reported: totals.reported,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── One post, everywhere it went ────────────────────────────────────────────

/** One observation in a publication's history. */
export interface SnapshotPoint {
  capturedAt: string;
  source: string;
  metrics: NormalizedPostMetrics;
  /** Engagement at this observation, or null when nothing was reported. */
  engagement: number | null;
}

/** How one network describes what it measured, so nothing is mislabelled. */
export interface ExposureReading {
  /** `reach` on Instagram, `impressions` on X and LinkedIn. Null when neither. */
  metric: ExposureMetric;
  /** "Reach", "Impressions" — what to put above the number. */
  label: string | null;
  /** The value, or null. Null never means zero. */
  value: number | null;
}

/**
 * One successful platform publication of a post, with its performance.
 *
 * "Successful" is load-bearing: a destination that failed or is still pending
 * is not here — it is in {@link PostDetail.notPublished}. Mixing the two would
 * put a null-metric row beside real ones and make a failure read as a post that
 * simply did badly.
 */
export interface PublicationPerformance {
  postPlatformId: string;
  provider: string;
  platformPostId: string | null;
  permalink: string | null;
  socialAccountId: string | null;
  publishedAt: string | null;
  /** What the member asked to publish this as. Null when they never chose. */
  contentType: string | null;
  /** What it actually is on the network, where known. */
  mediaType: string | null;
  /** True when the network said so; false when we inferred it at publish time. */
  mediaTypeConfirmed: boolean;
  /**
   * The exposure figure *under its own name*.
   *
   * The reason Instagram's 1,842 and LinkedIn's 7 are never put in one column:
   * the first is unique accounts and the second is appearances. See
   * `analytics/metric-support.ts`.
   */
  exposure: ExposureReading;
  /** The newest observation's numbers. Every field may be null. */
  metrics: NormalizedPostMetrics;
  engagement: number | null;
  engagementRate: number | null;
  /** Which normalised metrics this network ever reports. The rest are "—". */
  reportsMetrics: readonly string[];
  /**
   * What the UI should say when there are no numbers yet.
   *
   * Three genuinely different states that must not render alike:
   *   `measured`    — we have an observation.
   *   `collecting`  — published, analytics enabled, nothing observed yet.
   *   `unavailable` — this network cannot be read at all for this connection.
   */
  state: 'measured' | 'collecting' | 'unavailable';
  lastCapturedAt: string | null;
  /** Every observation, oldest first. The growth curve. */
  history: SnapshotPoint[];
  /** A note about the publication itself, e.g. media X refused. */
  notice: string | null;
}

/** A destination that did not produce a publication. Never a performance row. */
export interface UnpublishedDestination {
  provider: string;
  status: string;
  errorMessage: string | null;
}

/** What the platforms can tell us about individual media, which today is nothing. */
export interface MediaLevelSupport {
  provider: string;
  available: boolean;
  note: string;
}

export interface PostDetail {
  postId: string;
  title: string;
  caption: string;
  status: string;
  contextType: string;
  brandId: string | null;
  createdAt: string;
  publishedAt: string | null;
  /** The assets, described. Never carrying platform metrics — see below. */
  media: MediaAssetSummary[];
  /** "Video", "3 images", "Text only". */
  mediaShape: string;
  /** Successful publications, each with its own real numbers. */
  published: PublicationPerformance[];
  /** Destinations that failed, are pending, or were cancelled. */
  notPublished: UnpublishedDestination[];
  /**
   * Per network, whether per-asset metrics exist. False everywhere today.
   *
   * Declared rather than assumed so the UI says "Instagram reports metrics for
   * the whole post, including carousels — not per image" instead of showing a
   * breakdown that would have to be invented.
   */
  mediaLevel: MediaLevelSupport[];
}

/**
 * One post, everywhere it went, with everything actually measured about it.
 *
 * The endpoint that answers "what happened to *this* post?". It is deliberately
 * one query and one payload rather than four endpoints: the platform rows, the
 * history and the media all come off the same post, and splitting them would
 * mean four ownership checks and four round trips to draw one screen.
 *
 * Returns null when the post does not exist **or is not in this scope** — the
 * two are one answer on purpose, so a probe cannot distinguish "no such post"
 * from "somebody else's post".
 *
 * Unlike every other read here, this one is *lifetime by construction*: a
 * post's own history is not narrowed by an intelligence window. "The last 20
 * posts" is a question about a feed, and this is a question about one post.
 */
export async function postDetail(
  scope: AnalyticsScope,
  postId: string,
): Promise<PostDetail | null> {
  const post = await analyticsRepository.findPostWithPublications(postId, scope);
  if (!post) return null;

  // Which of this member's connections can be read at all. Used to tell
  // "collecting" from "we cannot look" — the difference between a spinner and
  // a Reconnect prompt.
  const readable = await readableProviders(scope);

  const published: PublicationPerformance[] = [];
  const notPublished: UnpublishedDestination[] = [];

  for (const destination of post.post_platforms) {
    // The same eligibility rule the rest of analytics uses. A row marked
    // PUBLISHED without an id cannot be identified on the network and is not a
    // publication we can report on.
    const isPublished =
      destination.status === PublishStatus.PUBLISHED && destination.publishedId;

    if (!isPublished) {
      notPublished.push({
        provider: destination.provider,
        status: destination.status,
        errorMessage: destination.errorMessage,
      });
      continue;
    }

    const support = metricSupportFor(destination.provider);
    const snapshots = destination.metricSnapshots;
    const latest = snapshots[snapshots.length - 1];
    const metrics = latest ? snapshotMetrics(latest) : {};
    const engagement = latest ? engagementOf(metrics) : null;

    published.push({
      postPlatformId: destination.id,
      provider: destination.provider,
      platformPostId: destination.publishedId,
      permalink: destination.permalink,
      socialAccountId: destination.socialAccountId,
      publishedAt: destination.publishedAt?.toISOString() ?? null,
      contentType: destination.contentType,
      mediaType: destination.mediaType,
      mediaTypeConfirmed: destination.mediaTypeFromPlatform,
      exposure: {
        metric: support.exposure,
        label: support.exposureLabel,
        value: support.exposure ? (metrics[support.exposure] ?? null) : null,
      },
      metrics,
      engagement,
      engagementRate: rate(engagement, exposureOf(metrics)),
      reportsMetrics: support.reports,
      state: latest
        ? 'measured'
        : readable.has(destination.provider)
          ? 'collecting'
          : 'unavailable',
      lastCapturedAt: latest?.capturedAt.toISOString() ?? null,
      history: snapshots.map((snapshot) => {
        const point = snapshotMetrics(snapshot);
        return {
          capturedAt: snapshot.capturedAt.toISOString(),
          source: snapshot.source,
          metrics: point,
          engagement: engagementOf(point),
        };
      }),
      notice: destination.notice,
    });
  }

  const media = describeMedia(post);

  return {
    postId: post.id,
    title: post.title,
    caption: post.caption,
    status: post.status,
    contextType: post.context_type,
    brandId: post.brand_id,
    createdAt: post.created_at.toISOString(),
    publishedAt: post.published_at?.toISOString() ?? null,
    media,
    mediaShape: describeShape(media),
    published,
    notPublished,
    // Only for networks this post actually reached. Declaring it for every
    // network would be a page full of "unavailable" for platforms the member
    // never published to.
    mediaLevel: [...new Set(published.map((row) => row.provider))].map(
      (provider) => {
        const support = metricSupportFor(provider);
        return {
          provider,
          available: support.mediaLevel,
          note: support.mediaLevelNote,
        };
      },
    ),
  };
}

/**
 * The providers whose analytics this member can actually read right now.
 *
 * Reused from {@link syncStatus}'s own logic rather than duplicated: a
 * connection with no adapter, or without the granted scopes, cannot produce a
 * snapshot — so a publication on it is `unavailable`, not `collecting`, and the
 * UI must not show a spinner that will never resolve.
 */
async function readableProviders(scope: AnalyticsScope): Promise<Set<string>> {
  const connections = await syncStatus(scope);
  return new Set(
    connections.filter((entry) => entry.analyticsEnabled).map((e) => e.provider),
  );
}

/** One stored snapshot row, as normalised metrics. */
function snapshotMetrics(snapshot: {
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
}): NormalizedPostMetrics {
  return {
    impressions: snapshot.impressions,
    reach: snapshot.reach,
    views: snapshot.views,
    likes: snapshot.likes,
    comments: snapshot.comments,
    shares: snapshot.shares,
    reposts: snapshot.reposts,
    saves: snapshot.saves,
    clicks: snapshot.clicks,
    videoViews: snapshot.videoViews,
    watchTimeMs: snapshot.watchTimeMs,
  };
}

export interface SyncStatusEntry {
  provider: string;
  socialAccountId: string;
  displayName: string | null;
  username: string | null;
  status: string;
  /** False when this network has no analytics adapter at all. */
  analyticsSupported: boolean;
  /**
   * True only when the network *can* be read and this connection holds the
   * scopes for it. False with `analyticsSupported: true` is precisely the
   * "Reconnect to enable analytics" case.
   */
  analyticsEnabled: boolean;
  /** The scopes this connection is missing, for a specific prompt. */
  missingScopes: string[];
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
}

/**
 * Whether analytics can be read at all, per connected account.
 *
 * This is the endpoint that keeps the product honest about its own coverage. An
 * account whose network has no adapter, or whose granted scopes fall short,
 * reports that plainly — the UI's answer is "reconnect to enable analytics",
 * never a zero or an estimate.
 *
 * Scopes are read from `social_accounts.scopes`, which records what the member
 * actually *granted*, not what we asked for. Somebody who unticked a permission
 * on the consent screen is caught here rather than on a 403 mid-sync.
 */
export async function syncStatus(
  scope: AnalyticsScope,
): Promise<SyncStatusEntry[]> {
  const accounts = await socialAccountRepository.listByUser(scope.userId, {
    contextType: scope.contextType,
    brandId: scope.brandId,
  });

  const states = await analyticsRepository.findSyncStates(
    accounts.map((account) => account.id),
  );
  const stateById = new Map(states.map((state) => [state.socialAccountId, state]));

  return accounts.map((account) => {
    // A stored provider string that is not in the catalogue has no adapter and
    // no scopes to check — it reports as unsupported rather than throwing.
    const analytics = isKnownProvider(account.provider)
      ? getProvider(account.provider)?.analytics
      : undefined;
    const granted = account.scopes ?? [];
    const missingScopes = analytics
      ? analytics.requiredScopes.filter((required) => !granted.includes(required))
      : [];
    const state = stateById.get(account.id);

    return {
      provider: account.provider,
      socialAccountId: account.id,
      displayName: account.displayName ?? null,
      username: account.username ?? null,
      status: account.status,
      analyticsSupported: Boolean(analytics),
      analyticsEnabled: Boolean(analytics?.hasRequiredScopes(granted)),
      missingScopes,
      lastSyncAt: state?.lastSyncAt?.toISOString() ?? null,
      lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null,
      consecutiveFailures: state?.consecutiveFailures ?? 0,
      lastError: state?.lastError ?? null,
    };
  });
}

export const analyticsQueryService = {
  overview,
  byPlatform,
  byMediaType,
  posts,
  postDetail,
  timeseries,
  syncStatus,
};
