import { describe, it, expect, vi } from 'vitest';
import { generateGraphicDesignConcept, readCopyPlan } from './art-director.generator';
import { buildCanonicalCreativeBrief } from '../brand/creative-brief';
import { compareGraphicConcepts } from '../strategy/concept-similarity';
import type { AiTextProvider } from '../providers';
import type { CreativeStrategy, GraphicDesignConcept } from '../types';

const provider = (generateJson: AiTextProvider['generateJson']): AiTextProvider => ({
  id: 'mock',
  model: 'mock-model',
  supportsVision: false,
  isConfigured: () => true,
  generateJson,
});

const strategy = (overrides: Partial<CreativeStrategy> = {}): CreativeStrategy => ({
  communicationIdea: 'The kitchen keeps working while everyone else is celebrating.',
  creativeMechanism: 'documentary moment',
  emotionalDirection: 'quiet respect',
  brandConnection: 'This kitchen has never closed for the holiday.',
  visualOpportunity: 'A single unposed frame carries the whole message.',
  prohibitedVisualCliches: ['a family smiling around a table', 'gold ornament borders'],
  ...overrides,
});

/** A blueprint the art director might return, with only the fields a test cares about. */
const blueprint = (overrides: Record<string, unknown> = {}) => ({
  conceptName: 'Service Continues',
  visualIdea: 'One unposed frame of the pass at the moment the room fills up.',
  creativeMechanism: 'documentary moment',
  typeBehavior: 'small stamped caption, deliberately subordinate to the frame',
  imageBehavior: 'the subject — a single cinematic crop carrying the whole message',
  graphicBehavior: 'none',
  spatialRelationship: 'the caption sits inside the photograph, printed onto it',
  hierarchyStrategy: 'the photograph leads completely; words are a footnote',
  dominantVisualObject: 'the pass at service',
  hero: 'image',
  imageRole: 'full-bleed',
  firstRead: 'the moment itself',
  copyPlan: { requiredRoles: ['HEADLINE'], maxTextElements: 1, rationale: 'The frame carries the idea.' },
  elementsToOmit: ['CTA button'],
  ...overrides,
});

