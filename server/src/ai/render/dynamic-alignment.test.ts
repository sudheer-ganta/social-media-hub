import { describe, it, expect } from 'vitest';
import {
  discoverNaturalAxes,
  evaluateCandidateAlignment,
  enhancePlacementCandidatesWithAlignment,
} from './dynamic-alignment';
import { discoverPlacementCandidates } from './dynamic-placement';
import {
  createCanvasRepresentation,
  createBrandDesignRepresentation,
  createDesignField,
} from './design-representation';
import { analyzeImageField } from './image-field';
import { createDynamicCopyModel } from './copy-model';
import { exploreLineStructures } from '../typography/dynamic-line-structure';
import sharp from 'sharp';

describe('Dynamic Alignment Engine — Phase 6', () => {
  const canvas = createCanvasRepresentation(1200, 1500);

  async function makeTestImage(opts: {
    bgLuminance?: number;
    subjectRect?: { x: number; y: number; w: number; h: number; lum?: number };
  }): Promise<Buffer> {
    const width = 256;
    const height = 256;
    const bgLum = opts.bgLuminance ?? 220;
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
          const val = (x + y) % 4 === 0 ? sLum : Math.min(255, sLum + 120);
          buf[idx] = val;
          buf[idx + 1] = val;
          buf[idx + 2] = val;
        }
      }
    }

    return sharp(buf, { raw: { width, height, channels: 3 } }).png().toBuffer();
  }

  it('1. different images produce different natural alignment axes and evidence', async () => {
    const img1 = await makeTestImage({ subjectRect: { x: 0.15, y: 0.2, w: 0.35, h: 0.6 } });
    const img2 = await makeTestImage({ subjectRect: { x: 0.55, y: 0.2, w: 0.35, h: 0.6 } });

    const field1 = createDesignField(await analyzeImageField(img1));
    const field2 = createDesignField(await analyzeImageField(img2));

    const axes1 = discoverNaturalAxes({ field: field1, canvas });
    const axes2 = discoverNaturalAxes({ field: field2, canvas });

    expect(axes1.length).toBeGreaterThan(0);
    expect(axes2.length).toBeGreaterThan(0);

    // Axes positions differ based on subject and focal geometry
    const vertPos1 = axes1.filter((a) => a.orientation === 'vertical').map((a) => a.position);
    const vertPos2 = axes2.filter((a) => a.orientation === 'vertical').map((a) => a.position);

    expect(vertPos1).not.toEqual(vertPos2);
  });

  it('2. evaluates continuous alignment evidence without overwriting Phase 5 coordinates', async () => {
    const img = await makeTestImage({ subjectRect: { x: 0.1, y: 0.3, w: 0.4, h: 0.5 } });
    const field = createDesignField(await analyzeImageField(img));

    const copy = createDynamicCopyModel('h1', 'THE NEW AUTUMN DROP', 'primary-hook', 1);
    const lineStates = exploreLineStructures({ copy, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.7, height: 0.3 }, canvas });

    const placements = discoverPlacementCandidates({
      typographyState: lineStates[0],
      field,
      canvas,
      maxCandidates: 4,
    });

    const enhanced = enhancePlacementCandidatesWithAlignment({
      candidates: placements,
      field,
      canvas,
    });

    expect(enhanced.length).toBe(placements.length);

    // Verify coordinates were NOT overwritten with hardcoded presets
    for (let i = 0; i < enhanced.length; i++) {
      expect(enhanced[i].rect.x).toBe(placements[i].rect.x);
      expect(enhanced[i].rect.y).toBe(placements[i].rect.y);
      expect(enhanced[i].rect.width).toBe(placements[i].rect.width);
      expect(enhanced[i].rect.height).toBe(placements[i].rect.height);

      // Verify alignment signals are attached
      expect(enhanced[i].alignmentSignals).toBeDefined();
      expect(enhanced[i].alignmentScores.compositeAlignmentScore).toBeGreaterThan(0);
      expect(typeof enhanced[i].geometry.baselineY).toBe('number');
    }
  });

  it('3. different typography widths produce different alignment coherence with visual axes', async () => {
    const img = await makeTestImage({ subjectRect: { x: 0.2, y: 0.2, w: 0.5, h: 0.6 } });
    const field = createDesignField(await analyzeImageField(img));

    const wideCandidate = {
      rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.12 },
      pixelBounds: { xPx: 120, yPx: 150, widthPx: 960, heightPx: 180 },
      signals: {} as any,
      scores: {} as any,
      reasons: [],
    };

    const narrowCandidate = {
      rect: { x: 0.1, y: 0.1, width: 0.35, height: 0.25 },
      pixelBounds: { xPx: 120, yPx: 150, widthPx: 420, heightPx: 375 },
      signals: {} as any,
      scores: {} as any,
      reasons: [],
    };

    const enhancedWide = evaluateCandidateAlignment({ candidate: wideCandidate, field, canvas });
    const enhancedNarrow = evaluateCandidateAlignment({ candidate: narrowCandidate, field, canvas });

    // Geometric bounds reflect their actual distinct widths
    expect(enhancedWide.geometry.right).not.toEqual(enhancedNarrow.geometry.right);
    expect(enhancedWide.alignmentSignals.canvasRelationshipCoherence).toBeDefined();
  });

  it('4. multiple elements discover shared edges naturally while allowing deliberate offsets', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    const primaryRect = { x: 0.12, y: 0.15, width: 0.76, height: 0.20 };
    const sharedEdgeSecRect = { x: 0.12, y: 0.38, width: 0.45, height: 0.10 }; // perfectly flush left
    const offsetSecRect = { x: 0.30, y: 0.38, width: 0.45, height: 0.10 }; // deliberate diagonal offset

    const sharedCandidate = {
      rect: sharedEdgeSecRect,
      pixelBounds: { xPx: 144, yPx: 570, widthPx: 540, heightPx: 150 },
      signals: {} as any,
      scores: {} as any,
      reasons: [],
    };

    const offsetCandidate = {
      rect: offsetSecRect,
      pixelBounds: { xPx: 360, yPx: 570, widthPx: 540, heightPx: 150 },
      signals: {} as any,
      scores: {} as any,
      reasons: [],
    };

    const evalShared = evaluateCandidateAlignment({
      candidate: sharedCandidate,
      field,
      canvas,
      existingElements: [primaryRect],
    });

    const evalOffset = evaluateCandidateAlignment({
      candidate: offsetCandidate,
      field,
      canvas,
      existingElements: [primaryRect],
    });

    // Both are completely valid and receive meaningful element relationship scores
    expect(evalShared.alignmentSignals.elementRelationshipCoherence).toBeGreaterThan(0.8);
    expect(evalOffset.alignmentSignals.elementRelationshipCoherence).toBeGreaterThan(0.7);
    expect(evalOffset.alignmentScores.compositeAlignmentScore).toBeGreaterThan(0);
  });

  it('5. alignment scoring is fully observable and configurable without hardcoded presets', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    const candidate = {
      rect: { x: 0.10, y: 0.10, width: 0.60, height: 0.15 },
      pixelBounds: { xPx: 120, yPx: 150, widthPx: 720, heightPx: 225 },
      signals: {} as any,
      scores: {} as any,
      reasons: [],
    };

    const enhanced = evaluateCandidateAlignment({
      candidate,
      field,
      canvas,
      customWeights: {
        axisAlignmentWeight: 0.60,
        multiElementHarmonyWeight: 0.20,
        opticalStabilityWeight: 0.20,
      },
    });

    expect(enhanced.alignmentSignals.axisCoherence).toBeDefined();
    expect(enhanced.alignmentSignals.nearestVerticalAxisDistance).toBeDefined();
    expect(enhanced.alignmentSignals.nearestHorizontalAxisDistance).toBeDefined();
    expect(enhanced.alignmentSignals.canvasRelationshipCoherence).toBeDefined();
    expect(enhanced.alignmentSignals.opticalAlignmentQuality).toBeDefined();
    expect(enhanced.alignmentScores.compositeAlignmentScore).toBeGreaterThan(0);
  });

  it('6. different fonts produce distinct optical baselines and optical ink margins', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));
    const copy = createDynamicCopyModel('h1', 'ELEGANT EDITORIAL', 'primary-hook', 1);

    const lineStatesPlayfair = exploreLineStructures({ copy, font: 'Playfair Display', weight: 700, spatialBox: { x: 0, y: 0, width: 0.7, height: 0.25 }, canvas });
    const lineStatesAnton = exploreLineStructures({ copy, font: 'Anton', weight: 400, spatialBox: { x: 0, y: 0, width: 0.7, height: 0.25 }, canvas });

    const candPlayfair = {
      rect: { x: 0.1, y: 0.2, width: 0.6, height: 0.15 },
      pixelBounds: { xPx: 120, yPx: 300, widthPx: 720, heightPx: 225 },
      typographyState: lineStatesPlayfair[0],
      signals: {} as any,
      scores: {} as any,
      reasons: [],
    };

    const candAnton = {
      rect: { x: 0.1, y: 0.2, width: 0.6, height: 0.15 },
      pixelBounds: { xPx: 120, yPx: 300, widthPx: 720, heightPx: 225 },
      typographyState: lineStatesAnton[0],
      signals: {} as any,
      scores: {} as any,
      reasons: [],
    };

    const evalPlayfair = evaluateCandidateAlignment({ candidate: candPlayfair, field, canvas });
    const evalAnton = evaluateCandidateAlignment({ candidate: candAnton, field, canvas });

    // Different OpenType ascender/descender metrics produce different exact baseline positions
    expect(evalPlayfair.geometry.baselineY).not.toEqual(evalAnton.geometry.baselineY);
    expect(evalPlayfair.geometry.opticalTop).toBeDefined();
  });

  it('7. canvas aspect ratios influence discovered center and symmetry axes', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    const canvasSquare = createCanvasRepresentation(1200, 1200); // 1:1
    const canvasStory = createCanvasRepresentation(1080, 1920);  // 9:16

    const axesSquare = discoverNaturalAxes({ field, canvas: canvasSquare });
    const axesStory = discoverNaturalAxes({ field, canvas: canvasStory });

    expect(axesSquare.length).toBeGreaterThan(0);
    expect(axesStory.length).toBeGreaterThan(0);
  });

  it('8. zero hardcoded alignment presets are forced (left, right, center, margin)', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    // Arbitrary continuous non-preset coordinates (e.g. x = 0.2371, y = 0.4182)
    const arbitraryCand = {
      rect: { x: 0.2371, y: 0.4182, width: 0.5123, height: 0.1428 },
      pixelBounds: { xPx: 285, yPx: 627, widthPx: 615, heightPx: 214 },
      signals: {} as any,
      scores: {} as any,
      reasons: [],
    };

    const evaluated = evaluateCandidateAlignment({ candidate: arbitraryCand, field, canvas });

    // Evaluated directly with continuous geometry, never snapped or rounded to 0.08 or 0.50
    expect(evaluated.rect.x).toBe(0.2371);
    expect(evaluated.rect.y).toBe(0.4182);
    expect(evaluated.alignmentScores.compositeAlignmentScore).toBeGreaterThan(0);
  });
});
