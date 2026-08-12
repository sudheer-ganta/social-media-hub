import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { MediaType, MetricSource, PublishStatus } from '../generated/prisma/enums';
import type { AnalyticsScope, TimeDimension } from '../analytics/window';

/**
 * Every read and write the analytics feature makes against the database.
 *
 * ─── The one rule ────────────────────────────────────────────────────────────
 * **No query in this file runs without a scope.** Every function that reads
 * takes an {@link AnalyticsScope} and every one of them passes it through
 * {@link scopeFilter}, which pins `created_by`, `context_type` *and* `brand_id`
 * simultaneously. That is what makes "never blend Personal and Brand" a
 * property of the data layer rather than a rule each caller has to remember,
 * and it is why there is no unscoped `findAll` here to reach for by mistake.
 *
 * The brand_id half matters as much as the context half: a Personal query
 * filters `brand_id: null`, not merely `context_type: 'personal'`. Without it a
 * member with three brands would see all four contexts' posts under Personal,
 * because every brand post also satisfies "belongs to this user".
 *
 * ─── What counts as published ────────────────────────────────────────────────
 * `post_platforms.status = PUBLISHED` with a non-null `published_id` — never
 * `posts.status`. The two disagree, and the disagreement is not academic:
 * `postsService.publishNow()` sets `posts.status = 'published'` without
 * contacting any network at all. A post marked published in the workspace that
 * never reached a platform has no performance to report, and counting it would
 * put a permanent zero into every average.
 */

/** The scope predicate, applied to a `post` relation. */
function postScopeFilter(scope: AnalyticsScope) {
  return {
    created_by: scope.userId,
    context_type: scope.contextType,
    // Explicit on both branches. `brand_id: null` is a filter in its own right
    // for Personal — see the note above.
    brand_id: scope.contextType === 'brand' ? scope.brandId : null,
  };
}

/**
 * What makes a `post_platforms` row real performance data.
 *
 * `publishedId` non-null as well as the status, because a row can be flipped to
 * PUBLISHED by a code path that never received an id back, and a publication we
 * cannot identify on the network is one we can never sync.
 */
const PUBLISHED_PREDICATE = {
  status: PublishStatus.PUBLISHED,
  publishedId: { not: null },
} as const;

/**
 * Turns a time dimension into a `publishedAt` predicate.
 *
 * Lifetime adds nothing — every retained publication qualifies. A period bounds
 * both ends. The intelligence window adds *no predicate at all* and is applied
 * as a `take` instead, which is the mechanical difference between "the last 20
 * posts" and "the last 20 days" and the reason the two are separate types.
 *
 * A window does require a timestamp to order on, so it demands `publishedAt` is
 * present. Rows published before that column existed carry null and are
 * excluded from windows — they cannot be placed in a sequence honestly — while
 * still counting toward lifetime totals, where their position does not matter.
 */
function dimensionFilter(dimension: TimeDimension) {
  if (dimension.kind === 'period') {
    return { publishedAt: { gte: dimension.from, lt: dimension.to } };
  }
  if (dimension.kind === 'window') {
    return { publishedAt: { not: null } };
  }
  return {};
}

