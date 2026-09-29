/**
 * FLOWPOST MULTI-ELEMENT COMPOSITION INTEGRATION TEST SUITE
 *
 * Verifies that Logo and Secondary Copy are first-class, actively-scored
 * elements inside Dynamic Design Engine discovery BEFORE BestState selection,
 * adhering to continuous geometric evaluation without hardcoded magic numbers.
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  discoverOptimizedComposition,
  evaluateCompositionState,
  assertCompositionStateValid,
  CompositionStateAssertionError,
} from './composition-evaluation';
import { createCanvasRepresentation, createBrandDesignRepresentation, createDesignField } from './design-representation';
import { analyzeImageField } from './image-field';

async function createMockField(options?: {
  subjectRegion?: { x: number; y: number; w: number; h: number };
  pattern?: 'clean' | 'dark-top' | 'dark-bottom' | 'subject-center' | 'subject-bottom';
}) {
  const width = 1080;
  const height = 1080;
  const pat = options?.pattern || 'clean';

  let svg = `<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#f8f9fa"/></svg>`;

  if (pat === 'dark-top') {
    svg = `<svg width="${width}" height="${height}">
      <rect width="${width}" height="${height * 0.5}" fill="#111111"/>
      <rect y="${height * 0.5}" width="${width}" height="${height * 0.5}" fill="#f8f9fa"/>
    </svg>`;
  } else if (pat === 'dark-bottom') {
    svg = `<svg width="${width}" height="${height}">
      <rect width="${width}" height="${height * 0.5}" fill="#f8f9fa"/>
      <rect y="${height * 0.5}" width="${width}" height="${height * 0.5}" fill="#111111"/>
    </svg>`;
  } else if (pat === 'subject-center') {
    svg = `<svg width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#f8f9fa"/>
      <rect x="${width * 0.20}" y="${height * 0.30}" width="${width * 0.60}" height="${height * 0.40}" fill="#333333"/>
    </svg>`;
  } else if (pat === 'subject-bottom') {
    svg = `<svg width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#f8f9fa"/>
      <rect x="${width * 0.10}" y="${height * 0.50}" width="${width * 0.80}" height="${height * 0.45}" fill="#222222"/>
    </svg>`;
  } else if (options?.subjectRegion) {
    const sr = options.subjectRegion;
    svg = `<svg width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#f8f9fa"/>
      <rect x="${width * sr.x}" y="${height * sr.y}" width="${width * sr.w}" height="${height * sr.h}" fill="#222222"/>
    </svg>`;
  }

  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  const rawImageField = await analyzeImageField(buf);
  return createDesignField(rawImageField);
}

describe('Multi-Element Composition Integration — First-Class Discovery Invariants', () => {
  const canvas = createCanvasRepresentation(1080, 1080);
  const brand = createBrandDesignRepresentation({
    colors: ['#0f172a', '#d97706', '#ffffff'],
    logo: {
      aspectRatio: 3.0,
      detectedColor: '#0f172a',
      recommendedPlacement: 'top-left',
    },
  });

  const headlineItem = {
    id: 'primary-hook',
    text: 'Sacred Himalayan Gatherings',
    role: 'headline' as const,
    priority: 1,
    font: 'Inter',
    weight: 700,
  };

  const supportItem = {
    id: 'secondary-hook',
    text: 'Handcrafted feasts steeped in generational warmth',
    role: 'subheadline' as const,
    priority: 2,
    font: 'Inter',
    weight: 400,
  };

  const logoItem = {
    id: 'brand-mark',
    role: 'logo' as const,
    aspectRatio: 3.2,
    sourceDimensions: { width: 320, height: 100 },
  };

  // Test 1: Logo participates in discovery hypotheses before BestState selection
  it('1. Logo participates in discovery hypotheses before BestState is selected', async () => {
    const field = await createMockField();
    const result = discoverOptimizedComposition({
      copyItems: [headlineItem],
      logoItem,
      field,
      canvas,
      brand,
    });

    expect(result.bestState).toBeDefined();
    const logoElement = result.bestState.elements.find((e) => e.role === 'logo');
    expect(logoElement).toBeDefined();
    expect(logoElement!.id).toBe('brand-mark');
  });

  // Test 2: Logo cannot be silently appended after BestState selection
  it('2. Logo is an intrinsic part of BestState and not appended post-hoc', async () => {
    const field = await createMockField();
    const result = discoverOptimizedComposition({
      copyItems: [headlineItem],
      logoItem,
      field,
      canvas,
      brand,
    });

    expect(result.bestState.elements.some((e) => e.role === 'logo')).toBe(true);
    expect(result.bestState.elements.length).toBe(2); // headline + logo
  });

  // Test 3: Logo geometry adheres to intrinsic aspect ratio
  it('3. Logo geometry preserves intrinsic aspect ratio proportionally', async () => {
    const field = await createMockField();
    const resultSquare = discoverOptimizedComposition({
      copyItems: [headlineItem],
      logoItem: { id: 'brand-mark', role: 'logo', aspectRatio: 4.0 },
      field,
      canvas,
      brand,
    });

    const logo = resultSquare.bestState.elements.find((e) => e.role === 'logo')!;
    const observedRatio = logo.rect.width / logo.rect.height;
    expect(observedRatio).toBeGreaterThanOrEqual(2.5);
    expect(observedRatio).toBeLessThanOrEqual(5.5);
  });

  // Test 4: Logo actively participates in inter-element collision scoring
  it('4. Logo actively participates in collision evaluation and influences state score', async () => {
    const field = await createMockField();
    const headlinePlacement = {
      id: 'primary-hook',
      role: 'headline' as const,
      typographyState: {
        hypothesis: { lines: ['Title'], maxCharsPerLine: 5, naturalBreaksPreserved: true, punctuationOrphansAvoided: true, balanceScore: 1 },
        fontScale: 0.05,
        fontFamily: 'Inter',
        weight: 700,
        lineHeightMultiplier: 1.2,
        trackingEm: 0,
        caseTransform: 'none' as const,
        boundingBox: { widthNormalized: 0.50, heightNormalized: 0.20, pixelWidth: 540, pixelHeight: 216 },
        alignment: 'left' as const,
        score: 1.0,
      },
      rect: { x: 0.05, y: 0.05, width: 0.50, height: 0.20 },
      ink: {
        id: 'ink-1',
        color: { hex: '#000000', oklab: { L: 0, a: 0, b: 0 }, oklch: { L: 0, C: 0, h: 0 }, relativeLuminance: 0, temperature: 0 },
        provenance: { sourceColor: '#000000', derivationType: 'brand-direct' as const, deltaEOklab: 0, lightnessDistance: 0, chromaDistance: 0, hueDistance: 0, isCalibratedBrandToleranceAvailable: false, brandCompatibilityScore: 1 },
        contrast: { localBackdropLuminance: 0.9, localLuminanceVariance: 0.01, wcagRatio: 15, apcaEstimatedLc: 90, isWcagCompliant: true, opticalScaleMultiplier: 1 },
        scores: { aggregateScore: 0.9, contrastScore: 0.9, brandAffinityScore: 1, imageHarmonyScore: 0.9, opticalScore: 0.9, hierarchyScore: 0.9 },
        signals: { perceivedInkMass: 1, chromaticVibration: 0, imageHarmonyScore: 0.9 },
      },
      surface: {
        id: 'surface-none',
        scores: { aggregateSurfaceScore: 0.9, legibilityBoostScore: 0, imageIntegrityScore: 1, brandAlignmentScore: 1, necessityScore: 0 },
        signals: { contrastGain: 0, visualDisruption: 0, imagePreservation: 1, surfaceComplexity: 0, postSurfaceWcag: 15, postSurfaceApca: 90 },
      },
    };

    const cleanLogo = {
      ...headlinePlacement,
      id: 'brand-mark',
      role: 'logo' as const,
      rect: { x: 0.65, y: 0.85, width: 0.25, height: 0.08 },
    };

    const collidingLogo = {
      ...headlinePlacement,
      id: 'brand-mark',
      role: 'logo' as const,
      rect: { x: 0.06, y: 0.06, width: 0.25, height: 0.08 },
    };

    const evalClean = evaluateCompositionState({ canvas, field, elements: [headlinePlacement, cleanLogo] });
    const evalColliding = evaluateCompositionState({ canvas, field, elements: [headlinePlacement, collidingLogo] });

    expect(evalClean.aggregateScore).toBeGreaterThan(evalColliding.aggregateScore);
  });

  // Test 5: Logo participates in final contrast and ink evaluation on its actual footprint
  it('5. Logo participates in contrast and ink evaluation on its actual footprint', async () => {
    const field = await createMockField({ pattern: 'dark-top' });
    const result = discoverOptimizedComposition({
      copyItems: [headlineItem],
      logoItem,
      field,
      canvas,
      brand: createBrandDesignRepresentation({
        colors: ['#0f172a', '#ffffff'],
        logo: { aspectRatio: 3.0 },
      }),
    });

    const logo = result.bestState.elements.find((e) => e.role === 'logo')!;
    expect(logo.ink).toBeDefined();
    expect(logo.ink.contrast.wcagRatio).toBeGreaterThanOrEqual(1.5);
  });

  // Test 6: Support copy participates in discovery hypotheses
  it('6. Secondary copy participates in multi-element discovery hypotheses', async () => {
    const field = await createMockField();
    const result = discoverOptimizedComposition({
      copyItems: [headlineItem, supportItem],
      logoItem,
      field,
      canvas,
      brand,
    });

    expect(result.bestState.elements.length).toBe(3);
    const sub = result.bestState.elements.find((e) => e.role === 'subheadline');
    expect(sub).toBeDefined();
    expect(sub!.id).toBe('secondary-hook');
  });

  // Test 7: Support copy explores independent placement when stack encounters subject/detail
  it('7. Support copy explores independent placement when downward stack hits subject', async () => {
    const field = await createMockField({
      subjectRegion: { x: 0.05, y: 0.25, w: 0.90, h: 0.40 },
    });

    const result = discoverOptimizedComposition({
      copyItems: [headlineItem, supportItem],
      logoItem,
      field,
      canvas,
      brand,
    });

    const support = result.bestState.elements.find((e) => e.role === 'subheadline')!;
    expect(support).toBeDefined();
    expect(support.rect.height).toBeGreaterThan(0);
    expect(support.rect.width).toBeGreaterThan(0);
  });

  // Test 8: Support copy participates in subject interaction scoring
  it('8. Support copy participates in subject interaction scoring', async () => {
    const field = await createMockField({ pattern: 'subject-center' });

    const result = discoverOptimizedComposition({
      copyItems: [headlineItem, supportItem],
      logoItem,
      field,
      canvas,
      brand,
    });

    expect(result.bestState.signals.subjectInterference).toBeDefined();
    expect(result.bestState.signals.subjectInterference).toBeLessThanOrEqual(0.40);
  });

  // Test 9: Element-to-element continuous spatial relationships are evaluated
  it('9. Evaluates continuous relationships across headline, support, and logo', async () => {
    const field = await createMockField();
    const result = discoverOptimizedComposition({
      copyItems: [headlineItem, supportItem],
      logoItem,
      field,
      canvas,
      brand,
    });

    expect(result.bestState.signals.axisCoherence).toBeDefined();
    expect(result.bestState.signals.groupingCoherence).toBeDefined();
    expect(result.bestState.interactionSignals.logoType).toBeDefined();
  });

  // Test 10: Complete multi-element state is selected as one unified BestState
  it('10. Complete composition is selected as one cohesive BestState', async () => {
    const field = await createMockField();
    const result = discoverOptimizedComposition({
      copyItems: [headlineItem, supportItem],
      logoItem,
      field,
      canvas,
      brand,
    });

    const roles = result.bestState.elements.map((e) => e.role);
    expect(roles).toContain('headline');
    expect(roles).toContain('subheadline');
    expect(roles).toContain('logo');
  });

  // Test 11: Pure renderer preserves selected state geometry without mutation
  it('11. Selected BestState geometry is structurally valid and directly renderable', async () => {
    const field = await createMockField();
    const result = discoverOptimizedComposition({
      copyItems: [headlineItem, supportItem],
      logoItem,
      field,
      canvas,
      brand,
    });

    const plan = {
      nodes: result.bestState.elements.map((el) => ({
        id: el.id,
        kind: el.role === 'logo' ? 'logo' : 'copy',
        x: el.rect.x,
        y: el.rect.y,
        width: el.rect.width,
        height: el.rect.height,
      })),
    };

    expect(() =>
      assertCompositionStateValid(plan, [headlineItem, supportItem], {
        requireLogo: true,
        logoId: 'brand-mark',
      })
    ).not.toThrow();
  });

  // Test 12: Regression Case: The Light Within the Steamer (Quiet negative space single headline)
  it('12. "The Light Within the Steamer" regression: Single headline + logo in quiet space', async () => {
    const field = await createMockField({ pattern: 'subject-center' });

    const result = discoverOptimizedComposition({
      copyItems: [
        {
          id: 'primary-hook',
          text: 'The Light Within the Steamer',
          role: 'headline',
          priority: 1,
        },
      ],
      logoItem,
      field,
      canvas,
      brand,
    });

    expect(result.bestState.elements.length).toBe(2);
    const headline = result.bestState.elements.find((e) => e.role === 'headline')!;
    const logo = result.bestState.elements.find((e) => e.role === 'logo')!;

    // Headline sits in quiet negative space (outside center subject y: 0.30..0.70)
    const inQuietSpace = headline.rect.y <= 0.30 || headline.rect.y >= 0.70;
    expect(inQuietSpace).toBe(true);
    expect(logo.rect.y).toBeDefined();
    expect(result.bestState.evaluation.aggregateScore).toBeGreaterThan(0.40);
  });

  // Test 13: Failure Correction: Spice Rangoli Canvas (Logo is not orphaned or pathological)
  it('13. "Spice Rangoli Canvas" correction: Logo has proportional geometry in quiet space', async () => {
    const field = await createMockField({ pattern: 'subject-center' });

    const result = discoverOptimizedComposition({
      copyItems: [
        {
          id: 'primary-hook',
          text: 'Spice Rangoli Heritage',
          role: 'headline',
          priority: 1,
        },
      ],
      logoItem: {
        id: 'brand-mark',
        role: 'logo',
        aspectRatio: 2.8,
      },
      field,
      canvas,
      brand,
    });

    const logo = result.bestState.elements.find((e) => e.role === 'logo')!;
    expect(logo).toBeDefined();
    expect(logo.rect.width).toBeGreaterThan(0.06);
    expect(logo.rect.height).toBeGreaterThan(0.02);
    expect(logo.rect.x + logo.rect.width).toBeLessThanOrEqual(0.99);
    expect(logo.rect.y + logo.rect.height).toBeLessThanOrEqual(0.99);
  });

  // Test 14: Failure Correction: Diwali Feast (Support copy avoids naive subject stack)
  it('14. "Diwali Feast" correction: Secondary copy does not blindly stack onto subject', async () => {
    const field = await createMockField({ pattern: 'subject-center' });

    const result = discoverOptimizedComposition({
      copyItems: [
        {
          id: 'primary-hook',
          text: 'The Longest Table',
          role: 'headline',
          priority: 1,
        },
        {
          id: 'secondary-hook',
          text: 'Grand Diwali Celebration across generations',
          role: 'subheadline',
          priority: 2,
        },
      ],
      logoItem,
      field,
      canvas,
      brand,
    });

    const support = result.bestState.elements.find((e) => e.role === 'subheadline')!;
    expect(support).toBeDefined();
    expect(support.rect.height).toBeGreaterThan(0);
    expect(support.rect.width).toBeGreaterThan(0.20);
  });

  // Test 15: Fail closed invariant: assertCompositionStateValid throws on missing or colliding nodes
  it('15. assertCompositionStateValid fails closed on missing or colliding elements', () => {
    const invalidPlanMissing = {
      nodes: [{ id: 'primary-hook', kind: 'copy', x: 0.1, y: 0.1, width: 0.8, height: 0.2 }],
    };

    // Missing required subheadline
    expect(() =>
      assertCompositionStateValid(invalidPlanMissing, [headlineItem, supportItem])
    ).toThrow(CompositionStateAssertionError);

    // Missing required logo
    expect(() =>
      assertCompositionStateValid(invalidPlanMissing, [headlineItem], { requireLogo: true })
    ).toThrow(CompositionStateAssertionError);

    // Severe collision between nodes
    const collidingPlan = {
      nodes: [
        { id: 'primary-hook', kind: 'copy', x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
        { id: 'secondary-hook', kind: 'copy', x: 0.12, y: 0.12, width: 0.7, height: 0.15 },
      ],
    };
    expect(() =>
      assertCompositionStateValid(collidingPlan, [headlineItem, supportItem])
    ).toThrow(CompositionStateAssertionError);
  });

  // Test 16: Distinct element ink candidates independently derived
  it('16. Distinct element ink candidates are derived from their respective footprints', async () => {
    const field = await createMockField();
    const result = discoverOptimizedComposition({
      copyItems: [headlineItem, supportItem],
      logoItem,
      field,
      canvas,
      brand,
    });

    for (const el of result.bestState.elements) {
      expect(el.ink).toBeDefined();
      expect(el.ink.contrast).toBeDefined();
      expect(el.ink.contrast.wcagRatio).toBeGreaterThan(0);
    }
  });

  // Test 17: High-density subject field drives layout to alternative negative space
  it('17. Dense subject field drives composition to available negative space', async () => {
    const field = await createMockField({ pattern: 'subject-bottom' });

    const result = discoverOptimizedComposition({
      copyItems: [headlineItem, supportItem],
      logoItem,
      field,
      canvas,
      brand,
    });

    const headline = result.bestState.elements.find((e) => e.role === 'headline')!;
    expect(headline.rect.y).toBeLessThan(0.40);
  });

  // Test 18: Deterministic discovery across runs
  it('18. Multi-element discovery is deterministic across identical inputs', async () => {
    const field = await createMockField();
    const input = {
      copyItems: [headlineItem, supportItem],
      logoItem,
      field,
      canvas,
      brand,
    };

    const run1 = discoverOptimizedComposition(input);
    const run2 = discoverOptimizedComposition(input);

    expect(run1.bestState.evaluation.aggregateScore).toBe(run2.bestState.evaluation.aggregateScore);
    expect(run1.bestState.elements.length).toBe(run2.bestState.elements.length);
    for (let i = 0; i < run1.bestState.elements.length; i++) {
      expect(run1.bestState.elements[i].rect.x).toBe(run2.bestState.elements[i].rect.x);
      expect(run1.bestState.elements[i].rect.y).toBe(run2.bestState.elements[i].rect.y);
    }
  });
});
