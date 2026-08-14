import { describe, it, expect, vi } from 'vitest';
import { generateCreativeConcepts } from './creative-concepts.generator';
import { resolveBrandProfile } from '../brand/brand-profile';
import { resolveCreativeDna } from '../brand/creative-dna';
import type { AiTextProvider } from '../providers';

function mockProvider(payload: unknown): AiTextProvider {
  return {
    id: 'mock',
    model: 'mock-model',
    supportsVision: false,
    isConfigured: () => true,
    generateJson: vi.fn(async () => payload),
  };
}

function strongScores(overrides: Partial<Record<string, number>> = {}) {
  return {
    conceptStrength: 80,
    brandSpecificity: 75,
    productRelevance: 80,
    visualOriginality: 75,
    scrollStoppingPotential: 80,
    messageClarity: 70,
    socialInteractionPotential: 70,
    templateRisk: 20,
    ...overrides,
  };
}

const DIVERSE_CONCEPTS = {
  concepts: [
    {
      conceptName: 'Find the Missing Piece',
      bigIdea: 'The momo becomes a puzzle with one piece missing.',
      visualMechanism: 'puzzle/interaction',
      interaction: 'Which one fits?',
      productRole: 'the dish itself is the puzzle',
      mode: 'INTERACTIVE',
      artDirectionFamily: 'INTERACTIVE_GRAPHIC',
      scores: strongScores(),
    },
    {
      conceptName: 'Worth Reaching For',
      bigIdea: 'An unexpected hand reaches for the dish across an impossible gap.',
      visualMechanism: 'visual metaphor',
      visualMetaphor: 'desire as physical distance',
      mode: 'VISUAL_METAPHOR',
      artDirectionFamily: 'SURREAL_EDITORIAL',
      scores: strongScores({ productRelevance: 70 }),
    },
    {
      conceptName: 'Momos Mode ON',
      bigIdea: 'The dish becomes a switch in a control interface.',
      visualMechanism: 'object substitution',
      mode: 'PLAYFUL',
      artDirectionFamily: 'PLAYFUL_GRAPHIC',
      scores: strongScores({ visualOriginality: 85 }),
    },
    {
      conceptName: 'Generic Plate',
      bigIdea: 'A beautiful bowl of momos on a table.',
      visualMechanism: 'none really, just a nice photo',
      mode: 'EDITORIAL',
      artDirectionFamily: 'PRODUCT_STUDIO',
      scores: strongScores({ conceptStrength: 20, templateRisk: 90 }),
    },
  ],
};

describe('generateCreativeConcepts', () => {
  it('returns several genuinely different mechanisms, not cosmetic variants', async () => {
    const provider = mockProvider(DIVERSE_CONCEPTS);
    const { concepts, proposedCount } = await generateCreativeConcepts({
      provider,
      request: 'Create a memorable campaign for our momo dish.',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: ['instagram'],
      hasAssets: false,
      brand: resolveBrandProfile({ brand: { name: 'Seven Sisters' } }),
      creativeDna: resolveCreativeDna({}),
    });

    expect(proposedCount).toBe(4);
    const mechanisms = concepts.map((c) => c.visualMechanism);
    expect(new Set(mechanisms).size).toBe(mechanisms.length); // no duplicate mechanisms among what survived
  });

  it('rejects a weak/generic concept via the quality gate — conceptStrength too low, templateRisk too high', async () => {
    const provider = mockProvider(DIVERSE_CONCEPTS);
    const { concepts } = await generateCreativeConcepts({
      provider,
      request: 'Create a memorable campaign for our momo dish.',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: ['instagram'],
      hasAssets: false,
      brand: resolveBrandProfile({ brand: { name: 'Seven Sisters' } }),
      creativeDna: resolveCreativeDna({}),
    });

    expect(concepts.some((c) => c.conceptName === 'Generic Plate')).toBe(false);
    expect(concepts).toHaveLength(3);
  });

  it('never returns an empty set — keeps the strongest of a weak batch rather than leaving the user with nothing', async () => {
    const allWeak = {
      concepts: [
        { conceptName: 'A', bigIdea: 'a', visualMechanism: 'x', mode: 'EDITORIAL', scores: strongScores({ conceptStrength: 10, templateRisk: 95 }) },
        { conceptName: 'B', bigIdea: 'b', visualMechanism: 'y', mode: 'EDITORIAL', scores: strongScores({ conceptStrength: 25, templateRisk: 85 }) },
      ],
    };
    const provider = mockProvider(allWeak);
    const { concepts } = await generateCreativeConcepts({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
    });

    expect(concepts).toHaveLength(1);
    expect(concepts[0].conceptName).toBe('B'); // the less-bad of the two
  });

  it('drops a concept missing its anchor fields (conceptName/bigIdea/visualMechanism) rather than passing through a malformed one', async () => {
    const provider = mockProvider({
      concepts: [
        { conceptName: '', bigIdea: 'no name', visualMechanism: 'x', mode: 'EDITORIAL', scores: strongScores() },
        ...DIVERSE_CONCEPTS.concepts.slice(0, 1),
      ],
    });
    const { concepts, proposedCount } = await generateCreativeConcepts({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
    });

    expect(proposedCount).toBe(1); // the malformed one never made it past normalisation
    expect(concepts).toHaveLength(1);
  });

  it('threads brand and product-participation context into the prompt — the product must participate, not decorate', async () => {
    const provider = mockProvider(DIVERSE_CONCEPTS);
    await generateCreativeConcepts({
      provider,
      request: 'Create a campaign for this product.',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: ['instagram'],
      hasAssets: true,
      brand: resolveBrandProfile({ brand: { name: 'Seven Sisters' } }),
      creativeDna: resolveCreativeDna({}),
    });

    const call = vi.mocked(provider.generateJson).mock.calls[0][0];
    expect(call.prompt).toContain('product must participate in the idea');
    expect(call.systemInstruction).toContain('GENUINELY DIFFERENT mechanisms');
  });
});

