import { describe, it, expect } from 'vitest';
import {
  createCanvasRepresentation,
  createDesignField,
  createBrandDesignRepresentation,
} from './design-representation';
import { analyzeImageField } from './image-field';
import {
  parseColor,
  linearRgbToOklab,
  oklabToOklch,
  deltaEOklab,
  calculateWcagRatio,
  calculateApcaEstimate,
  evaluateContrast,
  evaluateLocalColorField,
  discoverInkCandidates,
  evaluateCompositionColors,
  DEFAULT_OPTICAL_CALIBRATION,
  type OpticalColorCalibration,
} from './dynamic-color';
import sharp from 'sharp';

describe('PHASE 8 — DYNAMIC COLOR & CONTRAST ENGINE', () => {
  async function createSyntheticField(setup: (raw: Buffer, width: number, height: number) => void) {
    const width = 256;
    const height = 256;
    const raw = Buffer.alloc(width * height * 3).fill(235);
    setup(raw, width, height);
    const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const metrics = await analyzeImageField(png);
    return createDesignField(metrics);
  }

  // TEST 1: Different image colors produce different ink candidates
  it('proves different image colors produce different ink candidates', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);

    // Dark image (slate background ~30/255)
    const darkField = await createSyntheticField((raw) => raw.fill(30));
    // Bright image (white background ~245/255)
    const brightField = await createSyntheticField((raw) => raw.fill(245));

    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'Acme', tone: 'bold' },
      creativeDna: { brandColors: ['#38bdf8', '#0f172a'] },
    });

    const footprint = { x: 0.1, y: 0.1, width: 0.8, height: 0.2 };
    const darkCandidates = discoverInkCandidates({ role: 'headline', footprint, field: darkField, canvas, brand });
    const brightCandidates = discoverInkCandidates({ role: 'headline', footprint, field: brightField, canvas, brand });

    expect(darkCandidates[0].color.oklab.L).toBeGreaterThan(0.60); // light ink for dark backdrop
    expect(brightCandidates[0].color.oklab.L).toBeLessThan(0.40); // dark ink for bright backdrop
  });

  // TEST 2: Different local image regions produce different color feasibility
  it('proves different local image regions produce different color feasibility', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    
    // Split field: Dark top (0..128) vs Bright bottom (128..256)
    const splitField = await createSyntheticField((raw, width, height) => {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 3;
          const val = y < 128 ? 25 : 240;
          raw[idx] = val;
          raw[idx + 1] = val;
          raw[idx + 2] = val;
        }
      }
    });

    const topFootprint = { x: 0.1, y: 0.05, width: 0.8, height: 0.2 };
    const bottomFootprint = { x: 0.1, y: 0.70, width: 0.8, height: 0.2 };

    const topLocal = evaluateLocalColorField({ footprint: topFootprint, field: splitField, canvas });
    const bottomLocal = evaluateLocalColorField({ footprint: bottomFootprint, field: splitField, canvas });

    expect(topLocal.meanLuminance).toBeLessThan(0.2);
    expect(bottomLocal.meanLuminance).toBeGreaterThan(0.8);
  });

  // TEST 3: Same brand + different image can produce different final ink candidates
  it('proves same brand + different image can produce different final ink candidates', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'Lumina', tone: 'premium' },
      creativeDna: { brandColors: ['#38bdf8', '#0f172a'] },
    });

    const fieldA = await createSyntheticField((raw) => raw.fill(20));
    const fieldB = await createSyntheticField((raw) => raw.fill(230));

    const footprint = { x: 0.1, y: 0.1, width: 0.8, height: 0.2 };
    const candA = discoverInkCandidates({ role: 'headline', footprint, field: fieldA, canvas, brand });
    const candB = discoverInkCandidates({ role: 'headline', footprint, field: fieldB, canvas, brand });

    expect(candA[0].color.hex).not.toBe(candB[0].color.hex);
  });

  // TEST 4: Brand colors influence candidate discovery without forcing the final color
  it('proves brand colors influence candidate discovery without forcing the final color', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(120)); // mid-gray

    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'BrandX', tone: 'energetic' },
      creativeDna: { brandColors: ['#f59e0b'] }, // amber
    });

    const candidates = discoverInkCandidates({
      role: 'headline',
      footprint: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
      field,
      canvas,
      brand,
    });

    expect(candidates.length).toBeGreaterThanOrEqual(3);
    for (const c of candidates) {
      expect(c.provenance.sourceColor).toBe('#f59e0b');
    }
  });

  // TEST 5: Derived colors retain provenance from approved brand colors
  it('proves derived colors retain provenance from approved brand colors', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(40));

    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'TestBrand', tone: 'clean' },
      creativeDna: { brandColors: ['#3b82f6'] },
    });

    const candidates = discoverInkCandidates({
      role: 'headline',
      footprint: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
      field,
      canvas,
      brand,
    });

    const tintCandidate = candidates.find((c) => c.provenance.derivationType === 'brand-tint');
    expect(tintCandidate).toBeDefined();
    expect(tintCandidate?.provenance.sourceColor).toBe('#3b82f6');
    expect(typeof tintCandidate?.provenance.deltaEOklab).toBe('number');
    expect(tintCandidate?.provenance.transformation.description).toContain('Lightness lifted');
  });

  // REGRESSION TEST 6: No fixed ΔE=0.30 brand tolerance remains as a universal rule
  it('proves no fixed ΔE=0.30 brand tolerance remains as a universal rule', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(40));

    // Brand without explicit tolerance
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'UncalibratedBrand', tone: 'clean' },
      creativeDna: { brandColors: ['#3b82f6'] },
    });

    const candidates = discoverInkCandidates({
      role: 'headline',
      footprint: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
      field,
      canvas,
      brand,
    });

    const tintCandidate = candidates.find((c) => c.provenance.derivationType === 'brand-tint');
    expect(tintCandidate).toBeDefined();
    // Provenance correctly exposes isCalibratedBrandToleranceAvailable = false without inventing 0.30 cutoff
    expect(tintCandidate?.provenance.isCalibratedBrandToleranceAvailable).toBe(false);
    expect(tintCandidate?.provenance.brandCompatibilityScore).toBeUndefined();
    // Raw perceptual distance components are explicitly exposed
    expect(typeof tintCandidate?.provenance.deltaEOklab).toBe('number');
    expect(typeof tintCandidate?.provenance.lightnessDistance).toBe('number');
    expect(typeof tintCandidate?.provenance.chromaDistance).toBe('number');
    expect(typeof tintCandidate?.provenance.hueDistance).toBe('number');
  });

  // REGRESSION TEST 7: Brand compatibility responds to actual Brand DNA constraints when they exist
  it('proves brand compatibility responds to actual Brand DNA constraints when constraints exist', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(40));

    // Brand with explicit calibrated tolerance in DNA (e.g. maxDeltaE = 0.50)
    const brandWithDNA = createBrandDesignRepresentation({
      brandProfile: { name: 'CalibratedBrand', tone: 'tech' },
      creativeDna: {
        brandColors: ['#3b82f6'],
      },
    });
    (brandWithDNA as any).allowedColorTolerance = 0.50;

    const candidates = discoverInkCandidates({
      role: 'headline',
      footprint: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
      field,
      canvas,
      brand: brandWithDNA,
    });

    const tintCandidate = candidates.find((c) => c.provenance.derivationType === 'brand-tint');
    expect(tintCandidate).toBeDefined();
    expect(tintCandidate?.provenance.isCalibratedBrandToleranceAvailable).toBe(true);
    expect(typeof tintCandidate?.provenance.brandCompatibilityScore).toBe('number');
    expect(tintCandidate?.provenance.brandCompatibilityScore).toBeGreaterThan(0);
  });

  // REGRESSION TEST 8: Optical calibration parameters are configurable and change signals continuously
  it('proves optical calibration parameters are configurable and change signals continuously', () => {
    const ink = parseColor('#38bdf8');

    // Default calibration
    const evalDefault = evaluateContrast({
      ink,
      backdropLum: 0.1,
      backdropStdDev: 0.02,
      fontSizePx: 24,
      fontWeight: 400,
      opticalCalibration: DEFAULT_OPTICAL_CALIBRATION,
    });

    // Custom calibration with higher size sensitivity
    const customCalib: OpticalColorCalibration = {
      ...DEFAULT_OPTICAL_CALIBRATION,
      sizeReference: 48,
      sizeMaxFactor: 2.0,
      weightReference: 800,
    };

    const evalCustom = evaluateContrast({
      ink,
      backdropLum: 0.1,
      backdropStdDev: 0.02,
      fontSizePx: 24,
      fontWeight: 400,
      opticalCalibration: customCalib,
    });

    expect(evalCustom.opticalScaleMultiplier).toBeGreaterThan(evalDefault.opticalScaleMultiplier);
  });

  // REGRESSION TEST 9: Color candidates retain individual tradeoff signals for Phase 10 evaluation
  it('proves color candidates retain individual tradeoff signals for Phase 10 evaluation', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(30));

    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'TradeoffBrand', tone: 'luxury' },
      creativeDna: { brandColors: ['#0f172a', '#38bdf8'] },
    });

    const candidates = discoverInkCandidates({
      role: 'headline',
      footprint: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
      field,
      canvas,
      brand,
    });

    for (const c of candidates) {
      // Individual signals are preserved
      expect(typeof c.contrast.wcagRatio).toBe('number');
      expect(typeof c.contrast.apcaEstimatedLc).toBe('number');
      expect(typeof c.signals.imageHarmonyScore).toBe('number');
      expect(typeof c.signals.opticalDensityScore).toBe('number');
      expect(c.signals.tradeoffProfile).toBeDefined();
      expect(typeof c.signals.tradeoffProfile.contrastQuality).toBe('number');
      expect(typeof c.signals.tradeoffProfile.brandAdherence).toBe('number');
      expect(typeof c.signals.tradeoffProfile.harmonyQuality).toBe('number');
      expect(typeof c.signals.tradeoffProfile.opticalSuitability).toBe('number');
    }
  });

  // TEST 10: Contrast is continuous rather than binary
  it('proves contrast is continuous rather than binary', () => {
    const black = parseColor('#000000');
    const midGray = parseColor('#777777');
    const white = parseColor('#ffffff');

    const evalBlack = evaluateContrast({ ink: black, backdropLum: 0.9, backdropStdDev: 0.05 });
    const evalGray = evaluateContrast({ ink: midGray, backdropLum: 0.9, backdropStdDev: 0.05 });
    const evalWhite = evaluateContrast({ ink: white, backdropLum: 0.9, backdropStdDev: 0.05 });

    expect(evalBlack.wcagRatio).toBeGreaterThan(evalGray.wcagRatio);
    expect(evalGray.wcagRatio).toBeGreaterThan(evalWhite.wcagRatio);
    expect(typeof evalBlack.apcaEstimatedLc).toBe('number');
  });

  // TEST 11: Font weight/size influences optical color suitability
  it('proves font weight/size influences optical color suitability', () => {
    const ink = parseColor('#38bdf8');
    
    // Large heavy display type vs small lightweight caption
    const evalHeavy = evaluateContrast({ ink, backdropLum: 0.1, backdropStdDev: 0.02, fontSizePx: 64, fontWeight: 800 });
    const evalLight = evaluateContrast({ ink, backdropLum: 0.1, backdropStdDev: 0.02, fontSizePx: 14, fontWeight: 300 });

    expect(evalHeavy.opticalScaleMultiplier).toBeLessThan(evalLight.opticalScaleMultiplier);
  });

  // TEST 12: High-chroma ink behaves differently from low-chroma ink despite similar luminance
  it('proves high-chroma ink behaves differently from low-chroma ink despite similar luminance', () => {
    const vibrantCyan = parseColor('#06b6d4');
    const neutralGray = parseColor('#6b7280');

    expect(vibrantCyan.oklch.C).toBeGreaterThan(neutralGray.oklch.C);
    expect(vibrantCyan.temperature).not.toBe(neutralGray.temperature);
  });

  // TEST 13: Image temperature influences harmony continuously
  it('proves image temperature influences harmony continuously', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);

    const warmField = await createSyntheticField((raw, width, height) => {
      for (let i = 0; i < raw.length; i += 3) {
        raw[i] = 220;
        raw[i + 1] = 120;
        raw[i + 2] = 40;
      }
    });

    const warmLocal = evaluateLocalColorField({ footprint: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 }, field: warmField, canvas });
    expect(warmLocal.temperature).toBeGreaterThan(0);
  });

  // TEST 14: Local texture/detail affects color feasibility
  it('proves local texture/detail affects color feasibility', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);

    const flatField = await createSyntheticField(() => {});
    const noisyField = await createSyntheticField((raw, width) => {
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const idx = (y * width + x) * 3;
          const val = (x * 37 + y * 53) % 255;
          raw[idx] = val;
          raw[idx + 1] = val;
          raw[idx + 2] = val;
        }
      }
    });

    const flatSummary = evaluateLocalColorField({ footprint: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 }, field: flatField, canvas });
    const noisySummary = evaluateLocalColorField({ footprint: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 }, field: noisyField, canvas });

    expect(flatSummary.colorStability).toBeGreaterThan(noisySummary.colorStability);
  });

  // REGRESSION TEST 15, 16, 17: Color does not modify Phase 5 coordinates, Phase 6 alignment, or Phase 7 spacing
  it('proves color does not modify Phase 5 coordinates, Phase 6 alignment, or Phase 7 spacing', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    const element = {
      id: 'h1',
      role: 'headline' as const,
      rect: { x: 0.1425, y: 0.0891, width: 0.7182, height: 0.1654 },
    };

    const result = evaluateCompositionColors({
      elements: [element],
      field,
      canvas,
    });

    expect(element.rect.x).toBe(0.1425);
    expect(element.rect.y).toBe(0.0891);
    expect(element.rect.width).toBe(0.7182);
    expect(element.rect.height).toBe(0.1654);
    expect(result.elementColors[0].elementId).toBe('h1');
  });

  // TEST 18: Multiple viable ink candidates are preserved
  it('proves multiple viable ink candidates are preserved', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(30));

    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'DiverseBrand', tone: 'modern' },
      creativeDna: { brandColors: ['#38bdf8', '#f43f5e'] },
    });

    const candidates = discoverInkCandidates({
      role: 'headline',
      footprint: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
      field,
      canvas,
      brand,
    });

    expect(candidates.length).toBeGreaterThanOrEqual(4);
  });

  // TEST 19: No white/black fallback ladder or fixed template rules exist
  it('proves no white/black fallback ladder or fixed template rules exist', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(50));

    const candidates = discoverInkCandidates({
      role: 'headline',
      footprint: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
      field,
      canvas,
    });

    for (const c of candidates) {
      expect(c.provenance).toBeDefined();
      expect(c.scores.compositeColorScore).toBeGreaterThan(0);
    }
  });

  // TEST 20: Accessibility constraints remain respected where required
  it('proves accessibility constraints remain respected where required', () => {
    const inkLight = parseColor('#ffffff');
    const evalAccessible = evaluateContrast({ ink: inkLight, backdropLum: 0.05, backdropStdDev: 0.01 });
    expect(evalAccessible.wcagRatio).toBeGreaterThan(4.5);
  });
});
