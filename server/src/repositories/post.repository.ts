import { prisma } from '../config/prisma';
import type { Post, PostPlatform } from '../generated/prisma/client';
import { PostStatus, PublishStatus } from '../generated/prisma/enums';

/**
 * The only module that reads or writes `posts` and `post_platforms` from the
 * backend.
 *
 * The React frontend also writes `posts`, but through supabase-js/PostgREST
 * under RLS. That's fine — both paths hit the same table and the same
 * constraints. What the backend owns exclusively is `post_platforms`: the
 * per-network publish attempts, which the browser can't see at all.
 */

// ─── posts ───────────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<Post | null> {
  return prisma.post.findUnique({ where: { id } });
}

/**
 * Loads a post only if it belongs to the user. The backend connects as the
 * database owner and so bypasses RLS — ownership has to be checked in the
 * query, not assumed from the connection.
 */
export async function findByIdForUser(
  id: string,
  userId: string,
): Promise<Post | null> {
  return prisma.post.findFirst({ where: { id, created_by: userId } });
}

/** Posts due to go out — what the Sprint 4 scheduler will poll. */
export async function findScheduledDueBefore(
  cutoff: Date,
  limit = 50,
): Promise<Post[]> {
  return prisma.post.findMany({
    where: {
      status: PostStatus.SCHEDULED,
      approved: true,
      publish_date: { lte: cutoff },
    },
    orderBy: [{ publish_date: 'asc' }, { publish_time: 'asc' }],
    take: limit,
  });
}

export async function updateStatus(
  id: string,
  status: PostStatus,
  extra: { publishedAt?: Date | null } = {},
): Promise<Post> {
  return prisma.post.update({
    where: { id },
    data: {
      status,
      ...(extra.publishedAt !== undefined && { published_at: extra.publishedAt }),
      updated_at: new Date(),
    },
  });
}

/**
 * Moves a post from SCHEDULED to QUEUED, but only if it is still SCHEDULED.
 * The conditional update is the claim: two scheduler ticks racing over the
 * same post means exactly one of them sees count === 1 and does the work.
 */
export async function claimForPublishing(id: string): Promise<boolean> {
  const { count } = await prisma.post.updateMany({
    where: { id, status: PostStatus.SCHEDULED },
    data: { status: PostStatus.QUEUED, updated_at: new Date() },
  });
  return count === 1;
}

// ─── post_platforms ──────────────────────────────────────────────────────────

/**
 * Opens (or reopens) the attempt row for one network. Retrying a failed
 * publish reuses the row and clears the previous error rather than appending
 * a second row, so `post_platforms` always answers "where does this post stand
 * on LinkedIn right now" with exactly one row.
 */
export async function startPlatformPublish(
  postId: string,
  provider: string,
): Promise<PostPlatform> {
  return prisma.postPlatform.upsert({
    where: { postId_provider: { postId, provider } },
    create: { postId, provider, status: PublishStatus.PUBLISHING },
    update: {
      status: PublishStatus.PUBLISHING,
      errorMessage: null,
      publishedId: null,
    },
  });
}

/** Why {@link claimPlatformPublish} refused. */
export type PublishClaimRefusal = 'in_progress' | 'already_published';

export type PublishClaim =
  | { claimed: true }
  | { claimed: false; reason: PublishClaimRefusal };

/**
 * Takes exclusive ownership of one network's publish attempt, or reports why it
 * could not.
 *
 * This is the duplicate-publish guard, and it is a *database* guard on purpose.
 * Disabling the button in the browser stops the common case; it does nothing
 * about a double-submit that beats the re-render, two open tabs, a retried
 * request, or a second server instance. Publishing the same post to someone's
 * professional feed twice is not a cosmetic bug, so the check has to happen
 * where the concurrency actually resolves.
 *
 * Two atomic steps, both relying on constraints rather than on read-then-write:
 *
 *  1. A conditional `updateMany` that only matches a row sitting in PENDING or
 *     FAILED. Two requests racing means exactly one sees `count === 1`.
 *  2. When no row exists at all, a plain `create`. The unique index on
 *     (post_id, provider) is what arbitrates — the loser gets P2002 and is
 *     told the attempt is already in flight.
 *
 * A PUBLISHED row is never reclaimed. Retrying a *failed* publish is a normal
 * thing to want; republishing a successful one is almost always a mistake, and
 * the caller is told so rather than silently posting again.
 */