/** The columns every analytics read needs from the publication and its post. */
const PUBLICATION_SELECT = {
  id: true,
  provider: true,
  publishedId: true,
  permalink: true,
  publishedAt: true,
  mediaType: true,
  mediaTypeFromPlatform: true,
  /**
   * What the member asked to publish this *as*.
   *
   * Kept alongside the observed `mediaType` rather than instead of it, because
   * the two answer different questions and a reader needs both: requested is
   * known at publish time and never changes, observed arrives at the first
   * sync and is the network's own word. Analytics groups by observed and falls
   * back to this — see `byMediaType` — so a Reel published an hour ago is
   * counted as a Reel rather than as "format unknown".
   */
  contentType: true,
  socialAccountId: true,
  post: {
    select: {
      id: true,
      title: true,
      caption: true,
      media: true,
      // The pre-`media` single-image column. Selected so a post published
      // before the multi-image composer still has a thumbnail in the feed —
      // `describeMedia` falls back to it, and without the column those rows
      // render as text-only posts that visibly are not.
      image_url: true,
      published_at: true,
    },
  },
  /**
   * The most recent observation only.
   *
   * A publication's current numbers are its newest snapshot, never a sum over
   * its snapshots — the series is cumulative, so adding T+1h to T+24h would
   * count the first day twice. The older rows stay in the table for lifecycle
   * and timing analysis; they are simply not what "how is this post doing"
   * means.
   *
   * ponytail: one correlated subquery per publication. Fine at a window of 60;
   * if a lifetime read over thousands of publications gets slow, replace with a
   * single DISTINCT ON query — that is the upgrade, not a cache.
   */
  metricSnapshots: {
    take: 1,
    orderBy: { capturedAt: 'desc' },
    select: {
      capturedAt: true,
      source: true,
      impressions: true,
      reach: true,
      views: true,
      likes: true,
      comments: true,
      shares: true,
      reposts: true,
      saves: true,
      clicks: true,
      videoViews: true,
      watchTimeMs: true,
    },
  },
} as const;

export type PublicationWithMetrics = Awaited<
  ReturnType<typeof findPublishedPublications>
>[number];

/**
 * Published publications in scope, newest first, with their latest metrics.
 *
 * One row per (post, network): a post that went to Instagram, Facebook and X is
 * three rows here and one row in `posts`. That is the grain every platform and
 * media-type comparison needs, and collapsing it would make "which platform
 * works best" unanswerable.
 */
export async function findPublishedPublications(
  scope: AnalyticsScope,
  options: {
    dimension: TimeDimension;
    /** Restrict to one network. Absent means every network in scope. */
    provider?: string;
  },
) {
  const { dimension, provider } = options;

  return prisma.postPlatform.findMany({
    where: {
      ...PUBLISHED_PREDICATE,
      ...dimensionFilter(dimension),
      ...(provider ? { provider } : {}),
      post: postScopeFilter(scope),
    },
    orderBy: { publishedAt: { sort: 'desc', nulls: 'last' } },
    // The intelligence window, and the only place it is applied. Lifetime and
    // period reads are bounded by their predicate, not by a count.
    ...(dimension.kind === 'window' ? { take: dimension.size } : {}),
    select: PUBLICATION_SELECT,
  });
}

/**
 * How many publications are in scope, ignoring any window.
 *
 * Separate from the read above because "posts published" on a lifetime card is
 * a count of *everything*, and must not quietly become 20 because the
 * intelligence window happens to be set to 20. This is the query that keeps the
 * two dimensions from contaminating each other.
 */
export async function countPublishedPublications(
  scope: AnalyticsScope,
  options: { dimension: LifetimeOrPeriod; provider?: string },
): Promise<number> {
  return prisma.postPlatform.count({
    where: {
      ...PUBLISHED_PREDICATE,
      ...dimensionFilter(options.dimension),
      ...(options.provider ? { provider: options.provider } : {}),
      post: postScopeFilter(scope),
    },
  });
}

/** A dimension that bounds by time rather than by count. */
export type LifetimeOrPeriod = Extract<
  TimeDimension,
  { kind: 'lifetime' } | { kind: 'period' }
>;

/**
 * Distinct FlowPost posts behind the publications in scope.
 *
 * "Posts published" means different things at the two grains and both are real:
 * three publications of one post is three platform results and one piece of
 * content. The overview reports both rather than picking, because picking one
 * makes the other look wrong.
 */
