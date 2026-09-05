import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({ listSignals: vi.fn(), recordSignals: vi.fn(), assertOwnedBrand: vi.fn(), deleteExplicitSignal: vi.fn() }));
const assetFind = vi.hoisted(() => vi.fn());
vi.mock('../repositories/brand-intelligence.repository', () => ({ brandIntelligenceRepository: repo }));
vi.mock('../config/prisma', () => ({ prisma: { generatedAsset: { findFirst: assetFind } } }));
const service = await import('./creative-brand-intelligence.service');

const row = (overrides: Record<string, unknown>) => ({ id: crypto.randomUUID(), dimension: 'style', value: 'editorial', polarity: 'positive', source: 'selected', occurrenceCount: 1, ...overrides });

describe('Brand Intelligence deterministic learning', () => {
  beforeEach(() => { vi.clearAllMocks(); repo.listSignals.mockResolvedValue([]); repo.recordSignals.mockResolvedValue([]); });

  it('keeps one weak observation below the usable preference threshold', async () => {
    repo.listSignals.mockResolvedValue([row({ occurrenceCount: 1 })]);
    const profile = await service.resolveBrandIntelligence('user-a', 'brand-a');
    expect(profile.preferredStyleId).toBeUndefined();
    expect(profile.learned[0]).toMatchObject({ strength: 'weak', confidence: .34 });
  });

  it('strengthens repeated signals deterministically', async () => {
    repo.listSignals.mockResolvedValue([row({ occurrenceCount: 5 })]);
    const profile = await service.resolveBrandIntelligence('user-a', 'brand-a');
    expect(profile.preferredStyleId).toBe('editorial');
    expect(profile.learned[0]).toMatchObject({ strength: 'strong', confidence: .9 });
  });

  it('explicit preference wins over stronger learned preference', async () => {
    repo.listSignals.mockResolvedValue([row({ value: 'y2k', occurrenceCount: 20 }), row({ value: 'editorial', source: 'explicit', occurrenceCount: 1 })]);
    expect((await service.resolveBrandIntelligence('user-a', 'brand-a')).preferredStyleId).toBe('editorial');
  });

  it('records positive selections and negative rejections without an AI call', async () => {
    await service.recordConceptSignal('user-a', 'brand-a', { styleId: 'editorial', visualMechanism: 'emotional story' }, 'selected');
    await service.recordConceptSignal('user-a', 'brand-a', { styleId: 'y2k', visualMechanism: 'neon collage' }, 'rejected');
    expect(repo.recordSignals.mock.calls[0][2]).toEqual(expect.arrayContaining([expect.objectContaining({ value: 'editorial', polarity: 'positive' })]));
    expect(repo.recordSignals.mock.calls[1][2]).toEqual(expect.arrayContaining([expect.objectContaining({ value: 'y2k', polarity: 'negative' })]));
  });

  it('extracts existing asset metadata for save/reuse/regeneration signals', async () => {
    assetFind.mockResolvedValue({ brandId: 'brand-a', creativeBrief: { palette: ['#000000'], composition: 'asymmetric', lighting: 'warm' }, typography: { headlineFont: 'Cormorant' } });
    expect(await service.recordAssetSignal('user-a', 'asset-a', 'saved')).toBe(true);
    expect(assetFind.mock.calls[0][0].where).toMatchObject({ userId: 'user-a', contextType: 'brand' });
    expect(repo.recordSignals.mock.calls[0][2]).toEqual(expect.arrayContaining([expect.objectContaining({ dimension: 'color', value: '#000000' }), expect.objectContaining({ dimension: 'typography', value: 'cormorant' })]));
  });

  it('does nothing for Personal assets', async () => {
    assetFind.mockResolvedValue(null);
    expect(await service.recordAssetSignal('user-a', 'personal-asset', 'saved')).toBe(false);
    expect(repo.recordSignals).not.toHaveBeenCalled();
  });
});
