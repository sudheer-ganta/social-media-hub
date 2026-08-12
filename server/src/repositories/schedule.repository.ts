import { prisma } from '../config/prisma';
import type { Post, PostPlatform } from '../generated/prisma/client';
import { PostStatus, PublishStatus } from '../generated/prisma/enums';
import type { MediaType } from '../generated/prisma/enums';
import {
  deriveParentStatus,
  EXECUTABLE_POST_STATUSES,
} from '../scheduler/status';

/**
 * Everything the scheduler reads or writes, and nothing else reads or writes
 * it.
 *
 * There is no `scheduled_posts` table. A scheduled post *is* a `posts` row with
 * `scheduled_at` set, and a scheduled destination *is* a `post_platforms` row
 * with `next_attempt_at` set — the same two tables the manual publisher already
 * owns, behind the same unique (post_id, provider) index that already stops a
 * post going out twice. See the migration for why a parallel table was the
 * wrong shape.
 *
 * Everything in here that decides who wins a race is a **conditional write**.
 * Not a read followed by a write, not a lock held in this process: a single
 * `updateMany` whose `where` names the state the row must currently be in.
 * Postgres serialises those, so of two workers that both saw the same due row,
 * exactly one gets `count === 1`. That is the entire concurrency story, and it
 * survives a restart, a second Render instance and a deploy mid-publish because
 * it never depended on this process being alive.
 */

// ─── scheduling ──────────────────────────────────────────────────────────────

/**
 * Arms a post and its destinations.
 *
 * One transaction, because a post that says SCHEDULED with no destination rows
 * would never fire and a destination armed against a post that is not
 * SCHEDULED would be picked up by a worker before the schedule was real.
 *
 * Destinations are upserted rather than inserted: rescheduling a post that has
 * already been through the composer reuses its rows and clears the previous
 * error, so `post_platforms` keeps answering "where does this post stand on
 * LinkedIn *right now*" with exactly one row — the same invariant
 * `startPlatformPublish` holds for a manual publish.
 *
 * A destination that already PUBLISHED is deliberately left alone. Rescheduling
 * a partially published post must not re-arm the network that succeeded; that
 * is the duplicate publish this whole feature exists to prevent.
 */
export async function armSchedule(
  postId: string,
  providers: string[],
  scheduledAt: Date,
  timezone: string,
  /**
   * What the member chose to publish as, per network.
   *
   * Recorded now because now is when they chose. The worker runs hours later
   * with no composer to ask, so a format that is not written down here is a
   * format that resolves from the media count at publish time — which is
   * correct for every post that never chose, and would be wrong for a Reel.
   *
   * Absent, or absent for one provider, is the null path and is deliberate. It
   * is what every already-armed schedule in the database has, and re-arming
   * without a choice must not invent one.
   */
  contentTypes: Record<string, MediaType> = {},
): Promise<void> {
  await prisma.$transaction([
    prisma.post.update({
      where: { id: postId },
      data: {
        status: PostStatus.SCHEDULED,
        scheduled_at: scheduledAt,
        timezone,
        published_at: null,
        updated_at: new Date(),
      },
    }),
    // Destinations the member removed from the schedule. Cancelled rather than
    // deleted, so a post that was scheduled to X and then wasn't keeps the
    // record of it.
    prisma.postPlatform.updateMany({
      where: {
        postId,
        provider: { notIn: providers },
        status: { in: [PublishStatus.PENDING, PublishStatus.FAILED] },
      },
      data: { status: PublishStatus.CANCELLED, nextAttemptAt: null },
    }),
    // Rows that already exist. `status: { not: PUBLISHED }` is the important
    // half: rescheduling a partially published post must not re-arm the
    // network that succeeded, which would publish it a second time. An upsert
    // cannot express that condition, which is why this is an updateMany and a
    // createMany rather than one call per provider.
    // One update per provider rather than one for all of them, because the
    // content type differs per provider — the same post is a Reel on Instagram
    // and an image post on LinkedIn. `status: { not: PUBLISHED }` is unchanged
    // and still the important half: rescheduling a partially published post
    // must not re-arm the network that succeeded.
    ...providers.map((provider) =>
      prisma.postPlatform.updateMany({
        where: {
          postId,
          provider,
          status: { not: PublishStatus.PUBLISHED },
        },
        data: {
          status: PublishStatus.PENDING,
          nextAttemptAt: scheduledAt,
          errorMessage: null,
          attempts: 0,
          // Written through as null when the member chose nothing, so a format
          // left over from a previous arming cannot outlive the choice that
          // set it.
          contentType: contentTypes[provider] ?? null,
        },
      }),
    ),
    // Rows that do not exist yet. `skipDuplicates` leans on the unique
    // (post_id, provider) index — the same index that arbitrates a manual
    // publish race — so a provider that already has a row, published or not, is
    // left as the updates above found it.
    prisma.postPlatform.createMany({
      data: providers.map((provider) => ({
        postId,
        provider,
        status: PublishStatus.PENDING,
        nextAttemptAt: scheduledAt,
        contentType: contentTypes[provider] ?? null,
      })),
      skipDuplicates: true,
    }),
  ]);
}

