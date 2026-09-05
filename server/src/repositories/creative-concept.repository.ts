import { prisma } from '../config/prisma';
import type { ScoredCreativeConcept } from '../ai/types';
import type { StoredGeneratedAsset } from './generated-asset.repository';

export interface ConceptScope { userId: string; contextType: 'personal' | 'brand'; brandId?: string | null }
export interface PersistedConcept extends ScoredCreativeConcept {
  conceptId: string;
  styleId?: string;
  promptVersion: string;
  styleVersion: string;
  contextVersion: string;
  generationVersion: string;
  generatedAsset: StoredGeneratedAsset | null;
  generationStatus: 'not_generated' | 'generating' | 'generated' | 'failed';
}

const status = (value: string): PersistedConcept['generationStatus'] => ({
  DISCOVERED: 'not_generated', GENERATING: 'generating', GENERATED: 'generated', FAILED: 'failed',
}[value] as PersistedConcept['generationStatus']);

function scopeWhere(scope: ConceptScope) {
  return { userId: scope.userId, contextType: scope.contextType, brandId: scope.contextType === 'brand' ? (scope.brandId ?? null) : null };
}

function map(row: any): PersistedConcept {
  return {
    ...(row.definition as ScoredCreativeConcept), conceptId: row.id, styleId: row.styleId ?? undefined,
    promptVersion: row.promptVersion, styleVersion: row.styleVersion, contextVersion: row.contextVersion,
    generationVersion: row.generationVersion, generatedAsset: row.generatedAsset ?? null, generationStatus: status(row.status),
  };
}

export async function saveDiscovered(scope: ConceptScope, prompt: string, input: Omit<PersistedConcept, 'generatedAsset' | 'generationStatus'>): Promise<PersistedConcept> {
  const row = await prisma.creativeConceptRecord.upsert({
    where: { id: input.conceptId },
    create: {
      id: input.conceptId, ...scopeWhere(scope), prompt, promptVersion: input.promptVersion,
      styleId: input.styleId ?? null, styleVersion: input.styleVersion, contextVersion: input.contextVersion,
      generationVersion: input.generationVersion, definition: input as unknown as object,
    },
    update: {},
    include: { generatedAsset: true },
  });
  return map(row);
}

export async function findOwned(conceptId: string, scope: ConceptScope): Promise<PersistedConcept | null> {
  const row = await prisma.creativeConceptRecord.findFirst({ where: { id: conceptId, ...scopeWhere(scope) }, include: { generatedAsset: true } });
  return row ? map(row) : null;
}

/** Atomic reservation: two clicks cannot both cross the paid-generation boundary. */
export async function claimGeneration(conceptId: string, scope: ConceptScope): Promise<boolean> {
  const staleBefore = new Date(Date.now() - 10 * 60_000);
  const result = await prisma.creativeConceptRecord.updateMany({
    where: {
      id: conceptId, ...scopeWhere(scope), generatedAssetId: null,
      OR: [{ status: { in: ['DISCOVERED', 'FAILED'] } }, { status: 'GENERATING', updatedAt: { lt: staleBefore } }],
    },
    data: { status: 'GENERATING', selectedAt: new Date(), selectionCount: { increment: 1 } },
  });
  return result.count === 1;
}

export async function recordReopen(conceptId: string, scope: ConceptScope): Promise<void> {
  await prisma.creativeConceptRecord.updateMany({ where: { id: conceptId, ...scopeWhere(scope) }, data: { selectedAt: new Date(), selectionCount: { increment: 1 } } });
}

export async function markFailed(conceptId: string, scope: ConceptScope): Promise<void> {
  await prisma.creativeConceptRecord.updateMany({ where: { id: conceptId, ...scopeWhere(scope), status: 'GENERATING' }, data: { status: 'FAILED' } });
}

export async function recordAssetSignal(assetId: string, userId: string, signal: 'saved' | 'reused'): Promise<boolean> {
  const result = await prisma.creativeConceptRecord.updateMany({
    where: { generatedAssetId: assetId, generatedAsset: { userId } },
    data: signal === 'saved' ? { savedAt: new Date() } : { reuseCount: { increment: 1 } },
  });
  return result.count === 1;
}

export async function explicitStyleHistory(scope: ConceptScope, limit = 40): Promise<Array<{ styleId: string; selectionCount: number; generated: boolean; saved: boolean; reuseCount: number; selectedAt: Date | null }>> {
  const rows = await prisma.creativeConceptRecord.findMany({
    where: { ...scopeWhere(scope), styleId: { not: null }, selectionCount: { gt: 0 } }, orderBy: { selectedAt: 'desc' }, take: limit,
    select: { styleId: true, selectionCount: true, generatedAssetId: true, savedAt: true, reuseCount: true, selectedAt: true },
  });
  return rows.map((row) => ({ styleId: row.styleId!, selectionCount: row.selectionCount, generated: Boolean(row.generatedAssetId), saved: Boolean(row.savedAt), reuseCount: row.reuseCount, selectedAt: row.selectedAt }));
}

export const creativeConceptRepository = { saveDiscovered, findOwned, claimGeneration, recordReopen, markFailed, recordAssetSignal, explicitStyleHistory };
