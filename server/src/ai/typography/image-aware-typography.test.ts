import { describe, it, expect } from 'vitest';
import { FONT_CATALOG, getFontDefinition, nearestAvailableWeight } from './font-catalog';
import { selectTypography } from './font-selector';
import { evaluateFontFit, evaluateFontCandidates } from './dynamic-typography';
import { createDynamicCopyModel } from '../render/copy-model';
import { createCanvasRepresentation, createBrandDesignRepresentation, createDesignField } from '../render/design-representation';
import { discoverOptimizedComposition } from '../render/composition-evaluation';
import { fittedCopySvg, type DesignNode } from '../render/designer-composition';
import { buildTypeSystem } from './type-system';
import { resolveDesignRecipe } from '../render/design-recipe';
import { resolveCreativeDna } from '../brand/creative-dna';
import type { CreativeDirection } from '../types';
import type { ImageField, FieldRect } from '../render/image-field';

// Helper to create synthetic ImageFields with controlled texture, variance, and quietness
function createSyntheticField(options: {
  meanLuminance?: number;
  luminanceStdDev?: number;
  detailEnergy?: number;
  quietness?: number;
  occupancy?: number;
}) {
  const {
    meanLuminance = 0.5,
    luminanceStdDev = 0.04,
    detailEnergy = 0.05,
    quietness = 0.90,
    occupancy = 0.0,
  } = options;

  const rawField: ImageField = {
    grid: {
      cols: 32,
      rows: 32,
      luminance: new Float32Array(32 * 32).fill(meanLuminance),
      energy: new Float32Array(32 * 32).fill(detailEnergy),
    },
    occupancyGrid: new Float32Array(32 * 32).fill(occupancy),
    subjectBox: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    focalCentroid: { x: 0.5, y: 0.5 },
    quietRects: [
      {
        x: 0.05,
        y: 0.05,
        width: 0.90,
        height: 0.35,
        quietness,
        tone: {
          meanLuminance,
          stdDev: luminanceStdDev,
          verdict: luminanceStdDev > 0.14 ? 'mixed' : meanLuminance > 0.5 ? 'light' : 'dark',
        },
      },
    ],
    toneAt: () => ({
      meanLuminance,
      stdDev: luminanceStdDev,
      verdict: luminanceStdDev > 0.14 ? 'mixed' : meanLuminance > 0.5 ? 'light' : 'dark',
    }),
    occupancyAt: () => occupancy,
    occupancyMass: (r: FieldRect) => occupancy * r.width * r.height,
    totalOccupancyMass: occupancy,
    occlusionOf: (r: FieldRect) => (occupancy > 0 ? (occupancy * r.width * r.height) / occupancy : 0),
    busynessAt: () => detailEnergy,
  };

  return createDesignField(rawField);
}

