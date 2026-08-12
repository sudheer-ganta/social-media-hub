import { prisma } from '../config/prisma';
import { SocialAccountStatus } from '../generated/prisma/enums';
import { analyticsSyncService } from '../services/analytics-sync.service';
import { getProvider, isKnownProvider } from '../providers';

/**
 * The automatic half of analytics collection.
 *
 * ─── It is not a second scheduler ────────────────────────────────────────────
 * There is no interval here, no timer and no job table. `scheduler.worker.ts`
 * already owns the one `setInterval` this process runs, and it calls
 * {@link sweepAnalytics} on the same tick that publishes due posts. Everything
 * that makes that loop safe on Render — restart-tolerant, sleep-tolerant,
 * safe with two instances — is inherited rather than reimplemented:
 *
 *   • **Nothing is scheduled ahead of time.** Due-ness is derived from
 *     `published_at` and the newest snapshot's `captured_at`, so a tick that
 *     never ran leaves nothing stale. See `analytics/cadence.ts`.
 *   • **The claim is in the database.** `claimAccountForSync` is a conditional
 *     write, so two instances sweeping at once cannot both pay for the same
 *     metered read.
 *   • **A lost race costs a request, never an observation.** Snapshots collide
 *     at a unique index on (target, captured_at floored to the hour).
 *
 * ─── Pacing ──────────────────────────────────────────────────────────────────
 * The publish tick runs every thirty seconds; sweeping that often would be
 * absurd. The sweep self-gates on elapsed time in-process, and the *real* gate
 * is per-account and lives in `metric_sync_state` — so a restart that resets
 * the in-process timer still cannot cause a burst of API calls.
 */

/**
 * How often to look for accounts with analytics work waiting.
 *
 * Fifteen minutes. The finest cadence stage is T+1h, and the per-account pacing
 * floor is thirty minutes, so sweeping more often than this cannot make an
 * observation land any sooner — it can only add empty queries.
 */
const SWEEP_INTERVAL_MS = Number(
  process.env.ANALYTICS_SWEEP_MS ?? 15 * 60_000,
);

/**
 * Connections one sweep will contact. Bounds the damage of a large backlog and
 * of a burst of new connections; the next sweep takes the rest.
 */
const SWEEP_BATCH = Number(process.env.ANALYTICS_SWEEP_BATCH ?? 10);

/** In-process only. A restart re-arms it, which the database gate makes safe. */
let lastSweepAt: number | null = null;

/**
 * Whether the automatic sweep may run at all.
 *
 * Its own switch, independent of `SCHEDULER_ENABLED`, so that collecting
 * metrics can be stopped without stopping publishing. Those are very different
 * risks: a paused sweep costs some analytics history, while a paused scheduler
 * costs a member their scheduled post. Anyone reaching for a kill switch during
 * an incident — a provider outage, an unexpected API bill — wants the first one
 * and must not have to take the second to get it.
 *
 * Defaults to **enabled**, matching `SCHEDULER_ENABLED`'s `!== 'false'` idiom:
 * only the exact string `false` turns it off, so a typo or an empty value fails
 * safe by leaving collection on rather than silently stopping it.
 *
 * Read on every call rather than captured at import, so the switch takes effect
 * on the next tick — during an incident, a restart to change a flag is the
 * thing you least want to need.
 *
 * ─── Interaction with SCHEDULER_ENABLED ──────────────────────────────────────
 * The sweep rides the scheduler's tick, so `SCHEDULER_ENABLED=false` stops both
 * — unchanged from before this flag existed. The relationship is deliberately
 * one-way: this flag narrows what the tick does, it does not start a tick of
 * its own. Giving analytics its own interval would be the second scheduling
 * framework this design exists to avoid.
 */
export function isAnalyticsSyncEnabled(): boolean {
  return process.env.ANALYTICS_SYNC_ENABLED !== 'false';
}

/**
 * Connections that could conceivably have analytics work.
 *
 * Filtered in the query on the two things the database knows — the connection
 * is not revoked, and its network has an adapter at all — so a member with
 * three Instagram connections and one X costs one row, not four round trips
 * that each discover Instagram is unsupported.
 *
 * `scopes` is *not* filtered on here. It is an array column and the required
 * scopes differ per provider; the check happens in `syncAccount`, which is also
 * where the answer has somewhere honest to go.
 */
async function findSweepableAccounts(limit: number) {
  const supported = ['linkedin', 'instagram', 'facebook', 'x', 'youtube'].filter(
    (id) => isKnownProvider(id) && getProvider(id)?.analytics,
  );

  if (supported.length === 0) return [];

  return prisma.socialAccount.findMany({
    where: {
      provider: { in: supported },
      // REVOKED is terminal until the member reconnects. EXPIRED is not — the
      // sync path refreshes tokens, which is how a connection heals itself.
      status: { not: SocialAccountStatus.REVOKED },
    },
    orderBy: [{ syncState: { lastSyncAt: { sort: 'asc', nulls: 'first' } } }],
    take: limit,
    select: { id: true, provider: true },
  });
}

