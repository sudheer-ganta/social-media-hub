/**
 * One post, everywhere it went — the model this whole phase is built on.
 *
 * ─── What is being defended ──────────────────────────────────────────────────
 *
 * Three separations that are easy to collapse and expensive to get wrong:
 *
 *   content  ≠  publication   one post to four networks is four publications
 *   published ≠ attempted     a failed destination is an explanation, not a row
 *                             of zeros beside the real ones
 *   post     ≠  media         no network reports per-asset metrics, so the
 *                             assets are described and never scored
 *
 * Plus the null discipline the rest of analytics rests on: a metric a network
 * never reports, a metric not yet observed, and a metric reported as zero are
 * three different facts and must survive as three different values.
 *
 * Run: cd server && npx vitest run src/services/post-detail.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.DATABASE_URL = 'postgresql://test/test';
  process.env.SCHEDULER_ENABLED = 'false';
});

type Row = Record<string, any>;

const db = vi.hoisted(() => ({
  post: null as Row | null,
  /** The scope the repository was asked for, so ownership can be asserted. */
  lastScope: null as Row | null,
}));

vi.mock('../repositories/analytics.repository', () => ({
  analyticsRepository: {
    findPostWithPublications: vi.fn(async (postId: string, scope: Row) => {
      db.lastScope = scope;
      if (!db.post || db.post.id !== postId) return null;
      // The real query filters on the scope columns; the stand-in does the same
      // so a context mismatch returns null rather than another member's post.
      if (
        db.post.context_type !== scope.contextType ||
        (db.post.brand_id ?? null) !== (scope.brandId ?? null)
      ) {
        return null;
      }
      return db.post;
    }),
    // `postDetail` asks `syncStatus` which connections can be read at all, to
    // tell `collecting` from `unavailable`. No connection has ever synced here,
    // which is the normal state for a freshly published post.
    findSyncStates: vi.fn(async () => []),
  },
}));

/** Every connection readable, unless a test says otherwise. */
const connections = vi.hoisted(() => ({ readable: ['instagram', 'linkedin', 'facebook', 'x'] }));

vi.mock('../repositories/social-account.repository', () => ({
  socialAccountRepository: {
    listByUser: vi.fn(async () =>
      connections.readable.map((provider) => ({
        id: `acct-${provider}`,
        provider,
        providerAccountId: `${provider}-1`,
        displayName: provider,
        username: provider,
        status: 'CONNECTED',
        scopes: ['ALL'],
      })),
    ),
  },
}));

vi.mock('../providers', () => ({
  isKnownProvider: () => true,
  getProvider: (id: string) => ({
    id,
    displayName: id,
    analytics: {
      requiredScopes: ['ALL'],
      hasRequiredScopes: (granted: string[]) => granted.includes('ALL'),
    },
  }),
}));

import { postDetail } from './analytics-query.service';

const PERSONAL = { userId: 'user-1', contextType: 'personal' as const, brandId: null };
const BRAND_A = { userId: 'user-1', contextType: 'brand' as const, brandId: 'brand-a' };

const T0 = new Date('2026-08-12T06:00:00.000Z');
const HOUR = 3_600_000;

function snapshot(offsetMs: number, metrics: Record<string, number | null>) {
  return {
    capturedAt: new Date(T0.getTime() + offsetMs),
    source: 'PROVIDER',
    impressions: null,
    reach: null,
    views: null,
    likes: null,
    comments: null,
    shares: null,
    reposts: null,
    saves: null,
    clicks: null,
    videoViews: null,
    watchTimeMs: null,
    ...metrics,
  };
}

function destination(
  provider: string,
  overrides: Row = {},
): Row {
  return {
    id: `pp-${provider}`,
    provider,
    status: 'PUBLISHED',
    publishedId: `${provider}-post-1`,
    permalink: `https://${provider}.test/1`,
    publishedAt: T0,
    errorMessage: null,
    notice: null,
    mediaType: 'IMAGE',
    mediaTypeFromPlatform: false,
    contentType: 'IMAGE',
    socialAccountId: `acct-${provider}`,
    metricSnapshots: [],
    ...overrides,
  };
}

function post(overrides: Row = {}): Row {
  return {
    id: 'post-1',
    title: 'corporate drama',
    caption: 'a caption',
    media: [
      { id: 'm1', type: 'image', width: 2560, height: 1706, mimeType: 'image/jpeg', url: 'u1' },
    ],
    image_url: 'u1',
    status: 'PUBLISHED',
    context_type: 'personal',
    brand_id: null,
    created_at: T0,
    published_at: T0,
    post_platforms: [],
    ...overrides,
  };
}

beforeEach(() => {
  db.post = null;
  db.lastScope = null;
  connections.readable = ['instagram', 'linkedin', 'facebook', 'x'];
  vi.clearAllMocks();
});

