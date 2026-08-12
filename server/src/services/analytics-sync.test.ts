/**
 * The analytics sync service: what it collects, what it refuses to invent, and
 * what it does when a network misbehaves.
 *
 * The snapshot store is an **in-memory stand-in that enforces the real
 * observation key** — (target, captured_at) — rather than a mock that records
 * calls. That distinction matters for the same reason it does in
 * `scheduler.test.ts`: a mock returning `true` for every write would pass the
 * duplicate-prevention test and prove nothing. The property under test is that a
 * second observation *in the same hour* is dropped while the first survives, and
 * only a store with a unique key can demonstrate it.
 *
 * The provider adapter is mocked, and only the adapter. `providers/x/analytics`
 * has its own tests for how X's response shapes become normalised metrics; what
 * matters here is what this service does with them.
 *
 * Run: cd server && npx vitest run src/services/analytics-sync.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.DATABASE_URL = 'postgresql://test/test';
  process.env.SCHEDULER_ENABLED = 'false';
});

import { ProviderError } from '../providers/provider.interface';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = new Date('2026-08-11T10:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

// ─── In-memory stores ────────────────────────────────────────────────────────

type Row = Record<string, any>;

const db = vi.hoisted(() => ({
  postSnapshots: [] as Row[],
  accountSnapshots: [] as Row[],
  syncState: new Map<string, Row>(),
  publications: [] as Row[],
  accounts: [] as Row[],
  statusWrites: [] as Array<{ id: string; status: string }>,
}));

vi.mock('../repositories/analytics.repository', () => {
  const key = (a: string, d: Date) => `${a}|${d.toISOString()}`;

  return {
    analyticsRepository: {
      // Append-only with a unique observation key, exactly like the table.
      recordPostSnapshot: vi.fn(async (input: Row) => {
        const k = key(input.postPlatformId, input.capturedAt);
        if (db.postSnapshots.some((s) => key(s.postPlatformId, s.capturedAt) === k)) {
          return false;
        }
        db.postSnapshots.push({ ...input });
        return true;
      }),
      recordAccountSnapshot: vi.fn(async (input: Row) => {
        const k = `${input.userId}|${input.provider}|${input.providerAccountId}|${input.capturedAt.toISOString()}`;
        if (
          db.accountSnapshots.some(
            (s) =>
              `${s.userId}|${s.provider}|${s.providerAccountId}|${s.capturedAt.toISOString()}` === k,
          )
        ) {
          return false;
        }
        db.accountSnapshots.push({ ...input });
        return true;
      }),
      findSyncState: vi.fn(async (id: string) => db.syncState.get(id) ?? null),
      claimAccountForSync: vi.fn(async (id: string, now: Date, since: Date) => {
        const existing = db.syncState.get(id);
        if (!existing) {
          db.syncState.set(id, { socialAccountId: id, lastSyncAt: now, consecutiveFailures: 0 });
          return true;
        }
        if (existing.lastSyncAt && existing.lastSyncAt >= since) return false;
        existing.lastSyncAt = now;
        return true;
      }),
      recordSyncSuccess: vi.fn(async (id: string, atTime: Date) => {
        db.syncState.set(id, {
          ...(db.syncState.get(id) ?? { socialAccountId: id }),
          lastSyncAt: atTime,
          lastSuccessAt: atTime,
          consecutiveFailures: 0,
          lastError: null,
        });
      }),
      recordSyncFailure: vi.fn(async (id: string, atTime: Date, message: string) => {
        const prev = db.syncState.get(id) ?? { socialAccountId: id, consecutiveFailures: 0 };
        db.syncState.set(id, {
          ...prev,
          lastSyncAt: atTime,
          consecutiveFailures: (prev.consecutiveFailures ?? 0) + 1,
          lastError: message,
        });
      }),
      recordRateLimit: vi.fn(async (id: string, atTime: Date, until: Date, message: string) => {
        const prev = db.syncState.get(id) ?? { socialAccountId: id, consecutiveFailures: 0 };
        db.syncState.set(id, {
          ...prev,
          lastSyncAt: atTime,
          rateLimitedUntil: until,
          consecutiveFailures: (prev.consecutiveFailures ?? 0) + 1,
          lastError: message,
        });
      }),
      findSyncablePublications: vi.fn(async (accountId: string, since: Date | null) =>
        db.publications
          .filter((p) => p.socialAccountId === accountId)
          .filter((p) => (since ? p.publishedAt >= since : true))
          .map((p) => ({
            id: p.id,
            publishedId: p.publishedId,
            publishedAt: p.publishedAt,
            mediaTypeFromPlatform: p.mediaTypeFromPlatform ?? false,
            metricSnapshots: db.postSnapshots
              .filter((s) => s.postPlatformId === p.id)
              .sort((a, b) => b.capturedAt - a.capturedAt)
              .slice(0, 1)
              .map((s) => ({ capturedAt: s.capturedAt })),
          })),
      ),
      findLatestAccountCapture: vi.fn(async (userId: string, provider: string, paid: string) => {
        const rows = db.accountSnapshots
          .filter((s) => s.userId === userId && s.provider === provider && s.providerAccountId === paid)
          .sort((a, b) => b.capturedAt - a.capturedAt);
        return rows[0]?.capturedAt ?? null;
      }),
      countUnattributedPublications: vi.fn(async () =>
        db.publications.filter((p) => p.socialAccountId === null).length,
      ),
      confirmMediaType: vi.fn(async (id: string) => {
        const row = db.publications.find((p) => p.id === id);
        if (row) row.mediaTypeFromPlatform = true;
      }),
    },
  };
});

vi.mock('../repositories/social-account.repository', () => ({
  socialAccountRepository: {
    findById: vi.fn(async (id: string) => db.accounts.find((a) => a.id === id) ?? null),
    listByUser: vi.fn(async (userId: string, ctx: Row) =>
      db.accounts.filter(
        (a) =>
          a.userId === userId &&
          a.contextType === ctx.contextType &&
          (a.brandId ?? null) === (ctx.brandId ?? null),
      ),
    ),
    getDecryptedTokensById: vi.fn(async () => ({
      accessToken: 'plaintext-token',
      refreshToken: 'plaintext-refresh',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    })),
    updateStatus: vi.fn(async (id: string, status: string) => {
      db.statusWrites.push({ id, status });
    }),
  },
}));

const adapter = vi.hoisted(() => ({
  fetchPostMetrics: vi.fn(),
  fetchAccountMetrics: vi.fn(),
}));

/**
 * The four networks with adapters, and one without.
 *
 * All four share `adapter` deliberately. The real implementations differ
 * entirely in how they talk to their network and are tested next to it — what
 * this file exercises is the service *around* them, which must behave the same
 * for every provider it drives. Sharing one spy is what makes "Instagram syncs
 * the same way X does" a fact rather than a copied assertion.
 *
 * The per-provider parts are the ones that genuinely differ: the scope names
 * each demands, and — for LinkedIn — the absence of an account-metrics reader,
 * because LinkedIn reports no member follower count and registering one would
 * write a daily row that observed nothing.
 */
