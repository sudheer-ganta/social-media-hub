/** Ownership, scope, provenance, and atomic canonical attachment tests. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => { process.env.DATABASE_URL = 'postgresql://test/test'; });
const calls = vi.hoisted(() => ({ findFirst: [] as any[], findMany: [] as any[], create: [] as any[], update: [] as any[], attach: [] as any[], attachCount: 1 }));

vi.mock('../config/prisma', () => {
  const generatedAsset = {
    findFirst: vi.fn(async (args: any) => { calls.findFirst.push(args); return args.where.id === 'asset-1' && args.where.userId === 'user-a' ? { id: 'asset-1', userId: 'user-a', brandId: null, contextType: 'personal', creativeBrief: {}, sourceAssetUrls: [], source: 'AI_GENERATED', status: 'COMPLETED', createdAt: new Date() } : null; }),
    findMany: vi.fn(async (args: any) => { calls.findMany.push(args); return []; }),
    create: vi.fn(async (args: any) => { calls.create.push(args); return { id: 'new-asset', createdAt: new Date(), ...args.data }; }),
    update: vi.fn(async (args: any) => { calls.update.push(args); return { id: args.where.id, createdAt: new Date(), ...args.data }; }),
  };
  const creativeConceptRecord = { updateMany: vi.fn(async (args: any) => { calls.attach.push(args); return { count: calls.attachCount }; }) };
  return { prisma: { generatedAsset, $transaction: vi.fn(async (work: (tx: unknown) => unknown) => work({ generatedAsset, creativeConceptRecord })) } };
});

import * as repo from './generated-asset.repository';

beforeEach(() => { calls.findFirst = []; calls.findMany = []; calls.create = []; calls.update = []; calls.attach = []; calls.attachCount = 1; vi.clearAllMocks(); });

describe('findById — user isolation', () => {
  it('scopes by id AND userId together, never id alone', async () => { await repo.findById('asset-1', 'user-a'); expect(calls.findFirst[0].where).toEqual({ id: 'asset-1', userId: 'user-a' }); });
  it('returns null for the right asset id but wrong user', async () => { expect(await repo.findById('asset-1', 'user-b')).toBeNull(); });
});

describe('listByScope — personal/brand isolation', () => {
  it('forces brandId null for Personal', async () => { await repo.listByScope({ userId: 'user-a', contextType: 'personal', brandId: 'brand-x' }); expect(calls.findMany[0].where).toMatchObject({ userId: 'user-a', contextType: 'personal', brandId: null }); });
  it('keeps Brand A and Brand B history separate', async () => { await repo.listByScope({ userId: 'user-a', contextType: 'brand', brandId: 'brand-a' }); await repo.listByScope({ userId: 'user-a', contextType: 'brand', brandId: 'brand-b' }); expect(calls.findMany[0].where.brandId).toBe('brand-a'); expect(calls.findMany[1].where.brandId).toBe('brand-b'); });
  it('always scopes history by owner', async () => { await repo.listByScope({ userId: 'user-a', contextType: 'personal' }); expect(calls.findMany[0].where.userId).toBe('user-a'); });
});

describe('create and completion persistence', () => {
  it('persists provenance and never image bytes', async () => { await repo.create({ userId: 'user-a', contextType: 'personal', prompt: 'request', creativeBrief: { concept: 'c' } as any, sourceAssetUrls: [], provider: 'gemini', model: 'gemini-2.5-flash-image', source: 'AI_GENERATED' }); expect(calls.create[0].data).toMatchObject({ source: 'AI_GENERATED', status: 'PENDING' }); expect(Object.keys(calls.create[0].data)).not.toEqual(expect.arrayContaining(['bytes', 'data', 'buffer', 'imageData'])); });
  it('persists Cloudinary dimensions', async () => { await repo.markCompleted('asset-1', { imageUrl: 'https://cdn/x.png', cloudinaryPublicId: 'x', width: 1024, height: 1024, format: 'png' }); expect(calls.update[0].data).toMatchObject({ status: 'COMPLETED', width: 1024, height: 1024, format: 'png' }); });
  it('completes and attaches the claimed concept in one transaction', async () => { await repo.markCompletedAndAttachConcept('asset-1', 'concept-a', 'user-a', { imageUrl: 'https://cdn/a.png', cloudinaryPublicId: 'a' }); expect(calls.attach[0]).toEqual({ where: { id: 'concept-a', userId: 'user-a', status: 'GENERATING', generatedAssetId: null }, data: { generatedAssetId: 'asset-1', status: 'GENERATED' } }); });
  it('fails when no claimed concept row was attached', async () => { calls.attachCount = 0; await expect(repo.markCompletedAndAttachConcept('asset-1', 'concept-a', 'user-a', { imageUrl: 'https://cdn/a.png', cloudinaryPublicId: 'a' })).rejects.toThrow('Canonical concept attachment failed'); });
});
