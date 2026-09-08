import { describe, it, expect, vi } from 'vitest';
import { generateCreativeStrategy } from '../generators/creative-strategy.generator';
import { generateGraphicDesignConcept } from '../generators/art-director.generator';
import { buildCanonicalCreativeBrief } from '../brand/creative-brief';
import { buildCompositionInstructions } from '../render/designer-composition';
import { collectCampaignCopy } from '../prompts/campaign-creative.prompt';
import { resolveBrandProfile } from '../brand/brand-profile';
import { resolveCreativeDna } from '../brand/creative-dna';
import type { AiTextProvider } from '../providers';
import type {
  BrandProfile,
  CreativeDirection,
  CreativeIntentBrief,
  GraphicDesignConcept,
  ResolvedCreativeDna,
} from '../types';

/**
 * Divergence guards.
 *
 * The architecture tests prove the machinery is sound. These prove the machine
 * cannot COLLAPSE — that the information which should make two creatives differ
 * actually reaches the stage that decides, and that the information which
 * should NOT drive layout has no path to it.
 *
 * What these can and cannot show, stated honestly: with a mocked provider they
 * prove the PLUMBING permits divergence and forbids collapse. They cannot prove
 * a real model chooses different mechanisms — only a real run can, which is
 * what `scripts/verify-creative-divergence.ts` is for. Both matter: a real run
 * that diverges today tells you nothing about tomorrow's refactor, and these
 * tests catch the refactor.
 */

const provider = (impl: AiTextProvider['generateJson']): AiTextProvider => ({
  id: 'mock',
  model: 'mock-model',
  supportsVision: false,
  isConfigured: () => true,
  generateJson: impl,
});

const intentOf = (over: Partial<CreativeIntentBrief> = {}): CreativeIntentBrief => ({
  extracted: true,
  event: '',
  culturalContext: '',
  productCategory: '',
  offer: '',
  promotionType: '',
  venueType: '',
  audience: '',
  requiredClaims: [],
  optionalDetails: [],
  confidence: {},
  ...over,
});

const strategyPayload = {
  communicationIdea: 'An idea.',
  creativeMechanism: 'documentary moment',
  emotionalDirection: 'quiet',
  brandConnection: 'Because of this brand.',
  visualOpportunity: 'A frame.',
  prohibitedVisualCliches: [],
};

/** Captures the prompt a strategy call would send, without asserting on the model's answer. */
async function strategyPromptFor(options: {
  request: string;
  brand: BrandProfile;
  creativeDna: ResolvedCreativeDna;
  intent?: CreativeIntentBrief;
  goal?: 'sales' | 'event_promotion' | 'brand_awareness';
}): Promise<string> {
  const generateJson = vi.fn(async () => strategyPayload);
  await generateCreativeStrategy({
    provider: provider(generateJson),
    request: options.request,
    goal: options.goal ?? 'event_promotion',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
    hasAssets: false,
    brand: options.brand,
    creativeDna: options.creativeDna,
    ...(options.intent && { intent: options.intent }),
  });
  return generateJson.mock.calls[0][0].prompt as string;
}

const neutralDna = resolveCreativeDna({ brand: { logoAssetUrl: 'https://cdn.example.com/logo.png' } });

// ─── Same occasion, different intent ─────────────────────────────────────────

describe('same occasion, different intent — occasion is not the creative concept', () => {
  const occasion = 'Deepavali';

  const variants = [
    { label: 'family dinner', request: 'Deepavali family dinner', intent: intentOf({ event: occasion, audience: 'families', requiredClaims: [occasion] }) },
    { label: 'discount',     request: 'Deepavali 50% off',        intent: intentOf({ event: occasion, offer: '50% off', requiredClaims: [occasion, '50% off'] }) },
    { label: 'party',        request: 'Deepavali party night',    intent: intentOf({ event: occasion, promotionType: 'party', requiredClaims: [occasion] }) },
    { label: 'greeting',     request: 'Deepavali wishes from us', intent: intentOf({ event: occasion, requiredClaims: [occasion] }) },
  ];

  it('sends four materially different strategy prompts for one occasion', async () => {
    const brand = resolveBrandProfile({ brand: { name: 'Northwind', tone: 'plain' } });
    const prompts = await Promise.all(
      variants.map((v) => strategyPromptFor({ request: v.request, brand, creativeDna: neutralDna, intent: v.intent })),
    );

    // Every prompt is distinct — the occasion is not the only thing the
    // strategist is told, so it cannot be the only thing it reasons from.
    expect(new Set(prompts).size).toBe(variants.length);

    // And each carries its OWN distinguishing fact.
    expect(prompts[0]).toContain('families');
    expect(prompts[1]).toContain('50% off');
    expect(prompts[2]).toContain('Deepavali party night');
    // The greeting has no offer and no audience, and the prompt says so by omission.
    expect(prompts[3]).not.toContain('50% off');
    expect(prompts[3]).not.toContain('families');
  });

  it('gives the occasion no channel to a visual decision', async () => {
    const brand = resolveBrandProfile({ brand: { name: 'Northwind' } });
    const prompt = await strategyPromptFor({
      request: 'Deepavali 50% off',
      brand,
      creativeDna: neutralDna,
      intent: intentOf({ event: 'Deepavali', offer: '50% off' }),
    });

    // The occasion arrives labelled as a FACT, explicitly not as direction.
    expect(prompt).toContain('What the member actually asked for (facts, not visual direction)');
    expect(prompt).toContain('None of them describes how the creative should look.');
    // Nothing in the prompt tells the model what this occasion looks like.
    expect(prompt).not.toMatch(/diya|lamp|rangoli|firework|gold|glow|motif|symbol/i);
  });

  it('carries the differing intent into the brief that the art director reads', () => {
    const briefs = variants.map((v) =>
      buildCanonicalCreativeBrief({
        userPrompt: v.request,
        goal: 'event_promotion',
        funnelStage: 'TOFU',
        intent: v.intent,
      }),
    );

    // Same event, but the briefs are not interchangeable.
    expect(new Set(briefs.map((b) => JSON.stringify(b.attentionHierarchy))).size).toBeGreaterThan(1);
    expect(briefs[1].offer).toBe('50% off');
    expect(briefs[0].offer).toBeUndefined();
    expect(briefs[3].offer).toBeUndefined();
  });
});

