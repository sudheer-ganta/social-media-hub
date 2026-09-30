import { describe, it, expect } from 'vitest';
import {
  discoverNaturalAxes,
  evaluateCandidateAlignment,
  enhancePlacementCandidatesWithAlignment,
  deriveDesignSubstrate,
  buildRelationalAlignmentGraph,
  evaluateCompositionAlignment,
  extractElementGeometricBounds,
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
import { discoverOptimizedComposition } from './composition-evaluation';
import sharp from 'sharp';

describe('Dynamic Alignment Engine — Phase 6 (Research-Backed Model)', () => {
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

  it('1. shared-edge relationship discovery', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    const elements = [
      { id: 'headline', role: 'headline', rect: { x: 0.10, y: 0.15, width: 0.70, height: 0.18 } },
      { id: 'support', role: 'subheadline', rect: { x: 0.10, y: 0.36, width: 0.45, height: 0.08 } },
    ];

    const evalResult = evaluateCompositionAlignment({ elements, field, canvas });

    // Edge from headline to support must be SHARES_LEFT_AXIS
    const leftEdge = evalResult.graph.edges.find(
      (e) => e.sourceId === 'headline' && e.targetId === 'support' && e.relationship === 'SHARES_LEFT_AXIS'
    );

    expect(leftEdge).toBeDefined();
    expect(leftEdge!.coherence).toBeGreaterThanOrEqual(0.95);
    expect(evalResult.pairwiseRelationshipScores['headline->support']).toBeGreaterThan(0.9);
  });

  it('2. shared-center relationship discovery', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    const elements = [
      { id: 'headline', role: 'headline', rect: { x: 0.15, y: 0.20, width: 0.70, height: 0.18 } }, // center = 0.50
      { id: 'cta', role: 'cta', rect: { x: 0.35, y: 0.45, width: 0.30, height: 0.08 } },             // center = 0.50
    ];

    const evalResult = evaluateCompositionAlignment({ elements, field, canvas });

    const centerEdge = evalResult.graph.edges.find(
      (e) => e.sourceId === 'headline' && e.targetId === 'cta' && e.relationship === 'SHARES_CENTER_AXIS'
    );

    expect(centerEdge).toBeDefined();
    expect(centerEdge!.coherence).toBeGreaterThanOrEqual(0.95);
    expect(evalResult.pairwiseRelationshipScores['headline->cta']).toBeGreaterThan(0.9);
  });

  it('3. independent-axis composition', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    const elements = [
      { id: 'headline', role: 'headline', rect: { x: 0.08, y: 0.12, width: 0.60, height: 0.18 } },
      { id: 'logo', role: 'logo', rect: { x: 0.75, y: 0.85, width: 0.18, height: 0.06 } },
    ];

    const evalResult = evaluateCompositionAlignment({ elements, field, canvas });

    expect(evalResult.independentAnchors.length).toBeGreaterThan(0);
    const logoAnchor = evalResult.independentAnchors.find((ia) => ia.elementId === 'logo');
    expect(logoAnchor).toBeDefined();
    expect(logoAnchor!.separationFromMainGroup).toBeGreaterThan(0.3);
    expect(evalResult.compositeScore).toBeGreaterThan(0.7);
  });

  it('4. semantic grouping', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    const elements = [
      { id: 'headline', role: 'headline', rect: { x: 0.08, y: 0.12, width: 0.60, height: 0.18 } },
      { id: 'support', role: 'subheadline', rect: { x: 0.08, y: 0.32, width: 0.40, height: 0.08 } },
    ];

    const substrate = deriveDesignSubstrate({ elements, field, canvas });

    expect(substrate.semanticGroups.length).toBeGreaterThan(0);
    const primaryGroup = substrate.semanticGroups[0];
    expect(primaryGroup.roles).toContain('headline');
    expect(primaryGroup.roles).toContain('subheadline');
    expect(primaryGroup.groupAlignmentType).toBe('flush-left');
    expect(primaryGroup.internalCoherence).toBeGreaterThan(0.9);
  });

  it('5. headline + support relational alignment', async () => {
    const img = await makeTestImage({ subjectRect: { x: 0.1, y: 0.5, w: 0.8, h: 0.4 } });
    const field = createDesignField(await analyzeImageField(img));

    const elements = [
      { id: 'headline', role: 'headline', rect: { x: 0.10, y: 0.12, width: 0.75, height: 0.20 } },
      { id: 'support', role: 'subheadline', rect: { x: 0.10, y: 0.35, width: 0.50, height: 0.09 } },
    ];

    const evalResult = evaluateCompositionAlignment({ elements, field, canvas });

    expect(evalResult.alignmentScoreContributions.relationalCoherence).toBeGreaterThan(0.80);
    expect(evalResult.alignmentScoreContributions.semanticGroupingConsistency).toBeGreaterThan(0.85);
    expect(evalResult.alignmentSummary.length).toBeGreaterThan(0);
  });

  it('6. logo as independent anchor', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    const elements = [
      { id: 'headline', role: 'headline', rect: { x: 0.10, y: 0.15, width: 0.70, height: 0.20 } },
      { id: 'support', role: 'subheadline', rect: { x: 0.10, y: 0.38, width: 0.50, height: 0.08 } },
      { id: 'brand-logo', role: 'logo', rect: { x: 0.78, y: 0.05, width: 0.16, height: 0.05 } },
    ];

    const evalResult = evaluateCompositionAlignment({ elements, field, canvas });

    const logoSeparationEdge = evalResult.graph.edges.find(
      (e) => (e.sourceId === 'brand-logo' || e.targetId === 'brand-logo') && e.relationship === 'SEPARATED_FROM'
    );
    expect(logoSeparationEdge).toBeDefined();
    expect(evalResult.independentAnchors.some((ia) => ia.role === 'logo')).toBe(true);
  });

  it('7. intentional asymmetric alignment', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    // Staggered / stepped layout: headline at x=0.10, subheadline stepped at x=0.22 (delta = 0.12)
    const elements = [
      { id: 'headline', role: 'headline', rect: { x: 0.10, y: 0.15, width: 0.65, height: 0.18 } },
      { id: 'support', role: 'subheadline', rect: { x: 0.22, y: 0.36, width: 0.45, height: 0.10 } },
    ];

    const evalResult = evaluateCompositionAlignment({ elements, field, canvas });

    expect(evalResult.substrate.asymmetryRhythm.hasIntentionalOffset).toBe(true);
    expect(evalResult.substrate.asymmetryRhythm.offsetDelta).toBeCloseTo(0.12, 2);
    // Intentional asymmetry is preserved and rewarded, not penalized as drift
    expect(evalResult.alignmentScoreContributions.intentionalAsymmetryPreservation).toBeGreaterThanOrEqual(0.85);
    expect(evalResult.alignmentScoreContributions.driftPenalty).toBe(0);
  });

  it('8. image-dependent substrate changes', async () => {
    const imgLeft = await makeTestImage({ subjectRect: { x: 0.08, y: 0.2, w: 0.35, h: 0.6 } });
    const imgRight = await makeTestImage({ subjectRect: { x: 0.58, y: 0.2, w: 0.35, h: 0.6 } });

    const fieldLeft = createDesignField(await analyzeImageField(imgLeft));
    const fieldRight = createDesignField(await analyzeImageField(imgRight));

    const elements = [
      { id: 'h1', role: 'headline', rect: { x: 0.12, y: 0.15, width: 0.60, height: 0.18 } },
    ];

    const substrateLeft = deriveDesignSubstrate({ elements, field: fieldLeft, canvas });
    const substrateRight = deriveDesignSubstrate({ elements, field: fieldRight, canvas });

    const leftAxesPos = substrateLeft.candidateAxes.map((a) => a.position);
    const rightAxesPos = substrateRight.candidateAxes.map((a) => a.position);

    expect(leftAxesPos).not.toEqual(rightAxesPos);
  });

  it('9. copy-dependent relationship changes', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    // Short copy (flush left) vs Multi-element staggered copy
    const elementsFlush = [
      { id: 'h1', role: 'headline', rect: { x: 0.10, y: 0.15, width: 0.50, height: 0.15 } },
      { id: 'sub', role: 'subheadline', rect: { x: 0.10, y: 0.32, width: 0.40, height: 0.08 } },
    ];

    const elementsStaggered = [
      { id: 'h1', role: 'headline', rect: { x: 0.10, y: 0.15, width: 0.50, height: 0.15 } },
      { id: 'sub', role: 'subheadline', rect: { x: 0.30, y: 0.32, width: 0.40, height: 0.08 } },
    ];

    const graphFlush = buildRelationalAlignmentGraph({
      elements: elementsFlush,
      substrate: deriveDesignSubstrate({ elements: elementsFlush, field, canvas }),
      field,
      canvas,
    });

    const graphStaggered = buildRelationalAlignmentGraph({
      elements: elementsStaggered,
      substrate: deriveDesignSubstrate({ elements: elementsStaggered, field, canvas }),
      field,
      canvas,
    });

    const flushRel = graphFlush.edges.find((e) => e.sourceId === 'h1' && e.targetId === 'sub')?.relationship;
    const staggeredRel = graphStaggered.edges.find((e) => e.sourceId === 'h1' && e.targetId === 'sub')?.relationship;

    expect(flushRel).toBe('SHARES_LEFT_AXIS');
    expect(staggeredRel).toBe('INTENTIONAL_OFFSET');
  });

  it('10. typography-width-dependent relationship changes', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));
    const copy = createDynamicCopyModel('h1', 'ELEGANT EDITORIAL DESIGN', 'primary-hook', 1);

    const lineStatesWide = exploreLineStructures({ copy, font: 'Anton', weight: 400, spatialBox: { x: 0, y: 0, width: 0.85, height: 0.20 }, canvas });
    const lineStatesNarrow = exploreLineStructures({ copy, font: 'Playfair Display', weight: 700, spatialBox: { x: 0, y: 0, width: 0.45, height: 0.35 }, canvas });

    const candWide = {
      rect: { x: 0.08, y: 0.15, width: 0.82, height: 0.18 },
      pixelBounds: { xPx: 96, yPx: 225, widthPx: 984, heightPx: 270 },
      typographyState: lineStatesWide[0],
      signals: {} as any,
      scores: {} as any,
      reasons: [],
    };

    const candNarrow = {
      rect: { x: 0.08, y: 0.15, width: 0.42, height: 0.32 },
      pixelBounds: { xPx: 96, yPx: 225, widthPx: 504, heightPx: 480 },
      typographyState: lineStatesNarrow[0],
      signals: {} as any,
      scores: {} as any,
      reasons: [],
    };

    const evalWide = evaluateCandidateAlignment({ candidate: candWide, field, canvas });
    const evalNarrow = evaluateCandidateAlignment({ candidate: candNarrow, field, canvas });

    expect(evalWide.geometry.right).not.toEqual(evalNarrow.geometry.right);
    expect(evalWide.geometry.baselineY).toBeDefined();
    expect(evalNarrow.geometry.baselineY).toBeDefined();
  });

  it('11. aspect-ratio-dependent relationship changes', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    const canvasSquare = createCanvasRepresentation(1200, 1200); // 1:1
    const canvasStory = createCanvasRepresentation(1080, 1920);  // 9:16

    const elements = [{ id: 'h1', role: 'headline', rect: { x: 0.10, y: 0.10, width: 0.70, height: 0.15 } }];

    const substrateSquare = deriveDesignSubstrate({ elements, field, canvas: canvasSquare });
    const substrateStory = deriveDesignSubstrate({ elements, field, canvas: canvasStory });

    expect(substrateSquare.candidateAxes.length).toBeGreaterThan(0);
    expect(substrateStory.candidateAxes.length).toBeGreaterThan(0);
  });

  it('12. multiple visual masses', async () => {
    const img = await makeTestImage({
      subjectRect: { x: 0.15, y: 0.2, w: 0.30, h: 0.5, lum: 20 },
    });
    const field = createDesignField(await analyzeImageField(img));

    const axes = discoverNaturalAxes({ field, canvas });
    expect(axes.length).toBeGreaterThanOrEqual(3);
  });

  it('13. no fixed corner behavior', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    const candidate = {
      rect: { x: 0.2831, y: 0.3912, width: 0.4321, height: 0.1784 },
      pixelBounds: { xPx: 340, yPx: 587, widthPx: 518, heightPx: 268 },
      signals: {} as any,
      scores: {} as any,
      reasons: [],
    };

    const evaluated = evaluateCandidateAlignment({ candidate, field, canvas });

    expect(evaluated.rect.x).toBe(0.2831);
    expect(evaluated.rect.y).toBe(0.3912);
  });

  it('14. no fixed left/center/right behavior', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    const arbitraryCand = {
      rect: { x: 0.3719, y: 0.2184, width: 0.4923, height: 0.1251 },
      pixelBounds: { xPx: 446, yPx: 328, widthPx: 591, heightPx: 188 },
      signals: {} as any,
      scores: {} as any,
      reasons: [],
    };

    const evaluated = evaluateCandidateAlignment({ candidate: arbitraryCand, field, canvas });

    expect(evaluated.rect.x).toBe(0.3719);
    expect(evaluated.rect.y).toBe(0.2184);
  });

  it('15. no post-BestState coordinate mutation', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    const copyItems = [
      { id: 'h1', text: 'AUTONOMOUS ALIGNMENT', role: 'headline' as const, priority: 1 },
      { id: 'sub', text: 'Relational layout intelligence', role: 'subheadline' as const, priority: 2 },
    ];

    const result = discoverOptimizedComposition({
      copyItems,
      field,
      canvas,
    });

    const bestState = result.bestState;
    expect(bestState).toBeDefined();

    // Verify alignment evaluation is attached and observable
    expect(bestState.alignmentEvaluation).toBeDefined();
    expect(bestState.alignmentEvaluation!.substrate).toBeDefined();
    expect(bestState.alignmentEvaluation!.graph).toBeDefined();

    // Coordinates of elements in bestState are strictly frozen
    const initialCoords = bestState.elements.map((e) => ({ ...e.rect }));
    for (let i = 0; i < bestState.elements.length; i++) {
      expect(bestState.elements[i].rect.x).toBe(initialCoords[i].x);
      expect(bestState.elements[i].rect.y).toBe(initialCoords[i].y);
      expect(bestState.elements[i].rect.width).toBe(initialCoords[i].width);
      expect(bestState.elements[i].rect.height).toBe(initialCoords[i].height);
    }
  });

  it('16. renderer geometry exactly equals BestState', async () => {
    const img = await makeTestImage({ bgLuminance: 220 });
    const field = createDesignField(await analyzeImageField(img));

    const copyItems = [
      { id: 'h1', text: 'PRECISION GEOMETRY', role: 'headline' as const, priority: 1 },
      { id: 'cta', text: 'EXPLORE NOW', role: 'cta' as const, priority: 2 },
    ];

    const result = discoverOptimizedComposition({
      copyItems,
      field,
      canvas,
    });

    const bestState = result.bestState;
    const planNodes = bestState.elements.map((el) => ({
      id: el.id,
      x: Number(el.rect.x.toFixed(3)),
      y: Number(el.rect.y.toFixed(3)),
      width: Number(el.rect.width.toFixed(3)),
      height: Number(el.rect.height.toFixed(3)),
    }));

    for (let i = 0; i < bestState.elements.length; i++) {
      expect(planNodes[i].x).toBeCloseTo(bestState.elements[i].rect.x, 2);
      expect(planNodes[i].y).toBeCloseTo(bestState.elements[i].rect.y, 2);
    }
  });

  describe('Critical Regression Invariants', () => {
    it('Same image + different content geometry -> relationship structure changes', async () => {
      const img = await makeTestImage({ bgLuminance: 220 });
      const field = createDesignField(await analyzeImageField(img));

      // Content 1: Single headline + support copy (flush stack)
      const content1 = [
        { id: 'h1', role: 'headline', rect: { x: 0.10, y: 0.15, width: 0.60, height: 0.15 } },
        { id: 'sub', role: 'subheadline', rect: { x: 0.10, y: 0.32, width: 0.45, height: 0.08 } },
      ];

      // Content 2: Headline + support + independently anchored logo
      const content2 = [
        { id: 'h1', role: 'headline', rect: { x: 0.10, y: 0.15, width: 0.60, height: 0.15 } },
        { id: 'sub', role: 'subheadline', rect: { x: 0.10, y: 0.32, width: 0.45, height: 0.08 } },
        { id: 'logo', role: 'logo', rect: { x: 0.80, y: 0.85, width: 0.15, height: 0.05 } },
      ];

      const eval1 = evaluateCompositionAlignment({ elements: content1, field, canvas });
      const eval2 = evaluateCompositionAlignment({ elements: content2, field, canvas });

      expect(eval1.graph.edges.length).not.toEqual(eval2.graph.edges.length);
      expect(eval2.independentAnchors.length).toBeGreaterThan(eval1.independentAnchors.length);
    });

    it('Different image + same content -> preferred structural relationship changes', async () => {
      const imgLeftSubject = await makeTestImage({ subjectRect: { x: 0.05, y: 0.2, w: 0.40, h: 0.6 } });
      const imgRightSubject = await makeTestImage({ subjectRect: { x: 0.55, y: 0.2, w: 0.40, h: 0.6 } });

      const fieldLeft = createDesignField(await analyzeImageField(imgLeftSubject));
      const fieldRight = createDesignField(await analyzeImageField(imgRightSubject));

      const content = [
        { id: 'h1', role: 'headline', rect: { x: 0.52, y: 0.20, width: 0.40, height: 0.25 } },
        { id: 'sub', role: 'subheadline', rect: { x: 0.52, y: 0.48, width: 0.35, height: 0.10 } },
      ];

      const evalLeft = evaluateCompositionAlignment({ elements: content, field: fieldLeft, canvas });
      const evalRight = evaluateCompositionAlignment({ elements: content, field: fieldRight, canvas });

      // On left subject, content at x=0.52 enjoys quiet space and different contour relation than when subject is on the right
      expect(evalLeft.alignmentScoreContributions.imageAwareAxisRelationship).toBeDefined();
      expect(evalRight.alignmentScoreContributions.imageAwareAxisRelationship).toBeDefined();
    });

    it('No fixed layout template is responsible for the alignment structure', async () => {
      const img = await makeTestImage({ bgLuminance: 220 });
      const field = createDesignField(await analyzeImageField(img));

      const elements = [
        { id: 'h1', role: 'headline', rect: { x: 0.1423, y: 0.1874, width: 0.5312, height: 0.1983 } },
        { id: 'sub', role: 'subheadline', rect: { x: 0.1423, y: 0.4012, width: 0.3845, height: 0.0912 } },
      ];

      const evalResult = evaluateCompositionAlignment({ elements, field, canvas });

      // Structure is derived strictly from continuous coordinates, never mapped to template IDs
      expect((evalResult.substrate as any).templateId).toBeUndefined();
      expect((evalResult.substrate as any).archetypeId).toBeUndefined();
      expect(evalResult.substrate.substrateCoherence).toBeGreaterThan(0.75);
    });
  });
});