export async function countPublishedPosts(
  scope: AnalyticsScope,
  options: { dimension: LifetimeOrPeriod; provider?: string },
): Promise<number> {
  const rows = await prisma.postPlatform.findMany({
    where: {
      ...PUBLISHED_PREDICATE,
      ...dimensionFilter(options.dimension),
      ...(options.provider ? { provider: options.provider } : {}),
      post: postScopeFilter(scope),
    },
    select: { postId: true },
    distinct: ['postId'],
  });
  return rows.length;
}

// ─── Snapshot writes ─────────────────────────────────────────────────────────

/**
 * A network's response on its way into a `Json?` column.
 *
 * Prisma will not accept a bare `null` for a nullable Json field — it needs
 * `Prisma.DbNull` to mean "SQL NULL", because a plain null is ambiguous between
 * that and the JSON value `null`. Getting this wrong typechecks fine behind a
 * cast and then throws at runtime on the first snapshot with no payload, which
 * is exactly when nobody is watching.
 */
function jsonOrDbNull(
  raw: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return raw === null || raw === undefined
    ? Prisma.DbNull
    : (raw as Prisma.InputJsonValue);
}

export interface PostSnapshotInput {
  postPlatformId: string;
  capturedAt: Date;
  source?: MetricSource;
  impressions?: number | null;
  reach?: number | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  reposts?: number | null;
  saves?: number | null;
  clicks?: number | null;
  videoViews?: number | null;
  watchTimeMs?: number | null;
  raw?: unknown;
}

/**
 * Stores one observation, or does nothing if that observation already exists.
 *
 * `createMany` with `skipDuplicates` rather than an upsert, and the distinction
 * is the point: this table is append-only, so a colliding write must be
 * *dropped*, not merged into the existing row. A re-run inside the same hour
 * hits the (post_platform_id, captured_at) unique index and is skipped, which
 * is the entire duplicate-snapshot strategy.
 *
 * Returns whether a row was actually written, so a sync can report what it did
 * rather than what it attempted.
 */
export async function recordPostSnapshot(
  input: PostSnapshotInput,
): Promise<boolean> {
  const { raw, ...metrics } = input;
  const result = await prisma.postMetricSnapshot.createMany({
    data: [
      {
        ...metrics,
        source: input.source ?? MetricSource.PLATFORM_API,
        raw: jsonOrDbNull(raw),
      },
    ],
    skipDuplicates: true,
  });
  return result.count > 0;
}

export interface AccountSnapshotInput {
  socialAccountId: string;
  userId: string;
  contextType: string;
  brandId: string | null;
  provider: string;
  providerAccountId: string;
  capturedAt: Date;
  source?: MetricSource;
  followers?: number | null;
  following?: number | null;
  postCount?: number | null;
  impressions?: number | null;
  reach?: number | null;
  profileViews?: number | null;
  raw?: unknown;
}

/** As above: append-only, duplicates dropped rather than merged. */
export async function recordAccountSnapshot(
  input: AccountSnapshotInput,
): Promise<boolean> {
  const { raw, ...metrics } = input;
  const result = await prisma.accountMetricSnapshot.createMany({
    data: [
      {
        ...metrics,
        source: input.source ?? MetricSource.PLATFORM_API,
        raw: jsonOrDbNull(raw),
      },
    ],
    skipDuplicates: true,
  });
  return result.count > 0;
}

/**
 * Account history for a scope, oldest first.
 *
 * Filtered on the denormalised scope columns rather than through the connection,
 * which is what lets follower history survive a disconnect and reconnect — the
 * `social_accounts` row changes, the series does not.
 */
export async function findAccountSnapshots(
  scope: AnalyticsScope,
  options: { dimension: LifetimeOrPeriod; provider?: string },
) {
  const { dimension, provider } = options;

  return prisma.accountMetricSnapshot.findMany({
    where: {
      userId: scope.userId,
      contextType: scope.contextType,
      brandId: scope.contextType === 'brand' ? scope.brandId : null,
      ...(provider ? { provider } : {}),
      ...(dimension.kind === 'period'
        ? { capturedAt: { gte: dimension.from, lt: dimension.to } }
        : {}),
    },
    orderBy: { capturedAt: 'asc' },
    select: {
      provider: true,
      providerAccountId: true,
      capturedAt: true,
      followers: true,
      following: true,
      postCount: true,
      impressions: true,
      reach: true,
      profileViews: true,
    },
  });
}