// ─── Same intent, different brands ───────────────────────────────────────────

describe('same intent, different brands — brand constrains, it does not compose', () => {
  const request = 'Foreign trips get 10% off';
  const intent = intentOf({ offer: '10% off', productCategory: 'foreign trips', requiredClaims: ['10% off'] });

  const brands = [
    resolveBrandProfile({ brand: { name: 'Meridian', tone: 'restrained, understated', personality: 'discreet, precise', targetAudience: 'private clients', brandColors: ['#12110f'] } }),
    resolveBrandProfile({ brand: { name: 'Hoplite', tone: 'blunt, cheap and proud of it', personality: 'loud, scrappy', targetAudience: 'students', brandColors: ['#ff3b00'] } }),
    resolveBrandProfile({ brand: { name: 'Wayfare', tone: 'warm, encouraging', personality: 'curious, communal', targetAudience: 'first-time backpackers', brandColors: ['#2f7d5b'] } }),
    resolveBrandProfile({ brand: { name: 'Continuum', tone: 'efficient, factual', personality: 'reliable, unshowy', targetAudience: 'corporate travel managers', brandColors: ['#1c3f7a'] } }),
  ];

  it('sends each brand its own strategy prompt for an identical request', async () => {
    const prompts = await Promise.all(
      brands.map((brand) => strategyPromptFor({ request, brand, creativeDna: neutralDna, intent, goal: 'sales' })),
    );

    expect(new Set(prompts).size).toBe(brands.length);
    expect(prompts[0]).toContain('private clients');
    expect(prompts[1]).toContain('students');
    expect(prompts[2]).toContain('first-time backpackers');
    expect(prompts[3]).toContain('corporate travel managers');

    // The strategist is told, in every case, that the brand does not decide the mechanism.
    const generateJson = vi.fn(async () => strategyPayload);
    await generateCreativeStrategy({
      provider: provider(generateJson), request, goal: 'sales', funnelStage: 'BOFU',
      platforms: [], hasAssets: false, brand: brands[0], creativeDna: neutralDna,
    });
    expect(generateJson.mock.calls[0][0].systemInstruction).toContain('It does NOT constrain the mechanism');
  });

  it('gives each brand its own voice in the brief, rather than one house voice', () => {
    const briefs = brands.map((brand) =>
      buildCanonicalCreativeBrief({ userPrompt: request, goal: 'sales', funnelStage: 'BOFU', brand, intent }),
    );

    // Before the brand-voice fix, every one of these read "confident and
    // distinctive" / ["authentic", "purposeful"] — the same voice for every
    // brand, because the fields being read did not exist.
    expect(new Set(briefs.map((b) => b.brandVoice.tone)).size).toBe(brands.length);
    expect(briefs[0].brandVoice.tone).toBe('restrained, understated');
    expect(briefs[1].brandVoice.personality).toEqual(['loud', 'scrappy']);
    expect(new Set(briefs.map((b) => b.brandVoice.personality.join('|'))).size).toBe(brands.length);
  });

  it('lets the SAME blueprint compose identically across brands — brand is not a layout', () => {
    // Two very different brands, one creative idea. The composition brief must
    // be identical: if a brand could change the composition on its own, the
    // brand would be a template.
    const concept: GraphicDesignConcept = {
      conceptName: 'Departure Board',
      visualIdea: 'The price behaves like a departures board flipping over.',
      creativeMechanism: 'modular typography that re-flips',
      typeBehavior: 'mechanical split-flap letterforms',
      imageBehavior: 'absent',
      spatialRelationship: 'the rows collide with the frame edge',
      hierarchyStrategy: 'the number leads; everything else is a timetable',
      dominantVisualObject: 'the flipping board',
      hero: 'typography',
      imageRole: 'omitted',
      firstRead: 'the number',
    };

    const instructions = brands.map(() =>
      buildCompositionInstructions({
        concept,
        requiredNodeList: '- id: "primary-hook" (kind: "copy")',
        isPureTypographicPoster: true,
      }),
    );

    expect(new Set(instructions).size).toBe(1);
  });

  it('lets a DIFFERENT blueprint compose differently for the same brand — the idea is the layout', () => {
    const base = {
      conceptName: 'X',
      hero: 'typography' as const,
      imageRole: 'omitted' as const,
      firstRead: 'x',
    };
    const a = buildCompositionInstructions({
      concept: { ...base, visualIdea: 'A departures board flipping.', creativeMechanism: 'modular typography', typeBehavior: 'split-flap rows', imageBehavior: 'absent' },
      requiredNodeList: '- id: "primary-hook" (kind: "copy")',
      isPureTypographicPoster: true,
    });
    const b = buildCompositionInstructions({
      concept: { ...base, visualIdea: 'A single unposed frame of the moment.', creativeMechanism: 'documentary moment', typeBehavior: 'a stamped caption', imageBehavior: 'the subject', hero: 'image', imageRole: 'full-bleed' },
      requiredNodeList: '- id: "hero-visual" (kind: "visual")',
      isPureTypographicPoster: false,
    });

    expect(a).not.toBe(b);
    expect(a).toContain('split-flap rows');
    expect(b).toContain('the subject');
  });
});

