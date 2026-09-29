import { creativeConceptRepository, type ConceptScope } from '../repositories/creative-concept.repository';
import { brandIntelligenceService, type BrandIntelligenceProfile } from './creative-brand-intelligence.service';
import { creativePerformanceService } from './creative-performance.service';

export interface DesignContext {
  scope: ConceptScope;
  preferredStyleId?: string;
  evidenceCount: number;
  brandIntelligence?: BrandIntelligenceProfile;
  performanceEvidence: string[];
  contextStatus?: {
    brandIntelligence?: { status: 'available' | 'unavailable'; reason?: string };
    performanceEvidence?: { status: 'available' | 'unavailable'; reason?: string };
  };
}

/** Reads explicit selections only. Generating/viewing alone is never interpreted as preference. */
export async function loadDesignContext(scope: ConceptScope): Promise<DesignContext> {
  let biStatus: { status: 'available' | 'unavailable'; reason?: string } = { status: 'available' };
  let peStatus: { status: 'available' | 'unavailable'; reason?: string } = { status: 'available' };

  const [history, brandIntelligence, performanceEvidence] = await Promise.all([
    creativeConceptRepository.explicitStyleHistory(scope).catch((error) => {
      console.warn('[creative] explicitStyleHistory unavailable; continuing without it', error);
      return [];
    }),
    scope.contextType === 'brand' && scope.brandId
      ? brandIntelligenceService.resolveBrandIntelligence(scope.userId, scope.brandId).catch((error) => {
          const reason = error instanceof Error ? error.message : String(error);
          console.warn('[creative] brandIntelligence unavailable; recording status as degraded', { reason });
          biStatus = { status: 'unavailable', reason: (error as any)?.code || 'DB_TIMEOUT' };
          return undefined;
        })
      : Promise.resolve(undefined),
    creativePerformanceService.compactPerformanceGuidance(scope).catch((error) => {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn('[creative] performance evidence unavailable; recording status as degraded', { reason });
      peStatus = { status: 'unavailable', reason: (error as any)?.code || 'DB_TIMEOUT' };
      return [];
    }),
  ]);
  const now = Date.now();
  const scores = new Map<string, number>();
  for (const item of history) {
    const ageDays = item.selectedAt ? Math.max(0, (now - item.selectedAt.getTime()) / 86_400_000) : 365;
    const recency = Math.max(.25, 1 - ageDays / 180);
    // Repeated explicit selection is evidence; a generated result strengthens it.
    const score = item.selectionCount * recency + (item.generated ? .75 : 0) + (item.saved ? 2 : 0) + (item.reuseCount ?? 0) * 2.5;
    scores.set(item.styleId, (scores.get(item.styleId) ?? 0) + score);
  }
  const strongest = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  // One generation is observation, not preference. Repetition, saving or
  // reuse must clear this evidence floor before history can shape a new brief.
  const historicalStyleId = strongest && strongest[1] >= 3 ? strongest[0] : undefined;
  const preferredStyleId = brandIntelligence?.preferredStyleId ?? historicalStyleId;
  return {
    scope,
    ...(preferredStyleId && { preferredStyleId }),
    ...(brandIntelligence && { brandIntelligence }),
    performanceEvidence,
    evidenceCount: history.length,
    contextStatus: {
      brandIntelligence: biStatus,
      performanceEvidence: peStatus,
    },
  };
}

export const designContextService = { loadDesignContext };
