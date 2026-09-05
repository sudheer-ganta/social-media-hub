import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({ explicitStyleHistory: vi.fn() }));
const intelligence = vi.hoisted(() => ({ resolveBrandIntelligence: vi.fn() }));
const performance = vi.hoisted(() => ({ compactPerformanceGuidance: vi.fn() }));
vi.mock('../repositories/creative-concept.repository', () => ({ creativeConceptRepository: repo }));
vi.mock('./creative-brand-intelligence.service', () => ({ brandIntelligenceService: intelligence }));
vi.mock('./creative-performance.service', () => ({ creativePerformanceService: performance }));
import { loadDesignContext } from './design-context.service';

describe('DesignContextService', () => {
  beforeEach(() => { vi.clearAllMocks(); repo.explicitStyleHistory.mockReset(); performance.compactPerformanceGuidance.mockResolvedValue([]); intelligence.resolveBrandIntelligence.mockResolvedValue({ brandId: 'x', explicit: [], learned: [], guidance: [] }); });

  it('reads Personal history using the Personal scope only', async () => {
    repo.explicitStyleHistory.mockResolvedValue([]);
    await loadDesignContext({ userId: 'u', contextType: 'personal', brandId: null });
    expect(repo.explicitStyleHistory).toHaveBeenCalledWith({ userId: 'u', contextType: 'personal', brandId: null });
  });

  it('returns deterministic performance guidance in the same isolated scope', async () => {
    repo.explicitStyleHistory.mockResolvedValue([]);
    performance.compactPerformanceGuidance.mockResolvedValue(['editorial: historically associated with stronger engagement on linkedin']);
    const result = await loadDesignContext({ userId: 'u', contextType: 'brand', brandId: 'brand-a' });
    expect(performance.compactPerformanceGuidance).toHaveBeenCalledWith({ userId: 'u', contextType: 'brand', brandId: 'brand-a' });
    expect(result.performanceEvidence).toEqual(['editorial: historically associated with stronger engagement on linkedin']);
  });

  it('keeps Brand A and Brand B isolated at the repository boundary', async () => {
    repo.explicitStyleHistory.mockImplementation(async (scope?: { brandId?: string | null }) => scope?.brandId === 'a'
      ? [{ styleId: 'editorial', selectionCount: 4, generated: true, selectedAt: new Date() }]
      : [{ styleId: 'y2k', selectionCount: 4, generated: true, selectedAt: new Date() }]);
    const a = await loadDesignContext({ userId: 'u', contextType: 'brand', brandId: 'a' });
    const b = await loadDesignContext({ userId: 'u', contextType: 'brand', brandId: 'b' });
    expect(a.preferredStyleId).toBe('editorial');
    expect(b.preferredStyleId).toBe('y2k');
  });

  it('weights repeated and saved explicit choices more strongly', async () => {
    repo.explicitStyleHistory.mockResolvedValue([
      { styleId: 'minimalist', selectionCount: 1, generated: false, selectedAt: new Date() },
      { styleId: 'editorial', selectionCount: 3, generated: true, selectedAt: new Date() },
    ]);
    expect((await loadDesignContext({ userId: 'u', contextType: 'personal' })).preferredStyleId).toBe('editorial');
  });

  it('does not infer a preference from one generated concept', async () => {
    repo.explicitStyleHistory.mockResolvedValue([{ styleId: 'y2k', selectionCount: 1, generated: true, selectedAt: new Date() }]);
    expect((await loadDesignContext({ userId: 'u', contextType: 'personal' })).preferredStyleId).toBeUndefined();
  });

  it('lets explicit Brand Intelligence outrank learned history', async () => {
    repo.explicitStyleHistory.mockResolvedValue([{ styleId: 'y2k', selectionCount: 8, generated: true, selectedAt: new Date() }]);
    intelligence.resolveBrandIntelligence.mockResolvedValue({ brandId: 'a', preferredStyleId: 'editorial', explicit: [], learned: [], guidance: [] });
    expect((await loadDesignContext({ userId: 'u', contextType: 'brand', brandId: 'a' })).preferredStyleId).toBe('editorial');
  });

  it('never queries Brand Intelligence for Personal', async () => {
    repo.explicitStyleHistory.mockResolvedValue([]);
    await loadDesignContext({ userId: 'u', contextType: 'personal' });
    expect(intelligence.resolveBrandIntelligence).not.toHaveBeenCalled();
  });
});
