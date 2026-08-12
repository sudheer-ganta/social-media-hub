/**
 * The first analytics reading, taken the moment a post goes out.
 *
 * ─── Why this exists ─────────────────────────────────────────────────────────
 *
 * The cadence's first observation is T+1h. That is right for a growth curve and
 * wrong for the thirty seconds after Publish, where a member opens the post,
 * sees "collecting", and cannot tell it from broken.
 *
 * ─── The two properties under test ───────────────────────────────────────────
 *
 * 1. **It only ever adds the observation that does not exist yet.** It must not
 *    become a general cadence override — re-reading a post observed twenty
 *    minutes ago spends a metered request (X bills per post read) to write a
 *    row that collides with the one already stored.
 *
 * 2. **It cannot fail a publish.** Not because the caller is careful, but
 *    because the call is detached. This file asserts that a sync which *throws*
 *    still leaves the publish path unharmed — the failure mode that would
 *    otherwise turn a background read into a lost post.
 *
 * Run: cd server && npx vitest run src/services/first-observation.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.DATABASE_URL = 'postgresql://test/test';
  process.env.SCHEDULER_ENABLED = 'false';
});

type Row = Record<string, any>;

const db = vi.hoisted(() => ({
  snapshots: [] as Row[],
  publications: [] as Row[],
  syncState: new Map<string, Row>(),
}));

const adapter = vi.hoisted(() => ({ fetchPostMetrics: vi.fn() }));

vi.mock('../repositories/analytics.repository', () => ({
  analyticsRepository: {
    recordPostSnapshot: vi.fn(async (input: Row) => {
      db.snapshots.push(input);
      return true;
    }),
    recordAccountSnapshot: vi.fn(async () => true),
    findSyncState: vi.fn(async (id: string) => db.syncState.get(id) ?? null),
    claimAccountForSync: vi.fn(async (id: string, now: Date) => {
      db.syncState.set(id, { socialAccountId: id, lastSyncAt: now, consecutiveFailures: 0 });
      return true;
    }),
    recordSyncSuccess: vi.fn(async () => {}),
    recordSyncFailure: vi.fn(async () => {}),
    recordRateLimit: vi.fn(async () => {}),
    findSyncablePublications: vi.fn(async () => db.publications),
    findLatestAccountCapture: vi.fn(async () => new Date()),
    confirmMediaType: vi.fn(async () => {}),
    countUnattributedPublications: vi.fn(async () => 0),
  },
}));

vi.mock('../repositories/social-account.repository', () => ({
  socialAccountRepository: {
    findById: vi.fn(async (id: string) => ({
      id,
      userId: 'user-1',
      provider: 'x',
      providerAccountId: 'x-1',
      contextType: 'personal',
      brandId: null,
      status: 'CONNECTED',
      scopes: ['ALL'],
    })),
    getDecryptedTokensById: vi.fn(async () => ({
      accessToken: 'token',
      refreshToken: null,
      expiresAt: new Date('2099-01-01'),
    })),
    updateStatus: vi.fn(async () => {}),
  },
}));

vi.mock('../providers', () => ({
  isKnownProvider: () => true,
  getProvider: () => ({
    id: 'x',
    displayName: 'X',
    analytics: {
      requiredScopes: ['ALL'],
      postMetricsMaxAgeDays: 30,
      postMetricsBatchSize: 100,
      hasRequiredScopes: (granted: string[]) => granted.includes('ALL'),
      fetchPostMetrics: adapter.fetchPostMetrics,
    },
  }),
}));

vi.mock('./token-refresh', () => ({
  tokenRefreshService: {
    isExpiringSoon: () => false,
    refreshAccountTokens: vi.fn(async () => ({ ok: true, accessToken: 'token' })),
  },
  TOKEN_REFRESH_SKEW_MS: 60_000,
}));

import { syncAccount, scheduleFirstObservation } from './analytics-sync.service';

const NOW = new Date('2026-08-12T10:00:00.000Z');
const MINUTE = 60_000;

/** A publication five minutes old — far inside the T+1h first stage. */
function freshPublication(overrides: Row = {}): Row {
  return {
    id: 'pp-1',
    socialAccountId: 'acct-1',
    publishedId: 'tweet-1',
    publishedAt: new Date(NOW.getTime() - 5 * MINUTE),
    mediaTypeFromPlatform: false,
    metricSnapshots: [],
    ...overrides,
  };
}

function metrics(id: string, values: Record<string, unknown> = {}) {
  return {
    platformPostId: id,
    mediaType: 'IMAGE' as const,
    metrics: {
      impressions: 3,
      reach: null,
      views: null,
      likes: 0,
      comments: 0,
      shares: null,
      reposts: 0,
      saves: 0,
      clicks: null,
      videoViews: null,
      watchTimeMs: null,
      ...values,
    },
    raw: {},
  };
}

beforeEach(() => {
  db.snapshots.length = 0;
  db.publications.length = 0;
  db.syncState.clear();
  vi.clearAllMocks();
  adapter.fetchPostMetrics.mockResolvedValue([]);
});

