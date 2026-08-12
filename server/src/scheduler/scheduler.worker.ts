import { scheduleRepository, type DueDestination } from '../repositories/schedule.repository';
import { publishService, PublishError } from '../publish/services/publish.service';
import { isRetryable, nextAttemptAt, toStoredMessage, MAX_ATTEMPTS } from './retry';
import { maybeSweepAnalytics, isAnalyticsSyncEnabled } from './analytics-sweep';

/**
 * The scheduler.
 *
 * ## What runs the clock
 *
 * A `setInterval` ticks this loop, and it is **not** the schedule. It is a
 * doorbell: every tick asks the database "what is due?" and the database
 * answers from `post_platforms.next_attempt_at`. Nothing about a pending
 * publish lives in this process — no timer per post, no map of jobs, no state
 * that a restart could lose. Kill the dyno mid-tick and the only thing lost is
 * the tick.
 *
 * That is what makes this safe on Render, where the server restarts on every
 * deploy, sleeps on the free tier, and may run more than one instance:
 *
 *   • **Restart / deploy / crash.** The next process to boot runs the same
 *     query and finds the same due rows. A destination abandoned mid-publish is
 *     freed by {@link reap} after a stale threshold.
 *   • **Sleep.** A post scheduled for 10:00 on an instance that was asleep
 *     until 10:10 is due at 10:10, because the query is `next_attempt_at <=
 *     now` and not `next_attempt_at == now`. It publishes immediately, late.
 *     **This is the missed-job policy**: late, not skipped, and not batched to
 *     some later window — a member who scheduled 10:00 wants it out, and a post
 *     silently dropped because nobody was listening is the worst outcome
 *     available. There is no staleness cutoff; a schedule stays due until it
 *     runs or is cancelled.
 *   • **Two instances.** Both tick, both select the same row, both try to claim
 *     it — and `claimDestination` is a single conditional UPDATE, so exactly
 *     one wins. The loser sees `false` and moves on without contacting anyone.
 *
 * ## What it does not do
 *
 * It does not publish. `publish.service.ts` does — the same function the
 * Publish button calls, with the same ownership check, connection resolution,
 * X token refresh, media pipeline and provider call. This file decides *when*
 * and *whether to try again*, and nothing else.
 */

/**
 * How often to ask.
 *
 * Thirty seconds: fine enough that a scheduled time is honoured to well under a
 * minute, coarse enough that an idle FlowPost costs two indexed queries a
 * minute. The query is a partial-index lookup on `next_attempt_at`, so the
 * empty case is close to free.
 */
const TICK_MS = Number(process.env.SCHEDULER_TICK_MS ?? 30_000);

/**
 * How long a claimed destination may sit in PUBLISHING before it is assumed
 * abandoned.
 *
 * Has to be comfortably longer than the slowest honest publish — an Instagram
 * carousel is a download per image, an upload per image, a container and a
 * publish — or the reaper frees live work and it goes out twice. Fifteen
 * minutes is many times the worst case.
 */
const STALE_CLAIM_MS = Number(process.env.SCHEDULER_STALE_MS ?? 15 * 60_000);

/** Destinations one tick will attempt. Bounds the damage of a large backlog. */
const BATCH = Number(process.env.SCHEDULER_BATCH ?? 25);

/**
 * True while a tick is running.
 *
 * Not a lock — the lock is in the database and has to be, because this variable
 * means nothing to a second Render instance. It is a re-entrancy guard for
 * *this* process: a tick that outruns the interval must not have a second copy
 * of itself started on top of it.
 */
let ticking = false;
let timer: NodeJS.Timeout | null = null;

/**
 * Publishes one due destination.
 *
 * The claim comes first and is the only thing standing between two workers and
 * a double post, so nothing before it may be slow and nothing after it may be
 * skipped. `preClaimed` tells the publish service the attempt is already ours —
 * see {@link PublishOptions} for why claiming twice would be worse than not
 * claiming at all.
 */
async function runDestination(due: DueDestination, now: Date): Promise<void> {
  const claimed = await scheduleRepository.claimDestination(due.id, now);
  if (!claimed) {
    // Another instance got there first, or the member cancelled between the
    // select and the update. Either way it is not ours and nothing is owed.
    return;
  }

  const attempts = due.attempts + 1;

  try {
    const result = await publishService.publishPost(
      due.userId,
      due.postId,
      due.provider,
      { preClaimed: true },
    );

    // The publish service already wrote PUBLISHED, the provider's id and the
    // permalink at the moment the network confirmed. This only stamps the
    // scheduler's own bookkeeping on top.
    await scheduleRepository.markDestinationPublished(
      due.id,
      new Date(result.publishedAt),
    );

    console.log('[scheduler] published', {
      postId: due.postId,
      provider: due.provider,
      attempts,
    });
  } catch (error) {
    await recordFailure(due, attempts, error, now);
  } finally {
    // The last word on the post's own status, always — a scheduled post can
    // target three networks, and `publish.service` writes that column from one
    // network's outcome. See `deriveParentStatus`.
    await scheduleRepository.syncParentStatus(due.postId);
  }
}