const REQUIRED_SCOPES: Record<string, string[]> = {
  x: ['tweet.read', 'users.read'],
  instagram: ['instagram_business_basic', 'instagram_business_manage_insights'],
  facebook: ['pages_read_engagement', 'read_insights'],
  linkedin: ['w_member_social', 'r_member_postAnalytics'],
};

const DISPLAY_NAMES: Record<string, string> = {
  x: 'X',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
};

vi.mock('../providers', () => ({
  isKnownProvider: (id: string) =>
    ['x', 'linkedin', 'instagram', 'facebook', 'youtube'].includes(id),
  getProvider: (id: string) => {
    const scopes = REQUIRED_SCOPES[id];

    // YouTube has no implementation at all, which is the genuine "FlowPost
    // cannot read analytics from this network" case now that the other four do.
    if (!scopes) return { id, displayName: DISPLAY_NAMES[id] ?? id };

    return {
      id,
      displayName: DISPLAY_NAMES[id],
      analytics: {
        requiredScopes: scopes,
        postMetricsMaxAgeDays: id === 'x' ? 30 : 365,
        postMetricsBatchSize: id === 'x' ? 100 : 50,
        hasRequiredScopes: (granted: string[]) =>
          scopes.every((s) => granted.includes(s)),
        fetchPostMetrics: adapter.fetchPostMetrics,
        // LinkedIn deliberately registers none — see the note above.
        ...(id === 'linkedin'
          ? {}
          : { fetchAccountMetrics: adapter.fetchAccountMetrics }),
      },
    };
  },
}));

vi.mock('./token-refresh', () => ({
  tokenRefreshService: {
    isExpiringSoon: () => false,
    refreshAccountTokens: vi.fn(async () => ({ ok: false, reason: 'rejected', message: 'no' })),
  },
  TOKEN_REFRESH_SKEW_MS: 60_000,
}));

import { syncAccount, syncContext } from './analytics-sync.service';
import { socialAccountRepository } from '../repositories/social-account.repository';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PERSONAL_X = {
  id: 'acct-personal-x',
  userId: 'user-1',
  provider: 'x',
  providerAccountId: 'x-100',
  contextType: 'personal',
  brandId: null,
  status: 'CONNECTED',
  scopes: ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'],
  displayName: 'Me',
  username: 'me',
};

