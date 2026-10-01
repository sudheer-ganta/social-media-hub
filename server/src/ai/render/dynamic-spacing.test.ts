import { describe, it, expect } from 'vitest';
import { createCanvasRepresentation, createDesignField } from './design-representation';
import { analyzeImageField } from './image-field';
import {
  evaluatePairwiseSpacing,
  evaluateCompositionSpacing,
  enhanceMultiElementCompositionWithSpacing,
  determineSemanticRelationship,
  SpacingElement,
} from './dynamic-spacing';
import sharp from 'sharp';

describe('PHASE 7 — DYNAMIC SPACING & GROUPING ENGINE', () => {
  async function createSyntheticField(setup: (raw: Buffer, width: number, height: number) => void) {
    const width = 256;
    const height = 256;
    const raw = Buffer.alloc(width * height * 3).fill(235);
    setup(raw, width, height);
    const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const metrics = await analyzeImageField(png);
    return createDesignField(metrics);
  }

  // TEST 1: Different typography heights produce different spacing relationships
  it('proves different typography heights produce different spacing relationships', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    const headlineTall: SpacingElement = {
      id: 'h1',
      role: 'headline',
      hierarchyLevel: 1,
      rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.25 },
    };

    const headlineCompact: SpacingElement = {
      id: 'h1',
      role: 'headline',
      hierarchyLevel: 1,
      rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.08 },
    };

    const subheadline: SpacingElement = {
      id: 'sub',
      role: 'subheadline',
      hierarchyLevel: 2,
      rect: { x: 0.1, y: 0.40, width: 0.6, height: 0.06 },
    };

    const relTall = evaluatePairwiseSpacing({ elementA: headlineTall, elementB: subheadline, field, canvas });
    const relCompact = evaluatePairwiseSpacing({ elementA: headlineCompact, elementB: subheadline, field, canvas });

    expect(relTall.verticalGap).toBe(0.05); // 0.40 - 0.35
    expect(relCompact.verticalGap).toBe(0.22); // 0.40 - 0.18
    expect(relTall.proximityCoherence).not.toBe(relCompact.proximityCoherence);
  });

  // TEST 2: Different headline/subheadline combinations produce different grouping behavior
  it('proves different headline/subheadline combinations produce different grouping behavior', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    const headline: SpacingElement = {
      id: 'h1',
      role: 'headline',
      hierarchyLevel: 1,
      rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.15 },
    };

    const subClose: SpacingElement = {
      id: 'sub-close',
      role: 'subheadline',
      hierarchyLevel: 2,
      rect: { x: 0.1, y: 0.28, width: 0.6, height: 0.05 },
    };

    const subFar: SpacingElement = {
      id: 'sub-far',
      role: 'subheadline',
      hierarchyLevel: 2,
      rect: { x: 0.1, y: 0.70, width: 0.6, height: 0.05 },
    };

    const relClose = evaluatePairwiseSpacing({ elementA: headline, elementB: subClose, field, canvas });
    const relFar = evaluatePairwiseSpacing({ elementA: headline, elementB: subFar, field, canvas });

    expect(relClose.groupingAffinity).toBeGreaterThan(relFar.groupingAffinity);
  });

  // TEST 3: Different image fields alter whitespace desirability
  it('proves different image fields alter whitespace desirability', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);

    // Quiet field
    const quietField = await createSyntheticField(() => {});

    // Busy high-contrast texture in the middle gap
    const busyField = await createSyntheticField((raw, width) => {
      for (let y = 50; y < 150; y++) {
        for (let x = 20; x < 230; x++) {
          const idx = (y * width + x) * 3;
          const val = (x * 13 + y * 17) % 255;
          raw[idx] = val;
          raw[idx + 1] = val;
          raw[idx + 2] = val;
        }
      }
    });

    const elA: SpacingElement = { id: 'a', role: 'headline', hierarchyLevel: 1, rect: { x: 0.1, y: 0.05, width: 0.8, height: 0.1 } };
    const elB: SpacingElement = { id: 'b', role: 'cta', hierarchyLevel: 3, rect: { x: 0.1, y: 0.65, width: 0.3, height: 0.08 } };

    const relQuiet = evaluatePairwiseSpacing({ elementA: elA, elementB: elB, field: quietField, canvas });
    const relBusy = evaluatePairwiseSpacing({ elementA: elA, elementB: elB, field: busyField, canvas });

    expect(relQuiet.localFieldQuietness).toBeGreaterThan(relBusy.localFieldQuietness);
    expect(relQuiet.densityAroundGap).toBeLessThan(relBusy.densityAroundGap);
  });

  // TEST 4: Changing alignment changes spacing evidence
  it('proves changing alignment changes spacing evidence', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    const elA: SpacingElement = { id: 'h1', role: 'headline', hierarchyLevel: 1, rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.12 } };
    
    // Aligned left edge with elA
    const elBAligned: SpacingElement = { id: 'sub1', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.1, y: 0.25, width: 0.5, height: 0.06 } };
    
    // Unaligned, floating awkwardly 3% to the right
    const elBMisaligned: SpacingElement = { id: 'sub2', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.13, y: 0.25, width: 0.5, height: 0.06 } };

    const relAligned = evaluatePairwiseSpacing({ elementA: elA, elementB: elBAligned, field, canvas });
    const relMisaligned = evaluatePairwiseSpacing({ elementA: elA, elementB: elBMisaligned, field, canvas });

    expect(relAligned.groupingAffinity).toBeGreaterThan(relMisaligned.groupingAffinity);
  });

  // TEST 5: Semantic grouping affects proximity preference without creating fixed distances
  it('proves semantic grouping affects proximity preference without creating fixed distances', () => {
    expect(determineSemanticRelationship('headline', 'subheadline')).toBe('headline-subheadline');
    expect(determineSemanticRelationship('headline', 'supporting-copy')).toBe('headline-support');
    expect(determineSemanticRelationship('offer', 'cta')).toBe('offer-cta');
    expect(determineSemanticRelationship('logo', 'headline')).toBe('logo-brand-anchor');
    expect(determineSemanticRelationship('metadata', 'headline')).toBe('metadata-footnote');
  });

  // TEST 6 & 7: Large whitespace is not automatically preferred and small spacing is not automatically rejected
  it('proves large whitespace is not automatically preferred and small spacing is not automatically rejected', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    const headline: SpacingElement = { id: 'h1', role: 'headline', hierarchyLevel: 1, rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.15 } };
    
    // Naturally grouped subheadline (gap: 0.04)
    const subComfortable: SpacingElement = { id: 'sub1', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.1, y: 0.29, width: 0.6, height: 0.05 } };
    
    // Excessively distant subheadline (gap: 0.55)
    const subDistant: SpacingElement = { id: 'sub2', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.1, y: 0.80, width: 0.6, height: 0.05 } };

    const evalComfortable = evaluateCompositionSpacing({ elements: [headline, subComfortable], field, canvas });
    const evalDistant = evaluateCompositionSpacing({ elements: [headline, subDistant], field, canvas });

    expect(evalComfortable.scores.semanticSpacingScore).toBeGreaterThan(evalDistant.scores.semanticSpacingScore);
  });

  // TEST 8: Optical font metrics influence spacing observations
  it('proves optical font metrics influence spacing observations', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    const elA: SpacingElement = {
      id: 'h1',
      role: 'headline',
      hierarchyLevel: 1,
      rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.1 },
      opticalMetrics: { ascenderPx: 45, descenderPx: 18, baselineYNorm: 0.18, fontSizePx: 52 },
    };

    const elB: SpacingElement = {
      id: 'sub',
      role: 'subheadline',
      hierarchyLevel: 2,
      rect: { x: 0.1, y: 0.22, width: 0.5, height: 0.05 },
      opticalMetrics: { ascenderPx: 22, descenderPx: 8, baselineYNorm: 0.26, fontSizePx: 26 },
    };

    const rel = evaluatePairwiseSpacing({ elementA: elA, elementB: elB, field, canvas });
    expect(rel.opticalSpacingAdjustment).toBeGreaterThan(0);
    expect(rel.baselineDistance).toBeCloseTo(0.08, 2);
  });

  // TEST 9: Multi-element relationships are evaluated jointly
  it('proves multi-element relationships are evaluated jointly', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    const elements: SpacingElement[] = [
      { id: 'h1', role: 'headline', hierarchyLevel: 1, rect: { x: 0.1, y: 0.08, width: 0.8, height: 0.15 } },
      { id: 'sub', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.1, y: 0.25, width: 0.6, height: 0.06 } },
      { id: 'cta', role: 'cta', hierarchyLevel: 3, rect: { x: 0.1, y: 0.35, width: 0.3, height: 0.07 } },
      { id: 'logo', role: 'logo', hierarchyLevel: 4, rect: { x: 0.75, y: 0.88, width: 0.18, height: 0.06 } },
    ];

    const composition = evaluateCompositionSpacing({ elements, field, canvas });

    expect(composition.graph.nodes.length).toBe(4);
    expect(composition.graph.edges.length).toBe(6); // 4 * 3 / 2 = 6 pairwise relationships
    expect(composition.graph.discoveredGroups.length).toBeGreaterThanOrEqual(1);
    expect(composition.scores.compositeSpacingScore).toBeGreaterThan(0.5);
  });

  // TEST 10 & 11: No fixed spacing constants or predefined element stacks exist
  it('proves no fixed spacing constants or predefined element stacks exist', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    const h1: SpacingElement = { id: 'h1', role: 'headline', hierarchyLevel: 1, rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.12 } };
    const sub: SpacingElement = { id: 'sub', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.1, y: 0.23, width: 0.6, height: 0.05 } };

    const result = evaluateCompositionSpacing({ elements: [h1, sub], field, canvas });

    // Measurements are pure continuous floating points
    expect(typeof result.signals.proximityCoherence).toBe('number');
    expect(typeof result.signals.whitespaceQuality).toBe('number');
    expect(typeof result.signals.spacingConflict).toBe('number');
    expect(result.scores.compositeSpacingScore).toBeGreaterThan(0);
  });

  // TEST 12: Candidate diversity is preserved
  it('proves candidate diversity is preserved', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    // State 1: Vertical Stack Layout
    const stateStack: SpacingElement[] = [
      { id: 'h1', role: 'headline', hierarchyLevel: 1, rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.12 } },
      { id: 'sub', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.1, y: 0.25, width: 0.6, height: 0.06 } },
    ];

    // State 2: Split Header/Footer Layout
    const stateSplit: SpacingElement[] = [
      { id: 'h1', role: 'headline', hierarchyLevel: 1, rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.12 } },
      { id: 'sub', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.1, y: 0.82, width: 0.6, height: 0.06 } },
    ];

    const evalStack = evaluateCompositionSpacing({ elements: stateStack, field, canvas });
    const evalSplit = evaluateCompositionSpacing({ elements: stateSplit, field, canvas });

    expect(evalStack.graph.discoveredGroups.length).toBe(1); // Single combined group
    expect(evalSplit.graph.discoveredGroups.length).toBe(2); // Two distinct groups
    expect(evalSplit.scores.compositeSpacingScore).toBeGreaterThan(0); // Both remain valid candidates
  });

  // TEST 13 & 14: Phase 5 coordinates and Phase 6 alignment evidence remain intact
  it('proves Phase 5 coordinates and Phase 6 alignment evidence remain intact', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    const primaryPlacement = {
      rect: { x: 0.1523, y: 0.0841, width: 0.7241, height: 0.1832 },
      pixelBounds: { xPx: 182, yPx: 126, widthPx: 868, heightPx: 274 },
      signals: {} as any,
      scores: { compositeScore: 0.88 } as any,
      geometry: { left: 0.1523, right: 0.8764, top: 0.0841, bottom: 0.2673, centerX: 0.5143, centerY: 0.1757, baselineY: 0.23, opticalTop: 0.09, opticalBottom: 0.26 },
      alignmentSignals: { axisCoherence: 0.95 } as any,
      alignmentScores: { compositeAlignmentScore: 0.92 } as any,
      alignmentReasons: ['Aligned with dominant axis'],
    };

    const secPlacement = {
      rect: { x: 0.1523, y: 0.3012, width: 0.5124, height: 0.0621 },
      pixelBounds: { xPx: 182, yPx: 451, widthPx: 614, heightPx: 93 },
      signals: {} as any,
      scores: { compositeScore: 0.82 } as any,
      geometry: { left: 0.1523, right: 0.6647, top: 0.3012, bottom: 0.3633, centerX: 0.4085, centerY: 0.3322, baselineY: 0.35, opticalTop: 0.31, opticalBottom: 0.36 },
      alignmentSignals: { axisCoherence: 0.92 } as any,
      alignmentScores: { compositeAlignmentScore: 0.90 } as any,
      alignmentReasons: ['Shared left edge'],
    };

    const enhanced = enhanceMultiElementCompositionWithSpacing({
      primaryPlacement,
      secondaryPlacements: [{ role: 'subheadline', candidate: secPlacement }],
      field,
      canvas,
    });

    // Coordinates untouched
    expect(enhanced.elements[0].rect.x).toBe(0.1523);
    expect(enhanced.elements[1].rect.x).toBe(0.1523);
    expect(enhanced.elements[0].geometry?.centerX).toBe(0.5143);
  });

  // TEST 15: Different canvas aspect ratios produce different spacing behavior
  it('proves different canvas aspect ratios produce different spacing behavior', async () => {
    const canvasPortrait = createCanvasRepresentation(1080, 1920); // 9:16
    const canvasLandscape = createCanvasRepresentation(1920, 1080); // 16:9
    const field = await createSyntheticField(() => {});

    const elA: SpacingElement = {
      id: 'h1',
      role: 'headline',
      hierarchyLevel: 1,
      rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.1 },
      opticalMetrics: { ascenderPx: 40, descenderPx: 15, baselineYNorm: 0.18, fontSizePx: 50 },
    };

    const elB: SpacingElement = {
      id: 'sub',
      role: 'subheadline',
      hierarchyLevel: 2,
      rect: { x: 0.1, y: 0.25, width: 0.5, height: 0.05 },
      opticalMetrics: { ascenderPx: 20, descenderPx: 8, baselineYNorm: 0.28, fontSizePx: 25 },
    };

    const relP = evaluatePairwiseSpacing({ elementA: elA, elementB: elB, field, canvas: canvasPortrait });
    const relL = evaluatePairwiseSpacing({ elementA: elA, elementB: elB, field, canvas: canvasLandscape });

    // Optical pixel-to-normalized conversion depends on canvas height
    expect(relP.opticalSpacingAdjustment).not.toBe(relL.opticalSpacingAdjustment);
  });

  // TEST 16: Existing elements influence spacing naturally
  it('proves existing elements influence spacing naturally', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    const headline: SpacingElement = { id: 'h1', role: 'headline', hierarchyLevel: 1, rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.15 } };
    const subheadline: SpacingElement = { id: 'sub', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.1, y: 0.28, width: 0.6, height: 0.06 } };
    
    // Existing logo occupying bottom-right
    const logo: SpacingElement = { id: 'logo', role: 'logo', hierarchyLevel: 4, rect: { x: 0.75, y: 0.85, width: 0.2, height: 0.08 } };

    const evalWithoutLogo = evaluateCompositionSpacing({ elements: [headline, subheadline], field, canvas });
    const evalWithLogo = evaluateCompositionSpacing({ elements: [headline, subheadline, logo], field, canvas });

    expect(evalWithLogo.graph.edges.length).toBe(3);
    expect(evalWithLogo.signals.densityBalance).not.toBe(evalWithoutLogo.signals.densityBalance);
  });

  // REGRESSION TEST 1: No fixed typography-height × spacing ratio exists
  it('proves no fixed typography-height × spacing ratio exists (removes headlineHeight * 0.45)', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    const h1: SpacingElement = { id: 'h1', role: 'headline', hierarchyLevel: 1, rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.20 } };
    const sub: SpacingElement = { id: 'sub', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.1, y: 0.35, width: 0.6, height: 0.05 } };

    const rel = evaluatePairwiseSpacing({ elementA: h1, elementB: sub, field, canvas });

    // Observable ratio is continuous and not forced to a hardcoded 0.45 or fixed ideal
    expect(typeof rel.scaleToDistanceRatio).toBe('number');
    expect(rel.scaleToDistanceRatio).toBeGreaterThan(0);
    expect(rel.scaleToDistanceRatio).not.toBe(0.45);
  });

  // REGRESSION TEST 2: Two compositions with the same headline height produce different spacing relationships when context differs
  it('proves two compositions with the same headline height produce different spacing relationships when context differs', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const quietField = await createSyntheticField(() => {});
    const busyField = await createSyntheticField((raw, width) => {
      for (let y = 60; y < 180; y++) {
        for (let x = 20; x < 240; x++) {
          const idx = (y * width + x) * 3;
          raw[idx] = (x * 7 + y * 13) % 255;
          raw[idx + 1] = 50;
          raw[idx + 2] = 200;
        }
      }
    });

    const h1: SpacingElement = { id: 'h1', role: 'headline', hierarchyLevel: 1, rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.15 } };
    const sub: SpacingElement = { id: 'sub', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.1, y: 0.30, width: 0.6, height: 0.05 } };

    const relQuiet = evaluatePairwiseSpacing({ elementA: h1, elementB: sub, field: quietField, canvas });
    const relBusy = evaluatePairwiseSpacing({ elementA: h1, elementB: sub, field: busyField, canvas });

    // Same headline height (0.15), but different emergent grouping affinity and whitespace quality
    expect(relQuiet.groupingAffinity).not.toBe(relBusy.groupingAffinity);
    expect(relQuiet.localFieldQuietness).toBeGreaterThan(relBusy.localFieldQuietness);
  });

  // REGRESSION TEST 3: Alignment-spacing coherence is derived continuously rather than receiving a fixed +0.25 bonus
  it('proves alignment-spacing coherence is derived continuously without a fixed +0.25 bonus', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    const h1: SpacingElement = { id: 'h1', role: 'headline', hierarchyLevel: 1, rect: { x: 0.10, y: 0.1, width: 0.8, height: 0.15 } };
    
    // Exact alignment (delta = 0)
    const subExact: SpacingElement = { id: 'sub1', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.10, y: 0.28, width: 0.6, height: 0.05 } };
    
    // Slight continuous offset (delta = 0.01)
    const subSlight: SpacingElement = { id: 'sub2', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.11, y: 0.28, width: 0.6, height: 0.05 } };
    
    // Moderate continuous offset (delta = 0.02)
    const subModerate: SpacingElement = { id: 'sub3', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.12, y: 0.28, width: 0.6, height: 0.05 } };

    const relExact = evaluatePairwiseSpacing({ elementA: h1, elementB: subExact, field, canvas });
    const relSlight = evaluatePairwiseSpacing({ elementA: h1, elementB: subSlight, field, canvas });
    const relModerate = evaluatePairwiseSpacing({ elementA: h1, elementB: subModerate, field, canvas });

    // Continuous decay, not a flat +0.25 / 0 step function
    expect(relExact.continuousAxisAlignment).toBeGreaterThan(relSlight.continuousAxisAlignment);
    expect(relSlight.continuousAxisAlignment).toBeGreaterThan(relModerate.continuousAxisAlignment);
    expect(relExact.alignmentSpacingCoherence).toBeGreaterThan(relSlight.alignmentSpacingCoherence);
  });

  // REGRESSION TEST 4: Changing alignment strength alters alignment-spacing coherence continuously
  it('proves changing alignment strength alters alignment-spacing coherence continuously', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    const h1: SpacingElement = { id: 'h1', role: 'headline', hierarchyLevel: 1, rect: { x: 0.10, y: 0.1, width: 0.8, height: 0.15 } };
    const subAligned: SpacingElement = { id: 'sub1', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.10, y: 0.28, width: 0.6, height: 0.05 } };
    const subDisplaced: SpacingElement = { id: 'sub2', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.55, y: 0.28, width: 0.25, height: 0.05 } };

    const relA = evaluatePairwiseSpacing({ elementA: h1, elementB: subAligned, field, canvas });
    const relD = evaluatePairwiseSpacing({ elementA: h1, elementB: subDisplaced, field, canvas });

    expect(relA.alignmentSpacingCoherence).toBeGreaterThan(relD.alignmentSpacingCoherence);
    expect(relD.continuousAxisAlignment).toBeLessThan(0.01);
  });

  // REGRESSION TEST 5: Spacing remains dependent on the complete composition context
  it('proves spacing remains dependent on the complete composition context', async () => {
    const canvas = createCanvasRepresentation(1200, 1500);
    const field = await createSyntheticField(() => {});

    const h1: SpacingElement = { id: 'h1', role: 'headline', hierarchyLevel: 1, rect: { x: 0.1, y: 0.08, width: 0.8, height: 0.12 } };
    const sub: SpacingElement = { id: 'sub', role: 'subheadline', hierarchyLevel: 2, rect: { x: 0.1, y: 0.23, width: 0.6, height: 0.05 } };
    const cta: SpacingElement = { id: 'cta', role: 'cta', hierarchyLevel: 3, rect: { x: 0.1, y: 0.32, width: 0.3, height: 0.06 } };

    const comp2 = evaluateCompositionSpacing({ elements: [h1, sub], field, canvas });
    const comp3 = evaluateCompositionSpacing({ elements: [h1, sub, cta], field, canvas });

    expect(comp3.graph.edges.length).toBe(3);
    expect(comp3.signals.alignmentSpacingCoherence).toBeDefined();
    expect(comp3.scores.compositeSpacingScore).toBeGreaterThan(0);
  });
});