// ─── The copy plan cannot be widened downstream ──────────────────────────────

describe('the copy plan is a ceiling that nothing downstream can raise', () => {
  const kitchenSink: CreativeDirection = {
    concept: 'C', visualStory: 'S', subject: 'S', environment: '', composition: '', lighting: '',
    mood: 'plain', palette: ['#101010'], brandConstraints: [], productTreatment: '', background: '#fff',
    negativeVisualConstraints: [], aspectRatio: '1:1', platform: 'instagram', mode: 'EDITORIAL',
    artDirectionFamily: 'TYPOGRAPHY_LED', copyTreatment: 'headline_support',
    headline: 'TEN PERCENT',
    supportingLine: 'A supporting sentence nobody asked for.',
    cta: 'Book now',
    interactionInstructions: '',
    marketingCreative: {
      eventBadge: 'This weekend',
      brandMessage: 'Experience luxury travel, crafted in harmony.',
      secondaryInfo: ['Flights', 'Hotels', 'Packages', 'Cruises'],
    },
  };

  it('renders only the roles the idea named, however much copy exists', () => {
    // The direction authored nine candidate text blocks — the classic
    // "designed information card". The idea asked for one.
    const all = collectCampaignCopy(kitchenSink, []);
    expect(all.length).toBeGreaterThanOrEqual(8);

    const planned = collectCampaignCopy(kitchenSink, [], {
      requiredRoles: ['HEADLINE'],
      maxTextElements: 1,
      rationale: 'One statement.',
    });
    expect(planned.map((c) => c.text)).toEqual(['TEN PERCENT']);
  });

  it('drops generic marketing filler that no role asked for', () => {
    const planned = collectCampaignCopy(kitchenSink, [], {
      requiredRoles: ['HEADLINE', 'CTA'],
      maxTextElements: 2,
      rationale: 'A statement and an action.',
    });
    const text = planned.map((c) => c.text).join(' ');

    for (const filler of ['Experience luxury', 'crafted in harmony', 'Flights', 'Cruises', 'This weekend']) {
      expect(text).not.toContain(filler);
    }
  });

  it('never lets a plan authorise more elements than the roles it names', () => {
    // A plan claiming room for nine while naming two is the "fill the space"
    // instinct arriving by the back door.
    const planned = collectCampaignCopy(kitchenSink, [], {
      requiredRoles: ['HEADLINE', 'CTA'],
      maxTextElements: 9,
      rationale: 'Two roles.',
    });
    expect(planned.length).toBeLessThanOrEqual(2);
  });
});

// ─── No cross-request state ──────────────────────────────────────────────────

describe('no request inherits anything from the request before it', () => {
  it('art-directs two unrelated requests without either prompt mentioning the other', async () => {
    const brand = resolveBrandProfile({ brand: { name: 'Northwind' } });
    const prompts: string[] = [];

    for (const [request, event] of [
      ['Grand opening of our new location', 'Grand Opening'],
      ['Summer clearance, half price', 'Summer Clearance'],
    ] as const) {
      const generateJson = vi.fn(async () => ({
        conceptName: 'C', visualIdea: 'An idea.', creativeMechanism: 'm',
        hero: 'typography', imageRole: 'omitted', firstRead: 'x',
      }));
      await generateGraphicDesignConcept({
        provider: provider(generateJson),
        brief: buildCanonicalCreativeBrief({
          userPrompt: request, goal: 'event_promotion', funnelStage: 'TOFU', brand,
          intent: intentOf({ event, requiredClaims: [event] }),
        }),
      });
      prompts.push(generateJson.mock.calls[0][0].prompt as string);
    }

    expect(prompts[0]).toContain('Grand Opening');
    expect(prompts[0]).not.toContain('Summer Clearance');
    expect(prompts[1]).toContain('Summer Clearance');
    expect(prompts[1]).not.toContain('Grand Opening');
  });
});