// ─── Publication maintenance ─────────────────────────────────────────────────

/**
 * Records the format a network reported for a publication.
 *
 * Only ever *promotes*: the `mediaTypeFromPlatform: false` guard means a value
 * the network confirmed can never be overwritten by a later inference, while an
 * inference made at publish time is replaced the first time the network speaks.
 * Without the guard a re-sync that failed to resolve a media key would quietly
 * downgrade a known REEL back to a guess.
 */
export async function confirmMediaType(
  postPlatformId: string,
  mediaType: MediaType,
): Promise<void> {
  await prisma.postPlatform.updateMany({
    where: { id: postPlatformId, mediaTypeFromPlatform: false },
    data: { mediaType, mediaTypeFromPlatform: true },
  });
}

// ─── Sync state ──────────────────────────────────────────────────────────────

/**
 * The one table here that is updated in place. It is a cursor, not history.
 */
export async function recordSyncSuccess(
  socialAccountId: string,
  at: Date,
): Promise<void> {
  await prisma.metricSyncState.upsert({
    where: { socialAccountId },
    create: { socialAccountId, lastSyncAt: at, lastSuccessAt: at },
    update: {
      lastSyncAt: at,
      lastSuccessAt: at,
      consecutiveFailures: 0,
      lastError: null,
    },
  });
}

export async function recordSyncFailure(
  socialAccountId: string,
  at: Date,
  message: string,
): Promise<void> {
  await prisma.metricSyncState.upsert({
    where: { socialAccountId },
    create: {
      socialAccountId,
      lastSyncAt: at,
      consecutiveFailures: 1,
      // Bounded: an upstream error can carry a long body, and this column is
      // read by a status endpoint, not by a debugger.
      lastError: message.slice(0, 500),
    },
    update: {
      lastSyncAt: at,
      consecutiveFailures: { increment: 1 },
      lastError: message.slice(0, 500),
    },
  });
}

export async function findSyncStates(socialAccountIds: string[]) {
  if (socialAccountIds.length === 0) return [];
  return prisma.metricSyncState.findMany({
    where: { socialAccountId: { in: socialAccountIds } },
  });
}

export async function findSyncState(socialAccountId: string) {
  return prisma.metricSyncState.findUnique({ where: { socialAccountId } });
}

/** Stands an account down until the network's rate-limit window has passed. */
export async function recordRateLimit(
  socialAccountId: string,
  at: Date,
  until: Date,
  message: string,
): Promise<void> {
  await prisma.metricSyncState.upsert({
    where: { socialAccountId },
    create: {
      socialAccountId,
      lastSyncAt: at,
      rateLimitedUntil: until,
      consecutiveFailures: 1,
      lastError: message.slice(0, 500),
    },
    update: {
      lastSyncAt: at,
      rateLimitedUntil: until,
      consecutiveFailures: { increment: 1 },
      lastError: message.slice(0, 500),
    },
  });
}

/**
 * Takes ownership of an account's next sync, or reports that somebody else has.
 *
 * The same conditional-write pattern the publish scheduler claims destinations
 * with, and for the same reason: two Render instances tick independently, both
 * see the account as eligible, and both would otherwise spend a metered read on
 * it. Writing `lastSyncAt` *before* the work — rather than after — is what makes
 * the claim exclusive, and it is also what makes a worker that dies mid-sync
 * fall out of the way rather than blocking forever: the next tick sees a stale
 * `lastSyncAt` and re-claims once the pacing interval has passed.
 *
 * `notSyncedSince` is the caller's pacing threshold. A row whose `lastSyncAt`
 * is newer than it does not match, so the update writes nothing and this
 * returns false.
 *
 * Snapshots are idempotent regardless — a lost race costs a duplicate request,
 * never a duplicate observation.
 */