/**
 * Calls a schedule off, if it has not already started.
 *
 * The conditional `updateMany` on the post is the whole guard: a worker that
 * has already claimed a destination has moved the post to PUBLISHING, so this
 * matches nothing and the caller is told the schedule is already processing.
 * Cancelling a post out from under a publish in flight is exactly the race that
 * would produce a post live on a network and marked CANCELLED in the database.
 *
 * Returns false when nothing was cancelled, which the service turns into
 * SCHEDULE_ALREADY_PROCESSING or SCHEDULE_ALREADY_PUBLISHED after re-reading
 * the row.
 */
export async function cancelSchedule(
  postId: string,
  userId: string,
): Promise<boolean> {
  const { count } = await prisma.post.updateMany({
    where: {
      id: postId,
      created_by: userId,
      status: { in: [PostStatus.SCHEDULED, PostStatus.DRAFT] },
    },
    // `scheduled_at` is deliberately left in place. It is what marks the post
    // as having been through the scheduler at all, and clearing it would drop
    // the post out of every schedule listing the moment it was cancelled —
    // which is precisely when a member wants to see it and confirm. CANCELLED
    // is what stops it executing; the due query filters on the post's status.
    data: { status: PostStatus.CANCELLED, updated_at: new Date() },
  });
  if (count !== 1) return false;

  // Only rows that had not started. A PUBLISHED destination on a partially
  // published post keeps its outcome — cancelling the schedule cannot unsend
  // what is already on someone's feed.
  await prisma.postPlatform.updateMany({
    where: { postId, status: PublishStatus.PENDING },
    data: { status: PublishStatus.CANCELLED, nextAttemptAt: null },
  });

  return true;
}

/**
 * Takes a post off the schedule entirely — the post itself survives.
 *
 * Distinct from {@link cancelSchedule}, which is a *state* a member chose and
 * wants to keep seeing. This is the delete: it clears `scheduled_at`, which is
 * what every schedule listing filters on, so the post drops out of the schedule
 * and goes back to being an ordinary row in the library.
 *
 * Refused while a worker holds it. Everything else — cancelled, failed,
 * partially published, still armed — can be taken off the list, and any
 * destination that had not started is cancelled with it so nothing is left
 * armed behind a post nobody is watching.
 */
export async function clearSchedule(
  postId: string,
  userId: string,
): Promise<boolean> {
  const { count } = await prisma.post.updateMany({
    where: {
      id: postId,
      created_by: userId,
      status: { notIn: [PostStatus.PUBLISHING, PostStatus.QUEUED] },
    },
    data: { scheduled_at: null, updated_at: new Date() },
  });
  if (count !== 1) return false;

  await prisma.postPlatform.updateMany({
    where: { postId, status: PublishStatus.PENDING },
    data: { status: PublishStatus.CANCELLED, nextAttemptAt: null },
  });

  return true;
}

