import { prisma } from '../config/prisma';

export type IntelligencePolarity = 'positive' | 'negative';
export type IntelligenceSource = 'explicit' | 'selected' | 'rejected' | 'saved' | 'reused' | 'regenerated';
export interface IntelligenceSignalInput { dimension: string; value: string; polarity: IntelligencePolarity; source: IntelligenceSource }

export async function assertOwnedBrand(userId: string, brandId: string): Promise<void> {
  const brand = await prisma.brand.findFirst({ where: { id: brandId, created_by: userId }, select: { id: true } });
  if (!brand) throw new Error('Brand not found');
}

export async function recordSignals(userId: string, brandId: string, signals: IntelligenceSignalInput[]) {
  await assertOwnedBrand(userId, brandId);
  return prisma.$transaction(signals.map((signal) => prisma.brandIntelligenceSignal.upsert({
    where: { userId_brandId_dimension_value_polarity_source: { userId, brandId, ...signal } },
    create: { userId, brandId, ...signal },
    update: { occurrenceCount: { increment: 1 }, lastObservedAt: new Date() },
  })));
}

export async function listSignals(userId: string, brandId: string) {
  await assertOwnedBrand(userId, brandId);
  return prisma.brandIntelligenceSignal.findMany({ where: { userId, brandId }, orderBy: [{ dimension: 'asc' }, { occurrenceCount: 'desc' }] });
}

export async function deleteExplicitSignal(userId: string, brandId: string, id: string): Promise<boolean> {
  await assertOwnedBrand(userId, brandId);
  const result = await prisma.brandIntelligenceSignal.deleteMany({ where: { id, userId, brandId, source: 'explicit' } });
  return result.count === 1;
}

export const brandIntelligenceRepository = { assertOwnedBrand, recordSignals, listSignals, deleteExplicitSignal };