const BRAND_A_X = {
  ...PERSONAL_X,
  id: 'acct-brand-a-x',
  providerAccountId: 'x-200',
  contextType: 'brand',
  brandId: 'brand-a',
};

/**
 * A LinkedIn connection made *before* the analytics scope was requested.
 *
 * The common case in production, and the one that must not read as zero
 * engagement: it publishes fine and cannot be analysed until the member
 * reconnects.
 */
const LINKEDIN = {
  ...PERSONAL_X,
  id: 'acct-linkedin',
  provider: 'linkedin',
  providerAccountId: 'li-1',
  scopes: ['openid', 'profile', 'w_member_social'],
};

/** The same connection after a reconnect that granted post analytics. */
const LINKEDIN_WITH_ANALYTICS = {
  ...LINKEDIN,
  id: 'acct-linkedin-analytics',
  scopes: [...LINKEDIN.scopes, 'r_member_postAnalytics'],
};

const BRAND_A_INSTAGRAM = {
  ...PERSONAL_X,
  id: 'acct-brand-a-ig',
  provider: 'instagram',
  providerAccountId: 'ig-1',
  contextType: 'brand',
  brandId: 'brand-a',
  scopes: [
    'instagram_business_basic',
    'instagram_business_content_publish',
    'instagram_business_manage_insights',
  ],
};

const BRAND_A_FACEBOOK = {
  ...PERSONAL_X,
  id: 'acct-brand-a-fb',
  provider: 'facebook',
  providerAccountId: 'fb-page-1',
  contextType: 'brand',
  brandId: 'brand-a',
  scopes: [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'read_insights',
  ],
};

/** A network with no implementation at all. */
const YOUTUBE = {
  ...PERSONAL_X,
  id: 'acct-youtube',
  provider: 'youtube',
  providerAccountId: 'yt-1',
  scopes: [],
};

/** A publication old enough to be due, attributed to `accountId`. */
function publication(id: string, accountId: string | null, publishedOffsetMs = -2 * HOUR) {
  return {
    id,
    socialAccountId: accountId,
    publishedId: `tweet-${id}`,
    publishedAt: at(publishedOffsetMs),
    mediaTypeFromPlatform: false,
  };
}

function metricsFor(platformPostId: string, overrides: Record<string, unknown> = {}) {
  return {
    platformPostId,
    mediaType: 'IMAGE' as const,
    metrics: {
      impressions: 900,
      reach: null,
      views: null,
      likes: 12,
      comments: 3,
      shares: 1,
      reposts: 4,
      saves: 2,
      clicks: 5,
      videoViews: null,
      watchTimeMs: null,
      ...overrides,
    },
    raw: { id: platformPostId },
  };
}

beforeEach(() => {
  db.postSnapshots.length = 0;
  db.accountSnapshots.length = 0;
  db.publications.length = 0;
  db.accounts.length = 0;
  db.statusWrites.length = 0;
  db.syncState.clear();
  vi.clearAllMocks();

  adapter.fetchAccountMetrics.mockResolvedValue({
    metrics: { followers: 1_500, following: 300, postCount: 88, impressions: null, reach: null, profileViews: null },
    raw: { id: 'x-100' },
  });
  adapter.fetchPostMetrics.mockResolvedValue([]);
});

// ─── Happy path ──────────────────────────────────────────────────────────────