/**
 * Moves an armed schedule to a new instant, if it has not already started.
 *
 * Same conditional-write guard as {@link cancelSchedule}, and for the same
 * reason: editing the time of a post a worker is currently publishing would
 * change nothing about the request already in flight and would leave the row
 * claiming a future it has already passed.
 */
export async function rescheduleAt(
  postId: string,
  userId: string,
  scheduledAt: Date,
  timezone: string,
): Promise<boolean> {
  const { count } = await prisma.post.updateMany({
    where: {
      id: postId,
      created_by: userId,
      status: PostStatus.SCHEDULED,
    },
    data: { scheduled_at: scheduledAt, timezone, updated_at: new Date() },
  });
  if (count !== 1) return false;

  await prisma.postPlatform.updateMany({
    where: { postId, status: PublishStatus.PENDING },
    data: { nextAttemptAt: scheduledAt },
  });
  return true;
}

// ─── the worker's queries ────────────────────────────────────────────────────

/** A due destination, with the two fields the worker needs off its post. */
export interface DueDestination {
  id: string;
  postId: string;
  provider: string;
  attempts: number;
  userId: string;
}

/**
 * Destinations that are due to fire, oldest first.
 *
 * Three conditions, and each one is a durability property:
 *
 *  • `status: PENDING` — never PUBLISHED (done), never PUBLISHING (someone
 *    holds it), never CANCELLED (the member called it off), never FAILED
 *    (out of attempts). The state machine is the filter.
 *  • `nextAttemptAt <= now` — *not* `scheduled_at`. A first run and a retry are
 *    the same query because both write this column, and a post whose instant
 *    passed while Render was asleep is due the moment the worker asks, which is
 *    the missed-job recovery policy in one comparison.
 *  • the post's own status is executable — the cancel check that cannot be
 *    raced, because a cancel writes the post row and this reads it.
 *
 * Oldest first so a backlog drains in the order it was promised, and bounded so
 * one tick cannot try to publish a thousand posts inside a single interval.
 */
