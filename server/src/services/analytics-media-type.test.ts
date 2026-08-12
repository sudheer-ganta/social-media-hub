/**
 * How the by-media-type breakdown decides what format a publication is.
 *
 * The rule under test is a precedence, and it is the same one the sync service
 * uses to pick a metrics horizon: **observed first, requested second**. The
 * network's own word wins whenever there is one; the member's stated intent is
 * consulted only while there is not.
 *
 * Both halves matter. Without the fallback, everything published in the last
 * hour sits in the "format unknown" bucket — a member who just posted a Reel is
 * told they have published nothing of any recognised format. With the fallback
 * winning over the observed value, Instagram filing a video as a REEL when we
 * called it a VIDEO would be silently overwritten by our own guess, which is
 * the whole thing the observed column exists to prevent.
 *
 * Run: cd server && npx vitest run src/services/analytics-media-type.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.DATABASE_URL = 'postgresql://test/test';
  process.env.SCHEDULER_ENABLED = 'false';
});

type Row = Record<string, any>;

const db = vi.hoisted(() => ({ publications: [] as Row[] }));

vi.mock('../repositories/analytics.repository', () => ({
  analyticsRepository: {
    findPublishedPublications: vi.fn(async () => db.publications),
  },
}));

import { byMediaType } from './analytics-query.service';

const SCOPE = { userId: 'user-1', contextType: 'personal' as const, brandId: null };
const WINDOW = { kind: 'window' as const, size: 20 };

/** One publication, with only the columns this breakdown reads. */
function publication(
  id: string,
  mediaType: string | null,
  contentType: string | null,
): Row {
  return {
    id,
    provider: 'instagram',
    publishedId: `ig-${id}`,
    permalink: null,
    publishedAt: new Date('2026-08-11T10:00:00.000Z'),
    mediaType,
    mediaTypeFromPlatform: mediaType !== null,
    contentType,
    socialAccountId: 'acct-1',
    post: { id: `post-${id}`, title: null, caption: 'hi', media: [], published_at: null },
    metricSnapshots: [],
  };
}

/** The bucket a given publication landed in. */
async function bucketsOf(...rows: Row[]) {
  db.publications = rows;
  const breakdown = await byMediaType(SCOPE, WINDOW);
  return breakdown.map((entry) => entry.mediaType);
}

beforeEach(() => {
  db.publications = [];
  vi.clearAllMocks();
});

describe('media-type bucketing', () => {
  it('uses the format the network reported', async () => {
    expect(await bucketsOf(publication('a', 'REEL', 'REEL'))).toEqual(['REEL']);
  });

  it('falls back to the requested format before the first sync', async () => {
    // A Reel published twenty minutes ago. Nothing has observed it yet — the
    // first cadence stage is T+1h — and it must not read as "unknown".
    expect(await bucketsOf(publication('a', null, 'REEL'))).toEqual(['REEL']);
  });

  it('lets the network overrule what we asked for', async () => {
    // We called it a VIDEO; Instagram filed it as a REEL. Instagram is the
    // authority on its own surfaces, and the observed column exists precisely
    // so this correction survives.
    expect(await bucketsOf(publication('a', 'REEL', 'VIDEO'))).toEqual(['REEL']);
  });

  it('keeps an unknown bucket for publications with neither', async () => {
    // Published before the content-type column existed and never synced. A
    // real bucket rather than a dropped row: excluding it would make the
    // percentages describe less than the window while appearing to describe
    // all of it.
    expect(await bucketsOf(publication('a', null, null))).toEqual([null]);
  });

  it('separates every format the composer can publish', async () => {
    const buckets = await bucketsOf(
      publication('a', 'TEXT', 'TEXT'),
      publication('b', 'IMAGE', 'IMAGE'),
      publication('c', 'CAROUSEL', 'CAROUSEL'),
      publication('d', 'VIDEO', 'VIDEO'),
      publication('e', 'REEL', 'REEL'),
      publication('f', 'STORY', 'STORY'),
    );

    // Six publications, six buckets — the distinction the next phase's
    // "which format works" question is built on.
    expect(buckets.sort()).toEqual([
      'CAROUSEL',
      'IMAGE',
      'REEL',
      'STORY',
      'TEXT',
      'VIDEO',
    ]);
  });

  it('does not merge a Reel with a feed video', async () => {
    const breakdown = await (async () => {
      db.publications = [
        publication('a', 'REEL', 'REEL'),
        publication('b', 'REEL', 'REEL'),
        publication('c', 'VIDEO', 'VIDEO'),
      ];
      return byMediaType(SCOPE, WINDOW);
    })();

    const reel = breakdown.find((entry) => entry.mediaType === 'REEL');
    const video = breakdown.find((entry) => entry.mediaType === 'VIDEO');

    expect(reel?.publications).toBe(2);
    expect(video?.publications).toBe(1);
  });

  it('reports coverage separately from the publication count', async () => {
    // Two Reels, neither measured. The count is real and the metrics are
    // absent, and a reader has to be able to tell — a zero engagement rate
    // over unmeasured posts would be a claim we cannot support.
    db.publications = [
      publication('a', 'REEL', 'REEL'),
      publication('b', 'REEL', 'REEL'),
    ];

    const [entry] = await byMediaType(SCOPE, WINDOW);

    expect(entry.publications).toBe(2);
    expect(entry.coverage.measured).toBe(0);
    expect(entry.engagementRate).toBeNull();
    expect(entry.averageEngagement).toBeNull();
  });
});