describe('successful X sync', () => {
  it('collects post metrics and writes one snapshot per publication', async () => {
    db.accounts.push(PERSONAL_X);
    db.publications.push(publication('pp-1', PERSONAL_X.id), publication('pp-2', PERSONAL_X.id));
    adapter.fetchPostMetrics.mockResolvedValue([
      metricsFor('tweet-pp-1'),
      metricsFor('tweet-pp-2'),
    ]);

    const result = await syncAccount(PERSONAL_X.id, { now: T0 });

    expect(result.ok).toBe(true);
    expect(result.publicationsDue).toBe(2);
    expect(result.publicationsAnswered).toBe(2);
    expect(result.postSnapshots).toBe(2);
    expect(db.postSnapshots).toHaveLength(2);
    expect(db.postSnapshots[0].likes).toBe(12);
  });

  it('batches every due post into one adapter call — no N+1', async () => {
    db.accounts.push(PERSONAL_X);
    for (let i = 0; i < 25; i += 1) {
      db.publications.push(publication(`pp-${i}`, PERSONAL_X.id));
    }
    adapter.fetchPostMetrics.mockResolvedValue([]);

    await syncAccount(PERSONAL_X.id, { now: T0 });

    expect(adapter.fetchPostMetrics).toHaveBeenCalledTimes(1);
    expect(adapter.fetchPostMetrics.mock.calls[0][0].platformPostIds).toHaveLength(25);
  });

  it('collects account metrics and stamps the connection scope onto them', async () => {
    db.accounts.push(BRAND_A_X);

    const result = await syncAccount(BRAND_A_X.id, { now: T0 });

    expect(result.accountSnapshots).toBe(1);
    const snapshot = db.accountSnapshots[0];
    expect(snapshot.followers).toBe(1_500);
    // The scope is copied onto the row so the series survives a reconnect and
    // so context filtering is a column predicate rather than a join.
    expect(snapshot.contextType).toBe('brand');
    expect(snapshot.brandId).toBe('brand-a');
    expect(snapshot.providerAccountId).toBe('x-200');
  });

  it('re-reads account figures daily, not on every sync', async () => {
    db.accounts.push(PERSONAL_X);

    await syncAccount(PERSONAL_X.id, { now: T0 });
    expect(adapter.fetchAccountMetrics).toHaveBeenCalledTimes(1);

    // Six hours later: paced out, so not asked for again.
    await syncAccount(PERSONAL_X.id, { now: at(6 * HOUR), force: true });
    expect(adapter.fetchAccountMetrics).toHaveBeenCalledTimes(1);

    await syncAccount(PERSONAL_X.id, { now: at(DAY), force: true });
    expect(adapter.fetchAccountMetrics).toHaveBeenCalledTimes(2);
  });

  it('records the media type the platform reported, once', async () => {
    db.accounts.push(PERSONAL_X);
    db.publications.push(publication('pp-1', PERSONAL_X.id));
    adapter.fetchPostMetrics.mockResolvedValue([metricsFor('tweet-pp-1')]);

    const result = await syncAccount(PERSONAL_X.id, { now: T0 });
    expect(result.mediaTypesConfirmed).toBe(1);
    expect(db.publications[0].mediaTypeFromPlatform).toBe(true);
  });

  it('updates sync state on success', async () => {
    db.accounts.push(PERSONAL_X);
    await syncAccount(PERSONAL_X.id, { now: T0 });

    const state = db.syncState.get(PERSONAL_X.id)!;
    expect(state.lastSuccessAt).toEqual(T0);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.lastError).toBeNull();
  });
});

// ─── Honesty about metrics ───────────────────────────────────────────────────

describe('never inventing a metric', () => {
  it('stores reach as NULL — X impressions must not become reach', async () => {
    db.accounts.push(PERSONAL_X);
    db.publications.push(publication('pp-1', PERSONAL_X.id));
    adapter.fetchPostMetrics.mockResolvedValue([metricsFor('tweet-pp-1')]);

    await syncAccount(PERSONAL_X.id, { now: T0 });

    const snapshot = db.postSnapshots[0];
    expect(snapshot.impressions).toBe(900);
    // The single most important assertion in this file.
    expect(snapshot.reach).toBeNull();
    expect(snapshot.reach).not.toBe(900);
  });

  it('stores video metrics as NULL rather than zero', async () => {
    db.accounts.push(PERSONAL_X);
    db.publications.push(publication('pp-1', PERSONAL_X.id));
    adapter.fetchPostMetrics.mockResolvedValue([metricsFor('tweet-pp-1')]);

    await syncAccount(PERSONAL_X.id, { now: T0 });

    expect(db.postSnapshots[0].videoViews).toBeNull();
    expect(db.postSnapshots[0].watchTimeMs).toBeNull();
  });

  it('passes a metric the network omitted through as NULL', async () => {
    db.accounts.push(PERSONAL_X);
    db.publications.push(publication('pp-1', PERSONAL_X.id));
    adapter.fetchPostMetrics.mockResolvedValue([
      metricsFor('tweet-pp-1', { clicks: null, saves: null }),
    ]);

    await syncAccount(PERSONAL_X.id, { now: T0 });

    expect(db.postSnapshots[0].clicks).toBeNull();
    expect(db.postSnapshots[0].saves).toBeNull();
  });
});

// ─── Idempotency and history ─────────────────────────────────────────────────

