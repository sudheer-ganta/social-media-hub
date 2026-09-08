/**
 * LayoutPlan builder + design recipe — unit tests.
 *
 * Run: cd server && npx vitest run src/ai/render/layout-plan.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  buildLayoutPlan,
  overlapArea,
  resolvePalette,
  validateCompositionDiversity,
  validateLayoutPlan,
  type ContentInput,
  type LayoutPlan,
  type LayoutPlanInput,
} from './layout-plan';
import { COMPOSITION_ARCHETYPES, deriveFallbackRecipe, normaliseDesignRecipe, resolveDesignRecipe } from './design-recipe';
import { BASE_DIRECTION, BASE_RECIPE, EMPTY_DNA, profileWithRecipe } from './creative-renderer.test';
import { chooseCompositionArchetype, getStyleDNA, STYLE_DNA_LIBRARY, styleDnaToRecipe } from '../style-dna/style-dna';
import type { CompositionArchetype, ImageCapabilities, ReferenceDesignRecipe } from '../types';

const CONTENT: ContentInput = {
  headline: 'Steam Rises, Weekend Begins',
  support: 'Twelve momos, one long table.',
  brandMessage: 'Cooked in silence, served with love.',
  secondaryInfo: 'Prism Mall, Gachibowli',
  cta: 'Book a table',
  hasLogo: true,
};

const TEST_TYPOGRAPHY: LayoutPlanInput['typography'] = {
  headline: 'Playfair Display',
  body: 'Inter',
  headlineWeight: 700,
  bodyWeight: 400,
  headlineCharWidth: 0.54,
  lineHeightMult: 1.15,
  letterSpacing: 0.5,
};

function planFor(recipe: Partial<ReferenceDesignRecipe>, content: Partial<ContentInput> = {}): ReturnType<typeof buildLayoutPlan> {
  const input: LayoutPlanInput = {
    width: 1280,
    height: 1600,
    recipe: { ...BASE_RECIPE, ...recipe },
    content: { ...CONTENT, ...content },
    palette: resolvePalette([], BASE_RECIPE.colorPalette),
    aspectRatio: '4:5',
    typography: TEST_TYPOGRAPHY,
  };
  return buildLayoutPlan(input);
}

describe('buildLayoutPlan', () => {
  it('every recipe axis combination yields a plan that passes its own validation', () => {
    const axes: Array<Partial<ReferenceDesignRecipe>> = [];
    for (const imageTreatment of ['full-bleed', 'framed', 'inset'] as const) {
      for (const layoutBehaviour of ['asymmetric', 'centered', 'grid', 'stacked', 'diagonal'] as const) {
        for (const footerStyle of ['torn-paper', 'solid-band', 'hairline', 'none'] as const) {
          for (const logoTreatment of ['integrated', 'corner', 'footer', 'watermark'] as const) {
            axes.push({ imageTreatment, layoutBehaviour, footerStyle, logoTreatment });
          }
        }
      }
    }
    for (const overrides of axes) {
      const plan = planFor(overrides);
      const issues = validateLayoutPlan(plan, CONTENT);
      expect(issues, `${JSON.stringify(overrides)} → ${issues.join('; ')}`).toEqual([]);
    }
  });

  it('a torn-paper footer recipe reserves a real footer band holding the brand message', () => {
    const plan = planFor({ footerStyle: 'torn-paper' });
    const footer = plan.blocks.find((b) => b.kind === 'footer');
    expect(footer).toBeDefined();
    if (footer?.kind !== 'footer') return;
    expect(footer.style).toBe('torn-paper');
    const brandMessage = plan.blocks.find((b) => b.kind === 'text' && b.role === 'brandMessage');
    expect(brandMessage && 'rect' in brandMessage && brandMessage.rect.y).toBeGreaterThanOrEqual(footer.rect.y);
  });

  it('an integrated logo leads the text stack instead of floating in a corner', () => {
    const integrated = planFor({ logoTreatment: 'integrated', footerStyle: 'none' });
    const corner = planFor({ logoTreatment: 'corner', footerStyle: 'none' });
    const integratedLogo = integrated.blocks.find((b) => b.kind === 'logo');
    const cornerLogo = corner.blocks.find((b) => b.kind === 'logo');
    const headline = integrated.blocks.find((b) => b.kind === 'text' && b.role === 'headline');
    if (integratedLogo?.kind !== 'logo' || cornerLogo?.kind !== 'logo' || !headline || !('rect' in headline)) {
      throw new Error('expected logo + headline blocks');
    }
    // Integrated: directly above the headline. Corner: pinned to the canvas top margin.
    expect(Math.abs(integratedLogo.rect.y + integratedLogo.rect.height - headline.rect.y)).toBeLessThan(0.06);
    expect(cornerLogo.rect.y).toBeLessThan(0.08);
  });

  it('a full-bleed plan puts a legibility scrim under the copy, a framed plan does not', () => {
    const fullBleed = planFor({ imageTreatment: 'full-bleed' });
    const framed = planFor({ imageTreatment: 'framed' });
    expect(fullBleed.blocks.some((b) => b.kind === 'scrim')).toBe(true);
    expect(framed.blocks.some((b) => b.kind === 'scrim')).toBe(false);
    // Framed: the image never touches the canvas edges.
    expect(framed.imageRect.x).toBeGreaterThan(0);
    expect(framed.imageRect.y).toBeGreaterThan(0);
  });

  it('texture and imperfection axes show up as texture/rotation, never random broken alignment', () => {
    const plan = planFor({ texture: 'paper-grain', imperfectionLevel: 'subtle' });
    expect(plan.blocks.some((b) => b.kind === 'texture' && b.texture === 'paper-grain')).toBe(true);
    const headline = plan.blocks.find((b) => b.kind === 'text' && b.role === 'headline');
    if (headline?.kind !== 'text') throw new Error('expected headline');
    expect(Math.abs(headline.spec.rotationDeg ?? 0)).toBeLessThanOrEqual(2);
  });

  it('never drops authored words — every headline word survives fitting', () => {
    const longHeadline = 'A very long headline that keeps going and going far past any reasonable column width limit';
    const plan = planFor({}, { headline: longHeadline });
    const headline = plan.blocks.find((b) => b.kind === 'text' && b.role === 'headline');
    if (headline?.kind !== 'text') throw new Error('expected headline');
    expect(headline.spec.lines.join(' ')).toBe(longHeadline);
  });
});

describe('validateLayoutPlan', () => {
  it('flags placeholder strings', () => {
    const plan = planFor({}, { headline: 'HEADLINE' });
    const issues = validateLayoutPlan(plan, { ...CONTENT, headline: 'HEADLINE' });
    expect(issues.some((issue) => issue.includes('placeholder'))).toBe(true);
  });

  it('flags a missing logo block when a logo exists', () => {
    const plan = planFor({});
    const stripped = { ...plan, blocks: plan.blocks.filter((b) => b.kind !== 'logo') };
    const issues = validateLayoutPlan(stripped, CONTENT);
    expect(issues.some((issue) => issue.includes('logo'))).toBe(true);
  });

  it('flags overlapping solid blocks', () => {
    const plan = planFor({});
    const headline = plan.blocks.find((b) => b.kind === 'text' && b.role === 'headline');
    if (headline?.kind !== 'text') throw new Error('expected headline');
    const clone = { ...headline, role: 'support' as const };
    const issues = validateLayoutPlan({ ...plan, blocks: [...plan.blocks, clone] }, CONTENT);
    expect(issues.some((issue) => issue.includes('overlaps'))).toBe(true);
  });
});

describe('normaliseDesignRecipe', () => {
  it('returns undefined for a non-object so absent stays absent', () => {
    expect(normaliseDesignRecipe(undefined)).toBeUndefined();
    expect(normaliseDesignRecipe('nope')).toBeUndefined();
  });

  it('bounds every axis to its vocabulary and keeps only valid hex colours', () => {
    const recipe = normaliseDesignRecipe({
      typographyFamily: 'papyrus-crimes',
      layoutBehaviour: 'asymmetric',
      colorPalette: ['#a1b2c3', 'red', '#zzzzzz'],
      footerStyle: 'torn-paper',
      graphicElements: ['hand-drawn underline', ''],
    });
    expect(recipe?.typographyFamily).toBe('serif-editorial');
    expect(recipe?.layoutBehaviour).toBe('asymmetric');
    expect(recipe?.colorPalette).toEqual(['#a1b2c3']);
    expect(recipe?.footerStyle).toBe('torn-paper');
    expect(recipe?.graphicElements).toEqual(['hand-drawn underline']);
  });
});

describe('deriveFallbackRecipe / resolveDesignRecipe', () => {
  it('a HANDCRAFTED direction derives a tactile recipe without any references', () => {
    const recipe = deriveFallbackRecipe({ ...BASE_DIRECTION, artDirectionFamily: 'HANDCRAFTED' }, EMPTY_DNA);
    expect(recipe.footerStyle).toBe('torn-paper');
    expect(recipe.texture).toBe('paper-grain');
  });

  it('an analysed reference profile with a recipe wins over the derived fallback', () => {
    const profile = profileWithRecipe({ footerStyle: 'hairline' });
    const { recipe, source } = resolveDesignRecipe(BASE_DIRECTION, EMPTY_DNA, { referenceStyle: profile });
    expect(recipe.footerStyle).toBe('hairline');
    expect(source).toBe('reference-analysis');
  });

  it('an explicitly selected style wins over an analysed reference profile — never silently overridden by upload analysis', () => {
    const profile = profileWithRecipe({ footerStyle: 'hairline', texture: 'none' });
    const style = getStyleDNA('collage')!; // texture: paper-grain/halftone, footer: torn-paper/none
    const { recipe, source } = resolveDesignRecipe(BASE_DIRECTION, EMPTY_DNA, { styleDna: style, referenceStyle: profile });
    expect(source).toBe('style-dna');
    expect(recipe.footerStyle).not.toBe('hairline');
    expect(['torn-paper', 'none']).toContain(recipe.footerStyle);
    expect(['paper-grain', 'halftone']).toContain(recipe.texture);
  });

  it('with neither a selected style nor an analysed reference, the recipe source is reported as generic-fallback', () => {
    const { source } = resolveDesignRecipe(BASE_DIRECTION, EMPTY_DNA, {});
    expect(source).toBe('generic-fallback');
  });

  it('TYPOGRAPHY_LED without references centres the layout', () => {
    const recipe = deriveFallbackRecipe({ ...BASE_DIRECTION, artDirectionFamily: 'TYPOGRAPHY_LED' }, EMPTY_DNA);
    expect(recipe.layoutBehaviour).toBe('centered');
  });

  it('typography follows the concept medium, never one universal house serif', () => {
    const familyOf = (artDirectionFamily: typeof BASE_DIRECTION.artDirectionFamily) =>
      deriveFallbackRecipe({ ...BASE_DIRECTION, artDirectionFamily }, EMPTY_DNA).typographyFamily;
    expect(familyOf('PLAYFUL_GRAPHIC')).toBe('geometric-sans');
    expect(familyOf('PRODUCT_STUDIO')).toBe('sans-modern');
    expect(familyOf('COLLAGE')).toBe('mixed');
    expect(familyOf('TYPOGRAPHY_LED')).toBe('condensed-display');
    // Editorial media still earn the serif — as a derived choice, not a default.
    expect(familyOf('EDITORIAL_PHOTOGRAPHY')).toBe('serif-editorial');
  });
});

describe('resolvePalette — no FlowPost house palette', () => {
  it('brand colours outrank reference colours, which outrank the campaign palette', () => {
    const brand = resolvePalette(['#8b1e1e'], ['#2244cc'], ['#22aa66']);
    expect(brand.accent).toBe('#8b1e1e');
    const reference = resolvePalette([], ['#2244cc'], ['#22aa66']);
    expect(reference.accent).toBe('#2244cc');
  });

  it('with no brand and no reference colours, the campaign palette tints the piece — never the neutral cream', () => {
    const palette = resolvePalette([], [], ['#0b3d2e', '#e8f4ec', '#ff6b35']);
    expect(palette.accent).toBe('#ff6b35');
    expect(palette.paper).toBe('#e8f4ec');
    expect(palette.ink).toBe('#0b3d2e');
  });

  it('the neutral floor is reachable only when every DNA layer supplied nothing', () => {
    const palette = resolvePalette([], [], []);
    expect(palette.paper).toBe('#f7f4ee');
  });
});

function planForArchetype(
  archetype: CompositionArchetype,
  content: Partial<ContentInput> = {},
  recipeOverrides: Partial<ReferenceDesignRecipe> = {},
  capabilities?: ImageCapabilities,
): LayoutPlan {
  const mergedContent: ContentInput = { ...CONTENT, ...content };
  if ('cta' in content && content.cta === undefined) delete (mergedContent as any).cta;
  if ('support' in content && content.support === undefined) delete (mergedContent as any).support;
  if ('secondaryInfo' in content && content.secondaryInfo === undefined) delete (mergedContent as any).secondaryInfo;
  if ('brandMessage' in content && content.brandMessage === undefined) delete (mergedContent as any).brandMessage;

  const input: LayoutPlanInput = {
    width: 1280,
    height: 1600,
    recipe: { ...BASE_RECIPE, compositionArchetype: archetype, ...recipeOverrides },
    content: mergedContent,
    palette: resolvePalette([], BASE_RECIPE.colorPalette),
    aspectRatio: '4:5',
    typography: TEST_TYPOGRAPHY,
    compositionArchetype: archetype,
    capabilities,
  };
  return buildLayoutPlan(input);
}

describe('Composition Archetypes & Diversity System', () => {
  it('1. Every archetype produces a valid layout with correct archetype property', () => {
    for (const archetype of COMPOSITION_ARCHETYPES) {
      const plan = planForArchetype(archetype);
      expect(plan.archetype).toBe(archetype);
      expect(plan.canvas.width).toBe(1280);
      expect(plan.canvas.height).toBe(1600);
      expect(plan.blocks.length).toBeGreaterThan(0);
      expect(plan.imageRect.width).toBeGreaterThan(0);
      expect(plan.imageRect.height).toBeGreaterThan(0);
    }
  });

  it('2. Every archetype passes layout plan validation', () => {
    for (const archetype of COMPOSITION_ARCHETYPES) {
      const plan = planForArchetype(archetype);
      const issues = validateLayoutPlan(plan, CONTENT);
      expect(issues, `${archetype} failed validation: ${issues.join('; ')}`).toEqual([]);
    }
  });

  it('3. EDITORIAL_OVERLAP allows intentional headline/image overlap', () => {
    const plan = planForArchetype('EDITORIAL_OVERLAP');
    const headline = plan.blocks.find((b) => b.kind === 'text' && b.role === 'headline');
    expect(headline).toBeDefined();
    if (!headline || !('rect' in headline)) throw new Error('headline expected');
    const overlap = overlapArea(plan.imageRect, headline.rect);
    expect(overlap).toBeGreaterThan(0.005);
    const issues = validateLayoutPlan(plan, CONTENT);
    expect(issues).toEqual([]);

    // But if headline overlaps in NEGATIVE_SPACE, it is flagged
    const negPlan = planForArchetype('NEGATIVE_SPACE');
    const negHeadline = negPlan.blocks.find((b) => b.kind === 'text' && b.role === 'headline') as any;
    if (negHeadline) {
      negHeadline.rect = { ...negPlan.imageRect };
      const negIssues = validateLayoutPlan(negPlan, CONTENT);
      expect(negIssues.some((issue) => issue.includes('headline unexpectedly overlaps image'))).toBe(true);
    }
  });

  it('4. Illegal text/text overlap still fails', () => {
    const plan = planForArchetype('FULL_BLEED_TYPE');
    const headline = plan.blocks.find((b) => b.kind === 'text' && b.role === 'headline');
    if (!headline || !('rect' in headline)) throw new Error('headline expected');
    const collidingText = { ...headline, role: 'support' as const };
    const issues = validateLayoutPlan({ ...plan, blocks: [...plan.blocks, collidingText] }, CONTENT);
    expect(issues.some((issue) => issue.includes('overlaps'))).toBe(true);
  });

  it('5. text/CTA overlap fails', () => {
    const plan = planForArchetype('ASYMMETRIC_GRID');
    const cta = plan.blocks.find((b) => b.kind === 'cta');
    const headline = plan.blocks.find((b) => b.kind === 'text' && b.role === 'headline');
    if (!cta || !headline || !('rect' in cta) || !('rect' in headline)) throw new Error('cta & headline expected');
    const brokenPlan = {
      ...plan,
      blocks: plan.blocks.map((b) => (b.kind === 'cta' ? { ...b, rect: headline.rect } : b)),
    };
    const issues = validateLayoutPlan(brokenPlan, CONTENT);
    expect(issues.some((issue) => issue.includes('overlaps'))).toBe(true);
  });

  it('6. FRAME_WITH_OVERLAP allows headline/frame overlap', () => {
    const plan = planForArchetype('FRAME_WITH_OVERLAP');
    const headline = plan.blocks.find((b) => b.kind === 'text' && b.role === 'headline');
    expect(headline).toBeDefined();
    expect(plan.blocks.some((b) => b.kind === 'border' && b.style === 'inset-frame')).toBe(true);
    const issues = validateLayoutPlan(plan, CONTENT);
    expect(issues).toEqual([]);
  });

  it('7. PRODUCT_CUTOUT respects image capabilities', () => {
    const cutoutPlan = planForArchetype('PRODUCT_CUTOUT', {}, {}, { isCutout: true });
    expect(cutoutPlan.structure).toContain('PRODUCT_CUTOUT/cutout-floating');

    const nonCutoutPlan = planForArchetype('PRODUCT_CUTOUT', {}, {}, { isCutout: false });
    expect(nonCutoutPlan.structure).toContain('PRODUCT_CUTOUT/spotlight');
  });

  it('8. Anti-template validator rejects a synthetic legacy layout', () => {
    const syntheticLegacy: LayoutPlan = {
      canvas: { width: 1080, height: 1080 },
      paper: '#f8f7f4',
      imageRect: { x: 0, y: 0.02, width: 0.95, height: 0.52 },
      archetype: 'FULL_BLEED_TYPE',
      structure: 'synthetic-legacy',
      blocks: [
        {
          kind: 'text',
          role: 'headline',
          rect: { x: 0.1, y: 0.56, width: 0.8, height: 0.08 },
          spec: {
            lines: ['Top Headline'],
            x: 540,
            y: 600,
            fontSize: 48,
            lineHeight: 56,
            fontFamily: 'Inter',
            fill: '#1a1a1a',
            align: 'center',
          },
        },
        {
          kind: 'divider',
          rect: { x: 0.1, y: 0.68, width: 0.8, height: 0.002 },
          stroke: '#1a1a1a',
          opacity: 0.5,
        },
        {
          kind: 'cta',
          rect: { x: 0.65, y: 0.78, width: 0.25, height: 0.06 },
          spec: {
            text: 'Shop',
            x: 700,
            y: 840,
            width: 200,
            height: 50,
            fontSize: 20,
            fontFamily: 'Inter',
            shape: 'rect',
            fill: '#ff0000',
            textFill: '#ffffff',
          },
        },
        {
          kind: 'footer',
          rect: { x: 0, y: 0.86, width: 1, height: 0.14 },
          style: 'solid-band',
          fill: '#e5e5e5',
        },
      ],
    };

    const issues = validateCompositionDiversity(syntheticLegacy);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain('LEGACY_TEMPLATE_COLLAPSE');
  });

  it('9. Anti-template validator accepts a modern graphic composition', () => {
    for (const arch of COMPOSITION_ARCHETYPES) {
      const plan = planForArchetype(arch);
      const issues = validateCompositionDiversity(plan);
      expect(issues, `${arch} had diversity issues: ${issues.join('; ')}`).toEqual([]);
    }
  });

  it('10. Same style + same variant is deterministic', () => {
    const style = getStyleDNA('minimalist')!;
    const arch1 = chooseCompositionArchetype({ style, variant: 2 });
    const arch2 = chooseCompositionArchetype({ style, variant: 2 });
    expect(arch1).toBe(arch2);

    const recipe1 = styleDnaToRecipe(style, 3);
    const recipe2 = styleDnaToRecipe(style, 3);
    expect(recipe1.compositionArchetype).toBe(recipe2.compositionArchetype);
  });

  it('11. Same style + different variants can produce different archetypes', () => {
    const style = getStyleDNA('minimalist')!;
    const pool = new Set(
      [0, 1, 2, 3].map((v) => chooseCompositionArchetype({ style, variant: v }))
    );
    expect(pool.size).toBeGreaterThan(1);
  });

  it('12. Different Style DNAs use only their allowed archetypes', () => {
    for (const style of STYLE_DNA_LIBRARY) {
      for (let v = 0; v < 8; v++) {
        const arch = chooseCompositionArchetype({ style, variant: v });
        expect(style.renderer.compositionArchetypes).toContain(arch);
      }
    }
  });

  it('13. Different styles can produce materially different layouts', () => {
    const minStyle = getStyleDNA('minimalist')!;
    const boldStyle = getStyleDNA('bold-typography')!;

    const minRecipe = styleDnaToRecipe(minStyle, 0);
    const boldRecipe = styleDnaToRecipe(boldStyle, 0);

    const minPlan = planForArchetype(minRecipe.compositionArchetype!, {}, minRecipe);
    const boldPlan = planForArchetype(boldRecipe.compositionArchetype!, {}, boldRecipe);

    expect(minPlan.structure).not.toBe(boldPlan.structure);
    expect(minPlan.imageRect.y).not.toBe(boldPlan.imageRect.y);
  });

  it('14. NEGATIVE_SPACE actually produces substantial whitespace', () => {
    const plan = planForArchetype('NEGATIVE_SPACE');
    let occupiedArea = plan.imageRect.width * plan.imageRect.height;
    for (const b of plan.blocks) {
      if ('rect' in b && b.kind !== 'scrim' && b.kind !== 'texture') {
        occupiedArea += b.rect.width * b.rect.height;
      }
    }
    expect(occupiedArea).toBeLessThan(0.65);
  });

  it('15. New layouts do not automatically contain divider/footer/CTA when unrequested', () => {
    const bareContent: ContentInput = {
      headline: 'Simple Clean Statement',
      hasLogo: false,
      cta: undefined,
      support: undefined,
      secondaryInfo: undefined,
    };
    const archetypesToCheck: CompositionArchetype[] = [
      'FULL_BLEED_TYPE',
      'EDITORIAL_OVERLAP',
      'NEGATIVE_SPACE',
      'TYPOGRAPHIC_POSTER',
      'SPLIT_COMPOSITION',
    ];
    for (const arch of archetypesToCheck) {
      const plan = planForArchetype(arch, bareContent);
      expect(plan.blocks.some((b) => b.kind === 'footer')).toBe(false);
      expect(plan.blocks.some((b) => b.kind === 'divider')).toBe(false);
      expect(plan.blocks.some((b) => b.kind === 'cta')).toBe(false);
    }
  });
});

