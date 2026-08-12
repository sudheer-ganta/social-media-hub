import { scheduleRepository, type ScheduledPostRow } from '../repositories/schedule.repository';
import { socialAccountRepository } from '../repositories/social-account.repository';
import { getProvider, getCatalogEntry, isKnownProvider } from '../providers';
import { capabilityFor, isContentType } from '../providers/capabilities';
import type { MediaType } from '../generated/prisma/enums';
import { activityService, ActivityAction } from '../services/activity.service';
import { PostStatus, PublishStatus, SocialAccountStatus } from '../generated/prisma/enums';
import { ScheduleError } from './errors';
import { isValidTimeZone, zonedTimeToUtc, TimezoneError, utcToZonedLocalIso } from './timezone';
import { MAX_ATTEMPTS } from './retry';
import type { Post } from '../generated/prisma/client';

/**
 * What the scheduling API *means*, as opposed to how it is transported
 * (`scheduled-posts.controller.ts`) or stored (`schedule.repository.ts`).
 *
 * Deliberately the same shape as `publish.service.ts`, one layer over: every
 * ownership check, every validation and every member-facing message lives here,
 * so a rule cannot be enforced on the manual path and forgotten on the
 * scheduled one.
 *
 * The one thing this module does **not** do is publish. It arms a schedule and
 * the worker fires it, and the worker calls `publish.service.ts`. There is
 * exactly one implementation of "send a post to a network" in this codebase and
 * neither of these files is it.
 */

/** How far ahead a schedule may be set. Two years — a typo guard, not a policy. */
const MAX_LEAD_MS = 2 * 365 * 24 * 60 * 60 * 1000;

/**
 * How close to "now" a schedule may be.
 *
 * Zero would technically work — the worker fires anything whose instant has
 * passed — but a member who picks a time thirty seconds out has almost
 * certainly mistyped, and "in the past" is a confusing error for a time that
 * was in the future when they pressed the button. Ten seconds of slack also
 * absorbs the clock skew between a browser and Render.
 */
const MIN_LEAD_MS = -10_000;

export interface CreateScheduleInput {
  /** The post to schedule. Its *content* comes from the row, never the request. */
  postId: string;
  /** Local wall clock, `YYYY-MM-DDTHH:mm`. Meaningless without `timezone`. */
  scheduledAt: string;
  /** IANA zone, e.g. `Asia/Kolkata`. */
  timezone: string;
  /** Networks to publish to. Defaults to the post's own `platforms` column. */
  providers?: string[];
  /**
   * What to publish as, per network — `{ "instagram": "REEL" }`.
   *
   * Recorded on the destination rows so the worker, running hours later with no
   * composer to ask, publishes what the member actually chose. Omitting it, or
   * omitting one network, is the null path: that destination resolves its
   * format from the media count exactly as every post did before this existed.
   */
  contentTypes?: Record<string, string>;
}

// ─── shapes the API returns ──────────────────────────────────────────────────

export interface ScheduledDestinationView {
  provider: string;
  providerName: string;
  status: PublishStatus;
  publishedId: string | null;
  url: string | null;
  errorMessage: string | null;
  attempts: number;
  /** Remaining automatic attempts. Zero means only a manual retry is left. */
  attemptsRemaining: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  publishedAt: string | null;
}

export interface ScheduledPostView {
  id: string;
  title: string;
  caption: string;
  imageUrl: string;
  mediaCount: number;
  status: PostStatus;
  /** The canonical instant, UTC. What the worker fires on. */
  scheduledAt: string | null;
  /** The zone the member picked, and the wall clock they picked in it. */
  timezone: string | null;
  scheduledLocal: string | null;
  contextType: string;
  brandId: string | null;
  createdAt: string;
  updatedAt: string;
  destinations: ScheduledDestinationView[];
}

// ─── create / reschedule ─────────────────────────────────────────────────────

/**
 * Arms a post to publish later.
 *
 * Note what is *not* in the input: the caption, the media, the context. Those
 * come off the stored row. That is the same rule the publish API keeps — "the
 * server publishes what is stored on the post, which means the browser cannot
 * ask us to post arbitrary text to someone's feed with a post id it happens to
 * own" — and a scheduling endpoint that accepted content would be a way around
 * it. The composer saves first and schedules second, exactly as it publishes.
 *
 * Every validation below is either an ownership check or something that would
 * otherwise fail at 3am with nobody watching. Getting "you have no Instagram
 * connection" now, in the composer, is the entire value of validating early.
 */
