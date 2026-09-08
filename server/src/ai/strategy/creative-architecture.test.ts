import { describe, it, expect, vi } from 'vitest';
import { generateCreativeStrategy, describesLayoutNotMechanism, normaliseCreativeStrategy, prohibitionsFor } from '../generators/creative-strategy.generator';
import { generateGraphicDesignConcept } from '../generators/art-director.generator';
import { buildCanonicalCreativeBrief } from '../brand/creative-brief';
import { resolveBrandProfile } from '../brand/brand-profile';
import { resolveCreativeDna } from '../brand/creative-dna';
import { collectCampaignCopy } from '../prompts/campaign-creative.prompt';
import { buildCompositionInstructions, fallbackConceptFrom, imageIsAbsent } from '../render/designer-composition';
import { compareGraphicConcepts } from './concept-similarity';
import type { AiTextProvider } from '../providers';
import type {
  BrandProfile,
  CreativeDirection,
  CreativeIntentBrief,
  CreativeStrategy,
  GraphicDesignConcept,
  ResolvedCreativeDna,
} from '../types';

/**
 * Architecture tests (spec §19).
 *
 * These are deliberately NOT tests about Diwali, restaurants or sales. Every
 * one asserts a property that must hold for ANY request and ANY brand — that
 * context cannot become a template, that the brand cannot become a template,
 * that a composition family is not an idea, and that nothing in the pipeline
 * supplies a position, an image or a line of copy that nobody asked for.
 *
 * A regression here means the collapse has returned, whatever the occasion.
 */

// ─── Fixtures ────────────────────────────────────────────────────────────────

const brand: BrandProfile = resolveBrandProfile({
  brand: { name: 'Northwind', industry: 'hospitality', personality: 'precise, unsentimental', tone: 'plain' },
});

const creativeDna: ResolvedCreativeDna = resolveCreativeDna({
  brand: { brandColors: ['#101010', '#f4f1ea'], logoAssetUrl: 'https://cdn.example.com/logo.png' },
});

const intentFor = (event: string, offer = ''): CreativeIntentBrief => ({
  extracted: true,
  event,
  culturalContext: '',
  productCategory: '',
  offer,
  promotionType: '',
  venueType: '',
  audience: '',
  requiredClaims: [event, offer].filter(Boolean),
  optionalDetails: [],
  confidence: {},
});

const provider = (impl: AiTextProvider['generateJson']): AiTextProvider => ({
  id: 'mock',
  model: 'mock-model',
  supportsVision: false,
  isConfigured: () => true,
  generateJson: impl,
});

/** A blueprint carrying a named mechanism and behaviours — the shape the architecture requires. */
const conceptOf = (overrides: Partial<GraphicDesignConcept>): GraphicDesignConcept => ({
  conceptName: 'Concept',
  visualIdea: 'An idea.',
  hero: 'typography',
  imageRole: 'omitted',
  firstRead: 'the idea',
  ...overrides,
});

const directionOf = (overrides: Partial<CreativeDirection> = {}): CreativeDirection => ({
  concept: 'Concept',
  visualStory: 'A story.',
  subject: 'Subject',
  environment: '',
  composition: '',
  lighting: '',
  mood: 'plain',
  palette: ['#101010'],
  brandConstraints: [],
  productTreatment: '',
  background: '#f4f1ea',
  negativeVisualConstraints: [],
  aspectRatio: '1:1',
  platform: 'instagram',
  mode: 'EDITORIAL',
  artDirectionFamily: 'TYPOGRAPHY_LED',
  copyTreatment: 'headline_support',
  headline: 'ONE LINE',
  supportingLine: 'A supporting sentence that the design may not want.',
  cta: 'Book now',
  interactionInstructions: '',
  marketingCreative: {
    offerText: '20% off',
    eventBadge: 'This weekend',
    brandMessage: 'Crafted in harmony with the season.',
    secondaryInfo: ['Flights', 'Hotels', 'Packages'],
  },
  ...overrides,
});

const briefFor = (userPrompt: string, event: string, offer = '') =>
  buildCanonicalCreativeBrief({
    userPrompt,
    goal: 'event_promotion',
    funnelStage: 'TOFU',
    brand,
    creativeDna,
    intent: intentFor(event, offer),
    logoAssetUrl: 'https://cdn.example.com/logo.png',
  });

