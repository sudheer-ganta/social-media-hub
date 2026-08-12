/**
 * The best-time service: what it reads, whose clock it uses, and what it
 * refuses.
 *
 * Run: cd server && npx vitest run src/services/best-time.test.ts
 *
 * The engine's arithmetic is tested in `analytics/timing.test.ts` against pure
 * inputs. What is left here is everything that touches the outside world: the
 * scope predicate, timezone resolution, the mapping from stored snapshots to
 * scores, and the environment-driven gates.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.DATABASE_URL = 'postgresql://test/test';
});

const repository = vi.hoisted(() => ({
  findPublishedPublications: vi.fn(),
  findScopeTimezone: vi.fn(),
}));

vi.mock('../repositories/analytics.repository', () => ({
  analyticsRepository: repository,
}));

import { MediaType } from '../generated/prisma/enums';
import { env } from '../config/env';
import { bestTimes, timingGates } from './best-time.service';
import type { AnalyticsScope } from '../analytics/window';

const KOLKATA = 'Asia/Kolkata';
const NOW = new Date('2026-08-12T09:00:00Z');

const personal: AnalyticsScope = {
  userId: 'user-1',
  contextType: 'personal',
  brandId: null,
};

const brand: AnalyticsScope = {
  userId: 'user-1',
  contextType: 'brand',
  brandId: 'brand-a',
};

/** A stored publication row, shaped as `findPublishedPublications` returns it. */
function row(
  at: string,
  overrides: {
    provider?: string;
    mediaType?: MediaType | null;
    contentType?: MediaType | null;
    likes?: number | null;
    impressions?: number | null;
    snapshots?: boolean;
  } = {},
) {
  const {
    provider = 'instagram',
    mediaType = null,
    contentType = null,
    likes = 50,
    impressions = 1000,
    snapshots = true,
  } = overrides;

  const snapshot = {
    impressions,
    reach: null,
    views: null,
    likes,
    comments: null,
    shares: null,
    reposts: null,
    saves: null,
    clicks: null,
    videoViews: null,
    watchTimeMs: null,
  };

  return {
    provider,
    publishedAt: new Date(at),
    mediaType,
    contentType,
    metricSnapshots: snapshots ? [snapshot] : [],
  };
}

function rows(count: number, at: string, overrides = {}) {
  return Array.from({ length: count }, () => row(at, overrides));
}

beforeEach(() => {
  vi.clearAllMocks();
  env.BEST_TIME_MIN_EARLY = '';
  env.BEST_TIME_MIN_STRONG = '';
  repository.findScopeTimezone.mockResolvedValue(KOLKATA);
  repository.findPublishedPublications.mockResolvedValue([]);
});

describe('timingGates', () => {
  it('defaults to 10 for early and 30 for strong', () => {
    expect(timingGates()).toMatchObject({ early: 10, strong: 30 });
  });

  it('takes overrides from the environment', () => {
    env.BEST_TIME_MIN_EARLY = '5';
    env.BEST_TIME_MIN_STRONG = '15';
    expect(timingGates()).toMatchObject({ early: 5, strong: 15 });
  });

  it('ignores nonsense rather than disabling the gate', () => {
    env.BEST_TIME_MIN_EARLY = 'soon';
    env.BEST_TIME_MIN_STRONG = '-4';
    expect(timingGates()).toMatchObject({ early: 10, strong: 30 });
  });

  it('never lets strong sit below early', () => {
    env.BEST_TIME_MIN_EARLY = '40';
    env.BEST_TIME_MIN_STRONG = '10';
    expect(timingGates()).toMatchObject({ early: 40, strong: 40 });
  });

  it('reports the gates in force on every response', async () => {
    env.BEST_TIME_MIN_EARLY = '4';
    env.BEST_TIME_MIN_STRONG = '8';
    const result = await bestTimes(personal, { now: NOW });
    expect(result.gates).toEqual({ early: 4, strong: 8 });
  });
});

describe('scope isolation', () => {
  it('queries with the personal scope, brand_id included', async () => {
    await bestTimes(personal, { now: NOW });
    expect(repository.findPublishedPublications).toHaveBeenCalledWith(personal, {
      dimension: { kind: 'lifetime' },
    });
  });

  it('queries with the brand scope for a brand', async () => {
    await bestTimes(brand, { now: NOW });
    expect(repository.findPublishedPublications).toHaveBeenCalledWith(brand, {
      dimension: { kind: 'lifetime' },
    });
    expect(repository.findScopeTimezone).toHaveBeenCalledWith(brand);
  });

  it('echoes the scope it answered for', async () => {
    const result = await bestTimes(brand, { now: NOW });
    expect(result.scope).toEqual({ contextType: 'brand', brandId: 'brand-a' });
  });

  it('reads lifetime, never the intelligence window', async () => {
    await bestTimes(personal, { now: NOW });
    const [, options] = repository.findPublishedPublications.mock.calls[0];
    expect(options.dimension.kind).toBe('lifetime');
  });
});