export async function createSchedule(
  userId: string,
  input: CreateScheduleInput,
): Promise<ScheduledPostView> {
  const post = await loadOwnedPost(input.postId, userId);

  assertSchedulable(post);
  assertPublishableContent(post);

  const scheduledAt = resolveInstant(input.scheduledAt, input.timezone);
  const providers = await resolveDestinations(userId, post, input.providers);

  await scheduleRepository.armSchedule(
    post.id,
    providers,
    scheduledAt,
    input.timezone,
    resolveContentTypes(providers, input.contentTypes),
  );

  // Audit. Never allowed to fail a schedule that is already armed.
  await activityService.log({
    userId,
    action: ActivityAction.POST_SCHEDULED,
    details: {
      postId: post.id,
      scheduledAt: scheduledAt.toISOString(),
      timezone: input.timezone,
      providers,
    },
  });

  return getSchedule(userId, post.id);
}

/**
 * Moves an armed schedule, and/or changes its destinations.
 *
 * Only a SCHEDULED post can be edited. PROCESSING cannot — a request already in
 * flight will not read the new time — and PUBLISHED and CANCELLED are terminal.
 * The refusal is a *conditional write* in the repository rather than a check
 * here, so a worker that claims the post between this read and that write still
 * wins.
 */
export async function updateSchedule(
  userId: string,
  postId: string,
  input: Partial<
    Pick<
      CreateScheduleInput,
      'scheduledAt' | 'timezone' | 'providers' | 'contentTypes'
    >
  >,
): Promise<ScheduledPostView> {
  const post = await loadOwnedPost(postId, userId);
  assertSchedulable(post);

  const timezone = input.timezone ?? post.timezone ?? 'UTC';
  const scheduledAt = input.scheduledAt
    ? resolveInstant(input.scheduledAt, timezone)
    : post.scheduled_at;

  if (!scheduledAt) {
    throw new ScheduleError(
      'SCHEDULE_TIME_INVALID',
      'This post has no scheduled time yet. Schedule it before editing.',
    );
  }

  // Destinations changed, or the post was never armed: re-arm it wholesale.
  // Both paths go through `armSchedule`, so "scheduled" means the same set of
  // rows however it was reached.
  if (input.providers || post.status !== PostStatus.SCHEDULED) {
    assertPublishableContent(post);
    const providers = await resolveDestinations(userId, post, input.providers);
    await scheduleRepository.armSchedule(
      post.id,
      providers,
      scheduledAt,
      timezone,
      resolveContentTypes(providers, input.contentTypes),
    );
    return getSchedule(userId, post.id);
  }

  const moved = await scheduleRepository.rescheduleAt(
    post.id,
    userId,
    scheduledAt,
    timezone,
  );
  if (!moved) throw await refusalFor(post.id, userId);

  return getSchedule(userId, post.id);
}

/** Calls a schedule off. Terminal — rescheduling is a new schedule. */
export async function cancelSchedule(
  userId: string,
  postId: string,
): Promise<ScheduledPostView> {
  await loadOwnedPost(postId, userId);

  const cancelled = await scheduleRepository.cancelSchedule(postId, userId);
  if (!cancelled) throw await refusalFor(postId, userId);

  await activityService.log({
    userId,
    action: ActivityAction.POST_SCHEDULE_CANCELLED,
    details: { postId },
  });

  return getSchedule(userId, postId);
}

/**
 * Deletes a schedule.
 *
 * Cancel first, then clear the scheduling columns — the post itself survives.
 * A member deleting a schedule wants the post back as a draft they can rework,
 * not the loss of the caption they wrote; deleting the row is what the posts
 * API is for.
 */
export async function deleteSchedule(
  userId: string,
  postId: string,
): Promise<void> {
  await loadOwnedPost(postId, userId);

  // The refusal is a conditional write, not a check on the row we just read —
  // a worker that claims the post in between still wins.
  const cleared = await scheduleRepository.clearSchedule(postId, userId);
  if (!cleared) throw await refusalFor(postId, userId);
}

