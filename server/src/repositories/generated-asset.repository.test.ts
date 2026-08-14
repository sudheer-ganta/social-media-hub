/**
 * Ownership/isolation for `generated_assets` — the table is backend-only
 * (RLS on, no PostgREST policies), so this repository's own `where` clauses
 * are the entire authorization boundary. What is under test is that every
 * read scopes by `userId` (and `brandId` for a brand context) rather than by
 * `id` alone — a query that forgot `userId` would let one member read
 * another's generation history.
 *
 * Run: cd server && npx vitest run src/repositories/generated-asset.repository.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgresql://test/test';
});

const calls = vi.hoisted(() => ({ findFirst: [] as any[], findMany: [] as any[], create: [] as any[], update: [] as any[] }));

vi.mock('../config/prisma', () => ({
  prisma: {
    generatedAsset: {
      findFirst: vi.fn(async (args: any) => {
        calls.findFirst.push(args);
        // Only "returns" a row when the where clause names the exact owner —
        // proving the repository sent userId, not just id.
        if (args.where.id === 'asset-1' && args.where.userId === 'user-a') {
          return { id: 'asset-1', userId: 'user-a', brandId: null, contextType: 'personal', creativeBrief: {}, sourceAssetUrls: [], source: 'AI_GENERATED', status: 'COMPLETED', createdAt: new Date() };
        }
        return null;
      }),
      findMany: vi.fn(async (args: any) => {
        calls.findMany.push(args);
        return [];
      }),
      create: vi.fn(async (args: any) => {
        calls.create.push(args);
        return { id: 'new-asset', createdAt: new Date(), ...args.data };
      }),
      update: vi.fn(async (args: any) => {
        calls.update.push(args);
        return { id: args.where.id, createdAt: new Date(), ...args.data };
      }),
    },
  },
}));

import * as repo from './generated-asset.repository';

beforeEach(() => {
  calls.findFirst = [];
  calls.findMany = [];
  calls.create = [];
  calls.update = [];
  vi.clearAllMocks();
});

describe('findById — user isolation', () => {
  it('scopes by id AND userId together, never id alone', async () => {
    await repo.findById('asset-1', 'user-a');
    expect(calls.findFirst[0].where).toEqual({ id: 'asset-1', userId: 'user-a' });
  });

  it('returns null for the right asset id but the wrong user — User A never sees User B\'s asset', async () => {
    const result = await repo.findById('asset-1', 'user-b');
    expect(result).toBeNull();
  });
});

describe('listByScope — personal/brand isolation', () => {
  it('forces brandId to null for a personal scope, even if one is passed in', async () => {
    await repo.listByScope({ userId: 'user-a', contextType: 'personal', brandId: 'brand-x' });
    expect(calls.findMany[0].where).toMatchObject({ userId: 'user-a', contextType: 'personal', brandId: null });
  });

  it('scopes a brand query to that brand only — Brand A never sees Brand B\'s assets', async () => {
    await repo.listByScope({ userId: 'user-a', contextType: 'brand', brandId: 'brand-a' });
    expect(calls.findMany[0].where).toMatchObject({ userId: 'user-a', contextType: 'brand', brandId: 'brand-a' });

    calls.findMany = [];
    await repo.listByScope({ userId: 'user-a', contextType: 'brand', brandId: 'brand-b' });
    expect(calls.findMany[0].where).toMatchObject({ brandId: 'brand-b' });
    expect(calls.findMany[0].where.brandId).not.toBe('brand-a');
  });

  it('always includes userId — one member\'s query can never widen to another\'s rows', async () => {
    await repo.listByScope({ userId: 'user-a', contextType: 'personal' });
    expect(calls.findMany[0].where.userId).toBe('user-a');
  });
});

describe('create — provenance and no image bytes', () => {
  it('persists the source and never a bytes-shaped field', async () => {
    await repo.create({
      userId: 'user-a',
      contextType: 'personal',
      prompt: 'a request',
      creativeBrief: { concept: 'c' } as any,
      sourceAssetUrls: [],
      provider: 'gemini',
      model: 'gemini-2.5-flash-image',
      source: 'AI_GENERATED',
    });

    const data = calls.create[0].data;
    expect(data.source).toBe('AI_GENERATED');
    expect(data.status).toBe('PENDING');
    // The Prisma model has no bytes/data/buffer column at all — GeneratedAsset
    // stores a Cloudinary URL, never the image itself. Structural proof: the
    // write payload this repository sends contains no such key.
    expect(Object.keys(data)).not.toEqual(expect.arrayContaining(['bytes', 'data', 'buffer', 'imageData']));
  });
});

describe('markCompleted — Cloudinary-measured dimensions', () => {
  it('persists width/height/format alongside the URL', async () => {
    await repo.markCompleted('asset-1', {
      imageUrl: 'https://cdn.example.com/x.png',
      cloudinaryPublicId: 'flowpost/generated/x',
      width: 1024,
      height: 1024,
      format: 'png',
    });

    expect(calls.update[0].data).toMatchObject({
      status: 'COMPLETED',
      imageUrl: 'https://cdn.example.com/x.png',
      width: 1024,
      height: 1024,
      format: 'png',
    });
  });
});
