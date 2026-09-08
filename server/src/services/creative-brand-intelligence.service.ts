import { brandIntelligenceRepository, type IntelligencePolarity, type IntelligenceSignalInput, type IntelligenceSource } from '../repositories/brand-intelligence.repository';
import { prisma } from '../config/prisma';

export type IntelligenceDimension = 'style' | 'color' | 'typography' | 'composition' | 'imagery' | 'lighting' | 'texture' | 'density' | 'alignment' | 'concept' | 'headline_length' | 'cta' | 'emoji' | 'tone' | 'vocabulary' | 'content_structure';
const DIMENSIONS = new Set<IntelligenceDimension>(['style','color','typography','composition','imagery','lighting','texture','density','alignment','concept','headline_length','cta','emoji','tone','vocabulary','content_structure']);
const clean = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 160) : '';

export interface ResolvedIntelligencePreference { id: string; dimension: string; value: string; polarity: IntelligencePolarity; source: IntelligenceSource; occurrenceCount: number; confidence: number; strength: 'explicit' | 'strong' | 'weak' }
export interface BrandIntelligenceProfile { brandId: string; explicit: ResolvedIntelligencePreference[]; learned: ResolvedIntelligencePreference[]; preferredStyleId?: string; guidance: string[] }

function resolveRow(row: any): ResolvedIntelligencePreference {
  const explicit = row.source === 'explicit';
  const confidence = explicit ? 1 : Math.min(.9, .2 + row.occurrenceCount * .14);
  return { id: row.id, dimension: row.dimension, value: row.value, polarity: row.polarity, source: row.source, occurrenceCount: row.occurrenceCount, confidence, strength: explicit ? 'explicit' : row.occurrenceCount >= 3 ? 'strong' : 'weak' };
}

export async function resolveBrandIntelligence(userId: string, brandId: string): Promise<BrandIntelligenceProfile> {
  try {
    const rows = await brandIntelligenceRepository.listSignals(userId, brandId);
    const resolved = rows.map(resolveRow);
    const explicit = resolved.filter((p) => p.strength === 'explicit');
    const learned = resolved.filter((p) => p.strength !== 'explicit');
    const usable = [...explicit, ...learned.filter((p) => p.strength === 'strong')];
    const explicitStyle = explicit.find((p) => p.dimension === 'style' && p.polarity === 'positive');
    const learnedStyle = learned.filter((p) => p.dimension === 'style' && p.polarity === 'positive' && p.strength === 'strong').sort((a,b) => b.confidence - a.confidence)[0];
    return {
      brandId, explicit, learned,
      ...((explicitStyle ?? learnedStyle) && { preferredStyleId: (explicitStyle ?? learnedStyle)!.value }),
      guidance: usable.map((p) => `${p.polarity === 'negative' ? 'Avoid' : 'Prefer'} ${p.dimension}: ${p.value}`),
    };
  } catch (error) {
    console.warn('[creative] resolveBrandIntelligence failed, returning empty profile', error);
    return { brandId, explicit: [], learned: [], guidance: [] };
  }
}

export async function setExplicitPreference(userId: string, brandId: string, input: { dimension?: unknown; value?: unknown; polarity?: unknown }) {
  const dimension = clean(input.dimension) as IntelligenceDimension;
  const value = clean(input.value);
  const polarity: IntelligencePolarity = input.polarity === 'negative' ? 'negative' : 'positive';
  if (!DIMENSIONS.has(dimension) || !value) throw new Error('Choose a valid preference and value.');
  await brandIntelligenceRepository.recordSignals(userId, brandId, [{ dimension, value, polarity, source: 'explicit' }]);
  return resolveBrandIntelligence(userId, brandId);
}

function signal(dimension: IntelligenceDimension, value: unknown, source: IntelligenceSource, polarity: IntelligencePolarity): IntelligenceSignalInput | null {
  const normalized = clean(value);
  return normalized ? { dimension, value: normalized.toLowerCase(), source, polarity } : null;
}
function unique(items: Array<IntelligenceSignalInput | null>) { return [...new Map(items.filter(Boolean).map((item) => [`${item!.dimension}:${item!.value}:${item!.polarity}:${item!.source}`, item!])).values()]; }

export async function recordConceptSignal(userId: string, brandId: string, concept: Record<string, any>, source: 'selected' | 'rejected') {
  const polarity: IntelligencePolarity = source === 'rejected' ? 'negative' : 'positive';
  const signals = unique([
    signal('style', concept.styleId, source, polarity), signal('concept', concept.visualMechanism ?? concept.artDirectionFamily, source, polarity),
    signal('composition', concept.layoutDirection, source, polarity), signal('typography', concept.typographyDirection, source, polarity),
    signal('lighting', concept.lightingDirection, source, polarity), signal('imagery', concept.imageryDirection, source, polarity),
  ]);
  if (signals.length) await brandIntelligenceRepository.recordSignals(userId, brandId, signals);
}

export async function recordAssetSignal(userId: string, assetId: string, source: 'saved' | 'reused' | 'regenerated') {
  const asset = await prisma.generatedAsset.findFirst({ where: { id: assetId, userId, contextType: 'brand', brandId: { not: null } }, select: { brandId: true, creativeBrief: true, typography: true } });
  if (!asset?.brandId) return false;
  const brief = asset.creativeBrief as Record<string, any>;
  const typography = asset.typography as Record<string, any> | null;
  const signals = unique([
    signal('concept', brief.visualMechanism ?? brief.artDirectionFamily, source, 'positive'), signal('composition', brief.composition, source, 'positive'),
    signal('lighting', brief.lighting, source, 'positive'), signal('density', brief.layoutDirection?.visualDensity, source, 'positive'),
    signal('typography', typography?.headlineFont ?? brief.typographyDirection, source, 'positive'),
    ...((Array.isArray(brief.palette) ? brief.palette : []).map((value: unknown) => signal('color', value, source, 'positive'))),
  ]);
  if (signals.length) await brandIntelligenceRepository.recordSignals(userId, asset.brandId, signals);
  return true;
}

export const brandIntelligenceService = { resolveBrandIntelligence, setExplicitPreference, recordConceptSignal, recordAssetSignal };