export async function claimPlatformPublish(
  postId: string,
  provider: string,
): Promise<PublishClaim> {
  const { count } = await prisma.postPlatform.updateMany({
    where: {
      postId,
      provider,
      status: { in: [PublishStatus.PENDING, PublishStatus.FAILED] },
    },
    data: {
      status: PublishStatus.PUBLISHING,
      errorMessage: null,
      publishedId: null,
    },
  });
  if (count === 1) return { claimed: true };

  const existing = await prisma.postPlatform.findUnique({
    where: { postId_provider: { postId, provider } },
  });

  if (existing) {
    return {
      claimed: false,
      reason:
        existing.status === PublishStatus.PUBLISHED
          ? 'already_published'
          : 'in_progress',
    };
  }

  try {
    await prisma.postPlatform.create({
      data: { postId, provider, status: PublishStatus.PUBLISHING },
    });
    return { claimed: true };
  } catch (error) {
    // P2002 — a concurrent request created the row between our read and this
    // write. That request owns the attempt; this one steps aside.
    if (isUniqueViolation(error)) {
      return { claimed: false, reason: 'in_progress' };
    }
    throw error;
  }
}

/**
 * Releases a claim without recording a failure against the network.
 *
 * For the case where we claimed the attempt and then found a problem on *our*
 * side — no connection, a caption that cannot be published — before anything
 * was sent. Leaving the row in PUBLISHING would wedge the post forever, and
 * writing FAILED would put a LinkedIn-shaped error on a post LinkedIn never
 * saw.
 */
export async function releasePlatformClaim(
  postId: string,
  provider: string,
): Promise<void> {
  await prisma.postPlatform.updateMany({
    where: { postId, provider, status: PublishStatus.PUBLISHING },
    data: { status: PublishStatus.PENDING, errorMessage: null },
  });
}

/** Prisma's unique-constraint error, without importing its error classes. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export async function markPlatformPublished(
  postId: string,
  provider: string,
  publishedId: string,
): Promise<PostPlatform> {
  return prisma.postPlatform.update({
    where: { postId_provider: { postId, provider } },
    data: {
      status: PublishStatus.PUBLISHED,
      publishedId,
      errorMessage: null,
    },
  });
}

export async function markPlatformFailed(
  postId: string,
  provider: string,
  errorMessage: string,
): Promise<PostPlatform> {
  return prisma.postPlatform.upsert({
    where: { postId_provider: { postId, provider } },
    create: {
      postId,
      provider,
      status: PublishStatus.FAILED,
      errorMessage,
    },
    update: { status: PublishStatus.FAILED, errorMessage },
  });
}

export async function listPlatformsForPost(
  postId: string,
): Promise<PostPlatform[]> {
  return prisma.postPlatform.findMany({
    where: { postId },
    orderBy: { createdAt: 'asc' },
  });
}

/** One network's attempt for one post, or null if it has never been tried. */
export async function findPlatformForPost(
  postId: string,
  provider: string,
): Promise<PostPlatform | null> {
  return prisma.postPlatform.findUnique({
    where: { postId_provider: { postId, provider } },
  });
}

export const postRepository = {
  findById,
  findByIdForUser,
  findScheduledDueBefore,
  updateStatus,
  claimForPublishing,
  startPlatformPublish,
  claimPlatformPublish,
  releasePlatformClaim,
  markPlatformPublished,
  markPlatformFailed,
  listPlatformsForPost,
  findPlatformForPost,
};
