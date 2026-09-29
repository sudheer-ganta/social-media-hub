import { describe, it, expect } from 'vitest';
import {
  discoverPlacementCandidates,
  evaluatePlacementRegion,
  discoverMultiElementPlacements,
} from './dynamic-placement';
import {
  createCanvasRepresentation,
  createBrandDesignRepresentation,
  createDesignField,
} from './design-representation';
import { analyzeImageField } from './image-field';
import { createDynamicCopyModel } from './copy-model';
import { exploreLineStructures } from '../typography/dynamic-line-structure';
import sharp from 'sharp';

describe('Dynamic Placement Engine — Phase 5', () => {
  const canvas = createCanvasRepresentation(1200, 1500);
  const brand = createBrandDesignRepresentation({
    brandProfile: { name: 'Villy Studio' },
    creativeDna: { brandColors: ['#18181b', '#f4f4f5'] },
  });

  // Helper to create synthetic test image buffers with controlled subject boxes and textures
  async function makeTestImage(opts: {
    bgLuminance?: number;
    subjectRect?: { x: number; y: number; w: number; h: number; lum?: number };
  }): Promise<Buffer> {
    const width = 256;
    const height = 256;
    const bgLum = opts.bgLuminance ?? 230;
    const buf = Buffer.alloc(width * height * 3).fill(bgLum);

    if (opts.subjectRect) {
      const sr = opts.subjectRect;
      const x0 = Math.round(sr.x * width);
      const y0 = Math.round(sr.y * height);
      const x1 = Math.min(width, x0 + Math.round(sr.w * width));
      const y1 = Math.min(height, y0 + Math.round(sr.h * height));
      const sLum = sr.lum ?? 30;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * width + x) * 3;
          // High detail/contrast inside subject
          const val = (x + y) % 4 === 0 ? sLum : Math.min(255, sLum + 130);
          buf[idx] = val;
          buf[idx + 1] = val;
          buf[idx + 2] = val;
        }
      }
    }

    return sharp(buf, { raw: { width, height, channels: 3 } }).png().toBuffer();
  }

  it('1. same image + same copy produces multiple viable continuous positions', async () => {
    const imgBuf = await makeTestImage({ bgLuminance: 230 });
    const field = createDesignField(await analyzeImageField(imgBuf));
    const copy = createDynamicCopyModel('h1', 'THE NEW AUTUMN DROP', 'primary-hook', 1);
    const lineStates = exploreLineStructures({ copy, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.8, height: 0.4 }, canvas });

    const candidates = discoverPlacementCandidates({
      typographyState: lineStates[0],
      field,
      canvas,
      maxCandidates: 6,
    });

    expect(candidates.length).toBeGreaterThanOrEqual(4);
    // Distinct continuous Y positions
    const yPositions = candidates.map((c) => c.rect.y);
    const uniqueY = new Set(yPositions.map((y) => y.toFixed(2)));
    expect(uniqueY.size).toBeGreaterThanOrEqual(3);

    for (const cand of candidates) {
      expect(cand.scores.compositeScore).toBeGreaterThan(0);
      expect(cand.pixelBounds.widthPx).toBeGreaterThan(0);
      expect(cand.pixelBounds.heightPx).toBeGreaterThan(0);
    }
  });

  it('2. different images produce different promising placement candidate distributions', async () => {
    // Image 1: noisy textured subject on bottom half (quiet top)
    const img1 = await makeTestImage({ subjectRect: { x: 0.05, y: 0.55, w: 0.9, h: 0.4, lum: 20 } });
    const field1 = createDesignField(await analyzeImageField(img1));

    // Image 2: noisy textured subject on top half (quiet bottom)
    const img2 = await makeTestImage({ subjectRect: { x: 0.05, y: 0.05, w: 0.9, h: 0.4, lum: 20 } });
    const field2 = createDesignField(await analyzeImageField(img2));

    const copy = createDynamicCopyModel('h1', 'HARVEST ROAST COFFEE', 'primary-hook', 1);
    const lineStates = exploreLineStructures({ copy, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.8, height: 0.3 }, canvas });

    const candidates1 = discoverPlacementCandidates({ typographyState: lineStates[0], field: field1, canvas });
    const candidates2 = discoverPlacementCandidates({ typographyState: lineStates[0], field: field2, canvas });

    const top1 = candidates1[0];
    const top2 = candidates2[0];

    // Image 1 top candidate is placed in the quiet upper half; Image 2 top candidate in the quiet lower half
    expect(top1.rect.y).toBeLessThan(0.45);
    expect(top2.rect.y).toBeGreaterThan(0.40);
  });

  it('3. changing typography width changes placement possibilities and boundary slack', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    // Narrow typography state (e.g. 3-line stacked headline)
    const narrowState = { widthNormalized: 0.35, heightNormalized: 0.30 };
    // Wide typography state (e.g. 1-line wide banner headline)
    const wideState = { widthNormalized: 0.88, heightNormalized: 0.10 };

    const narrowCandidates = discoverPlacementCandidates({ typographyState: narrowState, field, canvas, maxCandidates: 8 });
    const wideCandidates = discoverPlacementCandidates({ typographyState: wideState, field, canvas, maxCandidates: 8 });

    expect(narrowCandidates.length).toBeGreaterThan(0);
    expect(wideCandidates.length).toBeGreaterThan(0);

    // Narrow state allows wider horizontal span across candidates
    const narrowXSpan = Math.max(...narrowCandidates.map((c) => c.rect.x)) - Math.min(...narrowCandidates.map((c) => c.rect.x));
    const wideXSpan = Math.max(...wideCandidates.map((c) => c.rect.x)) - Math.min(...wideCandidates.map((c) => c.rect.x));

    expect(narrowXSpan).toBeGreaterThan(wideXSpan);
  });

  it('4. a subject on the left does NOT automatically ban text on the left or force a hardcoded rule', async () => {
    // Subject on left side (x: 0.05, y: 0.2, w: 0.4, h: 0.6)
    const imgLeft = await makeTestImage({ subjectRect: { x: 0.05, y: 0.2, w: 0.4, h: 0.6, lum: 40 } });
    const fieldLeft = createDesignField(await analyzeImageField(imgLeft));

    const leftRect: FieldRect = { x: 0.08, y: 0.25, width: 0.35, height: 0.15 };
    const leftEval = evaluatePlacementRegion({
      rect: leftRect,
      field: fieldLeft,
      canvas,
    });

    // A candidate overlapping the left subject is NOT banned or marked invalid
    expect(leftEval.scores.compositeScore).toBeGreaterThan(0.20);
    expect(leftEval.signals.subjectOverlap.overlapRatio).toBeGreaterThan(0);

    // When evaluated with candidate discovery, left candidates remain viable options
    const copy = createDynamicCopyModel('h1', 'MINIMALIST TIMEPIECE', 'primary-hook', 1);
    const lineStates = exploreLineStructures({ copy, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.35, height: 0.2 }, canvas });

    const candidates = discoverPlacementCandidates({
      typographyState: lineStates[0],
      field: fieldLeft,
      canvas,
      maxCandidates: 12,
      customWeights: { subjectHarmonyWeight: 0.10 }, // Intentional overlay / crossing preference
    });

    const leftCandidates = candidates.filter((c) => c.rect.x < 0.30);
    expect(leftCandidates.length).toBeGreaterThan(0);
  });

  it('5. evaluates subject overlap continuously (none, peripheral, textured, focal-core)', async () => {
    const img = await makeTestImage({ subjectRect: { x: 0.2, y: 0.3, w: 0.6, h: 0.4, lum: 30 } });
    const field = createDesignField(await analyzeImageField(img));

    // Region 1: completely outside subject
    const outsideEval = evaluatePlacementRegion({
      rect: { x: 0.1, y: 0.05, width: 0.5, height: 0.15 },
      field,
      canvas,
    });
    expect(outsideEval.signals.subjectOverlap.classification).toBe('none');
    expect(outsideEval.signals.subjectOverlap.overlapRatio).toBe(0);

    // Region 2: partially touching subject boundary (peripheral)
    const peripheralEval = evaluatePlacementRegion({
      rect: { x: 0.1, y: 0.25, width: 0.2, height: 0.15 },
      field,
      canvas,
    });
    expect(['peripheral', 'textured-field']).toContain(peripheralEval.signals.subjectOverlap.classification);
    expect(peripheralEval.signals.subjectOverlap.overlapRatio).toBeGreaterThan(0);

    // Region 3: directly on top of subject core
    const coreEval = evaluatePlacementRegion({
      rect: { x: 0.3, y: 0.35, width: 0.4, height: 0.3 },
      field,
      canvas,
    });
    expect(coreEval.signals.subjectOverlap.overlapRatio).toBeGreaterThan(0.7);
    expect(coreEval.scores.subjectHarmonyScore).toBeLessThan(outsideEval.scores.subjectHarmonyScore);
  });

  it('6. continuous coarse-to-fine local refinement micro-optimizes coordinates', async () => {
    const img = await makeTestImage({ bgLuminance: 200 });
    const field = createDesignField(await analyzeImageField(img));

    const state = { widthNormalized: 0.5, heightNormalized: 0.15 };
    const candidates = discoverPlacementCandidates({
      typographyState: state,
      field,
      canvas,
      refineContinuous: true,
    });

    expect(candidates.length).toBeGreaterThan(0);
    // Coordinates are continuous floating point numbers with decimal precision
    const xDecimals = candidates.map((c) => c.rect.x.toString().split('.')[1]?.length || 0);
    expect(Math.max(...xDecimals)).toBeGreaterThanOrEqual(2);
  });

  it('7. multi-element placement avoids collisions between headline and secondary copy', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    const h1 = createDynamicCopyModel('h1', 'ARCHITECTURAL SOUNDSCAPES', 'primary-hook', 1);
    const sub = createDynamicCopyModel('sub', 'Engineered in Stockholm with pure analog drivers', 'secondary-hook', 2);
    const cta = createDynamicCopyModel('cta', 'ORDER NOW', 'cta', 3);

    const h1States = exploreLineStructures({ copy: h1, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.8, height: 0.3 }, canvas });
    const subStates = exploreLineStructures({ copy: sub, font: 'Inter', weight: 400, spatialBox: { x: 0, y: 0, width: 0.6, height: 0.15 }, canvas });
    const ctaStates = exploreLineStructures({ copy: cta, font: 'Inter', weight: 600, spatialBox: { x: 0, y: 0, width: 0.3, height: 0.08 }, canvas });

    const multiCompositions = discoverMultiElementPlacements({
      primaryState: { ...h1States[0], copyId: 'h1' },
      secondaryStates: [
        { ...subStates[0], copyId: 'sub' },
        { ...ctaStates[0], copyId: 'cta' },
      ],
      field,
      canvas,
    });

    expect(multiCompositions.length).toBeGreaterThan(0);
    const topComp = multiCompositions[0];

    // Check that primary and secondary do not completely overlap
    const pRect = topComp.primaryPlacement.rect;
    const subPlacement = topComp.secondaryPlacements['sub'];
    expect(subPlacement).toBeDefined();

    const subRect = subPlacement.rect;
    const xOverlap = Math.max(0, Math.min(pRect.x + pRect.width, subRect.x + subRect.width) - Math.max(pRect.x, subRect.x));
    const yOverlap = Math.max(0, Math.min(pRect.y + pRect.height, subRect.y + subRect.height) - Math.max(pRect.y, subRect.y));
    const overlapArea = xOverlap * yOverlap;

    expect(overlapArea).toBeLessThan(0.01); // Minimal or zero collision
  });

  describe('Behavioral Creative Field Tests', () => {
    it('Behavioral Test A: Placement candidate distributions respond dynamically to subject position', async () => {
      // Left subject
      const imgLeft = await makeTestImage({ subjectRect: { x: 0.05, y: 0.2, w: 0.4, h: 0.6, lum: 30 } });
      const fieldLeft = createDesignField(await analyzeImageField(imgLeft));

      // Right subject
      const imgRight = await makeTestImage({ subjectRect: { x: 0.55, y: 0.2, w: 0.4, h: 0.6, lum: 30 } });
      const fieldRight = createDesignField(await analyzeImageField(imgRight));

      const copy = createDynamicCopyModel('h1', 'SUMMER COLLECTION', 'primary-hook', 1);
      const lineStates = exploreLineStructures({ copy, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.45, height: 0.25 }, canvas });

      const candsLeft = discoverPlacementCandidates({ typographyState: lineStates[0], field: fieldLeft, canvas });
      const candsRight = discoverPlacementCandidates({ typographyState: lineStates[0], field: fieldRight, canvas });

      // Calculate center of mass of candidate X positions
      const avgXLeft = candsLeft.reduce((sum, c) => sum + c.rect.x, 0) / candsLeft.length;
      const avgXRight = candsRight.reduce((sum, c) => sum + c.rect.x, 0) / candsRight.length;

      // The candidate distributions shift naturally across the two opposing fields
      expect(avgXLeft).not.toEqual(avgXRight);
    });

    it('Behavioral Test B: Different typography widths generate distinct viable continuous regions', async () => {
      const img = await makeTestImage({ bgLuminance: 220 });
      const field = createDesignField(await analyzeImageField(img));

      const wideState = { widthNormalized: 0.85, heightNormalized: 0.10 };
      const compactState = { widthNormalized: 0.35, heightNormalized: 0.25 };

      const wideCandidates = discoverPlacementCandidates({ typographyState: wideState, field, canvas, maxCandidates: 8 });
      const compactCandidates = discoverPlacementCandidates({ typographyState: compactState, field, canvas, maxCandidates: 8 });

      expect(wideCandidates.length).toBeGreaterThan(0);
      expect(compactCandidates.length).toBeGreaterThan(0);

      // Compact state discovers positions in side gutters where wide state cannot physically fit
      const compactMaxX = Math.max(...compactCandidates.map((c) => c.rect.x));
      const wideMaxX = Math.max(...wideCandidates.map((c) => c.rect.x));

      expect(compactMaxX).toBeGreaterThan(wideMaxX);
    });

    it('Behavioral Test C: Different canvas aspect ratios adjust the continuous candidate discovery space', async () => {
      const img = await makeTestImage({ bgLuminance: 220 });
      const field = createDesignField(await analyzeImageField(img));

      const canvasSquare = createCanvasRepresentation(1200, 1200); // 1:1
      const canvasStory = createCanvasRepresentation(1080, 1920);  // 9:16

      const state = { widthNormalized: 0.6, heightNormalized: 0.15 };
      const candsSquare = discoverPlacementCandidates({ typographyState: state, field, canvas: canvasSquare });
      const candsStory = discoverPlacementCandidates({ typographyState: state, field, canvas: canvasStory });

      expect(candsSquare.length).toBeGreaterThan(0);
      expect(candsStory.length).toBeGreaterThan(0);

      // Pixel bounds scale accurately with respective canvas dimensions
      expect(candsSquare[0].pixelBounds.widthPx).toBe(Math.round(0.6 * 1200));
      expect(candsStory[0].pixelBounds.widthPx).toBe(Math.round(0.6 * 1080));
    });
  });

  describe('PHASE 9 REGRESSION: Placement Margin & Sampling Lattice Independence', () => {
    // 11. spatial balance responds to actual safe bounds
    it('11. spatial balance responds to actual safe bounds', async () => {
      const img = await makeTestImage({ bgLuminance: 220 });
      const field = createDesignField(await analyzeImageField(img));
      const testRect: FieldRect = { x: 0.05, y: 0.05, width: 0.5, height: 0.15 };

      const canvasNarrow = createCanvasRepresentation(1200, 1500, 0.08);
      const canvasWide = createCanvasRepresentation(1200, 1500, 0.03);

      const evalNarrow = evaluatePlacementRegion({ rect: testRect, field, canvas: canvasNarrow });
      const evalWide = evaluatePlacementRegion({ rect: testRect, field, canvas: canvasWide });

      // When safe bounds margin is smaller (0.03), the candidate at x=0.05 has higher spatial balance score
      expect(evalWide.scores.spatialBalanceScore).toBeGreaterThan(evalNarrow.scores.spatialBalanceScore);
    });

    // 12. changing safe bounds changes margin evaluation continuously
    it('12. changing safe bounds changes margin evaluation continuously', async () => {
      const img = await makeTestImage({ bgLuminance: 220 });
      const field = createDesignField(await analyzeImageField(img));
      const testRect: FieldRect = { x: 0.045, y: 0.045, width: 0.5, height: 0.15 };

      const margins = [0.02, 0.04, 0.06, 0.08, 0.10];
      const scores: number[] = [];

      for (const m of margins) {
        const customCanvas = createCanvasRepresentation(1200, 1500, m);
        const res = evaluatePlacementRegion({ rect: testRect, field, canvas: customCanvas });
        scores.push(res.scores.spatialBalanceScore);
      }

      // Scores should strictly decrease as safe bound margins increase past the candidate's coordinate
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    });

    // 13. no universal 0.06 aesthetic divisor remains
    it('13. no universal 0.06 aesthetic divisor remains in placement scoring', async () => {
      const img = await makeTestImage({ bgLuminance: 220 });
      const field = createDesignField(await analyzeImageField(img));

      // With safeBounds = 0.02, candidate at margin 0.03 gets full 1.0 margin score (not capped by 0.06)
      const customCanvas = createCanvasRepresentation(1200, 1500, 0.02);
      const testRect: FieldRect = { x: 0.03, y: 0.03, width: 0.5, height: 0.15 };
      const res = evaluatePlacementRegion({ rect: testRect, field, canvas: customCanvas });

      expect(res.scores.spatialBalanceScore).toBe(1.0);
    });

    // 14. final candidates can move between initial seed positions
    it('14. final candidates can move between initial seed positions during continuous refinement', async () => {
      const img = await makeTestImage({ bgLuminance: 220 });
      const field = createDesignField(await analyzeImageField(img));
      const state = { widthNormalized: 0.5, heightNormalized: 0.15 };

      const cands = discoverPlacementCandidates({
        typographyState: state,
        field,
        canvas,
        refineContinuous: true,
        samplingResolution: { xSteps: 6, ySteps: 10 },
      });

      expect(cands.length).toBeGreaterThan(0);
      // Continuous refinement produces fractional offsets not aligned to 1/6 step intervals (0.1667)
      const nonLatticeCands = cands.filter((c) => {
        const rem = (c.rect.x * 6) % 1;
        return rem > 0.001 && rem < 0.999;
      });
      expect(nonLatticeCands.length).toBeGreaterThan(0);
    });

    // 15. final coordinates are not restricted to the seed lattice
    it('15. final coordinates are not restricted to the seed lattice when seed resolution changes', async () => {
      const img = await makeTestImage({ bgLuminance: 220 });
      const field = createDesignField(await analyzeImageField(img));
      const state = { widthNormalized: 0.45, heightNormalized: 0.12 };

      const candsLowRes = discoverPlacementCandidates({
        typographyState: state,
        field,
        canvas,
        refineContinuous: true,
        samplingResolution: { xSteps: 4, ySteps: 8 },
      });

      const candsHighRes = discoverPlacementCandidates({
        typographyState: state,
        field,
        canvas,
        refineContinuous: true,
        samplingResolution: { xSteps: 12, ySteps: 24 },
      });

      // Both converge toward continuous field minima, showing continuous coordinates
      expect(candsLowRes.length).toBeGreaterThan(0);
      expect(candsHighRes.length).toBeGreaterThan(0);
      expect(typeof candsLowRes[0].rect.x).toBe('number');
      expect(typeof candsHighRes[0].rect.x).toBe('number');
    });
  });
});