const strategyPayload = (overrides: Record<string, unknown> = {}) => ({
  communicationIdea: 'The kitchen never closes.',
  creativeMechanism: 'documentary moment',
  emotionalDirection: 'quiet respect',
  brandConnection: 'This kitchen has never closed.',
  visualOpportunity: 'One unposed frame carries it.',
  prohibitedVisualCliches: ['a family smiling around a table'],
  ...overrides,
});

// ─── Test 1 ──────────────────────────────────────────────────────────────────

describe('Test 1 — two different events do not inherit the same visual language', () => {
  it('gives each occasion its own strategy prompt and lets each reach its own mechanism', async () => {
    const prompts: string[] = [];
    const mechanisms = ['documentary moment', 'modular typography that overruns its grid'];
    let call = 0;

    const call1 = await generateCreativeStrategy({
      provider: provider(async (options) => {
        prompts.push(options.prompt);
        return strategyPayload({ creativeMechanism: mechanisms[call++] });
      }),
      request: 'Diwali dinner at our restaurant',
      goal: 'event_promotion',
      funnelStage: 'TOFU',
      platforms: ['instagram'],
      hasAssets: false,
      brand,
      creativeDna,
      intent: intentFor('Diwali'),
    });

    const call2 = await generateCreativeStrategy({
      provider: provider(async (options) => {
        prompts.push(options.prompt);
        return strategyPayload({ creativeMechanism: mechanisms[call++] });
      }),
      request: 'BTS comeback party at our restaurant',
      goal: 'event_promotion',
      funnelStage: 'TOFU',
      platforms: ['instagram'],
      hasAssets: false,
      brand,
      creativeDna,
      intent: intentFor('BTS Comeback Party'),
    });

    // Each request is asked about its OWN occasion, and nothing about the first
    // reaches the second.
    expect(prompts[0]).toContain('Diwali');
    expect(prompts[0]).not.toContain('BTS');
    expect(prompts[1]).toContain('BTS Comeback Party');
    expect(prompts[1]).not.toContain('Diwali');

    // Neither prompt carries a visual grammar of any kind for the model to inherit.
    for (const prompt of prompts) {
      expect(prompt).not.toMatch(/typographic-poster|asymmetric-editorial|left-edge|upper-right|left-major/);
    }

    expect(call1.strategy.creativeMechanism).not.toBe(call2.strategy.creativeMechanism);
  });

  it('describes an occasion in meaning, and marks its symbols as available rather than required', async () => {
    const generateJson = vi.fn(async () => strategyPayload());
    const built = provider(generateJson);
    await generateCreativeStrategy({
      provider: built,
      request: 'Holi campaign',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand,
      creativeDna,
    });

    const system = generateJson.mock.calls[0][0].systemInstruction;
    expect(system).toContain('CONTEXT INFORMS. IT NEVER DICTATES.');
    expect(system).toContain('An occasion never determines a composition');
    expect(system).toContain('must not inherit the same visual language just because both are occasions');
  });
});

// ─── Test 2 ──────────────────────────────────────────────────────────────────

describe('Test 2 — the same event can produce radically different mechanisms', () => {
  it('accepts any mechanism the model invents, including ones this codebase has never heard of', () => {
    const invented = 'the menu is typeset as a departures board that keeps re-flipping';
    const strategy = normaliseCreativeStrategy(
      strategyPayload({ creativeMechanism: invented }) as never,
      { request: 'Diwali dinner' },
    );
    // Free text, not an enum — nothing narrows it to a known list.
    expect(strategy.creativeMechanism).toBe(invented);
  });

  it('rejects a "mechanism" that is really a layout description', () => {
    expect(describesLayoutNotMechanism('big headline on the left with a photo on the right')).toBe(true);
    expect(describesLayoutNotMechanism('logo in the corner, copy underneath')).toBe(true);
    expect(describesLayoutNotMechanism('typographic transformation')).toBe(false);
    expect(describesLayoutNotMechanism('documentary moment')).toBe(false);

    const strategy = normaliseCreativeStrategy(
      strategyPayload({ creativeMechanism: 'the headline sits on the left and the image on the right' }) as never,
      { request: 'Diwali dinner', conceptMechanism: 'visual pun' },
    );
    expect(strategy.creativeMechanism).toBe('visual pun');
  });
});

