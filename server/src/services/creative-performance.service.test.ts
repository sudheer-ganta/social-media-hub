import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../config/prisma', () => ({ prisma: { postCreativeAsset: { findMany } } }));
import { compactPerformanceGuidance, performanceEvidence } from './creative-performance.service';

const scope = { userId: '00000000-0000-4000-8000-000000000001', contextType: 'personal' as const, brandId: null };
function row(platform: string, rate: number, style = 'EDITORIAL') {
  return { finalPublished: true, generatedAsset: { source: 'AI_GENERATED', creativeBrief: { artDirectionFamily: style, palette: ['#111111'], composition: 'centered', lighting: 'soft' }, typography: { headlineFont: 'Inter' } }, post: { post_platforms: [{ provider: platform, publishedAt: new Date(), metricSnapshots: [{ reach: 100, impressions: null, views: null, likes: rate * 100, comments: 0, shares: 0, reposts: 0, saves: 0, clicks: 0 }] }] } };
}

describe('creative performance evidence', () => {
  beforeEach(() => findMany.mockReset());
  it('gates a single successful post as insufficient and injects no guidance', async () => {
    findMany.mockResolvedValue([row('instagram', .2)]);
    expect((await performanceEvidence(scope)).every((item) => item.strength === 'insufficient')).toBe(true);
    expect(await compactPerformanceGuidance(scope)).toEqual([]);
  });
  it('keeps platforms separate and uses non-causal wording', async () => {
    findMany.mockResolvedValue([...Array(6)].map(() => row('instagram', .2)).concat([...Array(6)].map(() => row('linkedin', .02, 'MINIMAL'))));
    const evidence = await performanceEvidence(scope);
    expect(new Set(evidence.map((item) => item.platform))).toEqual(new Set(['instagram', 'linkedin']));
    expect(evidence.map((item) => item.wording).join(' ')).not.toMatch(/causes|cause more/i);
  });
  it('queries the exact Personal scope without Brand leakage', async () => {
    findMany.mockResolvedValue([]); await performanceEvidence(scope);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ contextType: 'personal', brandId: null }) }));
  });
});