export async function claimAccountForSync(
  socialAccountId: string,
  now: Date,
  notSyncedSince: Date,
): Promise<boolean> {
  const existing = await prisma.metricSyncState.findUnique({
    where: { socialAccountId },
  });

  if (!existing) {
    try {
      await prisma.metricSyncState.create({
        data: { socialAccountId, lastSyncAt: now },
      });
      return true;
    } catch (error) {
      // A concurrent worker created the row first. That worker holds the claim.
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  const { count } = await prisma.metricSyncState.updateMany({
    where: {
      socialAccountId,
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: notSyncedSince } }],
    },
    data: { lastSyncAt: now },
  });

  return count > 0;
}

/** Prisma's unique-constraint error, without importing its error classes. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Publications this connection published that could still be read, each with
 * the timestamp of its newest observation.
 *
 * Scoped by `socialAccountId`, which is what keeps a brand's posts out of a
 * personal sync even on the same network: the token that published a post is
 * the only token that can read it, and this column is the record of which one
 * that was.
 *
 * Rows with a null `socialAccountId` are invisible here by construction. Those
 * are publications from before Phase 1, whose connection was never recorded —
 * see {@link countUnattributedPublications}, which counts them so the absence
 * is reported rather than silently looking like "no posts".
 */
export async function findSyncablePublications(
  socialAccountId: string,
  publishedSince: Date | null,
) {
  return prisma.postPlatform.findMany({
    where: {
      socialAccountId,
      status: PublishStatus.PUBLISHED,
      publishedId: { not: null },
      publishedAt: publishedSince ? { gte: publishedSince } : { not: null },
    },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      publishedId: true,
      publishedAt: true,
      mediaTypeFromPlatform: true,
      // Both formats, because they answer different questions and the sync
      // needs whichever is more trustworthy. `mediaType` is what the network
      // said (or what we inferred); `contentType` is what the member asked for.
      // For deciding how long to keep polling — a Story stops existing after a
      // day — either one saying STORY is enough.
      mediaType: true,
      contentType: true,
      metricSnapshots: {
        take: 1,
        orderBy: { capturedAt: 'desc' },
        select: { capturedAt: true },
      },
    },
  });
}

/**
 * Publications on this network, in this context, that can never be synced
 * because nothing recorded which connection they went out through.
 *
 * Counted rather than repaired. Inferring the connection from the context would
 * be right in the common case and wrong for anybody who has disconnected and
 * reconnected — and attributing one member's post to the wrong account is worse
 * than reporting honestly that some history is unreadable. The sync summary
 * carries this number so the gap is stated instead of discovered.
 */
export async function countUnattributedPublications(
  scope: AnalyticsScope,
  provider: string,
): Promise<number> {
  return prisma.postPlatform.count({
    where: {
      provider,
      socialAccountId: null,
      status: PublishStatus.PUBLISHED,
      publishedId: { not: null },
      post: postScopeFilter(scope),
    },
  });
}

/**
 * One post's content plus **every** destination it was sent to, with the full
 * snapshot history of each.
 *
 * Three ways this deliberately differs from {@link findPublishedPublications}:
 *
 *  • **Every destination, not only the published ones.** A post detail page has
 *    to explain what happened, and "X failed" is part of that. The *eligibility
 *    rule is applied by the caller* instead — successful destinations become
 *    performance, the rest become an explanation. Filtering here would make the
 *    failure invisible rather than separate.
 *  • **All snapshots, not the latest.** The growth curve — T+1h, T+6h, T+24h,
 *    T+72h — is the point of a detail view, and `take: 1` is what every other
 *    read wants and this one must not have.
 *  • **Scoped by the post, then by ownership.** The scope predicate is still
 *    applied in full: a post id belonging to another member, or to another
 *    context, returns null rather than somebody else's numbers.
 *
 * Unbounded snapshots are safe *here* and nowhere else: this is one post, whose
 * history is a handful of rows by construction — four staged observations and a
 * weekly tail. The same query across a lifetime window is what `take: 1` exists
 * to prevent.
 */