// ─── Provenance and sample size ──────────────────────────────────────────────

describe('classification provenance', () => {
  /**
   * A REEL bucket built entirely from what the member *asked for* is a claim
   * about intent; one the network confirmed is a claim about what was
   * published. Instagram files a video as a Reel whatever we called it, so the
   * two genuinely diverge — and "Reels perform best" computed from unconfirmed
   * rows would be a statement about our own labelling.
   */
  it('counts confirmed and inferred rows separately', async () => {
    db.publications = [
      { ...publication('a', 'REEL', 'REEL'), mediaTypeFromPlatform: true },
      { ...publication('b', 'REEL', 'REEL'), mediaTypeFromPlatform: true },
      { ...publication('c', 'REEL', 'REEL'), mediaTypeFromPlatform: false },
    ];

    const [entry] = await byMediaType(SCOPE, WINDOW);

    expect(entry.confirmed).toBe(2);
    expect(entry.inferred).toBe(1);
    expect(entry.publications).toBe(3);
  });

  it('marks a bucket classified only from the request as fully inferred', async () => {
    db.publications = [publication('a', null, 'REEL')];

    const [entry] = await byMediaType(SCOPE, WINDOW);

    // Grouped as REEL — the fallback works — but nothing confirmed it.
    expect(entry.mediaType).toBe('REEL');
    expect(entry.confirmed).toBe(0);
    expect(entry.inferred).toBe(1);
  });
});

describe('sample size gates the language, never the data', () => {
  /** A measured publication in the given bucket. */
  function measured(id: string, type: string) {
    return {
      ...publication(id, type, type),
      mediaTypeFromPlatform: true,
      metricSnapshots: [
        {
          capturedAt: new Date('2026-08-11T12:00:00.000Z'),
          source: 'PROVIDER',
          impressions: 100,
          reach: null,
          views: null,
          likes: 5,
          comments: null,
          shares: null,
          reposts: null,
          saves: null,
          clicks: null,
          videoViews: null,
          watchTimeMs: null,
        },
      ],
    };
  }

  it('is not a strong signal below the threshold', async () => {
    db.publications = [measured('a', 'REEL'), measured('b', 'REEL')];

    const [entry] = await byMediaType(SCOPE, WINDOW);

    // Two posts is a coincidence with a percentage attached. The numbers are
    // still returned — only the framing changes.
    expect(entry.strongSignal).toBe(false);
    expect(entry.totals.likes.value).toBe(10);
  });

  it('is a strong signal once enough have been measured', async () => {
    db.publications = ['a', 'b', 'c', 'd', 'e'].map((id) => measured(id, 'REEL'));

    const [entry] = await byMediaType(SCOPE, WINDOW);
    expect(entry.strongSignal).toBe(true);
  });

  it('counts measured rows, not published ones', async () => {
    // Twelve Reels of which one has ever been synced is one data point.
    db.publications = [
      measured('a', 'REEL'),
      ...['b', 'c', 'd', 'e', 'f'].map((id) => publication(id, 'REEL', 'REEL')),
    ];

    const [entry] = await byMediaType(SCOPE, WINDOW);

    expect(entry.publications).toBe(6);
    expect(entry.strongSignal).toBe(false);
  });
});