describe('snapshot idempotency and history', () => {
  it('drops a duplicate observation inside the same hour', async () => {
    db.accounts.push(PERSONAL_X);
    db.publications.push(publication('pp-1', PERSONAL_X.id));
    adapter.fetchPostMetrics.mockResolvedValue([metricsFor('tweet-pp-1')]);

    const first = await syncAccount(PERSONAL_X.id, { now: T0 });
    expect(first.postSnapshots).toBe(1);

    // Same hour, forced. The read happens; the write collides and is skipped.
    const second = await syncAccount(PERSONAL_X.id, {
      now: new Date(T0.getTime() + 20 * 60_000),
      force: true,
    });
    expect(second.postSnapshots).toBe(0);
    expect(db.postSnapshots).toHaveLength(1);
  });

  it('retains every distinct observation across the lifecycle', async () => {
    db.accounts.push(PERSONAL_X);
    // Published exactly at T0 so the cadence boundaries line up.
    db.publications.push(publication('pp-1', PERSONAL_X.id, 0));

    const series = [
      { offset: HOUR, impressions: 500 },
      { offset: 6 * HOUR, impressions: 1_400 },
      { offset: 24 * HOUR, impressions: 3_800 },
      { offset: 72 * HOUR, impressions: 5_200 },
    ];

    for (const point of series) {
      adapter.fetchPostMetrics.mockResolvedValue([
        metricsFor('tweet-pp-1', { impressions: point.impressions }),
      ]);
      await syncAccount(PERSONAL_X.id, { now: at(point.offset), force: true });
    }

    // Four observations, none overwritten. This is the history the whole
    // feature exists to accumulate.
    expect(db.postSnapshots).toHaveLength(4);
    expect(db.postSnapshots.map((s) => s.impressions)).toEqual([500, 1_400, 3_800, 5_200]);
  });

  it('does not destroy earlier snapshots when a later sync fails', async () => {
    db.accounts.push(PERSONAL_X);
    db.publications.push(publication('pp-1', PERSONAL_X.id, 0));

    adapter.fetchPostMetrics.mockResolvedValue([metricsFor('tweet-pp-1', { impressions: 500 })]);
    await syncAccount(PERSONAL_X.id, { now: at(HOUR), force: true });
    expect(db.postSnapshots).toHaveLength(1);

    adapter.fetchPostMetrics.mockRejectedValue(new ProviderError('boom', 502, 'x', 503));
    const failed = await syncAccount(PERSONAL_X.id, { now: at(6 * HOUR), force: true });

    expect(failed.ok).toBe(false);
    expect(db.postSnapshots).toHaveLength(1);
    expect(db.postSnapshots[0].impressions).toBe(500);
  });

  it('does not re-read a post that is not yet due', async () => {
    db.accounts.push(PERSONAL_X);
    // Twenty minutes old — younger than the first observation point.
    db.publications.push(publication('pp-1', PERSONAL_X.id, -20 * 60_000));

    const result = await syncAccount(PERSONAL_X.id, { now: T0, force: true });

    expect(result.publicationsDue).toBe(0);
    expect(result.publicationsNotYetDue).toBe(1);
    expect(adapter.fetchPostMetrics).not.toHaveBeenCalled();
  });
});

// ─── Context and brand separation ────────────────────────────────────────────

/**
 * Every network with an adapter is driven by the same service.
 *
 * The point of these is that adding Instagram, Facebook and LinkedIn did not
 * add a branch to the sync path. The service reads `provider.analytics`, checks
 * the connection's granted scopes and calls the adapter — and it does that
 * identically for all four, which is what keeps a fifth network from being a
 * fifth code path.
 */
