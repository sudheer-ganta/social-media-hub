import { describe, expect, it } from 'vitest';
import { validateDesign, validateStyleFidelity } from './design-validator';
import { BASE_RECIPE } from './creative-renderer.test';
import { getStyleDNA, styleDnaToRecipe } from '../style-dna/style-dna';
import type { ContentInput, LayoutPlan } from './layout-plan';
import type { TypographySelection } from '../typography/font-selector';
import type { FontRole } from '../typography/font-catalog';

const content: ContentInput = { headline: 'Built to move', cta: 'Shop now', hasLogo: false };
const plan = (): LayoutPlan => ({
  canvas: { width: 1080, height: 1080 }, paper: '#fff', imageRect: { x: 0, y: 0, width: 1, height: 1 }, structure: 'test',
  blocks: [
    { kind: 'text', role: 'headline', rect: { x: .1, y: .1, width: .6, height: .15 }, spec: { lines: ['Built to move'], fontSize: 72, fontFamily: 'Inter', fontWeight: 700, fill: '#000', lineHeight: 80, textAnchor: 'start' } },
    { kind: 'cta', rect: { x: .1, y: .8, width: .2, height: .08 }, spec: { text: 'Shop now', fontSize: 24, fontFamily: 'Inter', fontWeight: 600, fill: '#000', textFill: '#fff' } },
  ],
});

describe('validateDesign', () => {
  it('accepts a complete non-overlapping plan', () => expect(validateDesign(plan(), content).valid).toBe(true));
  it('returns structured errors for overlap and placeholder copy', () => {
    const broken = plan();
    broken.blocks[1] = { ...broken.blocks[1], rect: { x: .1, y: .1, width: .2, height: .08 } } as typeof broken.blocks[number];
    (broken.blocks[0] as Extract<typeof broken.blocks[number], { kind: 'text' }>).spec.lines = ['Lorem ipsum'];
    const result = validateDesign(broken, content);
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toEqual(expect.arrayContaining(['OVERLAP', 'PLACEHOLDER_TEXT']));
  });
  it('rejects invalid geometry before rasterization', () => {
    const broken = plan();
    broken.imageRect.width = Number.NaN;
    expect(validateDesign(broken, content).errors.some((issue) => issue.code === 'INVALID_GEOMETRY')).toBe(true);
  });
});

// ── Phase 6: deterministic style-fidelity validation ────────────────────────

const ROLE_TYPOGRAPHY = { family: 'Inter', weight: 400, fontSize: 0.02, letterSpacing: 0, lineHeightMult: 1.1, caseTransform: 'none' as const, italic: false };
const ROLES: FontRole[] = ['eyebrow', 'headline', 'subheadline', 'body', 'offer', 'cta', 'metadata', 'disclaimer', 'accent'];

function typographyFixture(overrides: Partial<TypographySelection> = {}): TypographySelection {
  return {
    headlineFont: 'Inter',
    bodyFont: 'Inter',
    headlineWeight: 700,
    bodyWeight: 400,
    typographyReasoning: 'test fixture',
    hierarchy: Object.fromEntries(ROLES.map((role) => [role, ROLE_TYPOGRAPHY])) as TypographySelection['hierarchy'],
    baseFontStack: { headline: 'Inter', body: 'Inter', headlineWeight: 700, bodyWeight: 400, headlineCharWidth: 0.56, lineHeightMult: 1.1 },
    facesUsed: [{ family: 'Inter', weight: 700, style: 'normal' }],
    ...overrides,
  };
}

