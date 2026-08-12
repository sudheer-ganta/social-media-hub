/**
 * The automatic sweep: what it picks up, how often it runs, and that it cannot
 * take the publish tick down with it.
 *
 * Run: cd server && npx vitest run src/scheduler/analytics-sweep.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.DATABASE_URL = 'postgresql://test/test';
  process.env.SCHEDULER_ENABLED = 'false';
});

const db = vi.hoisted(() => ({ accounts: [] as any[], findManyArgs: [] as any[] }));

vi.mock('../config/prisma', () => ({
  prisma: {
    socialAccount: {
      findMany: vi.fn(async (args: any) => {
        db.findManyArgs.push(args);
        const allowed: string[] = args.where.provider.in;
        return db.accounts
          .filter((a) => allowed.includes(a.provider) && a.status !== 'REVOKED')
          .slice(0, args.take)
          .map((a) => ({ id: a.id, provider: a.provider }));
      }),
    },
  },
}));

const syncAccount = vi.hoisted(() => vi.fn());

vi.mock('../services/analytics-sync.service', () => ({
  analyticsSyncService: { syncAccount },
}));

vi.mock('../providers', () => ({
  isKnownProvider: (id: string) =>
    ['x', 'linkedin', 'instagram', 'facebook', 'youtube'].includes(id),
  // Four adapters. YouTube has none and never enters the query — which is the
  // thing this mock exists to keep true as adapters are added.
  getProvider: (id: string) =>
    id === 'youtube' ? { id } : { id, analytics: {} },
}));

import {
  isAnalyticsSyncEnabled,
  maybeSweepAnalytics,
  resetSweepClock,
  sweepAnalytics,
} from './analytics-sweep';

const T0 = new Date('2026-08-11T10:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

beforeEach(() => {
  db.accounts.length = 0;
  db.findManyArgs.length = 0;
  vi.clearAllMocks();
  resetSweepClock();
  delete process.env.ANALYTICS_SYNC_ENABLED;
  syncAccount.mockResolvedValue({ ok: true, reason: undefined });
});

afterEach(() => {
  delete process.env.ANALYTICS_SYNC_ENABLED;
});

describe('which connections a sweep considers', () => {
  it('asks only for networks that have an analytics adapter', async () => {
    db.accounts.push(
      { id: 'a1', provider: 'x', status: 'CONNECTED' },
      { id: 'a2', provider: 'linkedin', status: 'CONNECTED' },
      { id: 'a3', provider: 'instagram', status: 'CONNECTED' },
      { id: 'a4', provider: 'facebook', status: 'CONNECTED' },
      { id: 'a5', provider: 'youtube', status: 'CONNECTED' },
    );

    await sweepAnalytics(T0);

    // YouTube is excluded in the query, so a member with an unsupported
    // connection costs no round trip that only rediscovers "unsupported".
    // Analytics is not an Instagram feature: every network with an adapter is
    // swept on the same tick, by the same engine.
    expect(db.findManyArgs[0].where.provider.in).toEqual([
      'linkedin',
      'instagram',
      'facebook',
      'x',
    ]);
    expect(syncAccount).toHaveBeenCalledTimes(4);
    expect(syncAccount).toHaveBeenCalledWith('a1', { now: T0 });
    expect(syncAccount).toHaveBeenCalledWith('a3', { now: T0 });
  });

  it('excludes revoked connections but not expired ones', async () => {
    // EXPIRED is recoverable — the sync path refreshes tokens, which is how a
    // connection heals itself. REVOKED is terminal until the member reconnects.
    await sweepAnalytics(T0);
    expect(db.findManyArgs[0].where.status).toEqual({ not: 'REVOKED' });
  });

  it('bounds one pass, so a backlog cannot become a burst', async () => {
    await sweepAnalytics(T0);
    expect(db.findManyArgs[0].take).toBe(10);
  });

  it('takes the least recently synced first', async () => {
    await sweepAnalytics(T0);
    expect(db.findManyArgs[0].orderBy).toEqual([
      { syncState: { lastSyncAt: { sort: 'asc', nulls: 'first' } } },
    ]);
  });
});

describe('counting real work', () => {
  it('does not count a connection that was merely paced out', async () => {
    db.accounts.push({ id: 'a1', provider: 'x', status: 'CONNECTED' });
    syncAccount.mockResolvedValue({ ok: false, reason: 'not_eligible' });

    // The common, healthy answer. A steady-state FlowPost returns this on most
    // passes and it is not worth a log line per tick.
    const summary = await sweepAnalytics(T0);
    expect(summary.attempted).toBe(0);
    expect(summary.notEligible).toBe(1);
    expect(summary.eligible).toBe(1);
  });

  it('counts snapshots, not contact', async () => {
    // The distinction this summary exists for. A pass that reached the network
    // and wrote nothing is not the same as one that wrote a member's metrics,
    // and the old `contacted` counter could not tell them apart.
    db.accounts.push({ id: 'a1', provider: 'x', status: 'CONNECTED' });
    syncAccount.mockResolvedValue({
      ok: true,
      postSnapshots: 2,
      accountSnapshots: 1,
    });

    const summary = await sweepAnalytics(T0);
    expect(summary.attempted).toBe(1);
    expect(summary.succeeded).toBe(1);
    expect(summary.snapshotsWritten).toBe(3);
    expect(summary.failed).toBe(0);
  });

  it('never reports a failed connection as succeeded', async () => {
    // The Instagram case: a retired API parameter answering 500 on every pass.
    // It was counted as `contacted`, which read as work being done.
    db.accounts.push({ id: 'a1', provider: 'instagram', status: 'CONNECTED' });
    syncAccount.mockResolvedValue({ ok: false, reason: 'failed' });

    const summary = await sweepAnalytics(T0);
    expect(summary.attempted).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.succeeded).toBe(0);
    expect(summary.snapshotsWritten).toBe(0);
  });

  it('separates a permission gap from a failure', async () => {
    // One reconnect away from working, and not something to page anyone about.
    db.accounts.push({ id: 'a1', provider: 'facebook', status: 'CONNECTED' });
    syncAccount.mockResolvedValue({ ok: false, reason: 'missing_scopes' });

    const summary = await sweepAnalytics(T0);
    expect(summary.missingScopes).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.succeeded).toBe(0);
  });

  it('separates a rate limit from a failure', async () => {
    db.accounts.push({ id: 'a1', provider: 'x', status: 'CONNECTED' });
    syncAccount.mockResolvedValue({ ok: false, reason: 'rate_limited' });

    const summary = await sweepAnalytics(T0);
    expect(summary.rateLimited).toBe(1);
    expect(summary.failed).toBe(0);
  });
});

describe('resilience', () => {
  it('carries on when one connection throws', async () => {
    db.accounts.push(
      { id: 'a1', provider: 'x', status: 'CONNECTED' },
      { id: 'a2', provider: 'x', status: 'CONNECTED' },
    );
    syncAccount.mockRejectedValueOnce(new Error('database unreachable'));

    // One bad connection must not end the sweep — and must not reach the
    // publish tick, which shares this process.
    const summary = await sweepAnalytics(T0);
    expect(summary.failed).toBe(1);
    expect(summary.succeeded).toBe(1);
    expect(syncAccount).toHaveBeenCalledTimes(2);
  });
});

describe('ANALYTICS_SYNC_ENABLED', () => {
  it('defaults to enabled when the variable is absent', () => {
    expect(isAnalyticsSyncEnabled()).toBe(true);
  });

  it('fails safe: only the exact string "false" disables it', () => {
    // A typo or an empty value must leave collection running rather than
    // silently stopping it.
    for (const value of ['true', 'TRUE', '', 'no', '0', 'False']) {
      process.env.ANALYTICS_SYNC_ENABLED = value;
      expect(isAnalyticsSyncEnabled()).toBe(true);
    }
    process.env.ANALYTICS_SYNC_ENABLED = 'false';
    expect(isAnalyticsSyncEnabled()).toBe(false);
  });

  it('disabled → no sweep, and no database query at all', async () => {
    db.accounts.push({ id: 'a1', provider: 'x', status: 'CONNECTED' });
    process.env.ANALYTICS_SYNC_ENABLED = 'false';

    expect(await maybeSweepAnalytics(T0)).toBe(false);
    expect(db.findManyArgs).toHaveLength(0);
    expect(syncAccount).not.toHaveBeenCalled();
  });

  it('enabled → the sweep runs', async () => {
    db.accounts.push({ id: 'a1', provider: 'x', status: 'CONNECTED' });
    process.env.ANALYTICS_SYNC_ENABLED = 'true';

    expect(await maybeSweepAnalytics(T0)).toBe(true);
    expect(syncAccount).toHaveBeenCalledWith('a1', { now: T0 });
  });

  it('is read per tick, so re-enabling needs no restart', async () => {
    db.accounts.push({ id: 'a1', provider: 'x', status: 'CONNECTED' });

    process.env.ANALYTICS_SYNC_ENABLED = 'false';
    expect(await maybeSweepAnalytics(T0)).toBe(false);

    // Turned back on a minute later. The disabled pass must not have advanced
    // the interval clock, or this would wait fifteen minutes for no reason.
    process.env.ANALYTICS_SYNC_ENABLED = 'true';
    expect(await maybeSweepAnalytics(at(60_000))).toBe(true);
  });

  it('does not gate a directly invoked sweep — the switch is on the tick', async () => {
    // `sweepAnalytics` is the unit; `maybeSweepAnalytics` is the scheduler's
    // door and the only thing the flag guards. Manual sync goes through
    // `analyticsSyncService` and is likewise unaffected.
    db.accounts.push({ id: 'a1', provider: 'x', status: 'CONNECTED' });
    process.env.ANALYTICS_SYNC_ENABLED = 'false';

    expect((await sweepAnalytics(T0)).attempted).toBe(1);
  });
});

describe('pacing against the publish tick', () => {
  it('runs once and then stands down for the sweep interval', async () => {
    db.accounts.push({ id: 'a1', provider: 'x', status: 'CONNECTED' });

    // The publish tick fires every 30s; sweeping that often would be absurd.
    expect(await maybeSweepAnalytics(T0)).toBe(true);
    expect(await maybeSweepAnalytics(at(60_000))).toBe(false);
    expect(await maybeSweepAnalytics(at(14 * 60_000))).toBe(false);
    expect(await maybeSweepAnalytics(at(15 * 60_000))).toBe(true);

    expect(syncAccount).toHaveBeenCalledTimes(2);
  });

  it('does not touch the database while standing down', async () => {
    db.accounts.push({ id: 'a1', provider: 'x', status: 'CONNECTED' });

    await maybeSweepAnalytics(T0);
    db.findManyArgs.length = 0;

    await maybeSweepAnalytics(at(60_000));
    expect(db.findManyArgs).toHaveLength(0);
  });
});