// ─── 20. The immediate first sync ────────────────────────────────────────────

describe('observeNew', () => {
  it('reads a publication far younger than the first cadence stage', async () => {
    db.publications = [freshPublication()];
    adapter.fetchPostMetrics.mockResolvedValue([metrics('tweet-1')]);

    const result = await syncAccount('acct-1', {
      now: NOW,
      force: true,
      observeNew: true,
    });

    expect(result.ok).toBe(true);
    expect(result.postSnapshots).toBe(1);
    expect(db.snapshots[0].postPlatformId).toBe('pp-1');
  });

  it('does not read that publication without the flag', async () => {
    // The unchanged behaviour: five minutes old is not due, and a plain
    // forced sync must not change the per-post cadence.
    db.publications = [freshPublication()];

    const result = await syncAccount('acct-1', { now: NOW, force: true });

    expect(result.publicationsDue).toBe(0);
    expect(adapter.fetchPostMetrics).not.toHaveBeenCalled();
  });

  it('stores a real zero rather than skipping it', async () => {
    // Most networks answer immediately with zeros that are genuine
    // measurements. Those are worth storing — they are the T+0 point of the
    // growth curve, and they are not the same as "no data".
    db.publications = [freshPublication()];
    adapter.fetchPostMetrics.mockResolvedValue([
      metrics('tweet-1', { impressions: 0, likes: 0 }),
    ]);

    await syncAccount('acct-1', { now: NOW, force: true, observeNew: true });

    expect(db.snapshots[0].impressions).toBe(0);
    expect(db.snapshots[0].likes).toBe(0);
    // And an unreported metric stays null through the immediate path too.
    expect(db.snapshots[0].reach).toBeNull();
  });

  it('never re-reads a publication that already has an observation', async () => {
    // The guard that keeps this from becoming a cadence override. The post is
    // young *and* already measured, so it is not due — re-reading would spend
    // a metered request to write a colliding row.
    db.publications = [
      freshPublication({
        metricSnapshots: [{ capturedAt: new Date(NOW.getTime() - MINUTE) }],
      }),
    ];

    const result = await syncAccount('acct-1', {
      now: NOW,
      force: true,
      observeNew: true,
    });

    expect(result.publicationsDue).toBe(0);
    expect(adapter.fetchPostMetrics).not.toHaveBeenCalled();
  });

  it('still respects the rate-limit stand-down', async () => {
    // A publish must not be able to punch through a network's "too many
    // requests" just because it is fresh.
    db.syncState.set('acct-1', {
      socialAccountId: 'acct-1',
      lastSyncAt: null,
      consecutiveFailures: 0,
      rateLimitedUntil: new Date(NOW.getTime() + 10 * MINUTE),
    });
    db.publications = [freshPublication()];

    const result = await syncAccount('acct-1', {
      now: NOW,
      force: true,
      observeNew: true,
    });

    expect(result.reason).toBe('rate_limited');
    expect(adapter.fetchPostMetrics).not.toHaveBeenCalled();
  });
});

// ─── 22. The background cadence is unchanged ─────────────────────────────────

describe('the background cadence still applies', () => {
  it('reads a publication that has reached T+1h without the flag', async () => {
    db.publications = [
      freshPublication({
        publishedAt: new Date(NOW.getTime() - 90 * MINUTE),
      }),
    ];
    adapter.fetchPostMetrics.mockResolvedValue([metrics('tweet-1')]);

    const result = await syncAccount('acct-1', { now: NOW });

    // Unchanged from before this phase: the sweep does all the real work.
    expect(result.postSnapshots).toBe(1);
  });
});

// ─── 21. It cannot fail a publish ────────────────────────────────────────────

describe('scheduleFirstObservation', () => {
  it('returns immediately rather than awaiting the read', async () => {
    db.publications = [freshPublication()];
    adapter.fetchPostMetrics.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
    );

    // Synchronous return is the property: the publish response does not wait
    // on a third-party API call.
    expect(scheduleFirstObservation('acct-1')).toBeUndefined();
  });

  it('swallows a failing sync instead of rejecting', async () => {
    // The failure mode this guards: an unhandled rejection in a detached
    // promise. The publish is already recorded and must not be affected.
    adapter.fetchPostMetrics.mockRejectedValue(new Error('network down'));
    db.publications = [freshPublication()];

    const unhandled = vi.fn();
    process.once('unhandledRejection', unhandled);

    expect(() => scheduleFirstObservation('acct-1')).not.toThrow();

    // Let the detached promise settle.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(unhandled).not.toHaveBeenCalled();

    process.removeListener('unhandledRejection', unhandled);
  });

  it('swallows a sync that throws outright', async () => {
    // syncAccount is written not to throw, but if the bookkeeping itself
    // fails it still must not reach the publish that triggered it.
    const { socialAccountRepository } = await import(
      '../repositories/social-account.repository'
    );
    vi.mocked(socialAccountRepository.findById).mockRejectedValueOnce(
      new Error('database unreachable'),
    );

    expect(() => scheduleFirstObservation('acct-1')).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});