/**
 * Re-arms one failed destination to fire immediately.
 *
 * Per-destination on purpose. A post that reached Instagram and failed on X
 * must be retried on X *alone* — re-running the whole schedule is the duplicate
 * publish this feature exists to prevent, and the repository's conditional
 * write refuses a destination that is not FAILED for exactly that reason.
 */
export async function retryDestination(
  userId: string,
  postId: string,
  provider: string,
): Promise<ScheduledPostView> {
  await loadOwnedPost(postId, userId);

  const destination = await scheduleRepository.findDestination(postId, provider);
  if (!destination) {
    throw new ScheduleError(
      'SCHEDULE_NOT_FOUND',
      'That post was never scheduled to publish there.',
    );
  }
  if (destination.status === PublishStatus.PUBLISHED) {
    throw new ScheduleError(
      'SCHEDULE_ALREADY_PUBLISHED',
      'That post is already live on this network.',
    );
  }

  const rearmed = await scheduleRepository.rearmDestination(postId, provider);
  if (!rearmed) {
    throw new ScheduleError(
      'SCHEDULE_ALREADY_PROCESSING',
      'That network is already being published to. Try again in a moment.',
    );
  }

  // The post is FAILED or PARTIALLY_PUBLISHED at this point, neither of which
  // the due query fires on. Re-deriving moves it to PUBLISHING, which does.
  await scheduleRepository.syncParentStatus(postId);

  return getSchedule(userId, postId);
}

// ─── reads ───────────────────────────────────────────────────────────────────

export async function getSchedule(
  userId: string,
  postId: string,
): Promise<ScheduledPostView> {
  const row = await scheduleRepository.findForUser(postId, userId);
  if (!row) {
    throw new ScheduleError(
      'SCHEDULE_NOT_FOUND',
      'That scheduled post could not be found.',
    );
  }
  return toView(row);
}

export async function listSchedules(
  userId: string,
  statuses?: PostStatus[],
): Promise<ScheduledPostView[]> {
  const rows = await scheduleRepository.listForUser(userId, { statuses });
  return rows.map(toView);
}

// ─── validation ──────────────────────────────────────────────────────────────

async function loadOwnedPost(postId: string, userId: string): Promise<ScheduledPostRow> {
  const row = postId
    ? await scheduleRepository.findForUser(postId, userId)
    : null;
  if (!row) {
    // Deliberately the same answer as a post that exists and belongs to someone
    // else. A 403 here would confirm the id is real.
    throw new ScheduleError(
      'SCHEDULE_NOT_FOUND',
      'That scheduled post could not be found.',
    );
  }
  return row;
}

/** The states a schedule may still be created or moved from. */
function assertSchedulable(post: Post): void {
  switch (post.status) {
    case PostStatus.PUBLISHING:
    case PostStatus.QUEUED:
      throw new ScheduleError(
        'SCHEDULE_ALREADY_PROCESSING',
        'This post is being published right now. Try again in a moment.',
      );
    case PostStatus.PUBLISHED:
      throw new ScheduleError(
        'SCHEDULE_ALREADY_PUBLISHED',
        'This post has already been published.',
      );
    case PostStatus.CANCELLED:
      throw new ScheduleError(
        'SCHEDULE_CANCELLED',
        'This schedule was cancelled. Duplicate the post to schedule it again.',
      );
    default:
      // DRAFT, SCHEDULED, FAILED and PARTIALLY_PUBLISHED can all be scheduled:
      // the first two are the ordinary path, and the last two are a member
      // rescheduling something that did not go out.
      return;
  }
}

/**
 * Content the networks will at least *accept an attempt* on.
 *
 * Not the whole of validation — each provider's own validator is the authority
 * and runs at publish time, where it can see the resolved media. This is the
 * subset worth catching hours earlier, in a composer the member is still
 * looking at.
 */
function assertPublishableContent(post: Post): void {
  if (!post.caption?.trim() && !post.ai_caption?.trim()) {
    throw new ScheduleError(
      'INVALID_CONTENT',
      'Add a caption before scheduling this post.',
    );
  }

  for (const url of mediaUrls(post)) {
    // Absolute https only. The publish path fetches these, and a fetch of a
    // member-supplied address is a server-side request forgery primitive — the
    // media service is the trust boundary that enforces it properly, but a
    // relative path or a `file:` URL is worth rejecting while someone is
    // watching rather than at 3am.
    if (!/^https:\/\//i.test(url)) {
      throw new ScheduleError(
        'INVALID_MEDIA',
        'One of the images on this post has an address we cannot publish. Re-upload it and try again.',
      );
    }
  }
}