// ─── Test 3 ──────────────────────────────────────────────────────────────────

describe('Test 3 — one brand, many compositions, one identity', () => {
  it('constrains tone and palette without constraining the mechanism or the layout', async () => {
    const generateJson = vi.fn(async () => strategyPayload());
    await generateCreativeStrategy({
      provider: provider(generateJson),
      request: 'Anything at all',
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: [],
      hasAssets: false,
      brand,
      creativeDna,
    });
    expect(generateJson.mock.calls[0][0].systemInstruction).toContain('BRAND IS A CONSTRAINT, NOT A TEMPLATE');

    const brief = briefFor('Anything at all', '');
    const adCall = vi.fn(async () => ({
      conceptName: 'A',
      visualIdea: 'An idea.',
      creativeMechanism: 'collage',
      hero: 'graphic-element',
      imageRole: 'floating-fragment',
      firstRead: 'the collage',
    }));
    await generateGraphicDesignConcept({ provider: provider(adCall), brief });

    const prompt = adCall.mock.calls[0][0].prompt;
    expect(prompt).toContain('BRAND CONSTRAINTS (tone, palette and personality — never a layout)');
    expect(prompt).toContain('It does not constrain the mechanism, the composition or the amount of copy.');
  });
});

// ─── Test 4 ──────────────────────────────────────────────────────────────────

describe('Test 4 — semantic roles do not determine spatial positions', () => {
  it('sends no position for any role when the blueprint decided none', () => {
    const instructions = buildCompositionInstructions({
      concept: conceptOf({
        creativeMechanism: 'scale distortion',
        typeBehavior: 'a single word, enormous, cropped by the frame',
        imageBehavior: 'absent',
        hierarchyStrategy: 'one word leads; nothing competes',
      }),
      requiredNodeList: '- id: "primary-hook" (kind: "copy")',
      isPureTypographicPoster: true,
    });

    // No default anchor, region or placement is fabricated for the planner.
    expect(instructions).not.toMatch(/left-edge|left-major|upper-right|vertical-down|asymmetric-editorial/);
    expect(instructions).toContain('The art director deliberately left placement open');

    // And the forbidden list names every role-to-position reflex explicitly.
    expect(instructions).toContain('typography on one side of the canvas with imagery on the other');
    expect(instructions).toContain('the brand mark parked in a corner or along the bottom edge as a footer');
    expect(instructions).toContain('a row of small labels beneath the main content');
  });

  it('passes through the positions an art director genuinely decided', () => {
    const instructions = buildCompositionInstructions({
      concept: conceptOf({
        creativeMechanism: 'object juxtaposition',
        headlinePlacement: 'wrapped around the plate rim, following its curve',
        negativeSpaceRegion: 'the empty half of the table',
      }),
      requiredNodeList: '- id: "primary-hook" (kind: "copy")',
      isPureTypographicPoster: false,
    });

    expect(instructions).toContain('SPATIAL DECISIONS THE ART DIRECTOR ALREADY MADE');
    expect(instructions).toContain('wrapped around the plate rim');
    expect(instructions).toContain('Everything not listed here is yours to compose from the idea.');
  });

  it('never sends a fixed fontScale band per semantic role', () => {
    const instructions = buildCompositionInstructions({
      concept: conceptOf({ hierarchyStrategy: 'near-equal quiet type on a field of emptiness' }),
      requiredNodeList: '- id: "primary-hook" (kind: "copy")',
      isPureTypographicPoster: true,
    });

    // The old brief hardcoded 0.08–0.25 for the hook, 0.035–0.08 for the offer
    // and 0.020–0.038 for supporting notes — a picture of "big headline, small
    // print" applied to every creative ever made.
    expect(instructions).not.toContain('0.08 - 0.25');
    expect(instructions).not.toContain('0.035 - 0.08');
    expect(instructions).not.toContain('0.020 - 0.038');
    expect(instructions).toContain('Choose every scale from the hierarchy described above');
    expect(instructions).toContain('near-equal quiet type on a field of emptiness');
  });
});

