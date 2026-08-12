/**
 * What counts as a publication, asserted against rows rather than clauses.
 *
 * ─── The bug this exists to prevent ──────────────────────────────────────────
 *
 * The Analytics page once showed "Posts Published: 0" beside a platform mix of
 * "LinkedIn 3, Instagram 3, Facebook 2, X 1". The chart was counting
 * `posts.platforms` — the destinations a member *ticked in the composer*, a
 * list carrying no status at all — so drafts, failures and in-flight publishes
 * all counted as publications.
 *
 * The rule is: **a platform publication counts only when that destination
 * actually published.** `status = PUBLISHED` *and* a non-null `publishedId` —
 * the id being load-bearing because a row can reach PUBLISHED without one, and
 * a publication we cannot identify on the network is one we can never sync.
 *
 * ─── Why this mocks Prisma with a working filter ─────────────────────────────
 *
 * `analytics.repository.test.ts` asserts the *shape* of the where clause, which
 * is the right test for scope enforcement. It cannot catch this class of bug: a
 * predicate can be perfectly shaped and still admit the wrong rows. So the mock
 * here actually evaluates the clause against fixtures covering every
 * `PublishStatus`, and the assertions are about which rows survive.
 *
 * Run: cd server && npx vitest run src/repositories/publication-eligibility.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.DATABASE_URL = 'postgresql://test/test';
});

type Row = Record<string, any>;

const db = vi.hoisted(() => ({ rows: [] as Row[] }));

/**
 * Enough of Prisma's where semantics to evaluate the clauses this repository
 * builds: equality, `{ not: null }`, `{ gte, lt }`, and a nested `post` object.
 * Anything the repository starts using that is not modelled here throws, rather
 * than silently matching everything — a permissive mock would defeat the point.
 */
function matches(row: Row, where: Row): boolean {
  for (const [key, condition] of Object.entries(where)) {
    if (key === 'post') {
      if (!matches(row.post ?? {}, condition as Row)) return false;
      continue;
    }

    const value = row[key];

    if (condition !== null && typeof condition === 'object') {
      for (const [op, operand] of Object.entries(condition as Row)) {
        if (op === 'not') {
          if (operand === null ? value === null || value === undefined : value === operand) {
            return false;
          }
        } else if (op === 'gte') {
          if (!(value && value >= operand)) return false;
        } else if (op === 'lt') {
          if (!(value && value < operand)) return false;
        } else if (op === 'in') {
          if (!(operand as unknown[]).includes(value)) return false;
        } else {
          throw new Error(`unmodelled Prisma operator: ${op}`);
        }
      }
      continue;
    }

    if (value !== condition) return false;
  }
  return true;
}

vi.mock('../config/prisma', () => ({
  prisma: {
    postPlatform: {
      findMany: vi.fn(async (args: any) => {
        let rows = db.rows.filter((row) => matches(row, args.where ?? {}));
        if (args.distinct?.includes('postId')) {
          const seen = new Set<string>();
          rows = rows.filter((row) =>
            seen.has(row.postId) ? false : (seen.add(row.postId), true),
          );
        }
        return rows;
      }),
      count: vi.fn(
        async (args: any) => db.rows.filter((row) => matches(row, args.where ?? {})).length,
      ),
    },
    accountMetricSnapshot: { findMany: vi.fn(async () => []) },
  },
}));

import {
  countPublishedPosts,
  countPublishedPublications,
  findPublishedPublications,
} from './analytics.repository';

const PERSONAL = { userId: 'user-1', contextType: 'personal' as const, brandId: null };
const BRAND_A = { userId: 'user-1', contextType: 'brand' as const, brandId: 'brand-a' };
const LIFETIME = { kind: 'lifetime' as const };

/** One `post_platforms` row, with its post's scope columns attached. */
function destination(
  provider: string,
  status: string,
  options: {
    postId?: string;
    publishedId?: string | null;
    scope?: typeof PERSONAL | typeof BRAND_A;
  } = {},
): Row {
  const scope = options.scope ?? PERSONAL;
  // A row is only ever given an id when it genuinely published — which is what
  // the production data looks like, and what makes the two halves of the
  // predicate independently meaningful.
  const publishedId =
    options.publishedId !== undefined
      ? options.publishedId
      : status === 'PUBLISHED'
        ? `${provider}-id`
        : null;

  return {
    id: `${provider}-${status}-${options.postId ?? 'post-1'}`,
    postId: options.postId ?? 'post-1',
    provider,
    status,
    publishedId,
    publishedAt: publishedId ? new Date('2026-08-12T06:33:00.000Z') : null,
    metricSnapshots: [],
    post: {
      created_by: scope.userId,
      context_type: scope.contextType,
      brand_id: scope.brandId,
    },
  };
}

/** The providers a platform-mix chart would draw, in provider order. */
async function platformMix(scope = PERSONAL) {
  const rows = await findPublishedPublications(scope, { dimension: LIFETIME });
  return rows.map((row: Row) => row.provider).sort();
}

beforeEach(() => {
  db.rows = [];
  vi.clearAllMocks();
});

// ─── One case per status ─────────────────────────────────────────────────────