/** Every media URL on a post, from the multi-image list or the single column. */
function mediaUrls(post: Post): string[] {
  if (Array.isArray(post.media)) {
    const urls = post.media
      .map((entry) =>
        entry && typeof entry === 'object'
          ? String((entry as Record<string, unknown>).url ?? '').trim()
          : '',
      )
      .filter(Boolean);
    if (urls.length) return urls;
  }
  const single = post.image_url?.trim();
  return single ? [single] : [];
}

/** The wall clock the member picked, as the instant it names. */
function resolveInstant(localIso: string, timezone: string): Date {
  if (!isValidTimeZone(timezone)) {
    throw new ScheduleError(
      'TIMEZONE_INVALID',
      'That timezone is not one we recognise.',
    );
  }

  let instant: Date;
  try {
    instant = zonedTimeToUtc(localIso, timezone);
  } catch (error) {
    if (error instanceof TimezoneError) {
      throw new ScheduleError('SCHEDULE_TIME_INVALID', 'Pick a valid date and time.');
    }
    throw error;
  }

  const lead = instant.getTime() - Date.now();
  if (lead < MIN_LEAD_MS) {
    throw new ScheduleError(
      'SCHEDULE_TIME_IN_PAST',
      'Scheduled posts need a date and time in the future.',
    );
  }
  if (lead > MAX_LEAD_MS) {
    throw new ScheduleError(
      'SCHEDULE_TIME_INVALID',
      'Pick a date within the next two years.',
    );
  }

  return instant;
}

/**
 * The networks this schedule will publish to, proven one by one.
 *
 * Four things have to be true of each, and each one is a different failure a
 * member can fix: the id is a network we know, we can actually publish to it,
 * they have connected it *in this post's context*, and that connection has not
 * been revoked. The context comes from the post's own columns — never from the
 * request — so a personal post can never resolve a brand connection.
 */
async function resolveDestinations(
  userId: string,
  post: Post,
  requested?: string[],
): Promise<string[]> {
  const wanted = (requested?.length ? requested : readPostPlatforms(post))
    .map((provider) => String(provider).trim().toLowerCase())
    .filter(Boolean);

  const providers = [...new Set(wanted)];

  if (providers.length === 0) {
    throw new ScheduleError(
      'NO_DESTINATIONS',
      'Choose at least one account to publish to.',
    );
  }

  const context = { contextType: post.context_type, brandId: post.brand_id };

  for (const provider of providers) {
    const name = getCatalogEntry(provider)?.displayName ?? provider;

    if (!isKnownProvider(provider) || !getProvider(provider)?.publish) {
      throw new ScheduleError(
        'PROVIDER_NOT_SUPPORTED',
        `FlowPost can't publish to ${name} yet.`,
      );
    }

    const account = await socialAccountRepository.findByUserAndProvider(
      userId,
      provider,
      context,
    );

    if (!account || account.status === SocialAccountStatus.REVOKED) {
      throw new ScheduleError(
        'ACCOUNT_NOT_CONNECTED',
        context.contextType === 'brand'
          ? `Connect a ${name} account for this brand before scheduling.`
          : `Connect your ${name} account before scheduling.`,
      );
    }

    // EXPIRED is deliberately allowed through for a provider that can refresh.
    // On X a connection sits EXPIRED as a matter of routine two hours after it
    // is made, with a perfectly good refresh token beside it — refusing here
    // would make the normal state of an X connection unschedulable. The publish
    // path renews it. See `ensureFreshAccessToken` in publish.service.ts.
    const provider_ = getProvider(provider);
    if (account.status === SocialAccountStatus.EXPIRED && !provider_?.refreshTokens) {
      throw new ScheduleError(
        'ACCOUNT_NOT_CONNECTED',
        `Your ${name} connection needs reconnecting before you can schedule.`,
      );
    }

    if (provider_?.canPublish && !provider_.canPublish(account.scopes)) {
      throw new ScheduleError(
        'ACCOUNT_NOT_CONNECTED',
        `FlowPost isn't allowed to post to your ${name} account. ` +
          'Reconnect it and approve publishing permission.',
      );
    }
  }

  return providers;
}