describe('Typography Step 2: Image-Aware Font Selection & Typographic Discovery', () => {
  const canvas = createCanvasRepresentation(1600, 1600);
  const headlineCopy = createDynamicCopyModel('h-1', 'Ultralight Expedition Alpine Pack', 'primary-hook', 1);

  // 1. Approved candidate pool survives pre-image selection
  it('1. Approved candidate pool survives pre-image selection into candidate pool', async () => {
    const direction: CreativeDirection = {
      concept: 'Alpine Pack',
      visualStory: 'Expedition gear',
      subject: 'Outdoor gear',
      environment: 'mountain',
      composition: 'asymmetric',
      lighting: 'crisp',
      mood: 'technical, rugged, bold',
      palette: ['#0f172a', '#0284c7'],
      brandConstraints: [],
      productTreatment: '',
      background: '#0f172a',
      negativeVisualConstraints: [],
      aspectRatio: '1:1',
      platform: 'instagram',
      mode: 'EDITORIAL',
      artDirectionFamily: 'TYPOGRAPHY_LED',
      copyTreatment: 'headline_support',
      headline: 'Ultralight Expedition Alpine Pack',
      supportingLine: 'Engineered for extreme summits',
      cta: 'Explore',
      interactionInstructions: '',
    };

    const creativeDna = resolveCreativeDna({
      creativeDna: { brandColors: ['#0f172a', '#0284c7'], mood: 'technical' },
    });
    const { recipe } = resolveDesignRecipe(direction, creativeDna);

    const typoSelection = await selectTypography({ direction, creativeDna, recipe });

    expect(typoSelection.approvedCandidates).toBeDefined();
    expect(typoSelection.approvedCandidates!.headline.length).toBeGreaterThanOrEqual(3);
    expect(typoSelection.approvedCandidates!.body.length).toBeGreaterThanOrEqual(2);
  });

  // 2. Image evidence can change final family selection
  it('2. Image evidence changes candidate family ranking between high-texture and serene backdrops', () => {
    const sereneField = createSyntheticField({
      meanLuminance: 0.95,
      luminanceStdDev: 0.02,
      detailEnergy: 0.02,
      quietness: 0.98,
    });

    const texturedField = createSyntheticField({
      meanLuminance: 0.40,
      luminanceStdDev: 0.16,
      detailEnergy: 0.35,
      quietness: 0.20,
    });

    const box: FieldRect = { x: 0.08, y: 0.08, width: 0.84, height: 0.30 };
    const brand = createBrandDesignRepresentation({
      colors: ['#ffffff', '#000000'],
      approvedFonts: {
        headline: ['Playfair Display', 'Barlow Condensed', 'Montserrat'],
        body: ['Inter', 'DM Sans'],
      },
    });

    // In serene field: Playfair Display (high contrast serif) flourishes
    const evalSerenePlayfair = evaluateFontFit({
      font: getFontDefinition('Playfair Display')!,
      role: 'primary-hook',
      copy: headlineCopy,
      spatialBox: box,
      canvas,
      field: sereneField,
      brand,
    });

    const evalTexturedPlayfair = evaluateFontFit({
      font: getFontDefinition('Playfair Display')!,
      role: 'primary-hook',
      copy: headlineCopy,
      spatialBox: box,
      canvas,
      field: texturedField,
      brand,
    });

    const evalTexturedBarlow = evaluateFontFit({
      font: getFontDefinition('Barlow Condensed')!,
      role: 'primary-hook',
      copy: headlineCopy,
      spatialBox: box,
      canvas,
      field: texturedField,
      brand,
    });

    // High texture penalizes delicate serif hairlines and rewards robust condensed/bold sans
    expect(evalSerenePlayfair.fitScore).toBeGreaterThan(evalTexturedPlayfair.fitScore);
    expect(evalTexturedBarlow.fitScore).toBeGreaterThan(evalTexturedPlayfair.fitScore);
  });

  // 3. Image evidence can change final weight continuously
  it('3. Image evidence modulates recommended weight continuously without arbitrary step spikes', () => {
    const box: FieldRect = { x: 0.08, y: 0.08, width: 0.84, height: 0.30 };
    const montserrat = getFontDefinition('Montserrat')!;

    const quietField = createSyntheticField({ detailEnergy: 0.02, luminanceStdDev: 0.02, quietness: 0.98 });
    const moderateField = createSyntheticField({ detailEnergy: 0.15, luminanceStdDev: 0.09, quietness: 0.50 });
    const heavyField = createSyntheticField({ detailEnergy: 0.38, luminanceStdDev: 0.18, quietness: 0.15 });

    const quietEval = evaluateFontFit({
      font: montserrat,
      role: 'primary-hook',
      copy: headlineCopy,
      spatialBox: box,
      canvas,
      field: quietField,
    });

    const moderateEval = evaluateFontFit({
      font: montserrat,
      role: 'primary-hook',
      copy: headlineCopy,
      spatialBox: box,
      canvas,
      field: moderateField,
    });

    const heavyEval = evaluateFontFit({
      font: montserrat,
      role: 'primary-hook',
      copy: headlineCopy,
      spatialBox: box,
      canvas,
      field: heavyField,
    });

    expect(quietEval.recommendedWeight).toBeLessThanOrEqual(moderateEval.recommendedWeight);
    expect(moderateEval.recommendedWeight).toBeLessThanOrEqual(heavyEval.recommendedWeight);
    expect(montserrat.weights).toContain(quietEval.recommendedWeight);
    expect(montserrat.weights).toContain(heavyEval.recommendedWeight);
  });

  // 4. Brand constraints cannot be violated
  it('4. Brand approved fonts receive authoritative priority bonus over non-approved candidates', () => {
    const brand = createBrandDesignRepresentation({
      colors: ['#000000'],
      approvedFonts: {
        headline: ['Outfit'],
        body: ['Inter'],
      },
    });

    const outfit = getFontDefinition('Outfit')!;
    const montserrat = getFontDefinition('Montserrat')!;

    const evalOutfit = evaluateFontFit({
      font: outfit,
      role: 'primary-hook',
      copy: headlineCopy,
      canvas,
      brand,
    });

    const evalMontserrat = evaluateFontFit({
      font: montserrat,
      role: 'primary-hook',
      copy: headlineCopy,
      canvas,
      brand,
    });

    expect(evalOutfit.scoreBreakdown.brandApproved).toBeGreaterThan(0);
    expect(evalMontserrat.scoreBreakdown.brandApproved).toBe(0);
    expect(evalOutfit.fitScore).toBeGreaterThan(evalMontserrat.fitScore);
  });

  // 5. Candidate ranking remains deterministic
  it('5. Candidate ranking is 100% deterministic across repeated evaluations', () => {
    const field = createSyntheticField({ detailEnergy: 0.20, luminanceStdDev: 0.10, quietness: 0.60 });
    const box: FieldRect = { x: 0.1, y: 0.1, width: 0.8, height: 0.3 };
    const brand = createBrandDesignRepresentation({ colors: ['#000000'] });

    const run1 = evaluateFontCandidates({ brand, copy: [headlineCopy], spatialBox: box, canvas, field });
    const run2 = evaluateFontCandidates({ brand, copy: [headlineCopy], spatialBox: box, canvas, field });

    expect(run1.length).toEqual(run2.length);
    for (let i = 0; i < run1.length; i++) {
      expect(run1[i].headlineFont.family).toEqual(run2[i].headlineFont.family);
      expect(run1[i].headlineWeight).toEqual(run2[i].headlineWeight);
      expect(run1[i].fitScore).toEqual(run2[i].fitScore);
    }
  });

  // 6. Candidate diversity is preserved
  it('6. Candidate diversity across categories is preserved in candidate shortlists', async () => {
    const direction: CreativeDirection = {
      concept: 'Artisan Culinary',
      visualStory: 'Fresh sourdough loaf',
      subject: 'Culinary',
      environment: 'kitchen',
      composition: 'centered',
      lighting: 'warm',
      mood: 'warm, artisanal, wholesome',
      palette: ['#451a03', '#fef3c7'],
      brandConstraints: [],
      productTreatment: '',
      background: '#fef3c7',
      negativeVisualConstraints: [],
      aspectRatio: '1:1',
      platform: 'instagram',
      mode: 'EDITORIAL',
      artDirectionFamily: 'EDITORIAL_DESIGN',
      copyTreatment: 'headline_support',
      headline: 'Slow Fermented Artisan Sourdough',
      supportingLine: 'Crisp blistered crust',
      cta: 'Order Fresh',
      interactionInstructions: '',
    };

    const creativeDna = resolveCreativeDna({
      creativeDna: { brandColors: ['#451a03', '#fef3c7'], mood: 'warm' },
    });
    const { recipe } = resolveDesignRecipe(direction, creativeDna);
    const typo = await selectTypography({ direction, creativeDna, recipe });

    const headlinePool = typo.approvedCandidates?.headline || [];
    const categories = new Set(headlinePool.map((f) => getFontDefinition(f)?.category).filter(Boolean));
    expect(categories.size).toBeGreaterThanOrEqual(2);
  });

  // 7. No single font is artificially blacklisted
  it('7. No catalog font is arbitrarily zeroed out when scripts and roles match', () => {
    for (const font of FONT_CATALOG) {
      if (font.languageSupport.includes('latin') && font.bestFor.includes('headline')) {
        const evalResult = evaluateFontFit({
          font,
          role: 'primary-hook',
          copy: headlineCopy,
          canvas,
        });
        expect(evalResult.fitScore).toBeGreaterThan(0);
      }
    }
  });

  // 8. Exact glyph metrics remain authoritative
  it('8. Exact OpenType glyph metrics measure different physical widths for narrow vs expanded fonts', () => {
    const condensed = getFontDefinition('Barlow Condensed')!;
    const expanded = getFontDefinition('Archivo Black')!;

    // When measure is narrow (boxAspect < 1.6), condensed font earns high spatialFit
    const boxNarrow: FieldRect = { x: 0.1, y: 0.1, width: 0.3, height: 0.4 };
    const longWordCopy = createDynamicCopyModel('hw', 'EXTRAORDINARY HYDROELECTRIC EXPEDITION', 'primary-hook', 1);

    const evalCondensed = evaluateFontFit({
      font: condensed,
      role: 'primary-hook',
      copy: longWordCopy,
      spatialBox: boxNarrow,
      canvas,
    });

    const evalExpanded = evaluateFontFit({
      font: expanded,
      role: 'primary-hook',
      copy: longWordCopy,
      spatialBox: boxNarrow,
      canvas,
    });

    expect(evalCondensed.scoreBreakdown.spatialFit + evalCondensed.scoreBreakdown.wordFit).toBeGreaterThan(
      evalExpanded.scoreBreakdown.spatialFit + evalExpanded.scoreBreakdown.wordFit
    );
  });

  // 9. Different image textures produce different candidate rankings
  it('9. Smooth high-key vs rough low-key fields produce distinct winning candidate pairs', () => {
    const smoothField = createSyntheticField({
      meanLuminance: 0.90,
      luminanceStdDev: 0.03,
      detailEnergy: 0.03,
      quietness: 0.95,
    });

    const roughField = createSyntheticField({
      meanLuminance: 0.20,
      luminanceStdDev: 0.18,
      detailEnergy: 0.40,
      quietness: 0.15,
    });

    const brand = createBrandDesignRepresentation({
      colors: ['#000000', '#ffffff'],
      approvedFonts: {
        headline: ['Cormorant Garamond', 'Anton', 'Space Grotesk'],
        body: ['Inter', 'DM Sans'],
      },
    });

    const editorialCopy = createDynamicCopyModel('h-ed', 'Form Follows Silence', 'primary-hook', 1);

    const smoothCandidates = evaluateFontCandidates({
      brand,
      copy: [editorialCopy],
      canvas,
      field: smoothField,
    });

    const roughCandidates = evaluateFontCandidates({
      brand,
      copy: [editorialCopy],
      canvas,
      field: roughField,
    });

    // Smooth field rewards elegant delicate serifs; rough field rewards high optical robustness
    expect(smoothCandidates[0].headlineFont.family).toEqual('Cormorant Garamond');
    expect(roughCandidates[0].headlineFont.family).not.toEqual('Cormorant Garamond');
  });

  // 10. Quiet vs dense regions influence candidate compatibility
  it('10. Quiet negative space affordance improves serif fit without arbitrary thresholds', () => {
    const quietField = createSyntheticField({ quietness: 0.95, detailEnergy: 0.02 });
    const denseField = createSyntheticField({ quietness: 0.10, detailEnergy: 0.35 });

    const lora = getFontDefinition('Lora')!;

    const quietEval = evaluateFontFit({
      font: lora,
      role: 'primary-hook',
      copy: headlineCopy,
      canvas,
      field: quietField,
    });

    const denseEval = evaluateFontFit({
      font: lora,
      role: 'primary-hook',
      copy: headlineCopy,
      canvas,
      field: denseField,
    });

    expect(quietEval.fitScore).toBeGreaterThan(denseEval.fitScore);
  });

  // 11. Final typography remains renderer-faithful after Step 1
  it('11. Discovered composition typography is rendered faithfully into SVG with 0 mismatches', async () => {
    const field = createSyntheticField({ meanLuminance: 0.1, luminanceStdDev: 0.04, quietness: 0.92 });
    const brand = createBrandDesignRepresentation({
      colors: ['#0a0a0a', '#d97706', '#ffffff'],
      approvedFonts: {
        headline: ['Outfit', 'Montserrat', 'Playfair Display'],
        body: ['Inter', 'DM Sans'],
      },
    });

    const copyItems = [
      {
        id: 'primary-hook',
        text: 'Midnight Dark Roast Single Origin',
        role: 'headline' as const,
        priority: 1,
        font: 'Outfit',
        approvedFonts: ['Outfit', 'Montserrat', 'Playfair Display'],
        weight: 700,
      },
      {
        id: 'secondary-hook',
        text: 'Intense smoky dark chocolate notes',
        role: 'subheadline' as const,
        priority: 2,
        font: 'Inter',
        approvedFonts: ['Inter', 'DM Sans'],
        weight: 400,
      },
    ];

    const result = discoverOptimizedComposition({
      copyItems,
      field,
      canvas,
      brand,
    });

    const bestState = result.bestState;
    const headlineEl = bestState.elements.find((e) => e.id === 'primary-hook')!;
    const supportEl = bestState.elements.find((e) => e.id === 'secondary-hook')!;

    expect(headlineEl).toBeDefined();
    expect(supportEl).toBeDefined();

    const direction: CreativeDirection = {
      concept: 'Nocturne Roast',
      visualStory: 'Dark roast coffee beans',
      subject: 'Coffee',
      environment: 'studio',
      composition: 'asymmetric',
      lighting: 'moody',
      mood: 'moody, intense, luxurious',
      palette: ['#0a0a0a', '#d97706', '#ffffff'],
      brandConstraints: [],
      productTreatment: '',
      background: '#0a0a0a',
      negativeVisualConstraints: [],
      aspectRatio: '1:1',
      platform: 'instagram',
      mode: 'EDITORIAL',
      artDirectionFamily: 'CINEMATIC',
      copyTreatment: 'headline_support',
      headline: 'Midnight Dark Roast Single Origin',
      supportingLine: 'Intense smoky dark chocolate notes',
      cta: 'Taste The Night',
      interactionInstructions: '',
    };
    const creativeDna = resolveCreativeDna({
      creativeDna: { brandColors: ['#0a0a0a', '#d97706', '#ffffff'], mood: 'moody dark' },
    });
    const { recipe } = resolveDesignRecipe(direction, creativeDna);
    const typoSelection = await selectTypography({ direction, creativeDna, recipe });

    const typeSystem = buildTypeSystem({
      typography: typoSelection,
      concept: { conceptName: 'Test', visualIdea: 'Test', hero: 'image', imageRole: 'hero', firstRead: 'Test', elementsToOmit: [] },
      copy: [
        { role: 'HEADLINE', text: 'Midnight Dark Roast Single Origin' },
        { role: 'SUPPORT', text: 'Intense smoky dark chocolate notes' },
      ],
    });

    const headlineNode: DesignNode = {
      id: headlineEl.id,
      kind: 'copy',
      x: headlineEl.rect.x,
      y: headlineEl.rect.y,
      width: headlineEl.rect.width,
      height: headlineEl.rect.height,
      color: headlineEl.ink.color.hex,
      surface: 'none',
      fontFamily: headlineEl.typographyState.family,
      fontWeight: headlineEl.typographyState.weight,
      fontScale: headlineEl.typographyState.fontScale,
      tracking: headlineEl.typographyState.letterSpacing,
      lineHeight: headlineEl.typographyState.lineHeightMultiplier,
      align: 'left',
      shape: 'rectangle',
      lines: headlineEl.typographyState.hypothesis.lines,
    };

    const svg = fittedCopySvg(headlineNode, { role: 'HEADLINE', text: 'Midnight Dark Roast Single Origin' }, typoSelection, 1600, 1600, typeSystem);

    expect(svg).toContain(`font-family="${headlineEl.typographyState.family}"`);
    expect(svg).toContain(`font-weight="${headlineEl.typographyState.weight}"`);
    expect(svg).not.toContain('shrink');
  });

  // 12. Existing successful creative does not regress
  it('12. Existing successful "The Light Within the Steamer" creative does not regress', async () => {
    const direction: CreativeDirection = {
      concept: 'The Light Within the Steamer',
      visualStory: 'Bamboo steamer basket with warm rising steam',
      subject: 'Artisan Dim Sum',
      environment: 'warm studio dining',
      composition: 'centered hero with lower quiet zone',
      lighting: 'soft directional backlight',
      mood: 'warm, artisanal, culinary, authentic',
      palette: ['#451a03', '#d97706', '#fef3c7'],
      brandConstraints: [],
      productTreatment: '',
      background: '#fef3c7',
      negativeVisualConstraints: [],
      aspectRatio: '1:1',
      platform: 'instagram',
      mode: 'EDITORIAL',
      artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
      copyTreatment: 'headline_support',
      headline: 'The Light Within the Steamer',
      supportingLine: 'Handmade heritage momos folded fresh at dawn',
      cta: 'Taste The Craft',
      interactionInstructions: '',
    };

    const creativeDna = resolveCreativeDna({
      creativeDna: { brandColors: ['#451a03', '#d97706', '#fef3c7'], mood: 'culinary artisanal' },
    });
    const { recipe } = resolveDesignRecipe(direction, creativeDna);
    const typography = await selectTypography({ direction, creativeDna, recipe });

    expect(typography.approvedCandidates).toBeDefined();
    expect(typography.approvedCandidates!.headline).toBeDefined();
    expect(typography.approvedCandidates!.body).toBeDefined();

    const field = createSyntheticField({
      meanLuminance: 0.88,
      luminanceStdDev: 0.05,
      detailEnergy: 0.06,
      quietness: 0.85,
    });

    const brand = createBrandDesignRepresentation({
      colors: creativeDna.brandColors,
      approvedFonts: typography.approvedCandidates,
    });

    const discovery = discoverOptimizedComposition({
      copyItems: [
        {
          id: 'primary-hook',
          text: direction.headline,
          role: 'headline',
          priority: 1,
          font: typography.headlineFont,
          approvedFonts: typography.approvedCandidates?.headline,
          weight: typography.headlineWeight,
        },
        {
          id: 'secondary-hook',
          text: direction.supportingLine,
          role: 'subheadline',
          priority: 2,
          font: typography.bodyFont,
          approvedFonts: typography.approvedCandidates?.body,
          weight: typography.bodyWeight,
        },
      ],
      field,
      canvas,
      brand,
    });

    expect(discovery.bestState.signals.hierarchyClarity).toBeGreaterThan(0.7);
    expect(discovery.bestState.signals.spatialBalance).toBeGreaterThan(0.7);
    expect(discovery.bestState.elements.length).toBeGreaterThanOrEqual(2);
  });
});
