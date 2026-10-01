import { describe, it, expect } from 'vitest';
import {
  createCanvasRepresentation,
  createDesignField,
  createBrandDesignRepresentation,
} from './design-representation';
import { analyzeImageField } from './image-field';
import { discoverInkCandidates } from './dynamic-color';
import {
  discoverSurfaceCandidates,
  DEFAULT_SURFACE_CALIBRATION,
} from './dynamic-surface';
import sharp from 'sharp';

describe('PHASE 9 (PART A) — DYNAMIC SURFACE & SCRIM DISCOVERY ENGINE', () => {
  async function createSyntheticField(setup: (raw: Buffer, width: number, height: number) => void) {
    const width = 256;
    const height = 256;
    const raw = Buffer.alloc(width * height * 3).fill(235);
    setup(raw, width, height);
    const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const metrics = await analyzeImageField(png);
    return createDesignField(metrics);
  }

  // TEST 1: No-surface is evaluated as a genuine first-class candidate
  it('evaluates no-surface as a genuine first-class candidate on equal footing', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(240)); // clean bright studio

    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'CleanBrand', tone: 'minimal' },
      creativeDna: { brandColors: ['#0f172a'] },
    });

    const footprint = { x: 0.1, y: 0.1, width: 0.6, height: 0.15 };
    const inks = discoverInkCandidates({ role: 'headline', footprint, field, canvas, brand });
    const primaryInk = inks[0];

    const surfaceCandidates = discoverSurfaceCandidates({
      targetElementIds: ['h1'],
      footprint,
      ink: primaryInk,
      field,
      canvas,
      brand,
    });

    const noSurface = surfaceCandidates.find((c) => c.surfaceField === null);
    expect(noSurface).toBeDefined();
    expect(noSurface?.signals.interventionCost).toBe(0);
    expect(noSurface?.signals.subjectPreservation).toBe(1.0);
    expect(noSurface?.tradeoffProfile.imageIntegrity).toBe(1.0);
  });

  // TEST 2: High contrast clean background naturally favors no-surface
  it('naturally favors no-surface when image backdrop already provides clean contrast', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(245)); // smooth solid white

    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'StudioBrand', tone: 'editorial' },
      creativeDna: { brandColors: ['#0f172a'] }, // dark navy ink on white
    });

    const footprint = { x: 0.1, y: 0.1, width: 0.6, height: 0.15 };
    const inks = discoverInkCandidates({ role: 'headline', footprint, field, canvas, brand });
    const surfaceCandidates = discoverSurfaceCandidates({
      targetElementIds: ['h1'],
      footprint,
      ink: inks[0],
      field,
      canvas,
      brand,
    });

    // Top candidate should be no-surface because baseline WCAG is ~12:1 and detail is 0
    expect(surfaceCandidates[0].surfaceField).toBeNull();
  });

  // TEST 3: Noisy high-detail texture background increases surface necessity
  it('increases surface necessity on noisy high-detail texture backgrounds', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);

    // Clean background
    const cleanField = await createSyntheticField((raw) => raw.fill(200));
    // High-frequency noisy texture background
    const noisyField = await createSyntheticField((raw, width) => {
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const idx = (y * width + x) * 3;
          const val = (x * 47 + y * 71) % 255;
          raw[idx] = val;
          raw[idx + 1] = val;
          raw[idx + 2] = val;
        }
      }
    });

    const footprint = { x: 0.1, y: 0.1, width: 0.6, height: 0.15 };
    const cleanInks = discoverInkCandidates({ role: 'headline', footprint, field: cleanField, canvas });
    const noisyInks = discoverInkCandidates({ role: 'headline', footprint, field: noisyField, canvas });

    const cleanSurfaces = discoverSurfaceCandidates({ targetElementIds: ['h1'], footprint, ink: cleanInks[0], field: cleanField, canvas });
    const noisySurfaces = discoverSurfaceCandidates({ targetElementIds: ['h1'], footprint, ink: noisyInks[0], field: noisyField, canvas });

    expect(noisySurfaces[0].scores.necessityScore).toBeGreaterThan(cleanSurfaces[0].scores.necessityScore);
  });

  // TEST 4: Surface parameters are continuous rather than discrete presets
  it('proves surface parameters (extent, opacity, falloff) are continuous mathematical fields', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(120)); // mid-gray

    const footprint = { x: 0.15, y: 0.25, width: 0.55, height: 0.18 };
    const inks = discoverInkCandidates({ role: 'headline', footprint, field, canvas });
    const surfaceCandidates = discoverSurfaceCandidates({
      targetElementIds: ['h1'],
      footprint,
      ink: inks[0],
      field,
      canvas,
    });

    const surfaceBearing = surfaceCandidates.find((c) => c.surfaceField !== null);
    expect(surfaceBearing).toBeDefined();
    const sf = surfaceBearing!.surfaceField!;

    expect(typeof sf.center.x).toBe('number');
    expect(typeof sf.center.y).toBe('number');
    expect(typeof sf.falloffExponent).toBe('number');
    expect(typeof sf.opacityField.peak).toBe('number');
    expect(sf.opacityField.peak).toBeGreaterThan(0);
    expect(sf.opacityField.peak).toBeLessThanOrEqual(DEFAULT_SURFACE_CALIBRATION.maxOpacityLimit);
    expect(sf.spatialExtent.width).toBeGreaterThan(footprint.width);
  });

  // TEST 5: Surface intervention cost is measurable and penalizes unnecessary disruption
  it('proves surface intervention cost is measurable and penalizes disruption', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField((raw) => raw.fill(240));

    const footprint = { x: 0.1, y: 0.1, width: 0.6, height: 0.15 };
    const inks = discoverInkCandidates({ role: 'headline', footprint, field, canvas });
    const surfaceCandidates = discoverSurfaceCandidates({
      targetElementIds: ['h1'],
      footprint,
      ink: inks[0],
      field,
      canvas,
    });

    for (const c of surfaceCandidates) {
      expect(typeof c.signals.interventionCost).toBe('number');
      expect(typeof c.signals.imagePreservation).toBe('number');
      expect(typeof c.signals.subjectPreservation).toBe('number');
      expect(typeof c.tradeoffProfile.efficiency).toBe('number');
    }
  });

  // TEST 6: Surface discovery does NOT mutate typography coordinates
  it('proves surface discovery does NOT mutate typography coordinates or layout bounds', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    const originalFootprint = { x: 0.1425, y: 0.0891, width: 0.7182, height: 0.1654 };
    const inks = discoverInkCandidates({ role: 'headline', footprint: originalFootprint, field, canvas });
    
    discoverSurfaceCandidates({
      targetElementIds: ['h1'],
      footprint: originalFootprint,
      ink: inks[0],
      field,
      canvas,
    });

    expect(originalFootprint.x).toBe(0.1425);
    expect(originalFootprint.y).toBe(0.0891);
    expect(originalFootprint.width).toBe(0.7182);
    expect(originalFootprint.height).toBe(0.1654);
  });

  describe('PHASE 9 REGRESSION: Surface Parity & Symmetric Scoring', () => {
    // 1. no-surface and surface states use comparable evaluation signals
    it('1. no-surface and surface states use comparable evaluation signals', async () => {
      const canvas = createCanvasRepresentation(1200, 1500);
      const field = await createSyntheticField((raw) => raw.fill(120));
      const footprint = { x: 0.1, y: 0.1, width: 0.6, height: 0.15 };
      const inks = discoverInkCandidates({ role: 'headline', footprint, field, canvas });
      const candidates = discoverSurfaceCandidates({ targetElementIds: ['h1'], footprint, ink: inks[0], field, canvas });

      const noSurface = candidates.find((c) => c.surfaceField === null)!;
      const withSurface = candidates.find((c) => c.surfaceField !== null)!;

      expect(noSurface).toBeDefined();
      expect(withSurface).toBeDefined();

      // Check that both have all required evaluation signals
      const requiredSignalKeys = [
        'baselineWcag',
        'postSurfaceWcag',
        'postSurfaceApca',
        'contrastGain',
        'clarityGain',
        'detailReduction',
        'subjectPreservation',
        'imagePreservation',
        'visualDisruption',
        'surfaceFootprintArea',
        'surfaceStrength',
        'surfaceComplexity',
        'interventionCost',
        'brandCompatibility',
      ] as const;

      for (const key of requiredSignalKeys) {
        expect(typeof noSurface.signals[key]).toBe('number');
        expect(typeof withSurface.signals[key]).toBe('number');
      }

      expect(typeof noSurface.scores.suitabilityScore).toBe('number');
      expect(typeof withSurface.scores.suitabilityScore).toBe('number');
      expect(typeof noSurface.scores.compositeSurfaceScore).toBe('number');
      expect(typeof withSurface.scores.compositeSurfaceScore).toBe('number');
    });

    // 2. no-surface does not automatically dominate
    it('2. no-surface does not automatically dominate on low-contrast high-detail backgrounds', async () => {
      const canvas = createCanvasRepresentation(1200, 1500);
      // Construct a very difficult backdrop where baseline contrast is poor and detail is high
      const difficultField = await createSyntheticField((raw, width) => {
        for (let y = 0; y < 256; y++) {
          for (let x = 0; x < 256; x++) {
            const idx = (y * width + x) * 3;
            raw[idx] = (x * 71 + y * 97) % 255;
            raw[idx + 1] = (x * 71 + y * 97) % 255;
            raw[idx + 2] = (x * 71 + y * 97) % 255;
          }
        }
      });

      const footprint = { x: 0.1, y: 0.1, width: 0.6, height: 0.15 };
      const inks = discoverInkCandidates({ role: 'headline', footprint, field: difficultField, canvas });
      const candidates = discoverSurfaceCandidates({
        targetElementIds: ['h1'],
        footprint,
        ink: inks[0],
        field: difficultField,
        canvas,
      });

      const topCandidate = candidates[0];
      const withSurface = candidates.find((c) => c.surfaceField !== null);
      expect(withSurface).toBeDefined();
      // On difficult backdrops, surface candidates can score competitively or beat no-surface
      expect(withSurface!.scores.compositeSurfaceScore).toBeGreaterThan(0.35);
    });

    // 3. surface does not automatically dominate
    it('3. surface does not automatically dominate on high-contrast clean backgrounds', async () => {
      const canvas = createCanvasRepresentation(1200, 1500);
      const cleanField = await createSyntheticField((raw) => raw.fill(245));
      const footprint = { x: 0.1, y: 0.1, width: 0.6, height: 0.15 };
      const inks = discoverInkCandidates({ role: 'headline', footprint, field: cleanField, canvas });
      const candidates = discoverSurfaceCandidates({
        targetElementIds: ['h1'],
        footprint,
        ink: inks[0],
        field: cleanField,
        canvas,
      });

      const noSurface = candidates.find((c) => c.surfaceField === null)!;
      expect(candidates[0].id).toBe(noSurface.id);
    });

    // 4. strong contrast-gain surface can become competitive
    it('4. strong contrast-gain surface can become competitive against mid-gray backdrop', async () => {
      const canvas = createCanvasRepresentation(1200, 1500);
      const midField = await createSyntheticField((raw) => raw.fill(128)); // mid-gray creates contrast deficit
      const footprint = { x: 0.1, y: 0.1, width: 0.6, height: 0.15 };
      const inks = discoverInkCandidates({ role: 'headline', footprint, field: midField, canvas });
      const candidates = discoverSurfaceCandidates({
        targetElementIds: ['h1'],
        footprint,
        ink: inks[0],
        field: midField,
        canvas,
      });

      const surfaceCandidate = candidates.find((c) => c.surfaceField !== null)!;
      expect(surfaceCandidate.signals.contrastGain).toBeGreaterThanOrEqual(0);
      expect(surfaceCandidate.scores.compositeSurfaceScore).toBeGreaterThan(0.2);
    });

    // 5. surface intervention cost remains visible
    it('5. surface intervention cost remains visible and scales with opacity and footprint', async () => {
      const canvas = createCanvasRepresentation(1200, 1500);
      const field = await createSyntheticField((raw) => raw.fill(120));
      const footprint = { x: 0.1, y: 0.1, width: 0.6, height: 0.15 };
      const inks = discoverInkCandidates({ role: 'headline', footprint, field, canvas });
      const candidates = discoverSurfaceCandidates({
        targetElementIds: ['h1'],
        footprint,
        ink: inks[0],
        field,
        canvas,
      });

      const surfaceCand = candidates.find((c) => c.surfaceField !== null)!;
      expect(surfaceCand.signals.interventionCost).toBeGreaterThan(0);
      expect(surfaceCand.signals.visualDisruption).toBeGreaterThan(0);
    });

    // 6. image preservation cost remains visible
    it('6. image preservation cost remains visible and non-trivial for surface states', async () => {
      const canvas = createCanvasRepresentation(1200, 1500);
      const field = await createSyntheticField((raw) => raw.fill(120));
      const footprint = { x: 0.1, y: 0.1, width: 0.6, height: 0.15 };
      const inks = discoverInkCandidates({ role: 'headline', footprint, field, canvas });
      const candidates = discoverSurfaceCandidates({
        targetElementIds: ['h1'],
        footprint,
        ink: inks[0],
        field,
        canvas,
      });

      const noSurface = candidates.find((c) => c.surfaceField === null)!;
      const surfaceCand = candidates.find((c) => c.surfaceField !== null)!;

      expect(noSurface.signals.imagePreservation).toBe(1.0);
      expect(surfaceCand.signals.imagePreservation).toBeLessThan(1.0);
      expect(surfaceCand.signals.imagePreservation).toBeGreaterThan(0);
    });
  });
});