// ─── Tests 5 & 6 ─────────────────────────────────────────────────────────────

describe('Tests 5 & 6 — optional copy stays optional, and nothing is added to fill space', () => {
  it('renders exactly one line when the idea asked for one line', () => {
    const direction = directionOf({ marketingCreative: { brandMessage: 'Crafted in harmony with the season.', secondaryInfo: ['Flights', 'Hotels', 'Packages'] } });
    const copy = collectCampaignCopy(direction, [], {
      requiredRoles: ['HEADLINE'],
      maxTextElements: 1,
      rationale: 'The idea is carried by one statement.',
    });

    // The direction authored a headline, a supporting sentence, a brand
    // message, three category labels and a CTA — the seven-block information
    // card. The design asked for one line, and gets exactly one line.
    expect(copy.map((c) => c.text)).toEqual(['ONE LINE']);
  });

  it('honours the plan\'s reading order rather than re-sorting to headline-first', () => {
    const copy = collectCampaignCopy(directionOf(), [], {
      requiredRoles: ['OFFER', 'HEADLINE'],
      maxTextElements: 2,
      rationale: 'The number leads.',
    });
    expect(copy.map((c) => c.role)).toEqual(['OFFER', 'HEADLINE']);
  });

  it('never loses a hard campaign fact to the trim', () => {
    // A plan that would have dropped the offer keeps it anyway — a design may
    // be minimal, but it may not silently lose what the member asked for.
    const copy = collectCampaignCopy(directionOf(), [], {
      requiredRoles: ['HEADLINE'],
      maxTextElements: 1,
      rationale: 'One statement.',
    });
    expect(copy.map((c) => c.text)).toContain('20% off');
  });

  it('keeps a required claim the plan would otherwise have trimmed away', () => {
    // The occasion carries no percentage, currency or date, so only the
    // member's own stated requirement can save it — and it must.
    const direction = directionOf({
      headline: 'THE ROOM IS FULL',
      marketingCreative: { eventBadge: 'Harvest Supper', brandMessage: 'Crafted in harmony.' },
    });

    const copy = collectCampaignCopy(
      direction,
      [],
      { requiredRoles: ['HEADLINE'], maxTextElements: 1, rationale: 'One statement.' },
      ['Harvest Supper'],
    );

    expect(copy.map((c) => c.text)).toContain('Harvest Supper');
    // The filler still goes.
    expect(copy.map((c) => c.text)).not.toContain('Crafted in harmony.');
  });

  it('does not duplicate a claim a surviving line already carries', () => {
    const direction = directionOf({
      headline: 'HARVEST SUPPER, SATURDAY',
      marketingCreative: { eventBadge: 'Harvest Supper' },
    });

    const copy = collectCampaignCopy(
      direction,
      [],
      { requiredRoles: ['HEADLINE'], maxTextElements: 1, rationale: 'One statement.' },
      ['Harvest Supper'],
    );

    expect(copy.map((c) => c.text)).toEqual(['HARVEST SUPPER, SATURDAY']);
  });

  it('keeps its own judgement when no plan was decided', () => {
    const copy = collectCampaignCopy(directionOf(), []);
    expect(copy.length).toBeGreaterThan(1);
  });

  it('tells the copy writer the design\'s budget is a hard limit, not a target', async () => {
    const { buildCreativeDirectionPrompt } = await import('../prompts/creative-direction.prompt');
    const built = buildCreativeDirectionPrompt({
      request: 'Anything',
      goal: 'sales',
      funnelStage: 'BOFU',
      platforms: [],
      hasAssets: false,
      brand,
      creativeDna,
      artDirectionFamily: 'TYPOGRAPHY_LED',
      graphicConcept: conceptOf({
        copyPlan: { requiredRoles: ['HEADLINE'], maxTextElements: 1, rationale: 'One statement carries it.' },
      }),
    });

    expect(built.prompt).toContain('Maximum text elements on the finished piece: 1');
    expect(built.prompt).toContain('Leave EVERY other copy field empty');
    expect(built.prompt).toContain('do not add a role');
  });
});

