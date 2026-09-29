import { prisma } from '../config/prisma';
import { withDbRetry } from '../utils/db-resilience';

export type IntelligencePolarity = 'positive' | 'negative';
export type IntelligenceSource = 'explicit' | 'selected' | 'rejected' | 'saved' | 'reused' | 'regenerated';
export interface IntelligenceSignalInput { dimension: string; value: string; polarity: IntelligencePolarity; source: IntelligenceSource }

export async function assertOwnedBrand(userId: string, brandId: string): Promise<void> {
  const brand = await withDbRetry(
    () => prisma.brand.findFirst({ where: { id: brandId, created_by: userId }, select: { id: true } }),
    { label: 'assertOwnedBrand' },
  );
  if (!brand) throw new Error('Brand not found');
}

export async function recordSignals(userId: string, brandId: string, signals: IntelligenceSignalInput[]) {
  await assertOwnedBrand(userId, brandId);
  return withDbRetry(
    () => prisma.$transaction(signals.map((signal) => prisma.brandIntelligenceSignal.upsert({
      where: { userId_brandId_dimension_value_polarity_source: { userId, brandId, ...signal } },
      create: { userId, brandId, ...signal },
      update: { occurrenceCount: { increment: 1 }, lastObservedAt: new Date() },
    }))),
    { label: 'recordSignals' },
  );
}

export async function listSignals(userId: string, brandId: string) {
  await assertOwnedBrand(userId, brandId);
  return withDbRetry(
    () => prisma.brandIntelligenceSignal.findMany({ where: { userId, brandId }, orderBy: [{ dimension: 'asc' }, { occurrenceCount: 'desc' }] }),
    { label: 'listSignals' },
  );
}

export async function deleteExplicitSignal(userId: string, brandId: string, id: string): Promise<boolean> {
  await assertOwnedBrand(userId, brandId);
  const result = await withDbRetry(
    () => prisma.brandIntelligenceSignal.deleteMany({ where: { id, userId, brandId, source: 'explicit' } }),
    { label: 'deleteExplicitSignal' },
  );
  return result.count === 1;
}

export const brandIntelligenceRepository = { assertOwnedBrand, recordSignals, listSignals, deleteExplicitSignal };