describe('multi-provider sync', () => {
  it.each([
    ['instagram', () => BRAND_A_INSTAGRAM],
    ['facebook', () => BRAND_A_FACEBOOK],
    ['linkedin', () => LINKEDIN_WITH_ANALYTICS],
  ])('syncs %s when the connection holds the analytics scope', async (_name, fixture) => {
    const account = fixture();
    db.accounts.push(account);
    db.publications.push(publication('pp-1', account.id));
    adapter.fetchPostMetrics.mockResolvedValue([metricsFor('tweet-pp-1')]);

    const result = await syncAccount(account.id, { now: T0 });

    expect(result.ok).toBe(true);
    expect(result.postSnapshots).toBe(1);
    expect(db.postSnapshots[0].postPlatformId).toBe('pp-1');
  });

  it('does not write an account snapshot for LinkedIn, which reports no audience', async () => {
    // The adapter registers no `fetchAccountMetrics`. A row of nulls every day
    // would be an observation that observed nothing.
    db.accounts.push(LINKEDIN_WITH_ANALYTICS);

    const result = await syncAccount(LINKEDIN_WITH_ANALYTICS.id, { now: T0 });

    expect(result.ok).toBe(true);
    expect(db.accountSnapshots).toHaveLength(0);
    expect(adapter.fetchAccountMetrics).not.toHaveBeenCalled();
  });

  it('stamps each provider onto its own account snapshot', async () => {
    db.accounts.push(BRAND_A_INSTAGRAM, BRAND_A_FACEBOOK);

    await syncAccount(BRAND_A_INSTAGRAM.id, { now: T0 });
    await syncAccount(BRAND_A_FACEBOOK.id, { now: T0 });

    // Two connections in one context and one brand, kept apart by provider —
    // which is what stops a Page's followers being read as an Instagram figure.
    expect(db.accountSnapshots.map((s) => s.provider).sort()).toEqual([
      'facebook',
      'instagram',
    ]);
    expect(db.accountSnapshots.map((s) => s.providerAccountId).sort()).toEqual([
      'fb-page-1',
      'ig-1',
    ]);
  });

  it('keeps one network failing from costing the others their results', async () => {
    // A whole-context sweep across three networks. Facebook is down; Instagram
    // and X must still be synced, because `syncContext` never throws.
    db.accounts.push(BRAND_A_X, BRAND_A_INSTAGRAM, BRAND_A_FACEBOOK);
    adapter.fetchAccountMetrics.mockImplementation(async (input: Row) =>
      input.providerAccountId === 'fb-page-1'
        ? Promise.reject(new ProviderError('down', 502, 'facebook', 503))
        : {
            metrics: {
              followers: 10,
              following: null,
              postCount: null,
              impressions: null,
              reach: null,
              profileViews: null,
            },
            raw: {},
          },
    );

    const summary = await syncContext(
      { userId: 'user-1', contextType: 'brand', brandId: 'brand-a' },
      { now: T0 },
    );

    expect(summary.syncedAccounts).toBe(2);
    expect(summary.failedAccounts).toEqual([
      { provider: 'facebook', socialAccountId: 'acct-brand-a-fb', reason: 'failed' },
    ]);
    // The two that worked still wrote their observations.
    expect(db.accountSnapshots.map((s) => s.provider).sort()).toEqual([
      'instagram',
      'x',
    ]);
  });

  it('skips a scope-less connection cleanly without touching the others', async () => {
    db.accounts.push(BRAND_A_X, { ...LINKEDIN, contextType: 'brand', brandId: 'brand-a' });

    const summary = await syncContext(
      { userId: 'user-1', contextType: 'brand', brandId: 'brand-a' },
      { now: T0 },
    );

    expect(summary.syncedAccounts).toBe(1);
    // A missing scope is a failure worth reporting, not an unsupported network
    // and not a silent skip.
    expect(summary.unsupportedProviders).toEqual([]);
    expect(summary.failedAccounts.map((f) => f.reason)).toEqual(['missing_scopes']);
  });

  it('respects each provider’s own metrics horizon', async () => {
    // X serves 30 days and the rest a year. The service reads the number off
    // the adapter rather than holding one clock for every network.
    db.accounts.push(PERSONAL_X, BRAND_A_INSTAGRAM);
    db.publications.push(
      publication('pp-old-x', PERSONAL_X.id, -60 * DAY),
      publication('pp-old-ig', BRAND_A_INSTAGRAM.id, -60 * DAY),
    );

    await syncAccount(PERSONAL_X.id, { now: T0 });
    const xCall = adapter.fetchPostMetrics.mock.calls.length;

    await syncAccount(BRAND_A_INSTAGRAM.id, { now: T0 });

    // The 60-day-old X post is past X's 30-day cliff and is never asked about.
    expect(xCall).toBe(0);
    // The same age on Instagram is well inside its horizon.
    expect(adapter.fetchPostMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ platformPostIds: ['tweet-pp-old-ig'] }),
    );
  });
});

describe('context separation', () => {
  it('reads only the publications belonging to the syncing connection', async () => {
    db.accounts.push(PERSONAL_X, BRAND_A_X);
    db.publications.push(
      publication('pp-personal', PERSONAL_X.id),
      publication('pp-brand-a', BRAND_A_X.id),
    );
    adapter.fetchPostMetrics.mockResolvedValue([]);

    await syncAccount(BRAND_A_X.id, { now: T0 });

    // The brand's token asked about the brand's post, and only that one.
    const ids = adapter.fetchPostMetrics.mock.calls[0][0].platformPostIds;
    expect(ids).toEqual(['tweet-pp-brand-a']);
    expect(ids).not.toContain('tweet-pp-personal');
  });

  it('scopes a context sync to that context\'s connections only', async () => {
    db.accounts.push(PERSONAL_X, BRAND_A_X);

    await syncContext({ userId: 'user-1', contextType: 'personal', brandId: null }, { now: T0 });

    expect(socialAccountRepository.listByUser).toHaveBeenCalledWith('user-1', {
      contextType: 'personal',
      brandId: null,
    });
    // Only the personal connection produced a snapshot.
    expect(db.accountSnapshots).toHaveLength(1);
    expect(db.accountSnapshots[0].contextType).toBe('personal');
  });

  it('keeps two brands apart', async () => {
    const BRAND_B_X = { ...BRAND_A_X, id: 'acct-brand-b-x', providerAccountId: 'x-300', brandId: 'brand-b' };
    db.accounts.push(BRAND_A_X, BRAND_B_X);

    await syncContext({ userId: 'user-1', contextType: 'brand', brandId: 'brand-b' }, { now: T0 });

    expect(db.accountSnapshots).toHaveLength(1);
    expect(db.accountSnapshots[0].brandId).toBe('brand-b');
    expect(db.accountSnapshots[0].providerAccountId).toBe('x-300');
  });
});