/**
 * What one pass actually did.
 *
 * ─── Why this is not a single number ─────────────────────────────────────────
 *
 * It used to be `contacted`, and `contacted` counted every account whose reason
 * was not `not_eligible` — which includes `missing_scopes`, `unsupported` and
 * every kind of failure. A pass in which every connection was broken logged
 * `{ contacted: 4 }` and read like a healthy one. It was: an Instagram account
 * failing on a retired API parameter, for hours, under a line that said the
 * sweep had contacted it.
 *
 * So the summary separates the three questions that were collapsed into one —
 * *did we look*, *did the network answer*, and **did anything get written**.
 * Only the last one is the point of the feature, and it is the one a number
 * called `contacted` could not express.
 */
export interface SweepSummary {
  /** Connections the query returned as possibly having work. */
  eligible: number;
  /** Of those, the ones a sync was actually run for (not paced or claimed out). */
  attempted: number;
  /** Attempts that completed without a failure. Says nothing about snapshots. */
  succeeded: number;
  /** **The one that matters.** Metric rows written to the database this pass. */
  snapshotsWritten: number;
  failed: number;
  missingScopes: number;
  rateLimited: number;
  /** Paced, backed off, or claimed by another instance. The healthy default. */
  notEligible: number;
  /** No adapter for that network. Never becomes an error. */
  unsupported: number;
}

const EMPTY_SUMMARY: SweepSummary = {
  eligible: 0,
  attempted: 0,
  succeeded: 0,
  snapshotsWritten: 0,
  failed: 0,
  missingScopes: 0,
  rateLimited: 0,
  notEligible: 0,
  unsupported: 0,
};

/**
 * One analytics pass.
 *
 * Most passes do nothing: the per-account pacing and the per-post cadence mean
 * a steady-state FlowPost does real work a few times a day per connection, not
 * every fifteen minutes.
 *
 * Sequential, like the publish loop and for the same reasons: these are
 * metered, per-account rate-limited calls, and firing ten at once is how a
 * sweep turns into a 429 for everybody.
 *
 * Exported for tests, and separate from the gate below so a test can drive a
 * pass without waiting fifteen minutes.
 */
export async function sweepAnalytics(now: Date = new Date()): Promise<SweepSummary> {
  const accounts = await findSweepableAccounts(SWEEP_BATCH);
  const summary: SweepSummary = { ...EMPTY_SUMMARY, eligible: accounts.length };

  for (const account of accounts) {
    try {
      const result = await analyticsSyncService.syncAccount(account.id, { now });

      switch (result.reason) {
        case 'not_eligible':
          summary.notEligible += 1;
          continue;
        case 'unsupported':
          summary.unsupported += 1;
          continue;
        case 'missing_scopes':
          summary.missingScopes += 1;
          break;
        case 'rate_limited':
          summary.rateLimited += 1;
          break;
        default:
          break;
      }

      // Everything past the pacing gate cost us something — a request, or at
      // least the decision not to make one for a stated reason.
      summary.attempted += 1;

      if (result.ok) {
        summary.succeeded += 1;
        summary.snapshotsWritten += result.postSnapshots + result.accountSnapshots;
      } else if (result.reason !== 'missing_scopes' && result.reason !== 'rate_limited') {
        summary.failed += 1;
        // Named per account, not aggregated. A permanently broken adapter and a
        // network having a bad minute produce the same counter, and the
        // provider is what separates them at three in the morning.
        console.warn('[analytics-sweep] account did not sync', {
          socialAccountId: account.id,
          provider: account.provider,
          reason: result.reason,
        });
      }
    } catch (error) {
      summary.attempted += 1;
      summary.failed += 1;
      // syncAccount is written not to throw. If it does, the bookkeeping itself
      // failed — the database is unreachable, most likely. One bad connection
      // must not end the sweep.
      console.error('[analytics-sweep] account crashed', {
        socialAccountId: account.id,
        provider: account.provider,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  return summary;
}

/**
 * The gate the scheduler tick calls.
 *
 * Runs a sweep at most every {@link SWEEP_INTERVAL_MS}, and answers false the
 * rest of the time without touching the database.
 */
export async function maybeSweepAnalytics(now: Date = new Date()): Promise<boolean> {
  // Checked before the interval gate, and deliberately without advancing the
  // clock: turning the switch back on should produce a sweep on the next tick,
  // not fifteen minutes after the tick that found it disabled.
  if (!isAnalyticsSyncEnabled()) return false;

  if (lastSweepAt !== null && now.getTime() - lastSweepAt < SWEEP_INTERVAL_MS) {
    return false;
  }
  lastSweepAt = now.getTime();

  const summary = await sweepAnalytics(now);

  // Logged when anything happened at all, including a pass that only failed —
  // which is exactly the pass the old `contacted > 0` line reported as work.
  if (summary.attempted > 0) {
    console.log('[analytics-sweep] pass complete', summary);
  }
  return true;
}

/** Test seam: forget when the last sweep ran. */
export function resetSweepClock(): void {
  lastSweepAt = null;
}

export const analyticsSweep = {
  sweepAnalytics,
  maybeSweepAnalytics,
  resetSweepClock,
  isAnalyticsSyncEnabled,
};