// ─── Test 7 ──────────────────────────────────────────────────────────────────

describe('Test 7 — concepts differ at the IDEA level, not at the colour/layout level', () => {
  const documentary = conceptOf({
    creativeMechanism: 'documentary moment',
    visualMetaphor: '',
    typeBehavior: 'a small stamped caption',
    imageBehavior: 'the subject, a single cinematic crop',
    spatialRelationship: 'the caption printed onto the photograph',
    hierarchyStrategy: 'the photograph leads completely',
    dominantVisualObject: 'the pass at service',
    hero: 'image',
    imageRole: 'full-bleed',
    compositionFamily: 'asymmetric-editorial',
  });

  it('sees through a palette-and-family swap of one idea', () => {
    const restyled = { ...documentary, compositionFamily: 'split-contrast', conceptName: 'Warm variant' };
    const report = compareGraphicConcepts(documentary, restyled);

    expect(report.tooSimilar).toBe(true);
    // compositionFamily is deliberately not one of the compared axes.
    expect(report.comparedAxes).not.toContain('compositionFamily' as never);
    expect(report.sharedAxes).toContain('creativeMechanism');
  });

  it('accepts a genuinely different mechanism even inside the same family', () => {
    const typographic = conceptOf({
      creativeMechanism: 'modular letterforms that overrun their own grid',
      typeBehavior: 'the entire piece; letterforms are the only material',
      imageBehavior: 'absent',
      spatialRelationship: 'words collide with the frame edge and are cut by it',
      hierarchyStrategy: 'no leader; density itself is the message',
      dominantVisualObject: 'a wall of letterforms',
      compositionFamily: 'asymmetric-editorial',
    });

    expect(compareGraphicConcepts(documentary, typographic).tooSimilar).toBe(false);
  });

  it('will not let an unfilled blueprint claim novelty by being empty', () => {
    const empty = conceptOf({ visualIdea: 'An idea.', hero: 'image', imageRole: 'full-bleed' });
    const alsoEmpty = conceptOf({ visualIdea: 'An idea.', hero: 'image', imageRole: 'full-bleed' });
    expect(compareGraphicConcepts(empty, alsoEmpty).tooSimilar).toBe(true);
  });
});

// ─── Test 8 ──────────────────────────────────────────────────────────────────

describe('Test 8 — swapping only the event name does not make a creative acceptable', () => {
  it('reads two blueprints that differ only in their occasion as one design', () => {
    const forOne = conceptOf({
      conceptName: 'Diwali Feast',
      visualIdea: 'A warm table photographed from above with the occasion name set beside it.',
      creativeMechanism: 'editorial photography',
      typeBehavior: 'a large name set beside the photograph',
      imageBehavior: 'a table photographed from above',
      spatialRelationship: 'the name sits next to the photograph',
      hierarchyStrategy: 'the name leads, the photograph follows',
      dominantVisualObject: 'a laid table',
    });
    // Only the occasion changed. Everything that makes it a design is identical.
    const forAnother = { ...forOne, conceptName: 'Christmas Feast' };

    const report = compareGraphicConcepts(forOne, forAnother);
    expect(report.tooSimilar).toBe(true);
    expect(report.similarity).toBe(1);
  });
});

// ─── Tests 9 & 10 ────────────────────────────────────────────────────────────