// ─── 1–5. Content vs publication vs attempt ──────────────────────────────────

describe('one post, multiple platform publications', () => {
  it('keeps each network as its own publication', async () => {
    db.post = post({
      post_platforms: [
        destination('instagram'),
        destination('facebook'),
        destination('linkedin'),
      ],
    });

    const detail = await postDetail(PERSONAL, 'post-1');

    expect(detail!.published.map((p) => p.provider)).toEqual([
      'instagram',
      'facebook',
      'linkedin',
    ]);
    // One content item, three publications — the two grains stay separate.
    expect(detail!.postId).toBe('post-1');
  });

  it('carries each publication’s own platform id and account', async () => {
    db.post = post({
      post_platforms: [destination('instagram'), destination('linkedin')],
    });

    const detail = await postDetail(PERSONAL, 'post-1');

    expect(detail!.published[0].platformPostId).toBe('instagram-post-1');
    expect(detail!.published[0].socialAccountId).toBe('acct-instagram');
    expect(detail!.published[1].platformPostId).toBe('linkedin-post-1');
  });

  it.each([
    ['FAILED', 'x'],
    ['PENDING', 'instagram'],
    ['PUBLISHING', 'linkedin'],
    ['CANCELLED', 'facebook'],
  ])('excludes a %s destination from performance', async (status, provider) => {
    db.post = post({
      post_platforms: [
        destination('instagram', { provider: 'instagram' }),
        destination(provider, {
          provider,
          status,
          publishedId: null,
          publishedAt: null,
          errorMessage: status === 'FAILED' ? 'X rejected the post.' : null,
        }),
      ],
    });

    const detail = await postDetail(PERSONAL, 'post-1');

    // Not a performance row...
    expect(detail!.published.some((p) => p.status === status)).toBe(false);
    expect(detail!.published).toHaveLength(1);
    // ...but visible, as an explanation.
    expect(detail!.notPublished.map((d) => d.status)).toEqual([status]);
  });

  it('surfaces the failure message rather than swallowing it', async () => {
    db.post = post({
      post_platforms: [
        destination('x', {
          status: 'FAILED',
          publishedId: null,
          errorMessage: 'X declined the post because the API plan has no credit left.',
        }),
      ],
    });

    const detail = await postDetail(PERSONAL, 'post-1');

    expect(detail!.published).toHaveLength(0);
    expect(detail!.notPublished[0].errorMessage).toContain('no credit left');
  });

  it('excludes a PUBLISHED row that never received an id', async () => {
    // Cannot be identified on the network, so it can never be synced — the
    // same rule the rest of analytics applies.
    db.post = post({
      post_platforms: [destination('x', { publishedId: null })],
    });

    const detail = await postDetail(PERSONAL, 'post-1');
    expect(detail!.published).toHaveLength(0);
    expect(detail!.notPublished).toHaveLength(1);
  });

  it('returns a post with no successful destination as empty performance', async () => {
    db.post = post({
      status: 'DRAFT',
      published_at: null,
      post_platforms: [],
    });

    const detail = await postDetail(PERSONAL, 'post-1');
    expect(detail!.published).toEqual([]);
    expect(detail!.notPublished).toEqual([]);
  });
});

// ─── 6. Same content compared across platforms ───────────────────────────────

describe('comparing the same content across networks', () => {
  beforeEach(() => {
    db.post = post({
      post_platforms: [
        destination('instagram', {
          metricSnapshots: [snapshot(HOUR, { reach: 1842, likes: 120, comments: 6 })],
        }),
        destination('linkedin', {
          metricSnapshots: [snapshot(HOUR, { impressions: 7, likes: 1 })],
        }),
      ],
    });
  });

  it('labels each network’s exposure metric with what it actually is', async () => {
    const detail = await postDetail(PERSONAL, 'post-1');
    const [instagram, linkedin] = detail!.published;

    // The reason 1,842 and 7 are never put in one column: unique accounts
    // versus appearances.
    expect(instagram.exposure).toMatchObject({
      metric: 'reach',
      label: 'Reach',
      value: 1842,
    });
    expect(linkedin.exposure).toMatchObject({
      metric: 'impressions',
      label: 'Impressions',
      value: 7,
    });
  });

  it('never reports a metric a network does not measure', async () => {
    const detail = await postDetail(PERSONAL, 'post-1');
    const instagram = detail!.published[0];

    // Meta removed media impressions in v22 — permanently absent, not pending.
    expect(instagram.reportsMetrics).not.toContain('impressions');
    expect(instagram.metrics.impressions).toBeNull();
  });

  it('computes each publication’s own engagement rate', async () => {
    const detail = await postDetail(PERSONAL, 'post-1');
    const [instagram, linkedin] = detail!.published;

    // 126 / 1842 and 1 / 7 — each against its own exposure, never blended.
    expect(instagram.engagement).toBe(126);
    expect(linkedin.engagement).toBe(1);
    expect(linkedin.engagementRate).toBeCloseTo(1 / 7, 5);
  });
});