/** The post's own `platforms` JSON column, defensively. */
function readPostPlatforms(post: Post): string[] {
  return Array.isArray(post.platforms)
    ? post.platforms.filter((value): value is string => typeof value === 'string')
    : [];
}

/**
 * Why a conditional write refused.
 *
 * Re-reads rather than guessing: the write failed because the row was not in
 * the state we needed, and the only honest way to say which state it *was* in
 * is to look. Reading before the write instead would be the race this design
 * avoids.
 */
async function refusalFor(postId: string, userId: string): Promise<ScheduleError> {
  const row = await scheduleRepository.findForUser(postId, userId);
  if (!row) {
    return new ScheduleError(
      'SCHEDULE_NOT_FOUND',
      'That scheduled post could not be found.',
    );
  }
  switch (row.status) {
    case PostStatus.PUBLISHED:
    case PostStatus.PARTIALLY_PUBLISHED:
      return new ScheduleError(
        'SCHEDULE_ALREADY_PUBLISHED',
        'This post has already been published.',
      );
    case PostStatus.CANCELLED:
      return new ScheduleError(
        'SCHEDULE_CANCELLED',
        'This schedule has already been cancelled.',
      );
    default:
      return new ScheduleError(
        'SCHEDULE_ALREADY_PROCESSING',
        'This post is being published right now. Try again in a moment.',
      );
  }
}

// ─── serialisation ───────────────────────────────────────────────────────────

function toView(row: ScheduledPostRow): ScheduledPostView {
  return {
    id: row.id,
    title: row.title,
    caption: row.caption,
    imageUrl: row.image_url,
    mediaCount: Array.isArray(row.media) ? row.media.length : row.image_url ? 1 : 0,
    status: row.status,
    scheduledAt: row.scheduled_at?.toISOString() ?? null,
    timezone: row.timezone,
    scheduledLocal:
      row.scheduled_at && row.timezone && isValidTimeZone(row.timezone)
        ? utcToZonedLocalIso(row.scheduled_at, row.timezone)
        : null,
    contextType: row.context_type,
    brandId: row.brand_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    destinations: row.post_platforms.map((destination) => ({
      provider: destination.provider,
      providerName:
        getCatalogEntry(destination.provider)?.displayName ?? destination.provider,
      status: destination.status,
      publishedId: destination.publishedId,
      url: destination.permalink,
      // Already written for a member: only translated messages are ever stored.
      errorMessage: destination.errorMessage,
      attempts: destination.attempts,
      attemptsRemaining: Math.max(MAX_ATTEMPTS - destination.attempts, 0),
      lastAttemptAt: destination.lastAttemptAt?.toISOString() ?? null,
      nextAttemptAt: destination.nextAttemptAt?.toISOString() ?? null,
      publishedAt: destination.publishedAt?.toISOString() ?? null,
    })),
  };
}

/**
 * The per-network formats to record, keeping only what this network can carry.
 *
 * Two filters, and both are refusals rather than corrections. A value that is
 * not one of the six is dropped, and so is one this network does not publish —
 * a `REEL` aimed at Facebook, say. Dropping means the destination falls back to
 * the count-based resolution, which is a format that will publish, rather than
 * being armed with one guaranteed to fail hours later when nobody is watching.
 *
 * The composer should never send either, because it is built from these same
 * capabilities. This is the server not trusting that.
 */
function resolveContentTypes(
  providers: string[],
  requested: Record<string, string> | undefined,
): Record<string, MediaType> {
  if (!requested) return {};

  const resolved: Record<string, MediaType> = {};
  for (const provider of providers) {
    const value = requested[provider];
    if (!isContentType(value)) continue;
    if (!capabilityFor(provider, value)) {
      console.warn('[schedule] ignoring a format this network cannot publish', {
        provider,
        contentType: value,
      });
      continue;
    }
    resolved[provider] = value as MediaType;
  }
  return resolved;
}

export const scheduleService = {
  createSchedule,
  updateSchedule,
  cancelSchedule,
  deleteSchedule,
  retryDestination,
  getSchedule,
  listSchedules,
};