export async function findPostWithPublications(
  postId: string,
  scope: AnalyticsScope,
) {
  return prisma.post.findFirst({
    where: { id: postId, ...postScopeFilter(scope) },
    select: {
      id: true,
      title: true,
      caption: true,
      media: true,
      image_url: true,
      status: true,
      context_type: true,
      brand_id: true,
      created_at: true,
      published_at: true,
      // The *relation*, not the `platforms` JSON column beside it — that one is
      // the destinations a member ticked in the composer and carries no status,
      // which is exactly the field the platform-mix bug was reading.
      post_platforms: {
        orderBy: { publishedAt: { sort: 'asc', nulls: 'last' } },
        select: {
          id: true,
          provider: true,
          status: true,
          publishedId: true,
          permalink: true,
          publishedAt: true,
          errorMessage: true,
          notice: true,
          mediaType: true,
          mediaTypeFromPlatform: true,
          contentType: true,
          socialAccountId: true,
          metricSnapshots: {
            // Oldest first: this is a growth curve, and a curve read backwards
            // is a chart nobody can use.
            orderBy: { capturedAt: 'asc' },
            select: {
              capturedAt: true,
              source: true,
              impressions: true,
              reach: true,
              views: true,
              likes: true,
              comments: true,
              shares: true,
              reposts: true,
              saves: true,
              clicks: true,
              videoViews: true,
              watchTimeMs: true,
            },
          },
        },
      },
    },
  });
}

export type PostWithPublications = NonNullable<
  Awaited<ReturnType<typeof findPostWithPublications>>
>;

/** The newest account-level observation for a connection's account. */
export async function findLatestAccountCapture(
  userId: string,
  provider: string,
  providerAccountId: string,
): Promise<Date | null> {
  const row = await prisma.accountMetricSnapshot.findFirst({
    where: { userId, provider, providerAccountId },
    orderBy: { capturedAt: 'desc' },
    select: { capturedAt: true },
  });
  return row?.capturedAt ?? null;
}

/**
 * The zone this member schedules in, from the most recent post that recorded one.
 *
 * The timing engine needs a clock and must not assume UTC — an evening
 * recommendation computed in UTC for somebody in Asia/Kolkata lands five and a
 * half hours out, which is the difference between an evening and an afternoon.
 * `posts.timezone` is already the member's stated scheduling zone (the composer
 * writes it on every schedule), so this reads the answer rather than adding a
 * preference column nobody would fill in.
 *
 * Null when no post in scope ever carried one — which the caller must treat as
 * "no zone known", never as UTC.
 */
export async function findScopeTimezone(
  scope: AnalyticsScope,
): Promise<string | null> {
  const row = await prisma.post.findFirst({
    where: { ...postScopeFilter(scope), timezone: { not: null } },
    orderBy: { updated_at: 'desc' },
    select: { timezone: true },
  });
  return row?.timezone ?? null;
}

export const analyticsRepository = {
  findPublishedPublications,
  findScopeTimezone,
  countPublishedPublications,
  countPublishedPosts,
  recordPostSnapshot,
  recordAccountSnapshot,
  findAccountSnapshots,
  confirmMediaType,
  recordSyncSuccess,
  recordSyncFailure,
  recordRateLimit,
  findSyncStates,
  findSyncState,
  claimAccountForSync,
  findSyncablePublications,
  countUnattributedPublications,
  findLatestAccountCapture,
  findPostWithPublications,
};
