/**
 * The analytics repository's scope enforcement, asserted on the where-clause
 * it actually builds.
 *
 * Prisma is mocked down to a call recorder here, deliberately. What is under
 * test is not that Postgres filters correctly — it does — but that *every*
 * analytics read pins `created_by`, `context_type` and `brand_id` together. A
 * test that ran real queries against seeded data could pass while the query
 * silently omitted `brand_id`, because a fixture with one brand cannot tell the
 * difference. Reading the clause can.
 *
 * Run: cd server && npx vitest run src/repositories/analytics.repository.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.DATABASE_URL = 'postgresql://test/test';
});

const calls = vi.hoisted(() => ({ findMany: [] as any[], count: [] as any[] }));

vi.mock('../config/prisma', () => ({
  prisma: {
    postPlatform: {
      findMany: vi.fn(async (args: any) => {
        calls.findMany.push(args);
        return [];
      }),
      count: vi.fn(async (args: any) => {
        calls.count.push(args);
        return 0;
      }),
    },
    accountMetricSnapshot: {
      findMany: vi.fn(async (args: any) => {
        calls.findMany.push(args);
        return [];
      }),
    },
  },
}));

import {
  countPublishedPublications,
  countUnattributedPublications,
  findAccountSnapshots,
  findPublishedPublications,
} from './analytics.repository';

const PERSONAL = { userId: 'user-1', contextType: 'personal' as const, brandId: null };
const BRAND_A = { userId: 'user-1', contextType: 'brand' as const, brandId: 'brand-a' };

beforeEach(() => {
  calls.findMany.length = 0;
  calls.count.length = 0;
});

describe('context scoping', () => {
  it('pins brand_id to null for Personal, not merely context_type', async () => {
    await findPublishedPublications(PERSONAL, { dimension: { kind: 'lifetime' } });

    // Without the explicit null, every brand post also satisfies "belongs to
    // this user and has a context", and Personal would show all four contexts.
    expect(calls.findMany[0].where.post).toEqual({
      created_by: 'user-1',
      context_type: 'personal',
      brand_id: null,
    });
  });

  it('pins brand_id to the requested brand for a Brand scope', async () => {
    await findPublishedPublications(BRAND_A, { dimension: { kind: 'lifetime' } });

    expect(calls.findMany[0].where.post).toEqual({
      created_by: 'user-1',
      context_type: 'brand',
      brand_id: 'brand-a',
    });
  });

  it('applies the same scope to counts', async () => {
    await countPublishedPublications(BRAND_A, { dimension: { kind: 'lifetime' } });

    expect(calls.count[0].where.post).toEqual({
      created_by: 'user-1',
      context_type: 'brand',
      brand_id: 'brand-a',
    });
  });

  it('scopes account snapshots on the denormalised columns', async () => {
    await findAccountSnapshots(BRAND_A, { dimension: { kind: 'lifetime' } });

    const where = calls.findMany[0].where;
    expect(where.userId).toBe('user-1');
    expect(where.contextType).toBe('brand');
    expect(where.brandId).toBe('brand-a');
  });

  it('scopes the unattributed count too', async () => {
    await countUnattributedPublications(PERSONAL, 'x');

    expect(calls.count[0].where.post).toEqual({
      created_by: 'user-1',
      context_type: 'personal',
      brand_id: null,
    });
    expect(calls.count[0].where.socialAccountId).toBeNull();
  });
});

describe('what counts as published', () => {
  it('requires PUBLISHED status and a platform id, never posts.status', async () => {
    await findPublishedPublications(PERSONAL, { dimension: { kind: 'lifetime' } });

    const where = calls.findMany[0].where;
    expect(where.status).toBe('PUBLISHED');
    // `publishNow()` flips posts.status without contacting any network. A
    // publication we cannot identify on the platform is one we can never sync.
    expect(where.publishedId).toEqual({ not: null });
    expect(where.post.status).toBeUndefined();
  });
});

describe('the three time dimensions', () => {
  it('bounds a window by count and not by date', async () => {
    await findPublishedPublications(PERSONAL, {
      dimension: { kind: 'window', size: 20 },
    });

    const args = calls.findMany[0];
    expect(args.take).toBe(20);
    // A window needs a timestamp to order on, but imposes no range.
    expect(args.where.publishedAt).toEqual({ not: null });
  });

  it('bounds a period by date and not by count', async () => {
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-08-01T00:00:00.000Z');

    await findPublishedPublications(PERSONAL, {
      dimension: { kind: 'period', from, to },
    });

    const args = calls.findMany[0];
    expect(args.take).toBeUndefined();
    expect(args.where.publishedAt).toEqual({ gte: from, lt: to });
  });

  it('bounds lifetime by nothing at all — history is never narrowed', async () => {
    await findPublishedPublications(PERSONAL, { dimension: { kind: 'lifetime' } });

    const args = calls.findMany[0];
    expect(args.take).toBeUndefined();
    expect(args.where.publishedAt).toBeUndefined();
  });
});