describe('validateStyleFidelity', () => {
  it('is compliant when no style was selected', () => {
    const result = validateStyleFidelity({ recipe: BASE_RECIPE, typography: typographyFixture(), palette: { ink: '#111111', paper: '#ffffff', accent: '#111111' } });
    expect(result).toEqual({ compliant: true, violations: [] });
  });

  it('is compliant when every axis genuinely comes from the selected style', () => {
    const style = getStyleDNA('minimalist')!; // sans-serif only, no accent, texture: none, spacing: airy
    const recipe = { ...BASE_RECIPE, typographyFamily: 'sans-modern' as const, texture: 'none' as const, layoutBehaviour: 'centered' as const, footerStyle: 'none' as const, borderStyle: 'none' as const, shapeLanguage: 'editorial-rules' as const, imageTreatment: 'inset' as const, spacingBehaviour: 'airy' as const, logoTreatment: 'corner' as const };
    const typography = typographyFixture({ headlineFont: 'Inter', bodyFont: 'DM Sans', accentFont: undefined });
    const result = validateStyleFidelity({ styleDna: style, recipe, typography, palette: { ink: '#2b2b2b', paper: '#f7f4ee', accent: '#2b2b2b' } });
    expect(result).toEqual({ compliant: true, violations: [] });
  });

  it('flags a body font whose category the selected style excludes', () => {
    const style = getStyleDNA('minimal-doodles')!; // categories: sans-serif, handwritten — no serif
    const typography = typographyFixture({ headlineFont: 'Poppins', bodyFont: 'Lora' }); // Lora is serif
    const result = validateStyleFidelity({ styleDna: style, recipe: BASE_RECIPE, typography, palette: { ink: '#111111', paper: '#ffffff', accent: '#111111' } });
    expect(result.compliant).toBe(false);
    expect(result.violations.some((v) => v.includes('body font category'))).toBe(true);
  });

  it('flags an accent font when the selected style does not allow one', () => {
    const style = getStyleDNA('neo-brutalism')!; // accentAllowed: false
    const typography = typographyFixture({ headlineFont: 'Anton', bodyFont: 'Inter', accentFont: 'Caveat' });
    const result = validateStyleFidelity({ styleDna: style, recipe: BASE_RECIPE, typography, palette: { ink: '#000000', paper: '#ffffff', accent: '#000000' } });
    expect(result.compliant).toBe(false);
    expect(result.violations.some((v) => v.includes('accent font'))).toBe(true);
  });

  it('flags a texture the selected style never allows', () => {
    const style = getStyleDNA('minimalist')!; // texture: ['none'] only
    const recipe = { ...BASE_RECIPE, texture: 'halftone' as const };
    const result = validateStyleFidelity({ styleDna: style, recipe, typography: typographyFixture(), palette: { ink: '#111111', paper: '#ffffff', accent: '#111111' } });
    expect(result.compliant).toBe(false);
    expect(result.violations.some((v) => v.startsWith('texture'))).toBe(true);
  });

  it('flags a layout behaviour outside the selected style\'s allowed set', () => {
    const style = getStyleDNA('minimalist')!; // layoutBehaviour: ['centered', 'asymmetric']
    const recipe = { ...BASE_RECIPE, layoutBehaviour: 'diagonal' as const };
    const result = validateStyleFidelity({ styleDna: style, recipe, typography: typographyFixture(), palette: { ink: '#111111', paper: '#ffffff', accent: '#111111' } });
    expect(result.compliant).toBe(false);
    expect(result.violations.some((v) => v.startsWith('layout behaviour'))).toBe(true);
  });

  it('flags a final palette whose saturation clearly contradicts the selected style', () => {
    const style = getStyleDNA('y2k')!; // color.saturation: 'vibrant'
    const palette = { ink: '#3a3a3a', paper: '#e8e8e8', accent: '#8a8a8a' }; // uniformly muted/grey
    const result = validateStyleFidelity({ styleDna: style, recipe: BASE_RECIPE, typography: typographyFixture(), palette });
    expect(result.compliant).toBe(false);
    expect(result.violations.some((v) => v.includes('final rendered palette'))).toBe(true);
  });

  it('the same recipe is compliant for the style it was generated from, and non-compliant for an incompatible one', () => {
    const collage = getStyleDNA('collage')!; // texture: paper-grain/halftone — no overlap with minimalist's texture: none
    const recipe = styleDnaToRecipe(collage, 3); // by construction, every axis is one of collage's own values
    const typography = typographyFixture();
    const palette = { ink: '#111111', paper: '#ffffff', accent: '#111111' };

    const forItsOwnStyle = validateStyleFidelity({ styleDna: collage, recipe, typography, palette });
    expect(forItsOwnStyle.violations.filter((v) => v.startsWith('texture') || v.startsWith('layout behaviour'))).toEqual([]);

    const forADifferentStyle = validateStyleFidelity({ styleDna: getStyleDNA('minimalist')!, recipe, typography, palette });
    expect(forADifferentStyle.compliant).toBe(false);
  });
});