// ─── Attribution ─────────────────────────────────────────────────────────────

describe('attribution', () => {
  it('never syncs a publication whose connection was not recorded', async () => {
    db.accounts.push(PERSONAL_X);
    db.publications.push(
      publication('pp-attributed', PERSONAL_X.id),
      publication('pp-orphan', null),
    );
    adapter.fetchPostMetrics.mockResolvedValue([]);

    await syncAccount(PERSONAL_X.id, { now: T0 });

    const ids = adapter.fetchPostMetrics.mock.calls[0][0].platformPostIds;
    expect(ids).toEqual(['tweet-pp-attributed']);
  });

  it('reports the unattributable publications rather than guessing at them', async () => {
    db.accounts.push(PERSONAL_X);
    db.publications.push(publication('pp-orphan-1', null), publication('pp-orphan-2', null));

    const summary = await syncContext(
      { userId: 'user-1', contextType: 'personal', brandId: null },
      { now: T0 },
    );

    expect(summary.skippedUnattributed).toBe(2);
  });
});

// ─── Failure handling ────────────────────────────────────────────────────────

describe('error handling', () => {
  it('reports an unsupported provider instead of an empty result', async () => {
    // YouTube has no implementation at all. Distinct from the four that do and
    // are merely waiting on a scope — which is `missing_scopes`, below.
    db.accounts.push(YOUTUBE);

    const result = await syncAccount(YOUTUBE.id, { now: T0 });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unsupported');
    expect(result.postSnapshots).toBe(0);
    // Nothing recorded: we did not look, so there is nothing to say about it.
    expect(db.syncState.has(YOUTUBE.id)).toBe(false);
  });

  it('asks a pre-analytics LinkedIn connection to reconnect, never reporting zero', async () => {
    // The production case. This connection publishes fine; it simply predates
    // the scope. Anything other than `missing_scopes` here — an empty success
    // especially — would render as an account whose posts got no engagement.
    db.accounts.push(LINKEDIN);

    const result = await syncAccount(LINKEDIN.id, { now: T0 });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_scopes');
    expect(result.missingScopes).toEqual(['r_member_postAnalytics']);
    expect(result.postSnapshots).toBe(0);
    expect(db.postSnapshots).toHaveLength(0);
  });

  it('reports missing scopes with the specific scopes to reconnect for', async () => {
    db.accounts.push({ ...PERSONAL_X, scopes: ['tweet.write'] });

    const result = await syncAccount(PERSONAL_X.id, { now: T0 });

    expect(result.reason).toBe('missing_scopes');
    expect(result.missingScopes).toEqual(['tweet.read', 'users.read']);
  });

  it('treats a 5xx as temporary and leaves the connection alone', async () => {
    db.accounts.push(PERSONAL_X);
    adapter.fetchAccountMetrics.mockRejectedValue(new ProviderError('down', 502, 'x', 503));

    const result = await syncAccount(PERSONAL_X.id, { now: T0 });

    expect(result.reason).toBe('failed');
    expect(db.syncState.get(PERSONAL_X.id)!.consecutiveFailures).toBe(1);
    // The rule this codebase cares most about: metrics failing must never
    // present as a broken connection.
    expect(db.statusWrites).toHaveLength(0);
  });

  it('stands down for a rate-limit window on a 429', async () => {
    db.accounts.push(PERSONAL_X);
    adapter.fetchAccountMetrics.mockRejectedValue(new ProviderError('slow down', 502, 'x', 429));

    const result = await syncAccount(PERSONAL_X.id, { now: T0 });

    expect(result.reason).toBe('rate_limited');
    const state = db.syncState.get(PERSONAL_X.id)!;
    expect(state.rateLimitedUntil.getTime()).toBe(T0.getTime() + 15 * 60_000);
    expect(db.statusWrites).toHaveLength(0);
  });

  it('refuses to contact a rate-limited connection even on a manual sync', async () => {
    db.accounts.push(PERSONAL_X);
    db.syncState.set(PERSONAL_X.id, {
      socialAccountId: PERSONAL_X.id,
      lastSyncAt: T0,
      consecutiveFailures: 1,
      rateLimitedUntil: at(10 * 60_000),
    });

    const result = await syncAccount(PERSONAL_X.id, { now: at(60_000), force: true });

    expect(result.reason).toBe('rate_limited');
    expect(adapter.fetchAccountMetrics).not.toHaveBeenCalled();
  });

  it('marks the connection EXPIRED only on a 401', async () => {
    db.accounts.push(PERSONAL_X);
    adapter.fetchAccountMetrics.mockRejectedValue(new ProviderError('bad token', 502, 'x', 401));

    const result = await syncAccount(PERSONAL_X.id, { now: T0 });

    expect(result.reason).toBe('failed');
    expect(db.statusWrites).toEqual([{ id: PERSONAL_X.id, status: 'EXPIRED' }]);
  });

  it('does not mark the connection on a 403 — a permission problem is not a dead token', async () => {
    db.accounts.push(PERSONAL_X);
    adapter.fetchAccountMetrics.mockRejectedValue(new ProviderError('forbidden', 502, 'x', 403));

    await syncAccount(PERSONAL_X.id, { now: T0 });

    expect(db.statusWrites).toHaveLength(0);
  });

  it('never stores a provider message in sync state', async () => {
    db.accounts.push(PERSONAL_X);
    adapter.fetchAccountMetrics.mockRejectedValue(
      new ProviderError('X failed: token ya29.SECRET-VALUE rejected', 502, 'x', 503),
    );

    await syncAccount(PERSONAL_X.id, { now: T0 });

    const stored = db.syncState.get(PERSONAL_X.id)!.lastError as string;
    expect(stored).not.toContain('SECRET-VALUE');
    expect(stored).not.toContain('ya29');
    expect(stored).toBe('The network could not be reached. FlowPost will try again.');
  });

  it('counts a post the platform no longer returns as missing, not as zero', async () => {
    db.accounts.push(PERSONAL_X);
    db.publications.push(publication('pp-live', PERSONAL_X.id), publication('pp-deleted', PERSONAL_X.id));
    // X returns deleted posts in `errors`, not `data` — the adapter simply
    // does not hand them back.
    adapter.fetchPostMetrics.mockResolvedValue([metricsFor('tweet-pp-live')]);

    const result = await syncAccount(PERSONAL_X.id, { now: T0 });

    expect(result.publicationsDue).toBe(2);
    expect(result.publicationsAnswered).toBe(1);
    expect(result.publicationsMissing).toBe(1);
    // Crucially, no all-zero snapshot was fabricated for the deleted post.
    expect(db.postSnapshots).toHaveLength(1);
    expect(db.postSnapshots[0].postPlatformId).toBe('pp-live');
  });
});