describe('Tests 9 & 10 — an image is optional, and may also be the dominant object', () => {
  it('treats a declared absence of imagery as a first-class design decision', () => {
    expect(imageIsAbsent(conceptOf({ imageRole: 'omitted' }))).toBe(true);
    // Behaviour is read as well as the enum: an art director who wrote the
    // absence in prose decided it just as clearly.
    expect(imageIsAbsent(conceptOf({ imageRole: 'hero', imageBehavior: 'absent — the piece is made of type' }))).toBe(true);
    expect(imageIsAbsent(conceptOf({ imageRole: 'hero', imageBehavior: 'the subject of the piece' }))).toBe(false);
  });

  it('tells the planner not to invent a visual to occupy space when there is no image', () => {
    const instructions = buildCompositionInstructions({
      concept: conceptOf({ imageRole: 'omitted', imageBehavior: 'absent' }),
      requiredNodeList: '- id: "primary-hook" (kind: "copy")',
      isPureTypographicPoster: true,
    });
    expect(instructions).toContain('do not invent a visual to occupy space');
    expect(instructions).not.toContain('visualPrompt,');
  });

  it('lets imagery be the dominant object without typography taking the other half', () => {
    const instructions = buildCompositionInstructions({
      concept: conceptOf({
        hero: 'image',
        imageRole: 'full-bleed',
        imageBehavior: 'the ground everything else sits on',
        typeBehavior: 'a single stamped line, printed into the frame',
        spatialRelationship: 'the line is inside the photograph, not beside it',
        dominantVisualObject: 'the photograph itself',
      }),
      requiredNodeList: '- id: "hero-visual" (kind: "visual")',
      isPureTypographicPoster: false,
    });

    expect(instructions).toContain('IMAGE behaves as: the ground everything else sits on');
    expect(instructions).toContain('the line is inside the photograph, not beside it');
    expect(instructions).toContain('typography on one side of the canvas with imagery on the other');
  });
});

// ─── Test 11 ─────────────────────────────────────────────────────────────────

describe('Test 11 — a typography-led idea does not become "big text left, image right"', () => {
  it('carries the idea, not a grammar, and supplies no position at all', () => {
    const instructions = buildCompositionInstructions({
      concept: conceptOf({
        creativeMechanism: 'typographic transformation',
        typeBehavior: 'the headline is a physical object entering the frame',
        imageBehavior: 'absent',
        graphicBehavior: 'none',
        spatialRelationship: 'the letterforms are cut by the canvas edge',
        hierarchyStrategy: 'one statement dominates; nothing else competes',
        dominantVisualObject: 'the word itself',
      }),
      requiredNodeList: '- id: "primary-hook" (kind: "copy")',
      isPureTypographicPoster: true,
    });

    expect(instructions).toContain('The mechanism you are expressing: "typographic transformation"');
    expect(instructions).toContain('TYPE behaves as: the headline is a physical object entering the frame');
    expect(instructions).not.toMatch(/anchor: left-edge|dominantRegion: left-major|negativeSpaceRegion: upper-right/);
    expect(instructions).toContain('a large headline above or beside a photograph');
  });

  it('produces a fallback blueprint with no placement at all when no art director ran', () => {
    const fallback = fallbackConceptFrom(directionOf());

    // Every one of these used to be filled with the template.
    expect(fallback.heroPlacement).toBeUndefined();
    expect(fallback.headlinePlacement).toBeUndefined();
    expect(fallback.visualPlacement).toBeUndefined();
    expect(fallback.anchor).toBeUndefined();
    expect(fallback.dominantRegion).toBeUndefined();
    expect(fallback.negativeSpaceRegion).toBeUndefined();
    expect(fallback.compositionFamily).toBeUndefined();
    expect(fallback.typographyScaleContrast).toBeUndefined();
    expect(JSON.stringify(fallback)).not.toMatch(/left-edge|left-major|upper-right|typographic-poster/);
  });
});

// ─── Cross-cutting ───────────────────────────────────────────────────────────

describe('the strategy is an idea layer, never a visual one', () => {
  it('merges the domain\'s exhausted moves into the prohibitions the design must honour', () => {
    const strategy: CreativeStrategy = {
      communicationIdea: 'x',
      creativeMechanism: 'collage',
      emotionalDirection: 'y',
      brandConnection: 'z',
      visualOpportunity: 'w',
      prohibitedVisualCliches: ['a glowing product on a gradient'],
      domainContext: {
        occasion: 'Any occasion',
        meaning: 'Something to people.',
        relevantSymbols: ['a symbol'],
        emotionalAssociations: [],
        sensitivities: [],
        visualClichesToAvoid: ['the move every competitor already uses'],
      },
    };

    const prohibited = prohibitionsFor(strategy);
    expect(prohibited).toContain('a glowing product on a gradient');
    expect(prohibited).toContain('the move every competitor already uses');
    // The domain can only ever SUBTRACT visual options — it has no channel
    // through which to require a symbol, a colour or an image.
    expect(prohibited).not.toContain('a symbol');
  });
});
