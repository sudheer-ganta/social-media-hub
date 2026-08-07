import { prisma } from '../config/prisma';
import type { ActivityLog } from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';

/**
 * The only module that reads or writes `activity_logs`.
 *
 * The table is append-only by convention — there is no update or delete here
 * on purpose. Rows disappear only when the owning auth.users row is deleted,
 * via ON DELETE CASCADE.
 *
 * Write through `services/activity.service.ts` rather than calling this
 * directly: that's where the action names are defined.
 */

export interface CreateActivityInput {
  userId: string;
  action: string;
  provider?: string | null;
  details?: Prisma.InputJsonValue | null;
}

export async function create(
  input: CreateActivityInput,
): Promise<ActivityLog> {
  return prisma.activityLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      provider: input.provider ?? null,
      // Prisma distinguishes "SQL NULL" from "JSON null" for Json columns;
      // an absent payload should be a real NULL, not the JSON literal `null`.
      ...(input.details != null && { details: input.details }),
    },
  });
}

export interface ListActivityOptions {
  /** Narrows to one provider, e.g. only LinkedIn events. */
  provider?: string;
  /** Narrows to one action, e.g. only `social.connect`. */
  action?: string;
  limit?: number;
  /** Rows to skip, for paging. */
  offset?: number;
}

/** A user's activity, newest first. */
export async function listByUser(
  userId: string,
  options: ListActivityOptions = {},
): Promise<ActivityLog[]> {
  const { provider, action, limit = 50, offset = 0 } = options;

  return prisma.activityLog.findMany({
    where: {
      userId,
      ...(provider && { provider }),
      ...(action && { action }),
    },
    orderBy: { createdAt: 'desc' },
    // Hard ceiling: this feeds an activity feed, and an unbounded query against
    // an append-only table is a slow-request waiting to happen.
    take: Math.min(Math.max(limit, 1), 200),
    skip: Math.max(offset, 0),
  });
}

export async function countByUser(
  userId: string,
  options: Pick<ListActivityOptions, 'provider' | 'action'> = {},
): Promise<number> {
  return prisma.activityLog.count({
    where: {
      userId,
      ...(options.provider && { provider: options.provider }),
      ...(options.action && { action: options.action }),
    },
  });
}

export const activityRepository = {
  create,
  listByUser,
  countByUser,
};