describe('destinations that must never enter analytics', () => {
  it('excludes a FAILED destination', async () => {
    db.rows = [destination('x', 'FAILED')];

    expect(await platformMix()).toEqual([]);
    expect(await countPublishedPosts(PERSONAL, { dimension: LIFETIME })).toBe(0);
  });

  it('excludes a PENDING destination', async () => {
    // "AI Ready" and "scheduled" both land here: the row exists because a
    // destination was chosen, and nothing has been sent.
    db.rows = [destination('instagram', 'PENDING')];

    expect(await platformMix()).toEqual([]);
    expect(await countPublishedPosts(PERSONAL, { dimension: LIFETIME })).toBe(0);
  });

  it('excludes a PUBLISHING destination', async () => {
    db.rows = [destination('linkedin', 'PUBLISHING')];
    expect(await platformMix()).toEqual([]);
  });

  it('excludes a CANCELLED destination', async () => {
    db.rows = [destination('facebook', 'CANCELLED')];
    expect(await platformMix()).toEqual([]);
  });

  it('excludes a draft, which has no destination rows at all', async () => {
    // A draft's chosen platforms live in `posts.platforms` and produce no
    // `post_platforms` row until a publish is attempted. Counting that column
    // is precisely the bug this file guards.
    db.rows = [];
    expect(await platformMix()).toEqual([]);
    expect(await countPublishedPosts(PERSONAL, { dimension: LIFETIME })).toBe(0);
  });

  it('excludes a row marked PUBLISHED that never received an id', async () => {
    // Both halves of the predicate are load-bearing. Without the id there is
    // nothing to sync and nothing to link to.
    db.rows = [destination('x', 'PUBLISHED', { publishedId: null })];
    expect(await platformMix()).toEqual([]);
  });
});

describe('destinations that count', () => {
  it('includes a PUBLISHED destination with an id', async () => {
    db.rows = [destination('linkedin', 'PUBLISHED')];

    expect(await platformMix()).toEqual(['linkedin']);
    expect(await countPublishedPosts(PERSONAL, { dimension: LIFETIME })).toBe(1);
    expect(
      await countPublishedPublications(PERSONAL, { dimension: LIFETIME }),
    ).toBe(1);
  });
});

// ─── The production case that produced the bug report ────────────────────────

describe('a mixed-status post counts only what published', () => {
  /**
   * The real row set behind "Posts Published: 0 / Platform Mix: 9".
   *
   * One post whose LinkedIn, Instagram and Facebook destinations published and
   * whose X destination failed. The post's own `status` is FAILED — the
   * workspace status goes to FAILED when any destination fails — which is why
   * counting posts by that column reported zero.
   */
  beforeEach(() => {
    db.rows = [
      destination('linkedin', 'PUBLISHED'),
      destination('instagram', 'PUBLISHED'),
      destination('facebook', 'PUBLISHED'),
      destination('x', 'FAILED'),
    ];
  });

  it('counts the three that published and not the one that failed', async () => {
    expect(await platformMix()).toEqual(['facebook', 'instagram', 'linkedin']);
  });

  it('counts the post once, however many networks it reached', async () => {
    // One piece of content, three platform results. The two grains are both
    // true and must not be conflated.
    expect(await countPublishedPosts(PERSONAL, { dimension: LIFETIME })).toBe(1);
    expect(
      await countPublishedPublications(PERSONAL, { dimension: LIFETIME }),
    ).toBe(3);
  });

  it('keeps "Posts Published" and the platform mix consistent', async () => {
    // The invariant the UI broke: a non-empty mix implies at least one
    // published post, and an empty mix implies none. Never zero beside nine.
    const mix = await platformMix();
    const posts = await countPublishedPosts(PERSONAL, { dimension: LIFETIME });

    expect(mix.length > 0).toBe(posts > 0);
  });
});

describe('when nothing has published anywhere', () => {
  it('reports zero posts and an empty mix', async () => {
    db.rows = [
      destination('linkedin', 'PENDING', { postId: 'post-1' }),
      destination('instagram', 'FAILED', { postId: 'post-1' }),
      destination('facebook', 'PUBLISHING', { postId: 'post-2' }),
      destination('x', 'CANCELLED', { postId: 'post-2' }),
    ];

    const mix = await platformMix();
    const posts = await countPublishedPosts(PERSONAL, { dimension: LIFETIME });

    expect(mix).toEqual([]);
    expect(posts).toBe(0);
    expect(mix.length > 0).toBe(posts > 0);
  });
});

// ─── Scope is still enforced on top of eligibility ───────────────────────────

describe('context separation survives the eligibility rule', () => {
  beforeEach(() => {
    db.rows = [
      destination('linkedin', 'PUBLISHED', { postId: 'p-personal', scope: PERSONAL }),
      destination('instagram', 'PUBLISHED', { postId: 'p-brand', scope: BRAND_A }),
      // A published row belonging to somebody else entirely.
      destination('x', 'PUBLISHED', {
        postId: 'p-other',
        scope: { userId: 'user-2', contextType: 'personal', brandId: null } as any,
      }),
    ];
  });

  it('shows Personal only its own publications', async () => {
    expect(await platformMix(PERSONAL)).toEqual(['linkedin']);
    expect(await countPublishedPosts(PERSONAL, { dimension: LIFETIME })).toBe(1);
  });

  it('shows a brand only its own', async () => {
    expect(await platformMix(BRAND_A)).toEqual(['instagram']);
    expect(await countPublishedPosts(BRAND_A, { dimension: LIFETIME })).toBe(1);
  });

  it('never leaks another user’s publications into either', async () => {
    expect(await platformMix(PERSONAL)).not.toContain('x');
    expect(await platformMix(BRAND_A)).not.toContain('x');
  });

  it('does not let a brand’s publications count toward Personal', async () => {
    // `brand_id: null` is a filter in its own right for Personal, not an
    // absent one — otherwise every brand publication would also be personal.
    expect(await platformMix(PERSONAL)).not.toContain('instagram');
  });
});
