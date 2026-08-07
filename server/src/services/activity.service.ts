import {
  activityRepository,
  type ListActivityOptions,
} from '../repositories/activity.repository';
import type { ActivityLog, Prisma } from '../generated/prisma/client';

/**
 * The audit trail. Every notable thing a user's account does — connecting a
 * network, publishing a post, failing to — goes through here.
 *
 * Two rules make this safe to call from anywhere:
 *
 *  1. **Logging never breaks the caller.** A failed insert is reported to the
 *     console and swallowed. Losing an audit row is bad; failing a LinkedIn
 *     publish because the audit row wouldn't write is worse.
 *  2. **Nothing secret goes in `details`.** Tokens, authorization codes and
 *     client secrets are stripped on the way in — see {@link sanitize}. The
 *     column is JSONB and easy to over-share into.
 */

/** Canonical action names. Strings in the DB, a closed set in code. */
export const ActivityAction = {
  SOCIAL_CONNECT: 'social.connect',
  SOCIAL_DISCONNECT: 'social.disconnect',
  SOCIAL_REFRESH: 'social.refresh',
  POST_PUBLISH: 'post.publish',
  FAILURE: 'failure',
} as const;

export type ActivityAction =
  (typeof ActivityAction)[keyof typeof ActivityAction];

export type ActivityDetails = Record<string, unknown>;

/**
 * Anything whose key looks credential-shaped is replaced rather than stored.
 * Deliberately a denylist on key names: `details` payloads come from provider
 * responses whose exact shape we don't control, so the cheap keyword check
 * catches far more than an allowlist we'd have to keep in sync per provider.
 */
const SECRET_KEY_PATTERN =
  /(token|secret|password|credential|authorization|api[-_]?key|code)/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY_PATTERN.test(key)
      ? '[redacted]'
      : sanitize(val, depth + 1);
  }
  return out;
}

/**
 * Writes one audit row. Resolves to the row, or to null when the write failed
 * — callers are expected to ignore the result.
 */
export async function log(entry: {
  userId: string;
  action: string;
  provider?: string | null;
  details?: ActivityDetails | null;
}): Promise<ActivityLog | null> {
  try {
    return await activityRepository.create({
      userId: entry.userId,
      action: entry.action,
      provider: entry.provider ?? null,
      // The cast is unavoidable: `details` is an open-ended payload, and
      // Prisma's InputJsonValue can't be satisfied by Record<string, unknown>.
      // sanitize() has already walked it, so what lands here is plain JSON.
      details:
        entry.details == null
          ? null
          : (sanitize(entry.details) as Prisma.InputJsonValue),
    });
  } catch (error) {
    console.error('[activity] failed to write audit row', {
      action: entry.action,
      provider: entry.provider,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

/** A social network was connected (or reconnected) via OAuth. */
export function logConnection(
  userId: string,
  provider: string,
  details?: ActivityDetails,
) {
  return log({
    userId,
    action: ActivityAction.SOCIAL_CONNECT,
    provider,
    details: details ?? null,
  });
}

/** A social network was disconnected and its tokens deleted. */
export function logDisconnection(
  userId: string,
  provider: string,
  details?: ActivityDetails,
) {
  return log({
    userId,
    action: ActivityAction.SOCIAL_DISCONNECT,
    provider,
    details: details ?? null,
  });
}

/** An access token was exchanged for a fresh one. */
export function logRefresh(
  userId: string,
  provider: string,
  details?: ActivityDetails,
) {
  return log({
    userId,
    action: ActivityAction.SOCIAL_REFRESH,
    provider,
    details: details ?? null,
  });
}

/** A post went out to a network. */
export function logPublish(
  userId: string,
  provider: string,
  details: { postId: string; publishedId?: string } & ActivityDetails,
) {
  return log({
    userId,
    action: ActivityAction.POST_PUBLISH,
    provider,
    details,
  });
}

/**
 * Something went wrong. `error` is accepted as an Error or a string so callers
 * can pass a catch block's value straight through; only the message is stored,
 * never the stack, which tends to carry URLs with tokens in them.
 */
export function logFailure(
  userId: string,
  error: unknown,
  context: { provider?: string | null; action?: string } & ActivityDetails = {},
) {
  const { provider = null, action, ...rest } = context;

  return log({
    userId,
    action: ActivityAction.FAILURE,
    provider,
    details: {
      ...rest,
      ...(action && { failedAction: action }),
      message: error instanceof Error ? error.message : String(error),
    },
  });
}

/** Reads the feed back. Thin pass-through, kept here so callers import one module. */
export function listForUser(userId: string, options?: ListActivityOptions) {
  return activityRepository.listByUser(userId, options);
}

export const activityService = {
  log,
  logConnection,
  logDisconnection,
  logRefresh,
  logPublish,
  logFailure,
  listForUser,
};
