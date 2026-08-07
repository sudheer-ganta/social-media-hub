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

export const postRepository = {
  findById,
  findByIdForUser,
  findScheduledDueBefore,
  updateStatus,
  claimForPublishing,
  startPlatformPublish,
  markPlatformPublished,
  markPlatformFailed,
  listPlatformsForPost,
};