/**
 * Decides whether a failed destination gets another go.
 *
 * Retryable *and* attempts left → back to PENDING with a backoff, which the
 * ordinary due query will pick up: there is no second retry path. Otherwise
 * FAILED, terminally, with a message that has already been translated for a
 * member by the publish service.
 *
 * Nothing here logs a token, a header or a provider response body. The stored
 * message is `PublishError.message` or a generic one — never `error.message`
 * from an unknown throw, which can quote a request URL.
 */
async function recordFailure(
  due: DueDestination,
  attempts: number,
  error: unknown,
  now: Date,
): Promise<void> {
  const message = toStoredMessage(error);
  // Backoff measured from the tick's clock, not from `Date.now()`. The two are
  // the same in production and are deliberately not in tests, which is the only
  // way to assert that a retry does *not* fire before its delay has elapsed.
  const retryAt = isRetryable(error) ? nextAttemptAt(attempts, now) : null;

  if (retryAt) {
    await scheduleRepository.scheduleRetry(due.id, retryAt, message);
  } else {
    await scheduleRepository.failDestination(due.id, message);
  }

  console.error('[scheduler] attempt failed', {
    postId: due.postId,
    provider: due.provider,
    attempts,
    maxAttempts: MAX_ATTEMPTS,
    retryAt: retryAt?.toISOString() ?? null,
    // The publish service's status, not the provider's response.
    status: error instanceof PublishError ? error.status : undefined,
  });
}

/**
 * Frees destinations left in PUBLISHING by a process that no longer exists.
 *
 * The counterpart to holding no lock in memory: there is nothing to expire, so
 * the only evidence that a claim is dead is that it is old. Runs before the due
 * query so a reaped row can fire in the same tick.
 */
async function reap(now: Date): Promise<void> {
  const freed = await scheduleRepository.reapStaleClaims(
    new Date(now.getTime() - STALE_CLAIM_MS),
    now,
  );
  if (freed > 0) {
    console.warn('[scheduler] requeued abandoned claims', { count: freed });
  }
}

/**
 * One pass: reap, find what is due, publish each in turn.
 *
 * Sequential rather than parallel, deliberately. Destinations of the same post
 * share a token refresh and a media download, providers rate-limit per account,
 * and a batch of twenty-five publishes fired at once is how a scheduled morning
 * turns into a 429 for everybody. `BATCH` bounds the tick; the next tick takes
 * the rest.
 *
 * Exported for tests and for the boot-time catch-up run.
 */
export async function tick(now: Date = new Date()): Promise<number> {
  await reap(now);

  const due = await scheduleRepository.findDueDestinations(now, BATCH);
  for (const destination of due) {
    try {
      await runDestination(destination, now);
    } catch (error) {
      // A throw here means the bookkeeping itself failed — the database is
      // unreachable, most likely. One bad row must not end the tick, and the
      // row stays claimed until the reaper frees it.
      console.error('[scheduler] destination crashed', {
        postId: destination.postId,
        provider: destination.provider,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  return due.length;
}

async function safeTick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    await tick();
  } catch (error) {
    // Never let a failed tick kill the interval. A database that is down for a
    // minute must not stop the scheduler for the life of the process.
    console.error('[scheduler] tick failed', {
      error: error instanceof Error ? error.message : error,
    });
  }

  try {
    // Analytics rides the same doorbell rather than a second interval — see
    // `analytics-sweep.ts`. It self-gates to roughly every fifteen minutes, so
    // this is a cheap comparison on almost every tick.
    //
    // Deliberately outside the publish `try` and after it: collecting metrics
    // must never delay or fail a scheduled publish, and a publish tick that
    // threw must not skip the sweep.
    await maybeSweepAnalytics();
  } catch (error) {
    console.error('[analytics-sweep] sweep failed', {
      error: error instanceof Error ? error.message : error,
    });
  } finally {
    ticking = false;
  }
}

/**
 * Starts the loop.
 *
 * The first pass runs immediately rather than after one interval, because boot
 * is exactly when there is a backlog: everything that came due while the
 * process was being deployed, restarted or woken is sitting there, and waiting
 * thirty seconds to notice adds thirty seconds to every missed post.
 *
 * `unref()` so the timer does not hold the process open on shutdown.
 */
export function startScheduler(): void {
  if (timer) return;

  console.log('[scheduler] starting', {
    tickMs: TICK_MS,
    batch: BATCH,
    staleClaimMs: STALE_CLAIM_MS,
    maxAttempts: MAX_ATTEMPTS,
    // Whether this process will also collect analytics. Logged because the two
    // are independently switchable and "why is nothing syncing" should be
    // answerable from the boot line rather than from the environment.
    analyticsSync: isAnalyticsSyncEnabled(),
  });

  void safeTick();
  timer = setInterval(safeTick, TICK_MS);
  timer.unref();
}

export function stopScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

export const scheduler = { startScheduler, stopScheduler, tick };
