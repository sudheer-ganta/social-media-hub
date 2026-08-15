import { describe, it, expect, vi } from 'vitest';
import {
  classifyMechanismFamily,
  conceptSimilarity,
  evaluateConceptDiversity,
  generateCreativeConcepts,
  trimDuplicateMechanisms,
} from './creative-concepts.generator';
import { resolveBrandProfile } from '../brand/brand-profile';
import { resolveCreativeDna } from '../brand/creative-dna';
import type { AiTextProvider } from '../providers';
import type { ScoredCreativeConcept } from '../types';

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

// ── Mechanism diversity ─────────────────────────────────────────────────────
//
// Same request + same brand must yield genuinely different IDEAS, not one
// central device styled three ways. Diversity is judged on mechanismFamily
// plus text/self-reported similarity — never on palette/typography/layout.

describe('mechanism diversity', () => {
  const typed = (overrides: Partial<ScoredCreativeConcept> & { conceptName: string }): ScoredCreativeConcept => ({
    bigIdea: 'an idea',
    visualMechanism: 'visual metaphor',
    mode: 'EDITORIAL',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    mechanismFamily: 'VISUAL_METAPHOR',
    scores: {
      conceptStrength: 80,
      brandSpecificity: 75,
      productRelevance: 80,
      visualOriginality: 75,
      scrollStoppingPotential: 80,
      messageClarity: 70,
      socialInteractionPotential: 70,
      templateRisk: 20,
      mechanismNovelty: 50,
      similarityToOtherConcepts: 10,
    },
    ...overrides,
  });

  it('classifies a mechanism family from prose when the model omits it', () => {
    expect(classifyMechanismFamily('puzzle/interaction — spot the missing piece')).toBe('INTERACTIVE_PUZZLE');
    expect(classifyMechanismFamily('wordplay on the brand name in giant type')).toBe('TYPOGRAPHY_WORDPLAY');
    expect(classifyMechanismFamily('a before/after split of the same desk')).toBe('BEFORE_AFTER');
    expect(classifyMechanismFamily('the product transforms into a boarding pass')).toBe('TRANSFORMATION');
    expect(classifyMechanismFamily('a candid unposed documentary moment at the table')).toBe('DOCUMENTARY_MOMENT');
    expect(classifyMechanismFamily('something entirely unmatched by keywords')).toBe('VISUAL_METAPHOR');
  });

  it('flags duplicated mechanism families as a diversity violation', () => {
    const report = evaluateConceptDiversity([
      typed({ conceptName: 'A', mechanismFamily: 'VISUAL_METAPHOR' }),
      typed({ conceptName: 'B', mechanismFamily: 'VISUAL_METAPHOR', artDirectionFamily: 'COLLAGE' }),
      typed({ conceptName: 'C', mechanismFamily: 'INTERACTIVE_PUZZLE', artDirectionFamily: 'INTERACTIVE_GRAPHIC' }),
    ]);
    expect(report.duplicatedFamilies).toEqual(['VISUAL_METAPHOR']);
    expect(report.violationCount).toBeGreaterThan(0);
  });

  it('flags cosmetic variation — one central device styled twice — via text overlap, even across different declared families', () => {
    const a = typed({
      conceptName: 'The Calendar Countdown',
      bigIdea: 'A wall calendar counting down the days until the launch, dates crossed out.',
      visualMechanism: 'calendar countdown metaphor',
      mechanismFamily: 'VISUAL_METAPHOR',
    });
    const b = typed({
      conceptName: 'The Calendar Countdown Wall',
      bigIdea: 'A wall calendar counting down the launch days, each crossed date a product.',
      visualMechanism: 'calendar countdown composition',
      mechanismFamily: 'COLLAGE_GRAPHIC',
      artDirectionFamily: 'COLLAGE',
    });
    expect(conceptSimilarity(a, b)).toBeGreaterThan(0.34);
    const report = evaluateConceptDiversity([a, b, typed({ conceptName: 'C', bigIdea: 'A stranger asks to share the table.', visualMechanism: 'human observation', mechanismFamily: 'HUMAN_OBSERVATIONAL' })]);
    expect(report.similarPairs.length).toBeGreaterThan(0);
  });

  it('treats an honest high self-reported similarity as a violation', () => {
    const report = evaluateConceptDiversity([
      typed({ conceptName: 'A', scores: { ...typed({ conceptName: 'x' }).scores, similarityToOtherConcepts: 75 } }),
      typed({ conceptName: 'B', mechanismFamily: 'STORYTELLING', bigIdea: 'entirely different tale' }),
    ]);
    expect(report.selfReportedDuplicates).toEqual(['A']);
  });

  it('a genuinely diverse set reports zero violations', () => {
    const report = evaluateConceptDiversity([
      typed({ conceptName: 'A', bigIdea: 'The dish becomes a puzzle.', visualMechanism: 'puzzle', mechanismFamily: 'INTERACTIVE_PUZZLE', artDirectionFamily: 'INTERACTIVE_GRAPHIC' }),
      typed({ conceptName: 'B', bigIdea: 'A regular finally gets the corner seat.', visualMechanism: 'human observation', mechanismFamily: 'HUMAN_OBSERVATIONAL', artDirectionFamily: 'DOCUMENTARY' }),
      typed({ conceptName: 'C', bigIdea: 'Steam spells nothing, but you look twice.', visualMechanism: 'surreal juxtaposition', mechanismFamily: 'ABSURD_SURREAL', artDirectionFamily: 'SURREAL_EDITORIAL' }),
    ]);
    expect(report.violationCount).toBe(0);
  });

  it('retries once when the set is one idea styled three ways, and keeps the more diverse retry', async () => {
    const calendarTrio = {
      concepts: [
        { conceptName: 'The Calendar Redacted', bigIdea: 'A calendar with every date blacked out except launch day.', visualMechanism: 'calendar metaphor', mode: 'MINIMAL', artDirectionFamily: 'MINIMAL_ART', mechanismFamily: 'VISUAL_METAPHOR', scores: strongScores({ similarityToOtherConcepts: 70 }) },
        { conceptName: 'The Unpeeled Calendar', bigIdea: 'A calendar page peeling away to reveal launch day.', visualMechanism: 'calendar transformation', mode: 'STORYTELLING', artDirectionFamily: 'HANDCRAFTED', mechanismFamily: 'TRANSFORMATION', scores: strongScores({ similarityToOtherConcepts: 75 }) },
        { conceptName: 'The Calendar Grid', bigIdea: 'A calendar rebuilt as a grid of the product.', visualMechanism: 'calendar composition', mode: 'PLAYFUL', artDirectionFamily: 'PLAYFUL_GRAPHIC', mechanismFamily: 'COLLAGE_GRAPHIC', scores: strongScores({ similarityToOtherConcepts: 80 }) },
      ],
    };
    const generateJson = vi
      .fn()
      .mockResolvedValueOnce(calendarTrio)
      .mockResolvedValueOnce(DIVERSE_CONCEPTS);
    const provider: AiTextProvider = { id: 'mock', model: 'mock-model', supportsVision: false, isConfigured: () => true, generateJson };

    const { concepts } = await generateCreativeConcepts({
      provider,
      request: 'Create a campaign for our product launching next month.',
      goal: 'product_launch',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
    });

    expect(generateJson).toHaveBeenCalledTimes(2);
    const retryPrompt = generateJson.mock.calls[1][0].prompt as string;
    expect(retryPrompt).toContain('lacked genuine set diversity');
    // The diverse retry replaced the calendar trio.
    expect(concepts.some((c) => c.conceptName.toLowerCase().includes('calendar'))).toBe(false);
  });

  it('keeps the original set when the retry is no more diverse', async () => {
    const duplicated = {
      concepts: [
        { conceptName: 'A', bigIdea: 'metaphor one — a bridge of noodles.', visualMechanism: 'visual metaphor', mode: 'EDITORIAL', artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY', mechanismFamily: 'VISUAL_METAPHOR', scores: strongScores() },
        { conceptName: 'B', bigIdea: 'metaphor two — a doorway of books.', visualMechanism: 'visual metaphor', mode: 'MINIMAL', artDirectionFamily: 'MINIMAL_ART', mechanismFamily: 'VISUAL_METAPHOR', scores: strongScores() },
      ],
    };
    const generateJson = vi.fn().mockResolvedValue(duplicated);
    const provider: AiTextProvider = { id: 'mock', model: 'mock-model', supportsVision: false, isConfigured: () => true, generateJson };

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
    expect(concepts).toHaveLength(2); // set survives — diversity never empties it
  });

  it('trims the weaker mechanism duplicate when more than three concepts survive', () => {
    const kept = trimDuplicateMechanisms([
      typed({ conceptName: 'StrongMetaphor', mechanismFamily: 'VISUAL_METAPHOR' }),
      typed({
        conceptName: 'WeakMetaphor',
        mechanismFamily: 'VISUAL_METAPHOR',
        scores: { ...typed({ conceptName: 'x' }).scores, conceptStrength: 45 },
      }),
      typed({ conceptName: 'Puzzle', bigIdea: 'the label is a quiz', visualMechanism: 'puzzle', mechanismFamily: 'INTERACTIVE_PUZZLE' }),
      typed({ conceptName: 'Human', bigIdea: 'a stranger shares the table', visualMechanism: 'human observation', mechanismFamily: 'HUMAN_OBSERVATIONAL' }),
    ]);
    expect(kept).toHaveLength(3);
    expect(kept.map((c) => c.conceptName)).not.toContain('WeakMetaphor');
  });

  it('never trims below three concepts — quality outranks perfect diversity', () => {
    const three = [
      typed({ conceptName: 'A', mechanismFamily: 'VISUAL_METAPHOR' }),
      typed({ conceptName: 'B', mechanismFamily: 'VISUAL_METAPHOR' }),
      typed({ conceptName: 'C', bigIdea: 'the label is a quiz', visualMechanism: 'puzzle', mechanismFamily: 'INTERACTIVE_PUZZLE' }),
    ];
    expect(trimDuplicateMechanisms(three)).toHaveLength(3);
  });
});

// ── Intent fidelity (spec §1.3) ─────────────────────────────────────────────
//
// A clever concept that misses the member's offer is a bad concept. It must
// never reach the picker, and it must never reach the image model.

describe('generateCreativeConcepts — hard requirements', () => {
  const INTENT = {
    extracted: true,
    event: 'BTS comeback',
    culturalContext: 'K-pop',
    productCategory: 'Korean food',
    offer: '50% off',
    promotionType: 'event promotion',
    venueType: 'restaurant',
    audience: 'BTS fans',
    requiredClaims: ['BTS comeback', 'Korean food', '50% off'],
    optionalDetails: [],
    confidence: {},
  } as const;

  const conceptWith = (name: string, bigIdea: string, family: string) => ({
    conceptName: name,
    bigIdea,
    visualMechanism: 'visual metaphor',
    mode: 'CULTURAL',
    artDirectionFamily: family,
    scores: strongScores(),
  });

  function base() {
    return {
      request: 'BTS is coming back to our restaurant. 50% off all Korean food.',
      goal: 'event_promotion' as const,
      funnelStage: 'BOFU' as const,
      platforms: ['instagram'],
      hasAssets: false,
      brand: resolveBrandProfile(),
      creativeDna: resolveCreativeDna(),
      intent: INTENT,
    };
  }

  it('drops the concept that loses the offer and keeps the one that carries everything', async () => {
    const provider = mockProvider({
      concepts: [
        conceptWith('Perfectly Synchronized', 'Flavours in perfect harmony, plated beautifully.', 'EDITORIAL_PHOTOGRAPHY'),
        conceptWith(
          'The Lightstick Plating',
          'A BTS comeback night where every Korean food order is 50% off, plated like a stadium of lightsticks.',
          'CULTURAL_EDITORIAL',
        ),
      ],
    });

    const { concepts } = await generateCreativeConcepts({ provider, ...base() });

    expect(concepts).toHaveLength(1);
    expect(concepts[0].conceptName).toBe('The Lightstick Plating');
    expect(concepts[0].intentFidelity?.score).toBe(100);
    expect(concepts[0].intentFidelity?.missingRequirements).toEqual([]);
  });

  it('retries once, naming what was dropped, when every concept misses a requirement', async () => {
    const provider = mockProvider({
      concepts: [conceptWith('Synchronized Flavors', 'A beautiful plate of food.', 'EDITORIAL_PHOTOGRAPHY')],
    });

    await generateCreativeConcepts({ provider, ...base() });

    const calls = vi.mocked(provider.generateJson).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const retry = calls[calls.length - 1][0];
    expect(retry.prompt).toContain('drop requirements the member explicitly stated');
    expect(retry.prompt).toContain('50% off');
  });

  it('never returns nothing — the best-covering concept survives, carrying what it still misses', async () => {
    const provider = mockProvider({
      concepts: [
        conceptWith('Half Empty', 'A plate of Korean food, beautifully lit.', 'EDITORIAL_PHOTOGRAPHY'),
        conceptWith('Nothing At All', 'A mood.', 'MINIMAL_ART'),
      ],
    });

    const { concepts } = await generateCreativeConcepts({ provider, ...base() });

    expect(concepts.length).toBeGreaterThan(0);
    // The one that at least carries "Korean food" beats the one carrying none,
    // and what it still misses travels with it for the direction stage to fix.
    expect(concepts[0].intentFidelity?.requiredElementsPresent).toContain('Korean food');
    expect(concepts[0].intentFidelity?.missingRequirements).toContain('50% off');
  });

  it('retries to restore a full set when the gate silently shrinks it below three, and keeps the bigger covered retry', async () => {
    const oneCovers = {
      concepts: [
        conceptWith('Covers All', 'BTS comeback night: 50% off all Korean food.', 'CULTURAL_EDITORIAL'),
        conceptWith('Misses Offer', 'A BTS comeback feast of Korean food.', 'EDITORIAL_PHOTOGRAPHY'),
        conceptWith('Misses Everything', 'A beautiful plate.', 'PRODUCT_STUDIO'),
      ],
    };
    const threeCover = {
      concepts: [
        conceptWith('Covers All', 'BTS comeback night: 50% off all Korean food.', 'CULTURAL_EDITORIAL'),
        {
          ...conceptWith('Puzzle Cover', 'Find the BTS comeback dish — 50% off all Korean food for those who do.', 'INTERACTIVE_GRAPHIC'),
          visualMechanism: 'puzzle/interaction',
        },
        {
          ...conceptWith('Human Cover', 'A fan\'s table on BTS comeback night, Korean food at 50% off.', 'DOCUMENTARY'),
          visualMechanism: 'human observation',
        },
      ],
    };
    const generateJson = vi.fn().mockResolvedValueOnce(oneCovers).mockResolvedValueOnce(threeCover);
    const provider: AiTextProvider = { id: 'mock', model: 'mock-model', supportsVision: false, isConfigured: () => true, generateJson };

    const { concepts } = await generateCreativeConcepts({ provider, ...base() });

    // The gate kept only "Covers All"; the retry restored a full covered set.
    expect(concepts.length).toBe(3);
    expect(concepts.every((c) => (c.intentFidelity?.missingRequirements.length ?? 0) === 0)).toBe(true);
  });

  it('puts the member\'s requirements in the prompt, above the brand', async () => {
    const provider = mockProvider({
      concepts: [conceptWith('X', 'BTS comeback, Korean food, 50% off.', 'CULTURAL_EDITORIAL')],
    });

    await generateCreativeConcepts({ provider, ...base() });

    const prompt = vi.mocked(provider.generateJson).mock.calls[0][0].prompt;
    expect(prompt).toContain('What the member actually asked for');
    expect(prompt).toContain('HARD REQUIREMENTS');
    expect(prompt).toContain('"50% off"');
  });

  it('does not run at all when the member stated no hard requirements', async () => {
    const withoutClaims = mockProvider(DIVERSE_CONCEPTS);
    const withoutIntent = mockProvider(DIVERSE_CONCEPTS);

    const gated = await generateCreativeConcepts({
      provider: withoutClaims,
      ...base(),
      intent: { ...INTENT, requiredClaims: [] },
    });
    const ungated = await generateCreativeConcepts({
      provider: withoutIntent,
      ...base(),
      intent: undefined,
    });

    // Same concepts through either path, and none carries a fidelity verdict —
    // there was nothing to hold them to.
    expect(gated.concepts.length).toBe(ungated.concepts.length);
    expect(gated.concepts.every((c) => c.intentFidelity === undefined)).toBe(true);
    // One model call each: no retry is provoked by an empty requirement list.
    expect(vi.mocked(withoutClaims.generateJson)).toHaveBeenCalledTimes(1);
  });
});