describe('timezone resolution', () => {
  it('prefers the zone the member is scheduling in now', async () => {
    const result = await bestTimes(personal, { now: NOW, timezone: 'Europe/Berlin' });
    expect(result.timezone).toBe('Europe/Berlin');
    expect(result.timezoneSource).toBe('request');
    // No point reading history for a zone we already have.
    expect(repository.findScopeTimezone).not.toHaveBeenCalled();
  });

  it('falls back to the zone the member’s own posts recorded', async () => {
    const result = await bestTimes(personal, { now: NOW });
    expect(result.timezone).toBe(KOLKATA);
    expect(result.timezoneSource).toBe('history');
  });

  it('ignores a request zone that is not a real IANA zone', async () => {
    const result = await bestTimes(personal, { now: NOW, timezone: 'Mars/Olympus' });
    expect(result.timezone).toBe(KOLKATA);
    expect(result.timezoneSource).toBe('history');
  });

  it('refuses to recommend at all rather than assume UTC', async () => {
    repository.findScopeTimezone.mockResolvedValue(null);
    repository.findPublishedPublications.mockResolvedValue(
      rows(40, '2026-08-10T15:00:00Z'),
    );

    const result = await bestTimes(personal, { now: NOW });
    expect(result.timezone).toBeNull();
    expect(result.timezoneSource).toBe('none');
    expect(result.platforms[0].confidence).toBe('none');
    expect(result.platforms[0].recommendedTime).toBeNull();
    expect(result.platforms[0].reason).toMatch(/which timezone you post in/);
  });

  it('ignores a stored zone that is no longer valid', async () => {
    repository.findScopeTimezone.mockResolvedValue('Old/Zone');
    const result = await bestTimes(personal, { now: NOW });
    expect(result.timezone).toBeNull();
  });
});

describe('mapping stored snapshots to scores', () => {
  it('turns likes and impressions into an engagement rate', async () => {
    repository.findPublishedPublications.mockResolvedValue([
      ...rows(20, '2026-08-10T15:00:00Z', { likes: 100, impressions: 1000 }),
      ...rows(20, '2026-08-10T04:00:00Z', { likes: 10, impressions: 1000 }),
    ]);

    const result = await bestTimes(personal, { now: NOW });
    const instagram = result.platforms[0];
    expect(instagram.metric).toBe('engagement_rate');
    expect(instagram.window).toEqual({ start: '20:00', end: '21:00' });
    expect(instagram.sampleSize).toBe(40);
  });

  it('drops a publication that has never been measured', async () => {
    repository.findPublishedPublications.mockResolvedValue([
      ...rows(20, '2026-08-10T15:00:00Z'),
      ...rows(50, '2026-08-10T04:00:00Z', { snapshots: false }),
    ]);

    const result = await bestTimes(personal, { now: NOW });
    // The 50 unmeasured publications are not evidence, and are not zeros either.
    expect(result.platforms[0].sampleSize).toBe(20);
  });

  it('drops a publication with no publish timestamp', async () => {
    const undated = { ...row('2026-08-10T15:00:00Z'), publishedAt: null };
    repository.findPublishedPublications.mockResolvedValue([
      ...rows(15, '2026-08-10T15:00:00Z'),
      undated,
    ]);

    const result = await bestTimes(personal, { now: NOW });
    expect(result.platforms[0].sampleSize).toBe(15);
  });

  it('scores on counts when the network reports no exposure', async () => {
    repository.findPublishedPublications.mockResolvedValue([
      ...rows(20, '2026-08-10T15:00:00Z', {
        provider: 'facebook',
        impressions: null,
        likes: 40,
      }),
      ...rows(15, '2026-08-10T04:00:00Z', {
        provider: 'facebook',
        impressions: null,
        likes: 4,
      }),
    ]);

    const result = await bestTimes(personal, { now: NOW });
    expect(result.platforms[0].metric).toBe('engagement');
    expect(result.platforms[0].confidence).toBe('strong');
  });
});

