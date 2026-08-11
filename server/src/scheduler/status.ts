import { PostStatus, PublishStatus } from '../generated/prisma/enums';

/**
 * The parent post's status, derived from its destinations.
 *
 * A scheduled post targets N networks and each one succeeds or fails on its
 * own, so the row's single `status` column is a *summary* — it is never written
 * from what one network did. Deriving it in one pure function is what keeps the
 * worker, a cancel and a manual retry from disagreeing about what a post that
 * reached Instagram and not X should say.
 *
 * The order below is the precedence, and each rung is load-bearing:
 *
 *  1. **Nothing to summarise.** No destinations at all — leave the row alone by
 *     answering null. A post with no `post_platforms` rows is a draft.
 *  2. **Still moving.** Anything PENDING (waiting for its slot or its retry) or
 *     PUBLISHING (in flight) means the post is not finished, whatever the
 *     others did. PUBLISHING as a summary, so the due query keeps seeing it.
 *  3. **Mixed outcome.** At least one published and at least one didn't.
 *     PARTIALLY_PUBLISHED exists for precisely this: FAILED would hide a post
 *     that is live on someone's feed, and PUBLISHED would hide a failure the
 *     member still has to act on.
 *  4. **All the same.** Every destination published, every one failed, or every
 *     one was cancelled.
 */
export function deriveParentStatus(
  destinations: Array<{ status: PublishStatus }>,
): PostStatus | null {
  if (destinations.length === 0) return null;

  const has = (status: PublishStatus) =>
    destinations.some((destination) => destination.status === status);

  if (has(PublishStatus.PENDING) || has(PublishStatus.PUBLISHING)) {
    return PostStatus.PUBLISHING;
  }

  const published = has(PublishStatus.PUBLISHED);
  const failed = has(PublishStatus.FAILED);

  if (published && failed) return PostStatus.PARTIALLY_PUBLISHED;
  if (published) return PostStatus.PUBLISHED;
  if (failed) return PostStatus.FAILED;

  // Everything left is CANCELLED — the member called the whole schedule off.
  return PostStatus.CANCELLED;
}

/**
 * Post statuses a scheduled destination may still fire under.
 *
 * SCHEDULED is the first run. PUBLISHING is the state the post sits in while
 * one destination is in flight or waiting on a backoff, and a sibling still has
 * to go out — without it here, a two-network post whose first network started
 * would strand the second. PARTIALLY_PUBLISHED is a manual retry of the network
 * that failed.
 *
 * What is deliberately absent: CANCELLED, PUBLISHED, DRAFT and FAILED. A
 * cancelled post must never execute; the other three have nothing left to do
 * until something re-arms a destination, which is what a retry does.
 */
export const EXECUTABLE_POST_STATUSES = [
  PostStatus.SCHEDULED,
  PostStatus.PUBLISHING,
  PostStatus.PARTIALLY_PUBLISHED,
] as const;

/** Post statuses whose schedule a member may still edit or cancel. */
export const EDITABLE_POST_STATUSES = [
  PostStatus.DRAFT,
  PostStatus.SCHEDULED,
] as const;