// ─── 7–8. Scope isolation ────────────────────────────────────────────────────

describe('context isolation', () => {
  it('does not return a brand’s post under Personal', async () => {
    db.post = post({ context_type: 'brand', brand_id: 'brand-a' });
    expect(await postDetail(PERSONAL, 'post-1')).toBeNull();
  });

  it('does not return a Personal post under a brand', async () => {
    db.post = post();
    expect(await postDetail(BRAND_A, 'post-1')).toBeNull();
  });

  it('does not return one brand’s post under another', async () => {
    db.post = post({ context_type: 'brand', brand_id: 'brand-a' });
    const other = { ...BRAND_A, brandId: 'brand-b' };
    expect(await postDetail(other, 'post-1')).toBeNull();
  });

  it('passes the full scope to the repository, never just the user', async () => {
    db.post = post({ context_type: 'brand', brand_id: 'brand-a' });
    await postDetail(BRAND_A, 'post-1');

    expect(db.lastScope).toMatchObject({
      userId: 'user-1',
      contextType: 'brand',
      brandId: 'brand-a',
    });
  });

  it('answers a missing post and a foreign post identically', async () => {
    // Indistinguishable on purpose: otherwise this endpoint enumerates post ids.
    db.post = post({ context_type: 'brand', brand_id: 'brand-a' });
    const foreign = await postDetail(PERSONAL, 'post-1');

    db.post = null;
    const missing = await postDetail(PERSONAL, 'post-1');

    expect(foreign).toBe(missing);
  });
});

// ─── 10–13. Media type provenance and the null discipline ────────────────────

describe('media type provenance', () => {
  it('marks a platform-confirmed format as confirmed', async () => {
    db.post = post({
      post_platforms: [
        destination('instagram', {
          mediaType: 'REEL',
          mediaTypeFromPlatform: true,
          contentType: 'VIDEO',
        }),
      ],
    });

    const detail = await postDetail(PERSONAL, 'post-1');

    // Instagram filed it as a Reel; we asked for a video. Both survive.
    expect(detail!.published[0].mediaType).toBe('REEL');
    expect(detail!.published[0].mediaTypeConfirmed).toBe(true);
    expect(detail!.published[0].contentType).toBe('VIDEO');
  });

  it('marks an inferred format as not confirmed', async () => {
    db.post = post({
      post_platforms: [destination('x', { mediaTypeFromPlatform: false })],
    });

    const detail = await postDetail(PERSONAL, 'post-1');
    expect(detail!.published[0].mediaTypeConfirmed).toBe(false);
  });
});

describe('null is not zero', () => {
  it('keeps an unreported metric null', async () => {
    db.post = post({
      post_platforms: [
        destination('x', { metricSnapshots: [snapshot(HOUR, { impressions: 900 })] }),
      ],
    });

    const detail = await postDetail(PERSONAL, 'post-1');
    const x = detail!.published[0];

    expect(x.metrics.impressions).toBe(900);
    // X reports no unique reach, ever.
    expect(x.metrics.reach).toBeNull();
    expect(x.reportsMetrics).not.toContain('reach');
  });

  it('keeps a reported zero as zero', async () => {
    db.post = post({
      post_platforms: [
        destination('instagram', {
          metricSnapshots: [snapshot(HOUR, { reach: 1, likes: 0, comments: 0 })],
        }),
      ],
    });

    const detail = await postDetail(PERSONAL, 'post-1');
    const instagram = detail!.published[0];

    // A genuine measurement of nothing. Must not read as "unavailable".
    expect(instagram.metrics.likes).toBe(0);
    expect(instagram.metrics.comments).toBe(0);
    expect(instagram.state).toBe('measured');
  });
});

// ─── 14. The three empty states ──────────────────────────────────────────────

describe('what to say when there are no numbers', () => {
  it('is collecting when the network is readable and nothing is observed yet', async () => {
    db.post = post({ post_platforms: [destination('instagram')] });

    const detail = await postDetail(PERSONAL, 'post-1');

    expect(detail!.published[0].state).toBe('collecting');
    expect(detail!.published[0].lastCapturedAt).toBeNull();
  });

  it('is unavailable when the connection cannot be read at all', async () => {
    // The distinction that matters: "collecting" resolves on its own and
    // "unavailable" never will. A spinner on the second waits forever.
    connections.readable = ['x'];
    db.post = post({ post_platforms: [destination('instagram')] });

    const detail = await postDetail(PERSONAL, 'post-1');
    expect(detail!.published[0].state).toBe('unavailable');
  });

  it('is measured once anything has been observed', async () => {
    db.post = post({
      post_platforms: [
        destination('instagram', { metricSnapshots: [snapshot(HOUR, { reach: 1 })] }),
      ],
    });

    const detail = await postDetail(PERSONAL, 'post-1');
    expect(detail!.published[0].state).toBe('measured');
  });
});