describe('per-platform answers', () => {
  beforeEach(() => {
    repository.findPublishedPublications.mockResolvedValue([
      ...rows(20, '2026-08-10T15:00:00Z', { provider: 'instagram', likes: 500 }),
      ...rows(20, '2026-08-10T22:00:00Z', { provider: 'instagram', likes: 5 }),
      ...rows(20, '2026-08-10T03:45:00Z', { provider: 'linkedin', likes: 500 }),
      ...rows(20, '2026-08-10T22:00:00Z', { provider: 'linkedin', likes: 5 }),
    ]);
  });

  it('gives each requested network its own time', async () => {
    const result = await bestTimes(personal, {
      now: NOW,
      providers: ['instagram', 'linkedin'],
    });

    const [instagram, linkedin] = result.platforms;
    expect(instagram.window!.start).toBe('20:00');
    expect(linkedin.window!.start).toBe('09:00');
    expect(instagram.recommendedTime).not.toBe(linkedin.recommendedTime);
  });

  it('answers in the order asked', async () => {
    const result = await bestTimes(personal, {
      now: NOW,
      providers: ['linkedin', 'instagram'],
    });
    expect(result.platforms.map((entry) => entry.provider)).toEqual([
      'linkedin',
      'instagram',
    ]);
  });

  it('covers every network with history when none was named', async () => {
    const result = await bestTimes(personal, { now: NOW });
    expect(result.platforms.map((entry) => entry.provider)).toEqual([
      'instagram',
      'linkedin',
    ]);
  });

  it('names the network the way the product does', async () => {
    const result = await bestTimes(personal, { now: NOW, providers: ['x'] });
    expect(result.platforms[0].label).toBe('X');
    expect(result.platforms[0].reason).toBe('Not enough history yet.');
  });

  it('reports publish history as the evidence, never audience activity', async () => {
    const result = await bestTimes(personal, { now: NOW });
    for (const entry of result.platforms) {
      expect(entry.evidence).toBe('publish_history');
      expect(entry.reason).not.toMatch(/audience|followers|online/i);
    }
  });
});

describe('the scheduler prefill', () => {
  beforeEach(() => {
    repository.findPublishedPublications.mockResolvedValue([
      ...rows(20, '2026-08-10T15:00:00Z', { likes: 500 }),
      ...rows(20, '2026-08-10T04:00:00Z', { likes: 5 }),
    ]);
  });

  it('offers today and tomorrow as local wall clocks', async () => {
    // 09:00 UTC is 14:30 in Kolkata, so a 20:30 slot is still ahead today.
    const result = await bestTimes(personal, { now: NOW });
    const instagram = result.platforms[0];
    expect(instagram.recommendedTime).toBe('20:30');
    expect(instagram.today).toBe('2026-08-12T20:30');
    expect(instagram.tomorrow).toBe('2026-08-13T20:30');
  });

  it('withholds today once the window has passed', async () => {
    const result = await bestTimes(personal, { now: new Date('2026-08-12T18:00:00Z') });
    expect(result.platforms[0].today).toBeNull();
    expect(result.platforms[0].tomorrow).toBe('2026-08-13T20:30');
  });

  it('offers the half-hour choices the window spans', async () => {
    const result = await bestTimes(personal, { now: NOW });
    expect(result.platforms[0].slots).toEqual(['20:00', '20:30', '21:00']);
  });

  it('rounds the lift to a whole percent', async () => {
    const result = await bestTimes(personal, { now: NOW });
    const lift = result.platforms[0].liftPercent;
    expect(lift).not.toBeNull();
    expect(Number.isInteger(lift)).toBe(true);
  });

  it('carries no prefill when there is no recommendation', async () => {
    repository.findPublishedPublications.mockResolvedValue(
      rows(3, '2026-08-10T15:00:00Z'),
    );
    const result = await bestTimes(personal, { now: NOW });
    expect(result.platforms[0].today).toBeNull();
    expect(result.platforms[0].tomorrow).toBeNull();
    expect(result.platforms[0].slots).toEqual([]);
  });
});

describe('content-type awareness', () => {
  it('answers from the requested format when it has history', async () => {
    repository.findPublishedPublications.mockResolvedValue([
      ...rows(20, '2026-08-10T15:00:00Z', {
        contentType: MediaType.REEL,
        likes: 500,
      }),
      ...rows(20, '2026-08-10T04:00:00Z', {
        contentType: MediaType.REEL,
        likes: 5,
      }),
    ]);

    const result = await bestTimes(personal, { now: NOW, format: MediaType.REEL });
    expect(result.platforms[0].basis).toBe('content_type');
  });

  it('widens to the platform and says so when the format is thin', async () => {
    repository.findPublishedPublications.mockResolvedValue([
      ...rows(20, '2026-08-10T15:00:00Z', {
        contentType: MediaType.IMAGE,
        likes: 500,
      }),
      ...rows(20, '2026-08-10T04:00:00Z', {
        contentType: MediaType.IMAGE,
        likes: 5,
      }),
    ]);

    const result = await bestTimes(personal, { now: NOW, format: MediaType.REEL });
    expect(result.platforms[0].basis).toBe('platform');
    expect(result.platforms[0].reason).toMatch(/not enough reel history/i);
  });
});

describe('production safety', () => {
  it('never throws when there is no history at all', async () => {
    const result = await bestTimes(personal, { now: NOW });
    expect(result.platforms).toEqual([]);
  });

  it('answers with none rather than a guess on a tiny sample', async () => {
    repository.findPublishedPublications.mockResolvedValue(
      rows(4, '2026-08-10T15:00:00Z'),
    );
    const result = await bestTimes(personal, { now: NOW });
    expect(result.platforms[0].confidence).toBe('none');
    expect(result.platforms[0].reason).toBe('Not enough history yet.');
  });
});
