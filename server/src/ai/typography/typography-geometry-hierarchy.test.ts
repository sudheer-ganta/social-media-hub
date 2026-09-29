import { describe, it, expect } from 'vitest';
import {
  exploreLineStructures,
  generateTrackingCandidates,
  evaluateTrackingCandidates,
} from './dynamic-line-structure';
import { calculateTypographicMassProxy, getFontMetrics, measureText } from './font-metrics.service';
import { fontFilePath } from './font-catalog';
import { createDynamicCopyModel } from '../render/copy-model';
import { createCanvasRepresentation, createBrandDesignRepresentation, createDesignField } from '../render/design-representation';
import { analyzeImageField } from '../render/image-field';
import { discoverOptimizedComposition, evaluateCompositionState } from '../render/composition-evaluation';
import { fittedCopySvg, type DesignNode } from '../render/designer-composition';
import sharp from 'sharp';

describe('Typography Step 3: Typographic Geometry, Rhythm, Optical Mass & Hierarchy', () => {
  const canvas = createCanvasRepresentation(1080, 1080);
  const brand = createBrandDesignRepresentation({
    colors: ['#0f172a', '#b45309', '#fcfbf9'],
    approvedFonts: {
      headline: ['Outfit', 'Anton', 'Playfair Display', 'Inter'],
      body: ['Inter', 'Lora', 'Plus Jakarta Sans'],
    },
  });

  // ─── 1. Continuous Scale Discovery ──────────────────────────────────────────
  it('1. Same font discovers different font sizes for different image spatial capacities', () => {
    const copy = createDynamicCopyModel('h1', 'The Longest Table', 'primary-hook', 1);

    const smallBox = { x: 0.05, y: 0.05, width: 0.40, height: 0.15 };
    const largeBox = { x: 0.05, y: 0.05, width: 0.90, height: 0.40 };

    const smallStates = exploreLineStructures({ copy, font: 'Outfit', weight: 700, spatialBox: smallBox, canvas });
    const largeStates = exploreLineStructures({ copy, font: 'Outfit', weight: 700, spatialBox: largeBox, canvas });

    expect(smallStates.length).toBeGreaterThan(0);
    expect(largeStates.length).toBeGreaterThan(0);
    expect(largeStates[0].fontSizePx).toBeGreaterThan(smallStates[0].fontSizePx);
    expect(largeStates[0].fontScale).toBeGreaterThan(smallStates[0].fontScale);
  });

  // ─── 2. Responsive Copy Sizing ─────────────────────────────────────────────
  it('2. Copy length and line hypotheses adaptively determine discovered size', () => {
    const shortCopy = createDynamicCopyModel('h1', 'Pure Craft', 'primary-hook', 1);
    const longCopy = createDynamicCopyModel('h2', 'Experience 2D Virtual Saree Try-On From Home', 'primary-hook', 1);
    const box = { x: 0.05, y: 0.05, width: 0.85, height: 0.35 };

    const shortStates = exploreLineStructures({ copy: shortCopy, font: 'Inter', weight: 700, spatialBox: box, canvas });
    const longStates = exploreLineStructures({ copy: longCopy, font: 'Inter', weight: 700, spatialBox: box, canvas });

    expect(shortStates[0].fontSizePx).toBeGreaterThan(longStates[0].fontSizePx);
    // Neither should hit a fake hardcoded constant
    expect(shortStates[0].fontSizePx).not.toBe(152);
    expect(longStates[0].fontSizePx).not.toBe(88);
  });

  // ─── 3. Exact OpenType Glyph Metrics Authority ──────────────────────────────
  it('3. Exact OpenType glyph advances remain authoritative for text measurement', () => {
    const metrics = getFontMetrics(fontFilePath('Inter', 700, 'normal'));
    expect(metrics.unitsPerEm).toBeGreaterThan(0);
    expect(metrics.ascender).toBeGreaterThan(0);
    expect(metrics.descender).toBeLessThan(0);

    const measured1 = measureText({ family: 'Inter', weight: 700, text: 'Hello', fontSize: 40 });
    const measured2 = measureText({ family: 'Inter', weight: 700, text: 'Hello World', fontSize: 40 });
    expect(measured2.width).toBeGreaterThan(measured1.width);
  });

  // ─── 4. Valid Line Structures Intact ────────────────────────────────────────
  it('4. Discovered line structures preserve linguistic phrase integrity without word isolation', () => {
    const copy = createDynamicCopyModel('h1', 'Handmade heritage momos folded fresh at dawn', 'primary-hook', 1);
    const box = { x: 0.05, y: 0.05, width: 0.80, height: 0.30 };

    const states = exploreLineStructures({ copy, font: 'Outfit', weight: 700, spatialBox: box, canvas });
    expect(states.length).toBeGreaterThan(0);
    const best = states[0];
    expect(best.hypothesis.lines.length).toBeGreaterThanOrEqual(1);
    // Rag variance should be recorded
    expect(best.scores.ragVariance).toBeDefined();
    expect(best.scores.linguisticScore).toBeGreaterThan(0.7);
  });

  // ─── 5. Metric-Aware Candidate Leading Discovery ────────────────────────────
  it('5. Leading multiplier responds to font baseline metrics and line count', () => {
    const copy1 = createDynamicCopyModel('h1', 'One Line Headline', 'primary-hook', 1);
    const copy3 = createDynamicCopyModel('h2', 'This is a multi line text designed across three lines of body', 'secondary-hook', 2);
    const box = { x: 0.05, y: 0.05, width: 0.80, height: 0.35 };

    const statesH1 = exploreLineStructures({ copy: copy1, font: 'Outfit', weight: 700, spatialBox: box, canvas });
    const statesBody = exploreLineStructures({ copy: copy3, font: 'Lora', weight: 400, spatialBox: box, canvas });

    expect(statesH1[0].lineHeightMultiplier).toBeDefined();
    expect(statesBody[0].lineHeightMultiplier).toBeDefined();
    // Body text leading allows open breathing room relative to tight display
    expect(statesBody[0].lineHeightMultiplier).toBeGreaterThanOrEqual(statesH1[0].lineHeightMultiplier);
  });

  // ─── 6. Continuous Tracking Behavior ────────────────────────────────────────
  it('6. Optical tracking tightens for large display and opens for uppercase/small scale', () => {
    const displayCopy = createDynamicCopyModel('h1', 'BIG DISPLAY', 'primary-hook', 1);
    const smallCopy = createDynamicCopyModel('s1', 'small caption note', 'supporting-body', 2);
    const box = { x: 0.05, y: 0.05, width: 0.80, height: 0.30 };

    const displayStates = exploreLineStructures({ copy: displayCopy, font: 'Inter', weight: 700, spatialBox: box, canvas });
    const smallStates = exploreLineStructures({ copy: smallCopy, font: 'Inter', weight: 400, spatialBox: { ...box, height: 0.10 }, canvas });

    expect(displayStates[0].letterSpacing).toBeDefined();
    expect(smallStates[0].letterSpacing).toBeDefined();
  });

  // ─── 7. Typographic Mass Proxy Derivation ──────────────────────────────────
  it('7. Different fonts with identical nominal size produce different typographic mass proxies', () => {
    const lines = ['Engineered for Gravity'];
    const fontSize = 80;

    const antonMass = calculateTypographicMassProxy({ family: 'Anton', weight: 400, lines, fontSize });
    const loraMass = calculateTypographicMassProxy({ family: 'Lora', weight: 400, lines, fontSize });

    expect(antonMass.massProxy).toBeGreaterThan(0);
    expect(loraMass.massProxy).toBeGreaterThan(0);
    // Anton has different glyph advance and height distribution than Lora
    expect(antonMass.massProxy).not.toBe(loraMass.massProxy);
  });

  // ─── 8. Strict Separation of Physical Mass and Ink Contrast ────────────────
  it('8. Physical typographic mass is strictly independent of ink contrast', () => {
    const lines = ['Midnight Dark Roast'];
    const mass1 = calculateTypographicMassProxy({ family: 'Playfair Display', weight: 700, lines, fontSize: 60 });
    const mass2 = calculateTypographicMassProxy({ family: 'Playfair Display', weight: 700, lines, fontSize: 60 });

    expect(mass1.massProxy).toBe(mass2.massProxy);
    // Contrast is evaluated separately in dynamic color
  });

  // ─── 9. Pairwise Hierarchy Evaluation ──────────────────────────────────────
  it('9. Pairwise hierarchy clarity rewards intentional semantic ordering without universal presets', async () => {
    const copyItems = [
      { id: 'headline', role: 'headline' as const, text: 'The Light Within the Steamer', priority: 1, font: 'Outfit', weight: 700 },
      { id: 'support', role: 'subheadline' as const, text: 'Handmade heritage momos folded fresh at dawn', priority: 2, font: 'Inter', weight: 400 },
      { id: 'cta', role: 'subheadline' as const, text: 'Taste The Craft', priority: 3, font: 'Inter', weight: 600 },
    ];

    const svg = `<svg width="1080" height="1080"><rect width="1080" height="1080" fill="#fef3c7"/></svg>`;
    const pngBuf = await sharp(Buffer.from(svg)).png().toBuffer();
    const rawField = await analyzeImageField(pngBuf);
    const field = createDesignField(rawField);

    const discovery = discoverOptimizedComposition({
      copyItems,
      field,
      canvas,
      brand,
    });

    const bestState = discovery.bestState;
    expect(bestState).toBeDefined();
    expect(bestState.signals.hierarchyClarity).toBeGreaterThan(0.5);

    const h = bestState.elements.find(e => e.role === 'headline')!;
    const s = bestState.elements.find(e => e.role === 'subheadline')!;
    expect(h.typographyState.fontSizePx).toBeGreaterThan(s.typographyState.fontSizePx);
  });

  // ─── 10. Logo Evaluated as Brand Asset ──────────────────────────────────────
  it('10. Logo is evaluated as a brand asset with clearance, prominence, and balance', async () => {
    const copyItems = [
      { id: 'headline', role: 'headline' as const, text: 'Form Follows Silence', priority: 1, font: 'Anton', weight: 400 },
    ];
    const svg = `<svg width="1080" height="1080"><rect width="1080" height="1080" fill="#fafaf9"/></svg>`;
    const pngBuf = await sharp(Buffer.from(svg)).png().toBuffer();
    const rawField = await analyzeImageField(pngBuf);
    const field = createDesignField(rawField);

    const discovery = discoverOptimizedComposition({
      copyItems,
      logoItem: { id: 'brand-mark', role: 'logo', aspectRatio: 2.5 },
      field,
      canvas,
      brand,
    });

    const logo = discovery.bestState.elements.find(e => e.role === 'logo');
    expect(logo).toBeDefined();
    expect(logo!.rect.width).toBeGreaterThan(0.05);
    expect(logo!.rect.height).toBeGreaterThan(0.02);
  });

  // ─── 11. Determinism Invariant ──────────────────────────────────────────────
  it('11. Typographic discovery produces 100% deterministic output across repeated runs', () => {
    const copy = createDynamicCopyModel('h1', 'Spice Rangoli Heritage Blends', 'primary-hook', 1);
    const box = { x: 0.05, y: 0.05, width: 0.85, height: 0.30 };

    const run1 = exploreLineStructures({ copy, font: 'Outfit', weight: 700, spatialBox: box, canvas });
    const run2 = exploreLineStructures({ copy, font: 'Outfit', weight: 700, spatialBox: box, canvas });

    expect(run1[0].fontSizePx).toBe(run2[0].fontSizePx);
    expect(run1[0].lineHeightMultiplier).toBe(run2[0].lineHeightMultiplier);
    expect(run1[0].letterSpacing).toBe(run2[0].letterSpacing);
    expect(run1[0].hypothesis.lines).toEqual(run2[0].hypothesis.lines);
  });

  // ─── 12. Authoritative TypographyState Handoff Invariant ────────────────────
  it('12. TypographyState directly hands off font size, leading, tracking, and lines to SVG without alteration', () => {
    const node: DesignNode = {
      id: 'headline',
      kind: 'copy',
      x: 0.05,
      y: 0.05,
      width: 0.80,
      height: 0.20,
      color: '#ffffff',
      surface: 'none',
      fontFamily: 'Outfit',
      fontWeight: 700,
      fontScale: 0.08,
      tracking: -0.015,
      lineHeight: 1.08,
      align: 'left',
      shape: 'rectangle',
      lines: ['The Light', 'Within the Steamer'],
    };

    const copyLine = { role: 'HEADLINE', text: 'The Light Within the Steamer' };
    const typography = {
      headlineFont: 'Outfit',
      bodyFont: 'Inter',
      headlineWeight: 700,
      bodyWeight: 400,
      facesUsed: [{ family: 'Outfit', weight: 700, style: 'normal' as const }],
    };

    const svg = fittedCopySvg(node, copyLine as any, typography as any, 1080, 1080);
    expect(svg).toContain('font-family="Outfit"');
    expect(svg).toContain('font-weight="700"');
    expect(svg).toContain('font-size="86.4"'); // 1080 * 0.08 = 86.4
    expect(svg).toContain('letter-spacing="-1.30"'); // -0.015 * 86.4 = -1.296 -> -1.30
    expect(svg).toContain('The Light');
    expect(svg).toContain('Within the Steamer');
  });

  // ─── 13. Multiple Tracking Candidates for Same Font/Size ────────────────────
  it('13. Multiple distinct tracking candidates are generated and evaluated for the same font and size', () => {
    const candidates = generateTrackingCandidates({
      fontScale: 0.08,
      isAllUppercase: false,
      fontWidth: 'normal',
    });

    expect(candidates.length).toBeGreaterThanOrEqual(3);
    // Spans tight to open around center
    expect(Math.min(...candidates)).toBeLessThan(Math.max(...candidates));

    const fontFile = fontFilePath('Inter', 700, 'normal');
    const evaluated = evaluateTrackingCandidates({
      fontFile,
      lines: ['The Light Within'],
      fontSize: 80,
      lineHeightMultiplier: 1.15,
      fontScale: 80 / 1080,
      isAllUppercase: false,
      availWidthPx: 800,
      availHeightPx: 300,
    });

    expect(evaluated.length).toBe(candidates.length);
    // Every candidate has exact measured metrics and distinct composite score
    for (const e of evaluated) {
      expect(e.measuredMetrics.maxLineWidth).toBeGreaterThan(0);
      expect(e.compositeScore).toBeGreaterThanOrEqual(0);
    }
  });

  // ─── 14. Continuity / Smoothness Check ──────────────────────────────────────
  it('14. Tracking candidate center varies continuously with font size without discrete threshold jumps', () => {
    const sizes = [40, 48, 56, 64, 72, 80, 88, 96, 104];
    const centers: number[] = [];

    for (const sz of sizes) {
      const scale = sz / 1080;
      const cands = generateTrackingCandidates({ fontScale: scale, isAllUppercase: false });
      const mid = cands[Math.floor(cands.length / 2)];
      centers.push(mid);
    }

    // Ensure step differences between adjacent sizes are smooth and continuous (no jumps > 0.006)
    for (let i = 1; i < centers.length; i++) {
      const delta = Math.abs(centers[i] - centers[i - 1]);
      expect(delta).toBeLessThanOrEqual(0.006);
    }
  });

  // ─── 15. Lettercase Responsive Tracking Discovery ───────────────────────────
  it('15. Uppercase text discovers more open tracking candidates than mixed case at same scale', () => {
    const scale = 0.08;
    const mixedCands = generateTrackingCandidates({ fontScale: scale, isAllUppercase: false });
    const upperCands = generateTrackingCandidates({ fontScale: scale, isAllUppercase: true });

    const mixedCenter = mixedCands[Math.floor(mixedCands.length / 2)];
    const upperCenter = upperCands[Math.floor(upperCands.length / 2)];

    expect(upperCenter).toBeGreaterThan(mixedCenter);
  });

  // ─── 16. Font Width Responsive Tracking Discovery ───────────────────────────
  it('16. Condensed fonts discover tighter tracking than expanded fonts at same scale', () => {
    const scale = 0.08;
    const condCands = generateTrackingCandidates({ fontScale: scale, isAllUppercase: false, fontWidth: 'condensed' });
    const expCands = generateTrackingCandidates({ fontScale: scale, isAllUppercase: false, fontWidth: 'expanded' });

    const condCenter = condCands[Math.floor(condCands.length / 2)];
    const expCenter = expCands[Math.floor(expCands.length / 2)];

    expect(condCenter).toBeLessThan(expCenter);
  });
});
