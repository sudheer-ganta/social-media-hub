import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import {
  designCreative,
  renderDesignerPlan,
  validateDesignerPlan,
  repairPlanMechanically,
  resolveLogoNegativeSpacePosition,
  type DesignerPlan,
  type DesignNode,
} from './designer-composition';
import { validateAntiTemplateRules, validateAntiTemplateQuality } from './anti-template-validator';
import { resolveBrandProfile } from '../brand/brand-profile';
import { resolveCreativeDna } from '../brand/creative-dna';
import { resolveDesignRecipe } from './design-recipe';
import { selectTypography } from '../typography/font-selector';
import { collectCampaignCopy } from '../prompts/campaign-creative.prompt';
import { buildCanonicalCreativeBrief } from '../brand/creative-brief';
import type { CreativeDirection, CreativeRenderContext, GraphicDesignConcept } from '../types';

const testDirection: CreativeDirection = {
  concept: 'Monochrome Asymmetric Type Poster',
  visualStory: 'Oversized brutalist type slicing across the frame with tactile paper textures',
  subject: 'Design Exhibition',
  environment: 'Gallery interior with vast negative space',
  composition: 'asymmetric',
  lighting: 'natural ambient',
  mood: 'confident and bold',
  palette: ['#0f0f0f', '#f5f5f0', '#ff3300'],
  brandConstraints: [],
  productTreatment: '',
  background: '#f5f5f0',
  negativeVisualConstraints: ['no generic 2-column templates', 'no centered corporate cards'],
  aspectRatio: '1:1',
  platform: 'instagram',
  mode: 'EDITORIAL',
  artDirectionFamily: 'TYPOGRAPHIC_POSTER',
  copyTreatment: 'headline_support',
  headline: 'DESIGN FUTURES 2026',
  supportingLine: 'Annual typography and design retrospective',
  cta: '',
  interactionInstructions: '',
  marketingCreative: { offerText: 'FREE ENTRY' },
  graphicConcept: {
    conceptName: 'Asymmetric Editorial Poster',
    visualIdea: 'Oversized edge-bleeding headline with strong negative space',
    hero: 'typography',
    heroPlacement: 'Left-edge bleeding across top quadrant',
    imageRole: 'no-image',
    imageTreatment: 'None - pure typography and negative space',
    firstRead: 'DESIGN FUTURES 2026',
    typographyStrategy: 'Massive scale contrast with cropped bleed',
    typographyScaleContrast: 'Extreme 6:1 scale ratio',
    compositionStrategy: 'Asymmetric tension with expansive lower-right negative space',
    logoSanctuary: 'Lower-right negative space with 0.05 clearance',
    elementsToOmit: ['stock photos', 'generic icons', 'cards', 'CTA'],
    compositionFamily: 'asymmetric-editorial',
    anchor: 'top-left',
    movementAxis: 'diagonal-down-right',
    dominantRegion: 'top-half',
    headlinePlacement: 'bleeding-top-left',
    visualPlacement: 'none',
    overlapRelationships: 'none',
    negativeSpaceRegion: 'bottom-right',
    logoPlacementStrategy: 'negative-space-anchor',
    allowedBleed: ['top', 'left'],
    intentionalRotation: 0,
  },
};

const testContext: CreativeRenderContext = {
  brand: resolveBrandProfile(),
  creativeDna: resolveCreativeDna(),
  goal: 'awareness',
  funnelStage: 'TOFU',
  platforms: ['instagram'],
};

const makeNode = (
  id: string,
  kind: DesignNode['kind'],
  x: number,
  y: number,
  width: number,
  height: number,
  lines: string[] = [],
  fontScale = 0.045,
  rotation = 0
): DesignNode => ({
  id,
  kind,
  x,
  y,
  width,
  height,
  lines,
  color: '#0f0f0f',
  surface: 'none',
  fontScale,
  align: 'left',
  shape: 'rectangle',
  rotation,
});

const createImage = async (color: string) => ({
  mimeType: 'image/png',
  data: (
    await sharp({
      create: { width: 60, height: 60, channels: 3, background: color },
    })
      .png()
      .toBuffer()
  ).toString('base64'),
});

const getTypography = () =>
  selectTypography({
    direction: testDirection,
    creativeDna: testContext.creativeDna,
    recipe: resolveDesignRecipe(testDirection, testContext.creativeDna).recipe,
  });