// ─── Pacing ──────────────────────────────────────────────────────────────────

describe('automatic sync eligibility', () => {
  it('skips a connection synced moments ago', async () => {
    db.accounts.push(PERSONAL_X);
    db.syncState.set(PERSONAL_X.id, {
      socialAccountId: PERSONAL_X.id,
      lastSyncAt: T0,
      consecutiveFailures: 0,
    });

    const result = await syncAccount(PERSONAL_X.id, { now: at(60_000) });

    expect(result.reason).toBe('not_eligible');
    expect(adapter.fetchAccountMetrics).not.toHaveBeenCalled();
  });

  it('lets a manual sync bypass pacing', async () => {
    db.accounts.push(PERSONAL_X);
    db.syncState.set(PERSONAL_X.id, {
      socialAccountId: PERSONAL_X.id,
      lastSyncAt: T0,
      consecutiveFailures: 0,
    });

    const result = await syncAccount(PERSONAL_X.id, { now: at(60_000), force: true });

    expect(result.ok).toBe(true);
  });
});

// ─── Manual sync summary ─────────────────────────────────────────────────────

describe('manual sync summary', () => {
  it('reports honestly rather than claiming success', async () => {
    // Two connections, one of which cannot be read. The summary must say so
    // rather than reporting a clean sweep of the one that could.
    db.accounts.push(PERSONAL_X, LINKEDIN);
    db.publications.push(publication('pp-1', PERSONAL_X.id));
    adapter.fetchPostMetrics.mockResolvedValue([metricsFor('tweet-pp-1')]);

    const summary = await syncContext(
      { userId: 'user-1', contextType: 'personal', brandId: null },
      { now: T0, force: true },
    );

    expect(summary.syncedAccounts).toBe(1);
    expect(summary.syncedPosts).toBe(1);
    // One post snapshot plus one account snapshot.
    expect(summary.snapshotsCreated).toBe(2);
    // LinkedIn *has* an adapter now, so it is no longer "unsupported" — it is a
    // connection one reconnect away from working, which is a different message
    // to the member and a different row in this summary.
    expect(summary.unsupportedProviders).toEqual([]);
    expect(summary.failedAccounts).toEqual([
      { provider: 'linkedin', socialAccountId: LINKEDIN.id, reason: 'missing_scopes' },
    ]);
  });

  it('still reports a network with no implementation as unsupported', async () => {
    db.accounts.push(PERSONAL_X, YOUTUBE);

    const summary = await syncContext(
      { userId: 'user-1', contextType: 'personal', brandId: null },
      { now: T0, force: true },
    );

    expect(summary.unsupportedProviders).toEqual(['youtube']);
    expect(summary.failedAccounts).toEqual([]);
  });
});
