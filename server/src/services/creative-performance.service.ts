import { prisma } from '../config/prisma';
import type { CreativeScope } from '../repositories/creative-attribution.repository';

export type EvidenceStrength = 'insufficient' | 'emerging' | 'strong';
export interface CreativePerformanceEvidence {
  dimension: string; value: string; platform: string; observations: number;
  strength: EvidenceStrength; direction: 'positive' | 'neutral' | 'negative';
  wording: string;
}

const MIN_SAMPLE = 3;
const STRONG_SAMPLE = 6;
const DAY = 86_400_000;
const clean = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 120) : '';
const values = (asset: any): Array<[string, string]> => {
  const brief = (asset.creativeBrief ?? {}) as Record<string, any>;
  const typography = (asset.typography ?? {}) as Record<string, any>;
  const out: Array<[string, string]> = [
    ['style', clean(brief.styleId ?? brief.artDirectionFamily)],
    ['concept', clean(brief.visualMechanism ?? brief.concept)],
    ['typography', clean(typography.headlineFont ?? brief.typographyDirection)],
    ['composition', clean(brief.composition ?? brief.layoutDirection?.layoutType)],
    ['lighting', clean(brief.lighting)],
    ['source', String(asset.source).toLowerCase()],
  ];
  for (const color of Array.isArray(brief.palette) ? brief.palette.slice(0, 4) : []) out.push(['palette', clean(color)]);
  return out.filter((entry) => entry[1]);
};

function engagement(snapshot: any) {
  return ['likes','comments','shares','reposts','saves','clicks'].reduce((sum, key) => sum + (snapshot?.[key] ?? 0), 0);
}
function exposure(snapshot: any) { return snapshot?.reach ?? snapshot?.impressions ?? snapshot?.views ?? null; }

export async function performanceEvidence(scope: CreativeScope): Promise<CreativePerformanceEvidence[]> {
  if (!(prisma as any).postCreativeAsset?.findMany) return [];
  const rows = await prisma.postCreativeAsset.findMany({
    where: { ownerId: scope.userId, contextType: scope.contextType, brandId: scope.contextType === 'brand' ? (scope.brandId ?? null) : null, finalPublished: true },
    include: { generatedAsset: true, post: { include: { post_platforms: { where: { status: 'PUBLISHED', publishedId: { not: null } }, include: { metricSnapshots: { take: 1, orderBy: { capturedAt: 'desc' } } } } } } },
  });
  const groups = new Map<string, Array<{ rate: number; weight: number }>>();
  for (const row of rows) for (const publication of row.post.post_platforms) {
    const snapshot = publication.metricSnapshots[0];
    const denominator = exposure(snapshot);
    if (!snapshot || !denominator) continue;
    const rate = engagement(snapshot) / denominator;
    const ageDays = publication.publishedAt ? Math.max(0, (Date.now() - publication.publishedAt.getTime()) / DAY) : 365;
    const weight = Math.max(.25, 1 - ageDays / 365);
    for (const [dimension, value] of values(row.generatedAsset)) {
      const key = `${publication.provider}\u0000${dimension}\u0000${value.toLowerCase()}`;
      groups.set(key, [...(groups.get(key) ?? []), { rate, weight }]);
    }
  }
  const platformRates = new Map<string, number[]>();
  for (const [key, observations] of groups) {
    const platform = key.split('\u0000')[0];
    platformRates.set(platform, [...(platformRates.get(platform) ?? []), ...observations.map((o) => o.rate)]);
  }
  return [...groups.entries()].map(([key, observations]) => {
    const [platform, dimension, value] = key.split('\u0000');
    const weightedScore = observations.reduce((s, o) => s + o.rate * o.weight, 0) / observations.reduce((s, o) => s + o.weight, 0);
    const baselineValues = platformRates.get(platform) ?? [];
    const baseline = baselineValues.reduce((a,b) => a+b, 0) / Math.max(1, baselineValues.length);
    const strength: EvidenceStrength = observations.length < MIN_SAMPLE ? 'insufficient' : observations.length >= STRONG_SAMPLE ? 'strong' : 'emerging';
    const direction: CreativePerformanceEvidence['direction'] = strength === 'insufficient' || baseline === 0 ? 'neutral' : weightedScore >= baseline * 1.1 ? 'positive' : weightedScore <= baseline * .9 ? 'negative' : 'neutral';
    const wording = strength === 'insufficient'
      ? `${value}: insufficient evidence (${observations.length} observed posts)`
      : direction === 'positive' ? `${value}: historically associated with stronger engagement on ${platform} (${observations.length} observed posts)`
      : direction === 'negative' ? `${value}: performed below the observed ${platform} baseline (${observations.length} observed posts)`
      : `${value}: neutral observed performance on ${platform} (${observations.length} observed posts)`;
    return { dimension, value, platform, observations: observations.length, strength, direction, wording };
  }).sort((a,b) => b.observations - a.observations);
}

export async function compactPerformanceGuidance(scope: CreativeScope): Promise<string[]> {
  return (await performanceEvidence(scope)).filter((e) => e.strength === 'strong' && e.direction !== 'neutral').slice(0, 6).map((e) => e.wording);
}

export const creativePerformanceService = { performanceEvidence, compactPerformanceGuidance };