export async function findDueDestinations(
  now: Date,
  limit = 25,
): Promise<DueDestination[]> {
  const rows = await prisma.postPlatform.findMany({
    where: {
      status: PublishStatus.PENDING,
      nextAttemptAt: { lte: now },
      post: { status: { in: [...EXECUTABLE_POST_STATUSES] } },
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
    select: {
      id: true,
      postId: true,
      provider: true,
      attempts: true,
      post: { select: { created_by: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    postId: row.postId,
    provider: row.provider,
    attempts: row.attempts,
    userId: row.post.created_by,
  }));
}

/**
 * Takes exclusive ownership of one destination, or reports that someone else
 * already has it.
 *
 * **This is the duplicate-publish guard for scheduled posts**, and it is one
 * statement on purpose. `where` names PENDING; two workers that both selected
 * this row in the same second both run this update, Postgres serialises them,
 * and the second sees a row that is no longer PENDING and gets `count === 0`.
 * No lock is held in either process, so a worker that dies between the claim
 * and the publish cannot strand the row — the reaper below picks it up.
 *
 * `attempts` is incremented by the *claim*, not by the outcome. A process that
 * is killed mid-publish has still spent an attempt, which is what stops a
 * crash-loop from retrying the same post forever.
 *
 * `nextAttemptAt` is cleared so a row in flight is invisible to the due query
 * even before its status is read.
 */
export async function claimDestination(
  id: string,
  now: Date = new Date(),
): Promise<boolean> {
  const { count } = await prisma.postPlatform.updateMany({
    where: { id, status: PublishStatus.PENDING },
    data: {
      status: PublishStatus.PUBLISHING,
      attempts: { increment: 1 },
      lastAttemptAt: now,
      nextAttemptAt: null,
    },
  });
  return count === 1;
}

/**
 * Hands a claim back with a time to try again.
 *
 * Runs after a *retryable* failure. The status returns to PENDING and
 * `nextAttemptAt` is the backoff, so the ordinary due query picks the row up
 * again — there is no separate retry queue and no separate retry code path.
 * The error message is kept rather than cleared: a member looking at the post
 * between attempt one and attempt two should be able to see why it is waiting.
 *
 * Conditional on the row still being ours (PUBLISHING or, when the publish
 * service already recorded the failure, FAILED) so a cancel that landed in the
 * meantime is not undone.
 */
export async function scheduleRetry(
  id: string,
  nextAttemptAt: Date,
  errorMessage: string,
): Promise<void> {
  await prisma.postPlatform.updateMany({
    where: {
      id,
      status: { in: [PublishStatus.PUBLISHING, PublishStatus.FAILED, PublishStatus.PENDING] },
    },
    data: { status: PublishStatus.PENDING, nextAttemptAt, errorMessage },
  });
}

/**
 * Closes a destination out as failed — no further attempts.
 *
 * The publish service has usually written FAILED already; this is what makes it
 * final by clearing `nextAttemptAt`, and what covers the case where the failure
 * was one the publish service treats as "leaves the post unchanged" and so
 * released the claim back to PENDING. Without this, a permanent error on a
 * released claim would be retried forever.
 */
export async function failDestination(
  id: string,
  errorMessage: string,
): Promise<void> {
  await prisma.postPlatform.updateMany({
    where: {
      id,
      status: { in: [PublishStatus.PUBLISHING, PublishStatus.FAILED, PublishStatus.PENDING] },
    },
    data: {
      status: PublishStatus.FAILED,
      nextAttemptAt: null,
      errorMessage,
    },
  });
}

/**
 * Stamps a destination the publish service has already marked PUBLISHED.
 *
 * Deliberately narrow: it does not write the status, because the publish
 * service wrote it — together with the provider's own id and permalink — at the
 * moment the network confirmed. Duplicating that here would be a second place
 * that can declare a post live.
 */
export async function markDestinationPublished(
  id: string,
  publishedAt: Date = new Date(),
): Promise<void> {
  await prisma.postPlatform.updateMany({
    where: { id, status: PublishStatus.PUBLISHED },
    data: { nextAttemptAt: null, publishedAt },
  });
}

/**
 * Frees destinations abandoned by a process that no longer exists.
 *
 * A worker claims a row, the dyno is redeployed, and the row sits in PUBLISHING
 * with nobody coming back for it. Nothing else can free it — the claim is
 * deliberately not held in memory, so there is no lock to expire.
 *
 * The threshold has to be comfortably longer than the slowest real publish (an
 * Instagram carousel: download, upload, container, publish) or this reaps live
 * work and publishes it twice. Fifteen minutes is roughly twenty times the
 * worst case measured.
 *
 * ponytail: a time-based reaper can, in principle, re-run a publish that
 * reached the network in the instant before the process died — the window is
 * between the provider's 200 and `markPlatformPublished`, which is one write
 * wide. Closing it properly needs a provider-side idempotency key (X and Meta
 * both support one); do that if it is ever observed.
 */
export async function reapStaleClaims(
  staleBefore: Date,
  requeueAt: Date = new Date(),
): Promise<number> {
  const { count } = await prisma.postPlatform.updateMany({
    where: {
      status: PublishStatus.PUBLISHING,
      lastAttemptAt: { lt: staleBefore },
      // Only rows the scheduler owns. A manual publish also sits in PUBLISHING
      // and must not be adopted by the worker — it has a browser waiting on it.
      attempts: { gt: 0 },
    },
    data: { status: PublishStatus.PENDING, nextAttemptAt: requeueAt },
  });
  return count;
}

// ─── parent status ───────────────────────────────────────────────────────────

/**
 * Recomputes the post's own status from its destinations.
 *
 * Called after every attempt, and the reason it has to exist is that
 * `publish.service.ts` writes the post status from *one* network's outcome —
 * correct for a manual publish of a single network, wrong as the last word on a
 * post that also went to two others. This is the last word: it reads every
 * destination and applies {@link deriveParentStatus}.
 *
 * A CANCELLED post is left alone. Its destinations are cancelled too, so the
 * derivation would agree — but re-deriving a terminal state a member chose is
 * how a cancel that raced a final attempt gets silently overturned.
 */
export async function syncParentStatus(postId: string): Promise<PostStatus | null> {
  const destinations = await prisma.postPlatform.findMany({
    where: { postId },
    select: { status: true, publishedAt: true },
  });

  const status = deriveParentStatus(destinations);
  if (!status) return null;

  const publishedAt = destinations
    .map((destination) => destination.publishedAt)
    .filter((value): value is Date => value !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const { count } = await prisma.post.updateMany({
    where: { id: postId, status: { not: PostStatus.CANCELLED } },
    data: {
      status,
      ...(publishedAt && { published_at: publishedAt }),
      updated_at: new Date(),
    },
  });

  return count === 1 ? status : null;
}

// ─── reads for the API ───────────────────────────────────────────────────────

export type ScheduledPostRow = Post & { post_platforms: PostPlatform[] };

/** One scheduled post with its destinations, only if it is this user's. */
export async function findForUser(
  postId: string,
  userId: string,
): Promise<ScheduledPostRow | null> {
  return prisma.post.findFirst({
    where: { id: postId, created_by: userId },
    include: { post_platforms: { orderBy: { createdAt: 'asc' } } },
  });
}

/**
 * A user's scheduled posts, soonest first.
 *
 * Ownership is in the query, not implied by the connection — the backend
 * connects as the database owner and bypasses RLS, so every read here has to
 * prove whose row it is the same way the publish service does.
 */
export async function listForUser(
  userId: string,
  options: { statuses?: PostStatus[]; limit?: number } = {},
): Promise<ScheduledPostRow[]> {
  return prisma.post.findMany({
    where: {
      created_by: userId,
      // Only posts that have been through the scheduler. A draft the member is
      // still writing is not a scheduled post and does not belong on this list.
      scheduled_at: { not: null },
      ...(options.statuses?.length && { status: { in: options.statuses } }),
    },
    include: { post_platforms: { orderBy: { createdAt: 'asc' } } },
    orderBy: [{ scheduled_at: 'asc' }, { created_at: 'desc' }],
    take: options.limit ?? 200,
  });
}

/** One destination row by post and provider — for a per-destination retry. */
export async function findDestination(
  postId: string,
  provider: string,
): Promise<PostPlatform | null> {
  return prisma.postPlatform.findUnique({
    where: { postId_provider: { postId, provider } },
  });
}

/**
 * Re-arms one failed destination to fire immediately.
 *
 * Conditional on FAILED, so this can never re-arm a destination that published
 * — "retry" on a post that is already live on that network is the one thing
 * this feature must not do.
 */
export async function rearmDestination(
  postId: string,
  provider: string,
  at: Date = new Date(),
): Promise<boolean> {
  const { count } = await prisma.postPlatform.updateMany({
    where: { postId, provider, status: PublishStatus.FAILED },
    data: {
      status: PublishStatus.PENDING,
      attempts: 0,
      nextAttemptAt: at,
      errorMessage: null,
    },
  });
  return count === 1;
}

export const scheduleRepository = {
  armSchedule,
  cancelSchedule,
  clearSchedule,
  rescheduleAt,
  findDueDestinations,
  claimDestination,
  scheduleRetry,
  failDestination,
  markDestinationPublished,
  reapStaleClaims,
  syncParentStatus,
  findForUser,
  listForUser,
  findDestination,
  rearmDestination,
};