describe('generateGraphicDesignConcept', () => {
  it('hands the art director the strategy, its context and its prohibitions — and executes the mechanism', async () => {
    const brief = buildCanonicalCreativeBrief({
      userPrompt: 'Diwali promotion for our restaurant, 20% off',
      goal: 'event_promotion',
      funnelStage: 'TOFU',
      concept: {
        conceptName: 'Service Continues',
        bigIdea: 'The kitchen keeps working while everyone else is celebrating.',
        visualMechanism: 'documentary moment',
      },
      productAssetUrls: ['https://cdn.example.com/dish.png'],
      logoAssetUrl: 'https://cdn.example.com/logo.png',
    });

    const generateJson = vi.fn(async () => blueprint());
    const concept = await generateGraphicDesignConcept({
      provider: provider(generateJson),
      brief,
      strategy: strategy({
        domainContext: {
          occasion: 'Diwali',
          meaning: 'A festival of renewal spent with the people you choose.',
          relevantSymbols: ['oil lamps', 'rangoli'],
          emotionalAssociations: ['homecoming'],
          sensitivities: ['never treat it as generic "Indian decoration"'],
          visualClichesToAvoid: ['a wall of floating diyas', 'gold-on-maroon gradient'],
        },
      }),
    });

    const prompt = generateJson.mock.calls[0][0].prompt;
    expect(prompt).toContain('CREATIVE STRATEGY');
    expect(prompt).toContain('documentary moment');
    // Context reaches the art director as MEANING, explicitly marked as not a visual instruction.
    expect(prompt).toContain('this informs the idea, it does not dictate the design');
    expect(prompt).toContain('A festival of renewal');
    expect(prompt).toContain('never required, never decoration');
    // Both the strategy's own prohibitions and the domain's exhausted moves.
    expect(prompt).toContain('a family smiling around a table');
    expect(prompt).toContain('a wall of floating diyas');

    expect(concept.creativeMechanism).toBe('documentary moment');
    expect(concept.dominantVisualObject).toBe('the pass at service');
    expect(concept.spatialRelationship).toContain('printed onto it');
    // Everything the strategy forbade travels into the blueprint's omissions.
    expect(concept.elementsToOmit).toContain('a wall of floating diyas');
    expect(concept.elementsToOmit).toContain('a family smiling around a table');
  });

  it('leaves undecided placements ABSENT rather than defaulting to text-left / image-right / logo-corner', async () => {
    const brief = buildCanonicalCreativeBrief({
      userPrompt: 'New SaaS product launch',
      goal: 'product_launch',
      funnelStage: 'TOFU',
    });

    // The art director answered the idea and deliberately left every placement
    // field empty — the exact case the old generator filled with 'left-edge',
    // 'left-major', 'upper-right' and an oversized-headline scale ratio.
    const generateJson = vi.fn(async () => ({
      ...blueprint(),
      heroPlacement: '',
      headlinePlacement: '',
      visualPlacement: '',
      anchor: '',
      movementAxis: '',
      dominantRegion: '',
      negativeSpaceRegion: '',
      compositionFamily: '',
      typographyScaleContrast: '',
      logoSanctuary: '',
    }));

    const concept = await generateGraphicDesignConcept({ provider: provider(generateJson), brief });

    expect(concept.heroPlacement).toBeUndefined();
    expect(concept.headlinePlacement).toBeUndefined();
    expect(concept.visualPlacement).toBeUndefined();
    expect(concept.anchor).toBeUndefined();
    expect(concept.dominantRegion).toBeUndefined();
    expect(concept.negativeSpaceRegion).toBeUndefined();
    expect(concept.compositionFamily).toBeUndefined();
    expect(concept.typographyScaleContrast).toBeUndefined();
    expect(concept.logoSanctuary).toBeUndefined();

    // The idea itself survived intact — absence of a layout is not absence of a design.
    expect(concept.creativeMechanism).toBe('documentary moment');
    expect(concept.hierarchyStrategy).toContain('photograph leads');
  });

  it('carries an optional copy plan and never invents one', async () => {
    const brief = buildCanonicalCreativeBrief({ userPrompt: 'Sale', goal: 'sales', funnelStage: 'BOFU' });

    const withPlan = await generateGraphicDesignConcept({
      provider: provider(vi.fn(async () => blueprint())),
      brief,
    });
    expect(withPlan.copyPlan).toEqual({
      requiredRoles: ['HEADLINE'],
      maxTextElements: 1,
      rationale: 'The frame carries the idea.',
    });

    const withoutPlan = await generateGraphicDesignConcept({
      provider: provider(vi.fn(async () => blueprint({ copyPlan: { requiredRoles: [], maxTextElements: 6, rationale: '' } }))),
      brief,
    });
    // An empty plan is "undecided", never "include everything".
    expect(withoutPlan.copyPlan).toBeUndefined();
  });

  it('caps a copy plan at the roles it names, so a plan can never authorise filler', () => {
    const plan = readCopyPlan({ requiredRoles: ['HEADLINE', 'OFFER'], maxTextElements: 7, rationale: 'x' });
    expect(plan?.maxTextElements).toBe(2);
  });

  it('names the rejected IDEA, not the rejected layout, when redesigning', async () => {
    const brief = buildCanonicalCreativeBrief({
      userPrompt: '20% off foreign trips',
      goal: 'sales',
      funnelStage: 'BOFU',
    });

    const previousConcept = blueprint() as unknown as GraphicDesignConcept;
    const generateJson = vi.fn(async () => blueprint({ conceptName: 'Departure Board' }));

    await generateGraphicDesignConcept({
      provider: provider(generateJson),
      brief,
      previousConcept,
      redesignFeedback: 'Previous layout looked too much like a generic card.',
    });

    const prompt = generateJson.mock.calls[0][0].prompt;
    expect(prompt).toContain('REJECTED BLUEPRINT');
    expect(prompt).toContain('generic card');
    // The exclusion is stated on the idea axes...
    expect(prompt).toContain('Rejected mechanism: "documentary moment"');
    expect(prompt).toContain('Rejected dominant object: "the pass at service"');
    // ...and the prompt says explicitly that moving the layout is not a redesign.
    expect(prompt).toContain('A different compositionFamily is NOT a redesign');
  });

  it('never carries an occasion into the blueprint as a visual instruction', async () => {
    const brief = buildCanonicalCreativeBrief({
      userPrompt: 'Christmas menu launch',
      goal: 'event_promotion',
      funnelStage: 'TOFU',
    });

    const generateJson = vi.fn(async () => blueprint());
    await generateGraphicDesignConcept({
      provider: provider(generateJson),
      brief,
      strategy: strategy({
        domainContext: {
          occasion: 'Christmas',
          meaning: 'A pause in the year.',
          relevantSymbols: ['evergreen', 'candlelight'],
          emotionalAssociations: ['warmth'],
          sensitivities: [],
          visualClichesToAvoid: ['red-and-green everything'],
        },
      }),
    });

    const prompt = generateJson.mock.calls[0][0].prompt;
    // Symbols appear, but only ever labelled as available — never as a requirement.
    expect(prompt).toContain('evergreen');
    expect(prompt).toMatch(/Symbols AVAILABLE to the idea \(never required, never decoration\)[^\n]*evergreen/);
    expect(prompt).not.toMatch(/add (?:evergreen|candlelight)/i);
    // And the standing instruction forbids reasoning from occasion to layout.
    expect(generateJson.mock.calls[0][0].systemInstruction).toContain('this is an occasion, therefore a poster');
  });
});

describe('two blueprints for the same request', () => {
  const documentary = blueprint() as unknown as GraphicDesignConcept;

  it('reads a colour/family swap of one idea as ONE creative structure', () => {
    // Concept 1 and Concept 2 from spec §12: same everything, different family.
    const restyled = {
      ...documentary,
      conceptName: 'Service Continues (Warm)',
      compositionFamily: 'split-contrast',
    } as GraphicDesignConcept;

    const report = compareGraphicConcepts(documentary, restyled);
    expect(report.tooSimilar).toBe(true);
    expect(report.reason).toContain('one creative structure');
  });

  it('reads a genuinely different mechanism as a different design', () => {
    const typographic = {
      conceptName: 'Sold Out',
      visualIdea: 'The menu itself is set as a wall of type that runs out of room.',
      creativeMechanism: 'modular typography that overruns its own grid',
      typeBehavior: 'the entire piece — letterforms are the only material present',
      imageBehavior: 'absent',
      graphicBehavior: 'a rule system the words break out of',
      spatialRelationship: 'words collide with the canvas edge and are cut by it',
      hierarchyStrategy: 'no single leader; density itself is the message',
      dominantVisualObject: 'a wall of letterforms',
      hero: 'typography',
      imageRole: 'omitted',
      firstRead: 'the wall of names',
    } as GraphicDesignConcept;

    expect(compareGraphicConcepts(documentary, typographic).tooSimilar).toBe(false);
  });
});
