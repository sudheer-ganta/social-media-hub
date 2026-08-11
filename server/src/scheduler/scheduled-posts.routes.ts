import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { scheduleService } from './schedule.service';
import { ScheduleError } from './errors';
import { PostStatus } from '../generated/prisma/enums';

/**
 * The scheduling API. Mounted at `/api/scheduled-posts`.
 *
 *   POST   /                    arm a saved post to publish later
 *   GET    /                    this member's schedules, soonest first
 *   GET    /:id                 one schedule and its per-network state
 *   PATCH  /:id                 move it, or change which networks it goes to
 *   DELETE /:id                 stand it down (the post itself survives)
 *   POST   /:id/cancel          same, said explicitly
 *   POST   /:id/retry           re-arm one failed network
 *
 * Every route requires a session, and every handler proves ownership inside the
 * query — the backend connects as the database owner and bypasses RLS, so a
 * post id is never sufficient authority on its own.
 *
 * Note what is absent, as on the publish router: no route that takes a caption
 * or a media list. The content published is what is stored on the post. A
 * scheduling endpoint that accepted content would be a way to post arbitrary
 * text to someone's feed with an id you happen to own.
 */
const router = Router();

/**
 * Wraps a handler so a {@link ScheduleError} becomes its own status, message
 * and **code**, and anything else becomes a generic 500.
 *
 * The code is the part the publish API does not have, and the composer needs
 * it: SCHEDULE_TIME_IN_PAST belongs on the date field, ACCOUNT_NOT_CONNECTED
 * belongs next to a link to Integrations, SCHEDULE_ALREADY_PUBLISHED means
 * refresh the list. Matching on English prose is how that breaks the first time
 * a message is reworded.
 */
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof ScheduleError) {
        res.status(error.status).json({ error: error.message, code: error.code });
        return;
      }

      // An unexpected error's message can quote a provider response, a URL or a
      // connection string. It stays in the log.
      console.error('[scheduler] request failed', {
        method: req.method,
        path: req.path,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        error: 'Something went wrong. Please try again.',
        code: 'INTERNAL_ERROR',
      });
    }
  };
}

/** A required string field, or undefined. Arrays and objects never pass. */
function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** A string array field, or undefined. Anything else is dropped, not coerced. */
function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length ? items : undefined;
}

router.post(
  '/',
  requireAuth,
  handle(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    res.status(201).json(
      await scheduleService.createSchedule(req.user.id, {
        postId: str(body.postId) ?? '',
        scheduledAt: str(body.scheduledAt) ?? '',
        timezone: str(body.timezone) ?? '',
        ...(strings(body.providers) && { providers: strings(body.providers)! }),
      }),
    );
  }),
);

router.get(
  '/',
  requireAuth,
  handle(async (req, res) => {
    // `?status=scheduled,failed`. Unknown values are dropped rather than
    // rejected — a filter is a view, and a stale bookmark should show
    // everything rather than error.
    const wanted = str(req.query.status)
      ?.split(',')
      .map((value) => value.trim().toUpperCase())
      .filter((value): value is PostStatus => value in PostStatus);

    res.json(await scheduleService.listSchedules(req.user.id, wanted));
  }),
);

router.get(
  '/:id',
  requireAuth,
  handle(async (req, res) => {
    res.json(await scheduleService.getSchedule(req.user.id, String(req.params.id)));
  }),
);

router.patch(
  '/:id',
  requireAuth,
  handle(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    res.json(
      await scheduleService.updateSchedule(req.user.id, String(req.params.id), {
        ...(str(body.scheduledAt) && { scheduledAt: str(body.scheduledAt)! }),
        ...(str(body.timezone) && { timezone: str(body.timezone)! }),
        ...(strings(body.providers) && { providers: strings(body.providers)! }),
      }),
    );
  }),
);

router.post(
  '/:id/cancel',
  requireAuth,
  handle(async (req, res) => {
    res.json(await scheduleService.cancelSchedule(req.user.id, String(req.params.id)));
  }),
);

router.post(
  '/:id/retry',
  requireAuth,
  handle(async (req, res) => {
    const provider = str((req.body as Record<string, unknown>)?.provider);
    if (!provider) {
      throw new ScheduleError(
        'PROVIDER_NOT_SUPPORTED',
        'Say which network to retry.',
      );
    }
    res.json(
      await scheduleService.retryDestination(
        req.user.id,
        String(req.params.id),
        provider.toLowerCase(),
      ),
    );
  }),
);

router.delete(
  '/:id',
  requireAuth,
  handle(async (req, res) => {
    await scheduleService.deleteSchedule(req.user.id, String(req.params.id));
    res.status(204).end();
  }),
);

export default router;