describe('generateCreativeConcepts — artDirectionFamily', () => {
  it('normalises each concept\'s artDirectionFamily, falling back to a safe default for an invalid value', async () => {
    const provider = mockProvider({
      concepts: [
        { ...DIVERSE_CONCEPTS.concepts[0], artDirectionFamily: 'NOT_A_REAL_FAMILY' },
        DIVERSE_CONCEPTS.concepts[1],
      ],
    });
    const { concepts } = await generateCreativeConcepts({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
    });

    expect(concepts[0].artDirectionFamily).toBe('EDITORIAL_PHOTOGRAPHY'); // fallback
    expect(concepts[1].artDirectionFamily).toBe('SURREAL_EDITORIAL');
  });

  it('retries once when 3+ concepts all land on the same art-direction family — different ideas that would still render as one repeated template', async () => {
    const degenerate = {
      concepts: DIVERSE_CONCEPTS.concepts.map((c) => ({ ...c, artDirectionFamily: 'PRODUCT_STUDIO' })),
    };
    const generateJson = vi
      .fn()
      .mockResolvedValueOnce(degenerate)
      .mockResolvedValueOnce(DIVERSE_CONCEPTS);
    const provider: AiTextProvider = {
      id: 'mock',
      model: 'mock-model',
      supportsVision: false,
      isConfigured: () => true,
      generateJson,
    };

    const { concepts } = await generateCreativeConcepts({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
    });

    expect(generateJson).toHaveBeenCalledTimes(2);
    const families = new Set(concepts.map((c) => c.artDirectionFamily));
    expect(families.size).toBeGreaterThan(1);
  });

  it('does not retry when the family spread is already diverse', async () => {
    const provider = mockProvider(DIVERSE_CONCEPTS);
    await generateCreativeConcepts({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
    });

    expect(provider.generateJson).toHaveBeenCalledTimes(1);
  });
});

describe('generateCreativeConcepts — recent-visual-memory', () => {
  it('renders recent creative signatures as context to diverge from', async () => {
    const provider = mockProvider(DIVERSE_CONCEPTS);
    await generateCreativeConcepts({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
      recentSignatures: [
        { artDirectionFamily: 'PRODUCT_STUDIO', mode: 'EDITORIAL', palette: ['#0a0a0a'], lighting: 'soft studio', background: 'dark gradient' },
      ],
    });

    const call = vi.mocked(provider.generateJson).mock.calls[0][0];
    expect(call.prompt).toContain('Recent creatives from this brand');
    expect(call.prompt).toContain('PRODUCT_STUDIO');
  });

  it('omits the recent-creatives section when there is no history yet', async () => {
    const provider = mockProvider(DIVERSE_CONCEPTS);
    await generateCreativeConcepts({
      provider,
      request: 'anything',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
    });

    const call = vi.mocked(provider.generateJson).mock.calls[0][0];
    expect(call.prompt).not.toContain('Recent creatives from this brand');
  });
});