// ─── 15. Historical snapshots ────────────────────────────────────────────────

describe('snapshot history', () => {
  beforeEach(() => {
    db.post = post({
      post_platforms: [
        destination('linkedin', {
          metricSnapshots: [
            snapshot(1 * HOUR, { impressions: 20 }),
            snapshot(6 * HOUR, { impressions: 84 }),
            snapshot(24 * HOUR, { impressions: 312 }),
            snapshot(72 * HOUR, { impressions: 640 }),
          ],
        }),
      ],
    });
  });

  it('returns every observation, oldest first', async () => {
    const detail = await postDetail(PERSONAL, 'post-1');
    const history = detail!.published[0].history;

    // The growth curve. A curve read backwards is a chart nobody can use.
    expect(history.map((h) => h.metrics.impressions)).toEqual([20, 84, 312, 640]);
  });

  it('reports the newest observation as the current numbers', async () => {
    const detail = await postDetail(PERSONAL, 'post-1');

    // Never a sum over snapshots — the series is cumulative, so adding T+1h to
    // T+72h would count the first hour twice.
    expect(detail!.published[0].metrics.impressions).toBe(640);
  });

  it('does not collapse history into the latest reading', async () => {
    const detail = await postDetail(PERSONAL, 'post-1');
    expect(detail!.published[0].history).toHaveLength(4);
  });
});

// ─── 18–19. Media level ──────────────────────────────────────────────────────

describe('media', () => {
  it('describes each asset without scoring it', async () => {
    db.post = post({
      media: [
        { id: 'm1', type: 'image', width: 1080, height: 1080, url: 'a' },
        { id: 'm2', type: 'video', width: 1080, height: 1920, durationMs: 18_000, url: 'b' },
      ],
      post_platforms: [
        destination('instagram', {
          metricSnapshots: [snapshot(HOUR, { reach: 1842, likes: 126 })],
        }),
      ],
    });

    const detail = await postDetail(PERSONAL, 'post-1');

    expect(detail!.media).toHaveLength(2);
    expect(detail!.media[0]).toMatchObject({
      position: 0,
      kind: 'image',
      aspectRatioLabel: '1:1',
    });
    expect(detail!.media[1]).toMatchObject({
      position: 1,
      kind: 'video',
      aspectRatioLabel: '9:16',
      durationMs: 18_000,
    });
  });

  it('fabricates no per-asset metrics', async () => {
    db.post = post({
      media: [
        { id: 'm1', type: 'image', width: 1080, height: 1080, url: 'a' },
        { id: 'm2', type: 'image', width: 1080, height: 1080, url: 'b' },
        { id: 'm3', type: 'image', width: 1080, height: 1080, url: 'c' },
      ],
      post_platforms: [
        destination('instagram', {
          mediaType: 'CAROUSEL',
          metricSnapshots: [snapshot(HOUR, { reach: 1842, likes: 126 })],
        }),
      ],
    });

    const detail = await postDetail(PERSONAL, 'post-1');

    // 126 interactions over 3 slides must not become "42 each". Nothing on a
    // media asset carries a platform number at all.
    for (const asset of detail!.media) {
      expect(Object.keys(asset)).not.toContain('likes');
      expect(Object.keys(asset)).not.toContain('engagement');
      expect(Object.keys(asset)).not.toContain('reach');
    }
  });

  it('states that the network reports on the post, not the media', async () => {
    db.post = post({ post_platforms: [destination('instagram')] });

    const detail = await postDetail(PERSONAL, 'post-1');

    expect(detail!.mediaLevel).toEqual([
      {
        provider: 'instagram',
        available: false,
        note: expect.stringContaining('not per image'),
      },
    ]);
  });

  it('declares media support only for networks this post reached', async () => {
    db.post = post({ post_platforms: [destination('x')] });

    const detail = await postDetail(PERSONAL, 'post-1');

    // Not a page of "unavailable" for platforms never published to.
    expect(detail!.mediaLevel.map((m) => m.provider)).toEqual(['x']);
  });

  it('summarises the shape of what was attached', async () => {
    db.post = post({
      media: [
        { id: 'm1', type: 'image', url: 'a' },
        { id: 'm2', type: 'image', url: 'b' },
      ],
    });

    const detail = await postDetail(PERSONAL, 'post-1');
    expect(detail!.mediaShape).toBe('2 images');
  });

  it('reports a text post as having no media', async () => {
    db.post = post({ media: [], image_url: null });

    const detail = await postDetail(PERSONAL, 'post-1');
    expect(detail!.media).toEqual([]);
    expect(detail!.mediaShape).toBe('Text only');
  });
});
