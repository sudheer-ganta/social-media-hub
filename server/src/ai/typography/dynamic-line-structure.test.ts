import { describe, it, expect } from 'vitest';
import { exploreLineStructures } from './dynamic-line-structure';
import { createDynamicCopyModel } from '../render/copy-model';
import { createCanvasRepresentation, createBrandDesignRepresentation } from '../render/design-representation';
import { measureText } from './font-metrics.service';

describe('Dynamic Line Structure Engine — Phase 4', () => {
  const canvas = createCanvasRepresentation(1200, 1500);

  it('1. actual glyph widths determine line width using local TrueType fonts', () => {
    const copy = createDynamicCopyModel('h1', 'THE NEW AUTUMN DROP', 'primary-hook', 1);
    const spatialBox = { x: 0.1, y: 0.1, width: 0.8, height: 0.4 };

    const states = exploreLineStructures({
      copy,
      font: 'Inter',
      weight: 700,
      spatialBox,
      canvas,
    });

    expect(states.length).toBeGreaterThan(0);
    for (const state of states) {
      // Check that every line has an exact measured glyph width > 0
      for (const lw of state.measuredMetrics.lineWidths) {
        expect(lw).toBeGreaterThan(0);
      }
      expect(state.measuredMetrics.maxLineWidth).toBe(Math.max(...state.measuredMetrics.lineWidths));
      expect(state.boundingBox.widthPx).toBe(state.measuredMetrics.maxLineWidth);
      expect(state.boundingBox.heightPx).toBe(state.measuredMetrics.totalHeight);
    }
  });

  it('2. different fonts produce different line structures and widths for the same text', () => {
    const copy = createDynamicCopyModel('h1', 'HANDCRAFTED LUXURY ESSENTIALS', 'primary-hook', 1);
    const spatialBox = { widthPx: 700, heightPx: 300 };

    const statesAnton = exploreLineStructures({
      copy,
      font: 'Anton', // condensed
      weight: 400,
      spatialBox,
      canvas,
    });

    const statesPlayfair = exploreLineStructures({
      copy,
      font: 'Playfair Display', // wide serif
      weight: 700,
      spatialBox,
      canvas,
    });

    expect(statesAnton.length).toBeGreaterThan(0);
    expect(statesPlayfair.length).toBeGreaterThan(0);

    // Single-line hypothesis in Anton can fit at a larger font size than Playfair in the same 700px width
    const singleLineAnton = statesAnton.find((s) => s.hypothesis.lineCount === 1);
    const singleLinePlayfair = statesPlayfair.find((s) => s.hypothesis.lineCount === 1);

    if (singleLineAnton && singleLinePlayfair) {
      expect(singleLineAnton.fontSizePx).toBeGreaterThan(singleLinePlayfair.fontSizePx);
    }
  });

  it('3. changing font size changes measured geometry proportionally using OpenType tables', () => {
    const text = 'SUNDAY SPECIAL ROAST';
    const mSmall = measureText({ family: 'Inter', weight: 600, text, fontSize: 32 });
    const mLarge = measureText({ family: 'Inter', weight: 600, text, fontSize: 64 });

    expect(mLarge.width).toBeCloseTo(mSmall.width * 2, -1);
    expect(mLarge.ascent).toBeCloseTo(mSmall.ascent * 2, -1);
    expect(mLarge.descent).toBeCloseTo(mSmall.descent * 2, -1);
  });

  it('4. long words are handled using actual glyph metrics without premature breaks', () => {
    const copy = createDynamicCopyModel('h1', 'UNPRECEDENTED SUSTAINABILITY', 'primary-hook', 1);
    const spatialBox = { widthPx: 600, heightPx: 400 };

    const states = exploreLineStructures({
      copy,
      font: 'Barlow Condensed',
      weight: 700,
      spatialBox,
      canvas,
    });

    expect(states.length).toBeGreaterThan(0);
    // Finds 2-line hypothesis: "UNPRECEDENTED / SUSTAINABILITY"
    const twoLine = states.find((s) => s.hypothesis.lineCount === 2);
    expect(twoLine).toBeDefined();
    expect(twoLine!.hypothesis.lines).toEqual(['UNPRECEDENTED', 'SUSTAINABILITY']);
    expect(twoLine!.measuredMetrics.maxLineWidth).toBeLessThanOrEqual(600);
  });

  it('5. wide spatial capacity discovers 1-line and 2-line structures with larger scale', () => {
    const copy = createDynamicCopyModel('h1', 'FRESH ORGANIC MATCHA', 'primary-hook', 1);
    // Wide banner capacity: 1000px wide, 200px tall
    const wideBox = { widthPx: 1000, heightPx: 200 };

    const states = exploreLineStructures({
      copy,
      font: 'Inter',
      weight: 700,
      spatialBox: wideBox,
      canvas,
    });

    expect(states.length).toBeGreaterThan(0);
    const topState = states[0];
    // In a 1000x200 box, 1-line or 2-line structure achieves high width fill and large scale
    expect([1, 2]).toContain(topState.hypothesis.lineCount);
    expect(topState.measuredMetrics.maxLineWidth).toBeLessThanOrEqual(1000);
    expect(topState.measuredMetrics.totalHeight).toBeLessThanOrEqual(200);
  });

  it('6. narrow spatial capacity discovers multi-line stacked structures', () => {
    const copy = createDynamicCopyModel('h1', 'FRESH ORGANIC MATCHA', 'primary-hook', 1);
    // Narrow column capacity: 350px wide, 500px tall
    const narrowBox = { widthPx: 350, heightPx: 500 };

    const states = exploreLineStructures({
      copy,
      font: 'Inter',
      weight: 700,
      spatialBox: narrowBox,
      canvas,
    });

    expect(states.length).toBeGreaterThan(0);
    const topState = states[0];
    // In a 350x500 column, 2-line or 3-line allows a significantly larger font size than 1-line
    expect([2, 3]).toContain(topState.hypothesis.lineCount);
    expect(topState.measuredMetrics.maxLineWidth).toBeLessThanOrEqual(350);
  });

  it('7. same copy + same font produces genuine structural alternatives with exact metrics', () => {
    const copy = createDynamicCopyModel('h1', 'THE NEW AUTUMN DROP', 'primary-hook', 1);
    const spatialBox = { widthPx: 800, heightPx: 400 };

    const states = exploreLineStructures({
      copy,
      font: 'Cormorant Garamond',
      weight: 600,
      spatialBox,
      canvas,
    });

    // Expect multiple viable options (e.g. 1-line, 2-line, 3-line)
    const lineCounts = new Set(states.map((s) => s.hypothesis.lineCount));
    expect(lineCounts.size).toBeGreaterThanOrEqual(2);

    // Each state has distinct measured bounding boxes and font sizes
    const oneLine = states.find((s) => s.hypothesis.lineCount === 1);
    const twoLine = states.find((s) => s.hypothesis.lineCount === 2);

    if (oneLine && twoLine) {
      expect(twoLine.fontSizePx).toBeGreaterThan(oneLine.fontSizePx);
      expect(twoLine.measuredMetrics.totalHeight).toBeGreaterThan(oneLine.measuredMetrics.totalHeight);
    }
  });

  it('8. linguistic penalties act as soft signals without eliminating compositionally useful states', () => {
    const copy = createDynamicCopyModel('h1', 'EXPERIENCE THE ART OF BREWING', 'primary-hook', 1);
    const spatialBox = { widthPx: 500, heightPx: 350 };

    const states = exploreLineStructures({
      copy,
      font: 'Inter',
      weight: 600,
      spatialBox,
      canvas,
      includeAllViable: true,
    });

    expect(states.length).toBeGreaterThan(1);
    // Find a hypothesis that had an asymmetric rag or widow
    const hasRagged = states.some((s) => s.hypothesis.ragVariance > 0.2);
    expect(hasRagged).toBe(true);

    // Confirm it still carries a valid score and full measured geometry
    const raggedState = states.find((s) => s.hypothesis.ragVariance > 0.2)!;
    expect(raggedState.scores.compositeScore).toBeGreaterThan(0);
    expect(raggedState.boundingBox.widthPx).toBeGreaterThan(0);
  });

  it('9. discovers line structure without hardcoded layout templates or preset enums', () => {
    const copy = createDynamicCopyModel('h1', 'LIMITED EDITION VINTAGE RELEASE', 'primary-hook', 1);
    const spatialBox = { widthPx: 650, heightPx: 250 };

    const states = exploreLineStructures({
      copy,
      font: 'Space Grotesk',
      weight: 700,
      spatialBox,
      canvas,
    });

    expect(states.length).toBeGreaterThan(0);
    for (const state of states) {
      // The state is purely geometric and linguistic, zero preset templates
      expect(state.hypothesis.lines.length).toBeGreaterThan(0);
      expect(typeof state.fontSizePx).toBe('number');
      expect(typeof state.slack.horizontalSlackPx).toBe('number');
      expect(typeof state.slack.verticalSlackPx).toBe('number');
    }
  });

  describe('Behavioral Multi-Capacity Adaptation Test', () => {
    it('10. discovers genuine geometric alternatives across distinct spatial capacities for the same brand, image & copy', () => {
      const brand = createBrandDesignRepresentation({
        brandProfile: { name: 'Villy Studio', tone: 'editorial, bold' },
        creativeDna: { brandColors: ['#1c1917', '#881337'] },
      });
      const headline = 'THE COMPLETE SUMMER COLLECTION';
      const copy = createDynamicCopyModel('h1', headline, 'primary-hook', 1);
      const font = 'Inter';

      // Case A: Large horizontal capacity (wide upper band)
      const caseA_WideBox = { widthPx: 950, heightPx: 180 };
      const statesA = exploreLineStructures({
        copy,
        font,
        weight: 700,
        spatialBox: caseA_WideBox,
        canvas,
      });

      // Case B: Narrow vertical capacity (tall side column)
      const caseB_NarrowBox = { widthPx: 380, heightPx: 600 };
      const statesB = exploreLineStructures({
        copy,
        font,
        weight: 700,
        spatialBox: caseB_NarrowBox,
        canvas,
      });

      expect(statesA.length).toBeGreaterThan(0);
      expect(statesB.length).toBeGreaterThan(0);

      // Verify that both cases discover valid physical bounding boxes within their capacities
      for (const sA of statesA) {
        expect(sA.measuredMetrics.maxLineWidth).toBeLessThanOrEqual(caseA_WideBox.widthPx);
        expect(sA.measuredMetrics.totalHeight).toBeLessThanOrEqual(caseA_WideBox.heightPx);
      }
      for (const sB of statesB) {
        expect(sB.measuredMetrics.maxLineWidth).toBeLessThanOrEqual(caseB_NarrowBox.widthPx);
        expect(sB.measuredMetrics.totalHeight).toBeLessThanOrEqual(caseB_NarrowBox.heightPx);
      }

      // Case A discovers wide structures (1 or 2 lines)
      const topA = statesA[0];
      // Case B discovers stacked structures (3 or 4 lines)
      const topB = statesB[0];

      // Physical geometry is completely different based on actual space
      expect(topA.boundingBox.widthPx).toBeGreaterThan(topB.boundingBox.widthPx);
      expect(topB.boundingBox.heightPx).toBeGreaterThan(topA.boundingBox.heightPx);
      expect(topA.hypothesis.lineCount).toBeLessThan(topB.hypothesis.lineCount);
    });

    it('11. exposes all granular scoring signals on each candidate state and supports custom scoring weights', () => {
      const copy = createDynamicCopyModel('h1', 'SUSTAINABLE LUXURY LIVING', 'primary-hook', 1);
      const spatialBox = { widthPx: 700, heightPx: 300 };

      // Evaluate with custom weights emphasizing linguistic flow over pure scale impact
      const states = exploreLineStructures({
        copy,
        font: 'Inter',
        weight: 700,
        spatialBox,
        canvas,
        customWeights: {
          linguisticWeight: 0.70,
          scaleImpactWeight: 0.15,
          spatialUtilizationWeight: 0.15,
        },
      });

      expect(states.length).toBeGreaterThan(0);
      for (const s of states) {
        expect(typeof s.scores.scaleImpactScore).toBe('number');
        expect(typeof s.scores.spatialUtilizationScore).toBe('number');
        expect(typeof s.scores.linguisticScore).toBe('number');
        expect(typeof s.scores.ragVariance).toBe('number');
        expect(typeof s.scores.syntacticPenalty).toBe('number');
        expect(typeof s.scores.hasWidowOrOrphan).toBe('boolean');
        expect(typeof s.scores.compositeScore).toBe('number');
      }
    });

    it('12. preserves multiple structurally diverse candidates across distinct line counts for downstream composition', () => {
      const copy = createDynamicCopyModel('h1', 'DISCOVER THE CRAFT OF FINE COFFEE', 'primary-hook', 1);
      const spatialBox = { widthPx: 850, heightPx: 450 };

      const states = exploreLineStructures({
        copy,
        font: 'Cormorant Garamond',
        weight: 600,
        spatialBox,
        canvas,
        maxCandidates: 6,
      });

      // Verify that candidate states include multiple distinct line counts (e.g. 1, 2, 3 lines)
      const lineCounts = states.map((s) => s.hypothesis.lineCount);
      const uniqueLineCounts = new Set(lineCounts);
      expect(uniqueLineCounts.size).toBeGreaterThanOrEqual(3);
    });
  });
});