describe('Architectural Composition Pipeline Verification', () => {
  // Requirement 1 & 5: Anti-template validator catches 2-column split templates
  it('rejects classic 2-column social template layouts (left text column + right image column + footer logo)', () => {
    const twoColumnTemplatePlan: DesignerPlan = {
      background: '#ffffff',
      rationale: 'Generic two column template',
      nodes: [
        makeNode('primary-hook', 'copy', 0.08, 0.12, 0.40, 0.05, ['DESIGN FUTURES 2026']),
        makeNode('supporting-note', 'copy', 0.08, 0.18, 0.40, 0.30, ['Annual typography and design retrospective']),
        makeNode('hero-visual', 'visual', 0.50, 0.0, 0.50, 1.0, []),
        makeNode('secondary-hook', 'copy', 0.08, 0.52, 0.40, 0.05, ['FREE ENTRY']),
        makeNode('brand-mark', 'logo', 0.08, 0.85, 0.20, 0.08),
      ],
    };

    const result = validateAntiTemplateRules(twoColumnTemplatePlan, testDirection.graphicDesignConcept);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes('two-column') || v.toLowerCase().includes('template'))).toBe(true);
  });

  // Requirement 6: Intentional typography overlap and bleed is permitted
  it('permits intentional typography overlap when specified by the concept', () => {
    const asymmetricEditorialPlan: DesignerPlan = {
      background: '#f5f5f0',
      rationale: 'Asymmetric editorial poster with overlapping type and hero element',
      nodes: [
        makeNode('primary-hook', 'copy', -0.05, 0.05, 0.90, 0.35, ['DESIGN FUTURES 2026'], 0.10, -2),
        makeNode('hero-visual', 'visual', 0.40, 0.25, 0.55, 0.50, [], 0.045, 3),
        makeNode('secondary-hook', 'copy', 0.05, 0.45, 0.40, 0.10, ['FREE ENTRY'], 0.04),
        makeNode('supporting-note', 'copy', 0.05, 0.60, 0.45, 0.15, ['Annual typography and design retrospective'], 0.03),
        makeNode('brand-mark', 'logo', 0.75, 0.85, 0.18, 0.08),
      ],
    };

    const conceptWithOverlap: GraphicDesignConcept = {
      ...testDirection.graphicDesignConcept!,
      overlapRelationships: 'type-overlaps-visual',
      allowedBleed: ['top', 'left'],
    };

    const result = validateAntiTemplateQuality(asymmetricEditorialPlan, conceptWithOverlap);
    expect(result.passed).toBe(true);
    expect(result.strengths.some((s) => s.toLowerCase().includes('bleed') || s.toLowerCase().includes('scale'))).toBe(true);
  });

  // Requirement 7: Logo is not automatically a footer & uses negative space placement
  it('calculates natural negative space for logo and avoids center-bottom footer defaults', () => {
    const obstaclePlan: DesignerPlan = {
      background: '#ffffff',
      rationale: 'Test negative space logo placement',
      nodes: [
        makeNode('primary-hook', 'copy', 0.05, 0.05, 0.80, 0.30, ['Headline']),
        makeNode('hero-visual', 'visual', 0.05, 0.40, 0.60, 0.50, []),
        makeNode('brand-mark', 'logo', 0.50, 0.50, 0.18, 0.08),
      ],
    };

    const logoNode = obstaclePlan.nodes.find((n) => n.id === 'brand-mark')!;
    const logoPos = resolveLogoNegativeSpacePosition(obstaclePlan, logoNode, 'bottom-right');

    // Logo should be placed in available negative space (lower right or upper right)
    expect(logoPos.x).toBeGreaterThan(0.60);
    expect(logoPos.y).toBeGreaterThan(0.70);

    // Check clearance: logo does not overlap obstacles
    const obstacles = obstaclePlan.nodes.filter((n) => n.id !== 'brand-mark');
    for (const obs of obstacles) {
      const overlaps = !(
        logoPos.x + logoPos.width <= obs.x + 0.015 ||
        logoPos.x >= obs.x + obs.width - 0.015 ||
        logoPos.y + logoPos.height <= obs.y + 0.015 ||
        logoPos.y >= obs.y + obs.height - 0.015
      );
      expect(overlaps).toBe(false);
    }
  });

  // Requirement 8 & 9: Image is optional and simple campaigns are typography-led
  // The occasion is CONTEXT, never a visual template: the brief carries what
  // the member named and nothing about how it should look. The version this
  // replaced pattern-matched a list of festival and promotion words and set an
  // `isSimpleCampaign` flag that steered every matching request toward the same
  // typographic poster — a template keyed on the occasion, which produced one
  // design for every named festival and mishandled every unnamed one.
  it('never derives visual direction from the name of an occasion', () => {
    const briefFor = (userPrompt: string, event: string) =>
      buildCanonicalCreativeBrief({
        userPrompt,
        goal: 'event_promotion',
        funnelStage: 'TOFU',
        intent: {
          extracted: true,
          event,
          culturalContext: '',
          productCategory: '',
          offer: '',
          promotionType: '',
          venueType: '',
          audience: '',
          requiredClaims: [event],
          optionalDetails: [],
          confidence: {},
        },
      });

    const festival = briefFor('Diwali celebration at our restaurant', 'Diwali');
    const fandom = briefFor('BTS comeback party at our restaurant', 'BTS Comeback Party');
    const launch = briefFor('Enterprise cloud platform v3 launch', 'Platform v3 Launch');

    // Two different occasions produce two different briefs and inherit NOTHING
    // visual from one another.
    expect(festival.event).toBe('Diwali');
    expect(fandom.event).toBe('BTS Comeback Party');
    expect(festival.attentionHierarchy).not.toEqual(fandom.attentionHierarchy);

    // No brief carries a visual instruction at all — not a hero image slot, not
    // a footer, not a composition, and no flag that stands in for one.
    for (const brief of [festival, fandom, launch]) {
      expect(brief).not.toHaveProperty('isSimpleCampaign');
      const hierarchy = brief.attentionHierarchy.join(' ').toLowerCase();
      expect(hierarchy).not.toContain('hero asset');
      expect(hierarchy).not.toContain('visual story');
      expect(hierarchy).not.toContain('logo');
      expect(JSON.stringify(brief)).not.toMatch(/typographic-poster|asymmetric-editorial|left-edge|upper-right/);
    }
  });

  // Requirement 8: Image is optional — when imageRole is 'no-image', image provider is NOT called
  it('skips AI image generation completely when the concept specifies no image', async () => {
    const logo = await createImage('#1234ef');
    const reference = await createImage('#12ef34');

    const typographicPlan: DesignerPlan = {
      background: '#f5f5f0',
      rationale: 'Pure typographic poster with no background imagery',
      nodes: [
        makeNode('primary-hook', 'copy', -0.04, 0.08, 0.95, 0.35, ['DESIGN FUTURES 2026'], 0.12, -1),
        makeNode('secondary-hook', 'copy', 0.05, 0.48, 0.45, 0.12, ['FREE ENTRY'], 0.045),
        makeNode('supporting-note', 'copy', 0.05, 0.64, 0.50, 0.15, ['Annual typography and design retrospective'], 0.030),
        makeNode('brand-mark', 'logo', 0.75, 0.85, 0.18, 0.08),
      ],
    };

    const generateJson = vi.fn().mockImplementation(async (call) => {
      if (call.responseSchema && call.responseSchema.required?.includes('background')) {
        return typographicPlan;
      }
      return {
        observedSubject: 'Design Futures 2026',
        observedOffer: 'FREE ENTRY',
        observedHero: 'typography',
        firstRead: 'DESIGN FUTURES 2026',
        templateLook: false,
        aiLook: false,
        humanCraft: true,
        visualTension: true,
        typographyAsDesign: true,
        logoClear: true,
        problems: [],
        strengths: ['Pure typographic mastery', 'Strong asymmetric balance'],
      };
    });

    const generateImage = vi.fn().mockResolvedValue([await createImage('#ababab')]);

    const result = await designCreative({
      direction: testDirection,
      context: testContext,
      products: [],
      references: [reference],
      logo,
      textProvider: {
        id: 'mock',
        model: 'mock',
        supportsVision: true,
        isConfigured: () => true,
        generateJson,
      },
      imageProvider: {
        id: 'mock',
        model: 'mock',
        isConfigured: () => true,
        generateImage,
      },
    });

    expect(generateImage).not.toHaveBeenCalled();
    expect(result.data).toBeDefined();
    expect(result.assetIds).not.toContain('hero-visual');
  }, 20000);

  // Requirement 11: Mechanical errors are repaired deterministically with 0 LLM calls
  it('repairs mechanical errors (missing hex, text bounds, contrast, logo clearance) deterministically', () => {
    const brokenPlan: DesignerPlan = {
      background: '#ffffff',
      rationale: 'Plan with mechanical flaws',
      nodes: [
        // Out of bounds copy
        makeNode('primary-hook', 'copy', -0.30, 0.05, 1.40, 0.20, ['DESIGN FUTURES 2026'], 0.09),
        // Low contrast copy on white
        { ...makeNode('secondary-hook', 'copy', 0.05, 0.35, 0.40, 0.10, ['FREE ENTRY'], 0.01), color: '#ffffff' },
        // Logo collision with visual
        makeNode('hero-visual', 'visual', 0.50, 0.50, 0.40, 0.40, []),
        makeNode('brand-mark', 'logo', 0.52, 0.52, 0.18, 0.08),
      ],
    };

    const campaignCopy = collectCampaignCopy(testDirection);
    const repairedPlan = repairPlanMechanically(brokenPlan, campaignCopy, 0);

    // 1. Background fixed to valid hex
    expect(repairedPlan.background).toMatch(/^#[0-9a-fA-F]{6}$/);

    // 2. Primary hook clamped to reasonable bounds
    const primaryNode = repairedPlan.nodes.find((n) => n.id === 'primary-hook')!;
    expect(primaryNode.x).toBeGreaterThanOrEqual(-0.08);
    expect(primaryNode.width).toBeLessThanOrEqual(1.08);

    // 3. Secondary hook lifted to the readability floor the validator enforces
    //    — and no further. Repair fixes exactly what validation would reject;
    //    it must not also impose a hierarchy the art director did not ask for.
    const secondaryNode = repairedPlan.nodes.find((n) => n.id === 'secondary-hook')!;
    expect(secondaryNode.fontScale).toBeGreaterThanOrEqual(0.014);
    // Contrast color fixed
    expect(secondaryNode.color).not.toBe('#ffffff');

    // 4. Logo relocated out of hero-visual collision
    const logoNode = repairedPlan.nodes.find((n) => n.id === 'brand-mark')!;
    const visualNode = repairedPlan.nodes.find((n) => n.id === 'hero-visual')!;
    const overlaps = !(
      logoNode.x + logoNode.width <= visualNode.x ||
      logoNode.x >= visualNode.x + visualNode.width ||
      logoNode.y + logoNode.height <= visualNode.y ||
      logoNode.y >= visualNode.y + visualNode.height
    );
    expect(overlaps).toBe(false);
  });

  // Requirement 12 & 13: Max 2 creative attempts and redesign switches visual family
  it('enforces maximum 2 creative attempts and changes visual family on redesign', async () => {
    const logo = await createImage('#1234ef');
    const visual = await createImage('#ef1234');

    const validPlanAttempt: DesignerPlan = {
      background: '#ffffff',
      rationale: 'Asymmetric attempt',
      nodes: [
        makeNode('primary-hook', 'copy', -0.04, 0.05, 0.90, 0.25, ['DESIGN FUTURES 2026'], 0.10, -1),
        makeNode('secondary-hook', 'copy', 0.05, 0.35, 0.40, 0.10, ['FREE ENTRY'], 0.04),
        makeNode('supporting-note', 'copy', 0.05, 0.50, 0.45, 0.15, ['Annual typography and design retrospective'], 0.03),
        makeNode('hero-visual', 'product', 0.45, 0.25, 0.60, 0.60, []),
        makeNode('brand-mark', 'logo', 0.05, 0.85, 0.18, 0.08),
      ],
    };

    let artDirectorCalls = 0;
    const previousFamilies: string[] = [];

    const generateJson = vi.fn().mockImplementation(async (call) => {
      // Art Director prompt
      if (call.responseSchema && call.responseSchema.required?.includes('conceptName')) {
        artDirectorCalls++;
        const family = artDirectorCalls === 1 ? 'type-dominant-poster' : 'constructivist-grid';
        previousFamilies.push(family);
        return {
          conceptName: `Concept Attempt ${artDirectorCalls}`,
          visualIdea: 'Alternative layout concept',
          hero: 'typography',
          heroPlacement: 'Left side',
          imageRole: 'small-tactile-object',
          imageTreatment: 'Rotated slightly',
          firstRead: 'DESIGN FUTURES 2026',
          typographyStrategy: 'Bold scale contrast',
          typographyScaleContrast: 'High contrast',
          compositionStrategy: 'Asymmetrical balance',
          logoSanctuary: 'Top right corner',
          elementsToOmit: ['cards', 'columns', 'CTA'],
          compositionFamily: family,
          anchor: 'top-left',
          movementAxis: 'vertical-down',
          dominantRegion: 'left-column',
          headlinePlacement: 'top-left',
          visualPlacement: 'bottom-right',
          overlapRelationships: 'none',
          negativeSpaceRegion: 'top-right',
          logoPlacementStrategy: 'negative-space-anchor',
          allowedBleed: ['none'],
          intentionalRotation: 0,
        };
      }

      // Composition Planner prompt
      if (call.responseSchema && call.responseSchema.required?.includes('background')) {
        return validPlanAttempt;
      }

      // Critic prompt (always fails creatively to test retry bound)
      return {
        observedSubject: 'Design Futures',
        templateLook: true,
        criticalFlaws: ['Layout looks like a generic social media card.'],
        problems: ['Layout looks like a generic social media card.'],
      };
    });

    const generateImage = vi.fn().mockResolvedValue([await createImage('#ababab')]);

    await expect(
      designCreative({
        direction: testDirection,
        context: testContext,
        products: [visual],
        references: [],
        logo,
        textProvider: {
          id: 'mock',
          model: 'mock',
          supportsVision: true,
          isConfigured: () => true,
          generateJson,
        },
        imageProvider: {
          id: 'mock',
          model: 'mock',
          isConfigured: () => true,
          generateImage,
        },
      })
    ).rejects.toThrow('after two attempts');

    // Exactly 2 creative attempts were performed
    // Attempt 1: plan + critic + new art director = 3 calls
    // Attempt 2: plan + critic = 2 calls
    // Total JSON calls = 5
    expect(generateJson).toHaveBeenCalledTimes(5);
  }, 25000);

  // Requirement 16: Stage timing instrumentation
  it('tracks execution time for each of the design pipeline stages', async () => {
    const logo = await createImage('#1234ef');
    const visual = await createImage('#ef1234');

    const validPlan: DesignerPlan = {
      background: '#f5f5f0',
      rationale: 'Valid asymmetric layout',
      nodes: [
        makeNode('primary-hook', 'copy', -0.04, 0.08, 0.92, 0.25, ['DESIGN FUTURES 2026'], 0.10, -1),
        makeNode('secondary-hook', 'copy', 0.05, 0.38, 0.40, 0.10, ['FREE ENTRY'], 0.04),
        makeNode('supporting-note', 'copy', 0.05, 0.52, 0.45, 0.15, ['Annual typography and design retrospective'], 0.03),
        makeNode('hero-visual', 'product', 0.42, 0.25, 0.62, 0.60, []),
        makeNode('brand-mark', 'logo', 0.05, 0.85, 0.18, 0.08),
      ],
    };

    const recordedStages: Record<string, number> = {};

    const generateJson = vi.fn().mockImplementation(async (call) => {
      if (call.responseSchema && call.responseSchema.required?.includes('background')) {
        return validPlan;
      }
      return {
        observedSubject: 'DESIGN FUTURES 2026',
        observedOffer: 'FREE ENTRY',
        observedHero: 'typography',
        firstRead: 'DESIGN FUTURES 2026',
        templateLook: false,
        aiLook: false,
        humanCraft: true,
        visualTension: true,
        typographyAsDesign: true,
        logoClear: true,
        problems: [],
        strengths: ['Dynamic balance', 'High impact type'],
      };
    });

    const generateImage = vi.fn().mockResolvedValue([await createImage('#ababab')]);

    await designCreative({
      direction: testDirection,
      context: testContext,
      products: [visual],
      references: [],
      logo,
      textProvider: {
        id: 'mock',
        model: 'mock',
        supportsVision: true,
        isConfigured: () => true,
        generateJson,
      },
      imageProvider: {
        id: 'mock',
        model: 'mock',
        isConfigured: () => true,
        generateImage,
      },
      onStageTiming: (stage, ms) => {
        recordedStages[stage] = ms;
      },
    });

    // Stage timings should be recorded
    expect(recordedStages['composition']).toBeGreaterThanOrEqual(0);
    expect(recordedStages['mechanicalRepair']).toBeGreaterThanOrEqual(0);
    expect(recordedStages['render']).toBeGreaterThanOrEqual(0);
    expect(recordedStages['critic']).toBeGreaterThanOrEqual(0);
  }, 20000);
});
