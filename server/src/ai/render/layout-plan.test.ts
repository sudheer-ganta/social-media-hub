/**
 * LayoutPlan builder + design recipe — unit tests.
 *
 * Run: cd server && npx vitest run src/ai/render/layout-plan.test.ts
 */
import { describe, it, expect } from 'vitest';
import { buildLayoutPlan, resolvePalette, validateLayoutPlan, type ContentInput, type LayoutPlanInput } from './layout-plan';
import { deriveFallbackRecipe, normaliseDesignRecipe, resolveDesignRecipe } from './design-recipe';
import { BASE_DIRECTION, BASE_RECIPE, EMPTY_DNA, profileWithRecipe } from './creative-renderer.test';
import type { ReferenceDesignRecipe } from '../types';

const CONTENT: ContentInput = {
  headline: 'Steam Rises, Weekend Begins',
  support: 'Twelve momos, one long table.',
  brandMessage: 'Cooked in silence, served with love.',
  secondaryInfo: 'Prism Mall, Gachibowli',
  cta: 'Book a table',
  hasLogo: true,
};

function planFor(recipe: Partial<ReferenceDesignRecipe>, content: Partial<ContentInput> = {}): ReturnType<typeof buildLayoutPlan> {
  const input: LayoutPlanInput = {
    width: 1280,
    height: 1600,
    recipe: { ...BASE_RECIPE, ...recipe },
    content: { ...CONTENT, ...content },
    palette: resolvePalette([], BASE_RECIPE.colorPalette),
    aspectRatio: '4:5',
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

  it('an analysed profile with a recipe wins over the derived fallback', () => {
    const profile = profileWithRecipe({ footerStyle: 'hairline' });
    const recipe = resolveDesignRecipe(BASE_DIRECTION, EMPTY_DNA, profile);
    expect(recipe.footerStyle).toBe('hairline');
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
