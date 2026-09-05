import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ findFirst: [] as any[], findMany: [] as any[], updateMany: [] as any[] }));
vi.mock('../config/prisma', () => ({ prisma: { creativeConceptRecord: {
  findFirst: vi.fn(async (args: any) => { calls.findFirst.push(args); return null; }),
  findMany: vi.fn(async (args: any) => { calls.findMany.push(args); return []; }),
  updateMany: vi.fn(async (args: any) => { calls.updateMany.push(args); return { count: 1 }; }),
  upsert: vi.fn(),
} } }));
import { claimGeneration, explicitStyleHistory, findOwned } from './creative-concept.repository';

beforeEach(() => { calls.findFirst = []; calls.findMany = []; calls.updateMany = []; });

describe('creative concept scope isolation', () => {
  it('never reads a concept by ID without its owner and Personal scope', async () => {
    await findOwned('c', { userId: 'u', contextType: 'personal', brandId: 'brand-ignored' });
    expect(calls.findFirst[0].where).toMatchObject({ id: 'c', userId: 'u', contextType: 'personal', brandId: null });
  });

  it('keeps Brand A and Brand B history in different queries', async () => {
    await explicitStyleHistory({ userId: 'u', contextType: 'brand', brandId: 'a' });
    await explicitStyleHistory({ userId: 'u', contextType: 'brand', brandId: 'b' });
    expect(calls.findMany[0].where.brandId).toBe('a');
    expect(calls.findMany[1].where.brandId).toBe('b');
  });

  it('atomically claims only an ungenerated concept', async () => {
    await claimGeneration('c', { userId: 'u', contextType: 'brand', brandId: 'a' });
    expect(calls.updateMany[0].where).toMatchObject({ id: 'c', userId: 'u', brandId: 'a', generatedAssetId: null });
    expect(calls.updateMany[0].where.OR[0]).toEqual({ status: { in: ['DISCOVERED', 'FAILED'] } });
  });
});
