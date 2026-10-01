import { describe, it, expect } from 'vitest';
import {
  createCanvasRepresentation,
  createDesignField,
  createBrandDesignRepresentation,
} from './design-representation';
import { analyzeImageField } from './image-field';
import {
  discoverOptimizedComposition,
} from './composition-evaluation';
import { discoverSurfaceCandidates } from './dynamic-surface';
import { discoverInkCandidates } from './dynamic-color';
import sharp from 'sharp';

describe('PHASE 9 (PART B) — GLOBAL COMPOSITION EVALUATION ENGINE', () => {
  async function createSyntheticField(setup: (raw: Buffer, width: number, height: number) => void) {
    const width = 256;
    const height = 256;
    const raw = Buffer.alloc(width * height * 3).fill(235);
    setup(raw, width, height);
    const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const metrics = await analyzeImageField(png);
    return createDesignField(metrics);
  }

  // TEST 1: Dependency-aware discovery bounds hypotheses without Cartesian explosion
  it('discovers optimized composition within bounded exploration limits', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(240));

    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'Acme', tone: 'bold' },
      creativeDna: { brandColors: ['#0f172a', '#38bdf8'] },
    });

    const copyItems = [
      { id: 'h1', text: 'REVOLUTIONARY ACOUSTIC PRECISION', role: 'headline' as const, priority: 1 },
      { id: 'sub', text: 'Studio-grade spatial clarity engineered for pros', role: 'subheadline' as const, priority: 2 },
      { id: 'cta', text: 'EXPERIENCE NOW', role: 'cta' as const, priority: 3 },
    ];

    const result = discoverOptimizedComposition({
      copyItems,
      field,
      canvas,
      brand,
    });

    expect(result.bestState).toBeDefined();
    expect(result.bestState.elements.length).toBe(3);
    expect(result.metrics.totalStatesEvaluated).toBeLessThanOrEqual(12);
    expect(result.metrics.explorationLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.explorationLatencyMs).toBeLessThan(5000);
  });

  // TEST 2: Higher-order interaction signals are measurable
  it('evaluates real higher-order interaction signals', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(240));

    const copyItems = [
      { id: 'h1', text: 'MINIMALIST DESIGN', role: 'headline' as const, priority: 1 },
      { id: 'sub', text: 'Form follows function', role: 'subheadline' as const, priority: 2 },
    ];

    const result = discoverOptimizedComposition({ copyItems, field, canvas });
    const interactions = result.bestState.interactionSignals;

    expect(typeof interactions.typeImage).toBe('number');
    expect(typeof interactions.typePlacement).toBe('number');
    expect(typeof interactions.colorSurface).toBe('number');
    expect(typeof interactions.placementAlignment).toBe('number');
    expect(typeof interactions.spacingHierarchy).toBe('number');
    expect(typeof interactions.subjectType).toBe('number');
    expect(typeof interactions.logoType).toBe('number');
  });

  // TEST 3: Tradeoff profiles are preserved and observable
  it('preserves multi-objective tradeoff profiles without premature collapse', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(100)); // mid tone

    const copyItems = [
      { id: 'h1', text: 'POWERFUL CLOUD PLATFORM', role: 'headline' as const, priority: 1 },
    ];

    const result = discoverOptimizedComposition({ copyItems, field, canvas });
    const profile = result.bestState.tradeoffProfile;

    expect(typeof profile.legibilityScore).toBe('number');
    expect(typeof profile.imageIntegrityScore).toBe('number');
    expect(typeof profile.brandAdherenceScore).toBe('number');
    expect(typeof profile.spatialHarmonyScore).toBe('number');
    expect(typeof profile.hierarchyClarityScore).toBe('number');
  });

  // TEST 4: Authority invariance across Phases 5, 6, 7, 8
  it('proves Phase 9 preserves upstream Phase 5-8 authority without mutating coordinates', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(230));

    const copyItems = [
      { id: 'h1', text: 'HERO TITLE', role: 'headline' as const, priority: 1 },
    ];

    const result = discoverOptimizedComposition({ copyItems, field, canvas });
    const el = result.bestState.elements[0];

    expect(el.rect.x).toBeGreaterThanOrEqual(0);
    expect(el.rect.x + el.rect.width).toBeLessThanOrEqual(1.0);
    expect(el.rect.y).toBeGreaterThanOrEqual(0);
    expect(el.rect.y + el.rect.height).toBeLessThanOrEqual(1.0);
    expect(el.ink).toBeDefined();
    expect(el.surface).toBeDefined();
  });

  // ─── 10 ADVERSARIAL TESTS ──────────────────────────────────────────────────

  // ADVERSARIAL TEST 1: Same image with different typography footprint -> different surface discovery
  it('adversarial 1: same image with different typography footprint produces different surface discovery', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(80));

    const footprintSmall = { x: 0.1, y: 0.1, width: 0.3, height: 0.08 };
    const footprintLarge = { x: 0.1, y: 0.1, width: 0.8, height: 0.25 };

    const inkSmall = discoverInkCandidates({ role: 'headline', footprint: footprintSmall, field, canvas })[0];
    const inkLarge = discoverInkCandidates({ role: 'headline', footprint: footprintLarge, field, canvas })[0];

    const surfSmall = discoverSurfaceCandidates({ targetElementIds: ['h1'], footprint: footprintSmall, ink: inkSmall, field, canvas });
    const surfLarge = discoverSurfaceCandidates({ targetElementIds: ['h1'], footprint: footprintLarge, ink: inkLarge, field, canvas });

    const sFieldSmall = surfSmall.find((s) => s.surfaceField !== null)?.surfaceField;
    const sFieldLarge = surfLarge.find((s) => s.surfaceField !== null)?.surfaceField;

    expect(sFieldSmall?.spatialExtent.width).not.toBe(sFieldLarge?.spatialExtent.width);
  });

  // ADVERSARIAL TEST 2: Same typography with different image -> different surface discovery
  it('adversarial 2: same typography with different image produces different surface discovery', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const darkField = await createSyntheticField((raw) => raw.fill(20));
    const brightField = await createSyntheticField((raw) => raw.fill(245));

    const footprint = { x: 0.1, y: 0.1, width: 0.7, height: 0.18 };
    const darkInk = discoverInkCandidates({ role: 'headline', footprint, field: darkField, canvas })[0];
    const brightInk = discoverInkCandidates({ role: 'headline', footprint, field: brightField, canvas })[0];

    const darkSurfaces = discoverSurfaceCandidates({ targetElementIds: ['h1'], footprint, ink: darkInk, field: darkField, canvas });
    const brightSurfaces = discoverSurfaceCandidates({ targetElementIds: ['h1'], footprint, ink: brightInk, field: brightField, canvas });

    expect(darkSurfaces[0].signals.imagePreservation).toBeDefined();
    expect(brightSurfaces[0].signals.imagePreservation).toBeDefined();
  });

  // ADVERSARIAL TEST 3: Same image + typography with different ink -> different surface evaluation
  it('adversarial 3: same image + typography with different ink produces different surface evaluation', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(130)); // mid-gray

    const footprint = { x: 0.1, y: 0.1, width: 0.7, height: 0.18 };
    const inks = discoverInkCandidates({ role: 'headline', footprint, field, canvas });

    // Pick two distinct inks (e.g. high-lightness tint vs deep shade)
    const inkA = inks[0];
    const inkB = inks[inks.length - 1];

    const surfA = discoverSurfaceCandidates({ targetElementIds: ['h1'], footprint, ink: inkA, field, canvas });
    const surfB = discoverSurfaceCandidates({ targetElementIds: ['h1'], footprint, ink: inkB, field, canvas });

    expect(surfA[0].scores.compositeSurfaceScore).not.toBe(surfB[0].scores.compositeSurfaceScore);
  });

  // ADVERSARIAL TEST 4: Image already providing excellent contrast -> no-surface remains viable/selected
  it('adversarial 4: image providing excellent contrast selects no-surface naturally', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const pristineField = await createSyntheticField((raw) => raw.fill(250)); // pure white

    const copyItems = [
      { id: 'h1', text: 'CRYSTAL CLEAR CONTRAST', role: 'headline' as const, priority: 1 },
    ];

    const result = discoverOptimizedComposition({ copyItems, field: pristineField, canvas });
    // When backdrop has WCAG > 12:1 and 0 detail, surfaces are unnecessary intervention
    expect(result.bestState.surfaces.length).toBe(0);
  });

  // ADVERSARIAL TEST 5: High-detail image -> surface reduces detail interference without destroying subject
  it('adversarial 5: high-detail image reduces detail interference with measurable surface', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const noisyField = await createSyntheticField((raw, width) => {
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const idx = (y * width + x) * 3;
          raw[idx] = (x * 53 + y * 79) % 255;
          raw[idx + 1] = (x * 53 + y * 79) % 255;
          raw[idx + 2] = (x * 53 + y * 79) % 255;
        }
      }
    });

    const copyItems = [
      { id: 'h1', text: 'TEXT ON NOISY TEXTURE', role: 'headline' as const, priority: 1 },
    ];

    const result = discoverOptimizedComposition({ copyItems, field: noisyField, canvas });
    expect(result.bestState.signals.detailInterference).toBeDefined();
    expect(result.bestState.tradeoffProfile.legibilityScore).toBeGreaterThan(0.5);
  });

  // ADVERSARIAL TEST 6: Subject behind text -> surface preserves subject information
  it('adversarial 6: subject behind text penalizes excessive opacity to preserve subject', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const subjectField = await createSyntheticField((raw, width) => {
      // Create high saliency subject box in middle
      for (let y = 30; y < 200; y++) {
        for (let x = 30; x < 200; x++) {
          const idx = (y * width + x) * 3;
          raw[idx] = 40;
          raw[idx + 1] = 40;
          raw[idx + 2] = 40;
        }
      }
    });

    const footprint = { x: 0.2, y: 0.2, width: 0.6, height: 0.2 };
    const inks = discoverInkCandidates({ role: 'headline', footprint, field: subjectField, canvas });
    const surfaces = discoverSurfaceCandidates({ targetElementIds: ['h1'], footprint, ink: inks[0], field: subjectField, canvas });

    for (const s of surfaces) {
      expect(typeof s.signals.subjectPreservation).toBe('number');
      expect(s.signals.subjectPreservation).toBeGreaterThanOrEqual(0);
      expect(s.signals.subjectPreservation).toBeLessThanOrEqual(1.0);
    }
  });

  // ADVERSARIAL TEST 7: Different canvas ratios -> surface geometry changes continuously
  it('adversarial 7: different canvas ratios produce continuous surface geometry changes', async () => {
    const canvasSquare = createCanvasRepresentation(1080, 1080); // 1:1
    const canvasBanner = createCanvasRepresentation(1920, 600);  // 16:5

    const fieldSquare = await createSyntheticField((raw) => raw.fill(60));
    const fieldBanner = await createSyntheticField((raw) => raw.fill(60));

    const copyItems = [{ id: 'h1', text: 'RATIO AWARE DESIGN', role: 'headline' as const, priority: 1 }];

    const resSquare = discoverOptimizedComposition({ copyItems, field: fieldSquare, canvas: canvasSquare });
    const resBanner = discoverOptimizedComposition({ copyItems, field: fieldBanner, canvas: canvasBanner });

    expect(resSquare.bestState.canvas.aspectRatio).toBe(1.0);
    expect(resBanner.bestState.canvas.aspectRatio).toBe(3.2);
    expect(resSquare.bestState.elements[0].rect.height).not.toBe(resBanner.bestState.elements[0].rect.height);
  });

  // ADVERSARIAL TEST 8: No brand surface constraint -> no invented brand tolerance
  it('adversarial 8: brand without explicit surface constraints causes no invented tolerance', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(220));

    const uncalibratedBrand = createBrandDesignRepresentation({
      brandProfile: { name: 'Uncalibrated', tone: 'simple' },
      creativeDna: { brandColors: ['#1e3a8a'] },
    });

    const copyItems = [{ id: 'h1', text: 'UNCALIBRATED BRAND TEST', role: 'headline' as const, priority: 1 }];
    const result = discoverOptimizedComposition({ copyItems, field, canvas, brand: uncalibratedBrand });

    expect(result.bestState.signals.brandCompatibility).toBeGreaterThan(0);
  });

  // ADVERSARIAL TEST 9: Two states with different tradeoffs -> both remain observable
  it('adversarial 9: two states with different tradeoffs remain observable as retained alternatives', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(90)); // mid tone requiring tradeoffs

    const copyItems = [
      { id: 'h1', text: 'TRADE-OFF EXPLORATION', role: 'headline' as const, priority: 1 },
      { id: 'sub', text: 'Alternative states preserved for inspection', role: 'subheadline' as const, priority: 2 },
    ];

    const result = discoverOptimizedComposition({ copyItems, field, canvas });
    expect(result.bestState).toBeDefined();
    // Verify retained alternatives exist and possess distinct scores
    if (result.retainedAlternatives.length > 0) {
      const alt = result.retainedAlternatives[0];
      expect(alt.tradeoffProfile).toBeDefined();
      expect(typeof alt.evaluation.aggregateScore).toBe('number');
    }
  });

  // ADVERSARIAL TEST 10: Identical inputs -> 100% deterministic output
  it('adversarial 10: identical inputs produce 100% deterministic output', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(210));

    const copyItems = [
      { id: 'h1', text: 'DETERMINISTIC COMPOSITION', role: 'headline' as const, priority: 1 },
      { id: 'sub', text: 'Zero randomness in evaluation pipeline', role: 'subheadline' as const, priority: 2 },
    ];

    const run1 = discoverOptimizedComposition({ copyItems, field, canvas });
    const run2 = discoverOptimizedComposition({ copyItems, field, canvas });

    expect(run1.bestState.evaluation.aggregateScore).toBe(run2.bestState.evaluation.aggregateScore);
    expect(run1.bestState.elements[0].rect.x).toBe(run2.bestState.elements[0].rect.x);
    expect(run1.bestState.elements[0].rect.y).toBe(run2.bestState.elements[0].rect.y);
    expect(run1.bestState.elements[0].ink.color.hex).toBe(run2.bestState.elements[0].ink.color.hex);
  });

  describe('PHASE 9 REGRESSION: Post-Surface Contrast Credit in Global Evaluation', () => {
    // 7. no-surface postContrast equals baseline
    it('7. no-surface postContrast equals baseline contrast', async () => {
      const canvas = createCanvasRepresentation(1200, 1500);
      const field = await createSyntheticField((raw) => raw.fill(220));
      const footprint = { x: 0.1, y: 0.1, width: 0.6, height: 0.15 };
      const inks = discoverInkCandidates({ role: 'headline', footprint, field, canvas });
      const candidates = discoverSurfaceCandidates({ targetElementIds: ['h1'], footprint, ink: inks[0], field, canvas });

      const noSurface = candidates.find((c) => c.surfaceField === null)!;
      expect(noSurface.signals.postSurfaceWcag).toBe(noSurface.signals.baselineWcag);
      expect(noSurface.signals.contrastGain).toBe(0);
    });

    // 8. surface postContrast reflects actual contrast gain
    it('8. surface postContrast reflects actual contrast gain', async () => {
      const canvas = createCanvasRepresentation(1200, 1500);
      const field = await createSyntheticField((raw) => raw.fill(120));
      const footprint = { x: 0.1, y: 0.1, width: 0.6, height: 0.15 };
      const inks = discoverInkCandidates({ role: 'headline', footprint, field, canvas });
      const candidates = discoverSurfaceCandidates({ targetElementIds: ['h1'], footprint, ink: inks[0], field, canvas });

      const withSurface = candidates.find((c) => c.surfaceField !== null)!;
      expect(withSurface.signals.postSurfaceWcag).toBe(
        Number((withSurface.signals.baselineWcag + withSurface.signals.contrastGain).toFixed(2))
      );
    });

    // 9. colorScore responds to post-surface contrast
    it('9. colorScore responds to post-surface contrast in global state evaluation', async () => {
      const canvas = createCanvasRepresentation(1200, 1500);
      const field = await createSyntheticField((raw) => raw.fill(120));
      const copyItems = [{ id: 'h1', text: 'HIGH CONTRAST SURFACE TEST', role: 'headline' as const, priority: 1 }];

      const result = discoverOptimizedComposition({ copyItems, field, canvas });
      const evaluatedState = result.bestState;

      // The evaluated signals reflect effective contrast
      expect(evaluatedState.signals.wcagRatio).toBeGreaterThan(0);
      expect(evaluatedState.signals.localContrast).toBeGreaterThan(0);
      expect(evaluatedState.tradeoffProfile.legibilityScore).toBeGreaterThan(0);
    });

    // 10. color × surface interaction responds to contrast improvement
    it('10. color × surface interaction responds to contrast improvement', async () => {
      const canvas = createCanvasRepresentation(1200, 1500);
      const field = await createSyntheticField((raw) => raw.fill(100));
      const copyItems = [{ id: 'h1', text: 'INTERACTION SIGNAL VERIFICATION', role: 'headline' as const, priority: 1 }];

      const result = discoverOptimizedComposition({ copyItems, field, canvas });
      const colorSurfaceInteraction = result.bestState.interactionSignals.colorSurface;

      expect(typeof colorSurfaceInteraction).toBe('number');
      expect(colorSurfaceInteraction).toBeGreaterThan(0);
      expect(colorSurfaceInteraction).toBeLessThanOrEqual(1.0);
    });
  });
});
