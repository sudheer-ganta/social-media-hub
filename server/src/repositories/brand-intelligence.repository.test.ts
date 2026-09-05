import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  brand: { findFirst: vi.fn() },
  brandIntelligenceSignal: { upsert: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(async (operations: unknown[]) => Promise.all(operations)),
}));
vi.mock('../config/prisma', () => ({ prisma: db }));
const repository = await import('./brand-intelligence.repository');

describe('BrandIntelligenceRepository ownership and isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.brand.findFirst.mockResolvedValue({ id: 'brand-a' });
    db.brandIntelligenceSignal.findMany.mockResolvedValue([]);
    db.brandIntelligenceSignal.upsert.mockResolvedValue({ id: 'signal-a' });
  });

  it('authorizes every lookup by immutable brand id and owner id', async () => {
    await repository.listSignals('owner-a', 'brand-a');
    expect(db.brand.findFirst).toHaveBeenCalledWith({
      where: { id: 'brand-a', created_by: 'owner-a' },
      select: { id: true },
    });
    expect(db.brandIntelligenceSignal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'owner-a', brandId: 'brand-a' },
    }));
  });

  it('never falls back to another brand when ownership fails', async () => {
    db.brand.findFirst.mockResolvedValue(null);
    await expect(repository.listSignals('owner-a', 'brand-b')).rejects.toThrow('Brand not found');
    expect(db.brandIntelligenceSignal.findMany).not.toHaveBeenCalled();
  });

  it('accumulates repeated signals atomically within the owner and brand scope', async () => {
    await repository.recordSignals('owner-a', 'brand-a', [{ dimension: 'style', value: 'editorial', polarity: 'positive', source: 'selected' }]);
    expect(db.brandIntelligenceSignal.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_brandId_dimension_value_polarity_source: {
        userId: 'owner-a', brandId: 'brand-a', dimension: 'style', value: 'editorial', polarity: 'positive', source: 'selected',
      } },
      update: expect.objectContaining({ occurrenceCount: { increment: 1 } }),
    }));
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
