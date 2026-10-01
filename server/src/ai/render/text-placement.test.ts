/**
 * Fitting composed type to the measured image — unit tests.
 *
 * Run: cd server && npx vitest run src/ai/render/text-placement.test.ts
 */
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { analyzeImageField, type ImageField } from './image-field';
import { crossingIsDeclared, fitCopyToField, relativeLuminance } from './text-placement';
import { buildTypeSystem, type TypeSystem } from '../typography/type-system';
import type { TypographySelection } from '../typography/font-selector';
import type { FontRole } from '../typography/font-catalog';
import type { DesignNode, DesignerPlan } from './designer-composition';
import type { GraphicDesignConcept } from '../types';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const png = (paint: (x: number, y: number) => [number, number, number], size = 256) => {
  const raw = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = paint(x / size, y / size);
      const i = (y * size + x) * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
};

/** A bright, detailed subject in the lower half; calm dark ground above it. */
const subjectLowerHalf = () =>
  png((x, y) => {
    if (y > 0.55 && x > 0.15 && x < 0.85) {
      const noise = ((Math.sin(x * 220) + Math.cos(y * 190)) * 60 + 195) | 0;
      return [noise, noise, noise];
    }
    return [26, 28, 30];
  });

const flatField = (level: number) => png(() => [level, level, level]);

const ROLES: FontRole[] = ['eyebrow', 'headline', 'subheadline', 'body', 'offer', 'cta', 'metadata', 'disclaimer', 'accent'];

function typographyFixture(): TypographySelection {
  const hierarchy = Object.fromEntries(
    ROLES.map((role) => [
      role,
      { family: 'Inter', weight: 400, fontSize: 0.03, letterSpacing: 0, lineHeightMult: 1.15, caseTransform: 'sentence' as const, italic: false },
    ]),
  ) as TypographySelection['hierarchy'];
  return {
    headlineFont: 'Inter',
    bodyFont: 'Inter',
    headlineWeight: 700,
    bodyWeight: 400,
    typographyReasoning: '',
    hierarchy,
    baseFontStack: { headline: 'Inter', body: 'Inter', headlineWeight: 700, bodyWeight: 400, headlineCharWidth: 0.5, lineHeightMult: 1.15 },
    facesUsed: [],
  };
}

const typeSystem = (): TypeSystem =>
  buildTypeSystem({
    typography: typographyFixture(),
    concept: { typographyScaleContrast: 'dramatic' },
    copy: [
      { role: 'HEADLINE', text: 'Made for the long run' },
      { role: 'SUPPORT', text: 'Since 1994' },
    ],
  });

const copyNode = (over: Partial<DesignNode> & { id: string }): DesignNode => ({
  kind: 'copy',
  x: 0.08,
  y: 0.08,
  width: 0.5,
  height: 0.14,
  color: '#ffffff',
  surface: 'none',
  fontScale: 0.06,
  align: 'left',
  shape: 'rectangle',
  lines: ['Made for the long run'],
  ...over,
});

const planOf = (nodes: DesignNode[]): DesignerPlan => ({ background: '#111111', rationale: '', nodes });

const concept = (over: Partial<GraphicDesignConcept> = {}): GraphicDesignConcept =>
  ({ conceptName: 'c', visualIdea: 'an idea', hero: 'image', imageRole: 'full-bleed', firstRead: 'the idea', ...over }) as GraphicDesignConcept;

const fit = (plan: DesignerPlan, field: ImageField, over: Partial<Parameters<typeof fitCopyToField>[0]> = {}) =>
  fitCopyToField({ plan, field, typeSystem: typeSystem(), concept: concept(), palette: [], imageIsBackdrop: true, ...over });

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('fitCopyToField — the identity guarantee', () => {
  it('returns a deep-equal plan when nothing is wrong', async () => {
    // A flat mid-dark field: no subject to occlude, even tone, white type clears
    // contrast comfortably, hierarchy already correct.
    const field = await analyzeImageField(await flatField(24));
    const plan = planOf([
      copyNode({ id: 'primary-hook', fontScale: 0.07 }),
      copyNode({ id: 'supporting-note', y: 0.42, fontScale: 0.022, lines: ['Since 1994'] }),
    ]);
    const before = structuredClone(plan);

    const { plan: after, report } = fit(plan, field);

    expect(after).toEqual(before);
    expect(report.moved).toEqual([]);
    expect(report.recoloured).toEqual([]);
    expect(report.scrimmed).toEqual([]);
    expect(report.resized).toEqual([]);
  });

  it('never mutates the plan it was given', async () => {
    const field = await analyzeImageField(await subjectLowerHalf());
    const plan = planOf([copyNode({ id: 'primary-hook', y: 0.62 })]);
    const snapshot = structuredClone(plan);

    fit(plan, field);

    expect(plan).toEqual(snapshot);
  });
});

describe('fitCopyToField — occlusion', () => {
  it('moves type off the subject', async () => {
    const field = await analyzeImageField(await subjectLowerHalf());
    // Parked squarely on the subject in the lower half.
    const plan = planOf([copyNode({ id: 'primary-hook', x: 0.2, y: 0.62, width: 0.6, height: 0.16 })]);

    const { plan: after, report } = fit(plan, field);
    const moved = after.nodes[0];

    expect(report.moved.length).toBe(1);
    expect(field.occlusionOf(moved)).toBeLessThan(field.occlusionOf(plan.nodes[0]));
  });

  it('leaves a declared crossing exactly where the art director put it', async () => {
    const field = await analyzeImageField(await subjectLowerHalf());
    const plan = planOf([copyNode({ id: 'primary-hook', x: 0.2, y: 0.62, width: 0.6, height: 0.16 })]);

    const { plan: after, report } = fit(plan, field, {
      concept: concept({ spatialRelationship: 'the headline crosses straight over the subject' }),
    });

    expect(report.moved).toEqual([]);
    expect(after.nodes[0].x).toBe(plan.nodes[0].x);
    expect(after.nodes[0].y).toBe(plan.nodes[0].y);
    expect(report.notes.join(' ')).toContain('cross');
  });

  it('slides along the anchored edge rather than abandoning it', async () => {
    // Subject on the right; a bottom-anchored headline should stay at the bottom.
    const field = await analyzeImageField(
      await png((x, y) => (x > 0.5 ? [((Math.sin(x * 200) + Math.cos(y * 170)) * 60 + 190) | 0, 190, 190] : [22, 22, 22])),
    );
    const plan = planOf([copyNode({ id: 'primary-hook', x: 0.45, y: 0.82, width: 0.45, height: 0.12 })]);

    const { plan: after } = fit(plan, field);

    // Still anchored to the bottom edge, just moved along it.
    expect(after.nodes[0].y + after.nodes[0].height).toBeGreaterThan(0.6);
  });

  it('leaves placement alone when the visual is not the backdrop', async () => {
    const field = await analyzeImageField(await subjectLowerHalf());
    const plan = planOf([copyNode({ id: 'primary-hook', x: 0.2, y: 0.62, width: 0.6, height: 0.16 })]);

    const { plan: after, report } = fit(plan, field, { imageIsBackdrop: false });

    expect(after.nodes[0]).toEqual(plan.nodes[0]);
    expect(report.moved).toEqual([]);
    expect(report.notes.join(' ')).toContain('does not fill the canvas');
  });
});

describe('fitCopyToField — colour', () => {
  it('flips ink to suit a backdrop the plan guessed wrong', async () => {
    const field = await analyzeImageField(await flatField(244));
    // White type on a near-white photograph — invisible, and the flat-hex check
    // upstream could not see it because it compared against plan.background.
    const plan = planOf([copyNode({ id: 'primary-hook', color: '#ffffff' })]);

    const { plan: after, report } = fit(plan, field);

    expect(report.recoloured.length).toBe(1);
    expect(relativeLuminance(after.nodes[0].color)!).toBeLessThan(0.3);
  });

  it('prefers a brand colour that clears the target over defaulting to black', async () => {
    const field = await analyzeImageField(await flatField(250));
    const plan = planOf([copyNode({ id: 'primary-hook', color: '#ffffff' })]);

    const { plan: after } = fit(plan, field, { palette: ['#7f1d1d'] });

    expect(after.nodes[0].color).toBe('#7f1d1d');
  });

  it('leaves a colour that already works untouched', async () => {
    const field = await analyzeImageField(await flatField(20));
    const plan = planOf([copyNode({ id: 'primary-hook', color: '#ffffff' })]);

    const { plan: after, report } = fit(plan, field, { palette: ['#7f1d1d'] });

    expect(after.nodes[0].color).toBe('#ffffff');
    expect(report.recoloured).toEqual([]);
  });

  it('does not touch copy sitting on its own solid surface', async () => {
    const field = await analyzeImageField(await flatField(244));
    const plan = planOf([copyNode({ id: 'primary-hook', color: '#ffffff', surface: '#111111' })]);

    const { plan: after, report } = fit(plan, field);

    expect(after.nodes[0].color).toBe('#ffffff');
    expect(report.recoloured).toEqual([]);
    expect(report.scrimmed).toEqual([]);
  });
});

describe('fitCopyToField — the scrim is a last resort', () => {
  it('adds no scrim when an ink colour can carry the contrast', async () => {
    const field = await analyzeImageField(await flatField(24));
    const { plan: after, report } = fit(planOf([copyNode({ id: 'primary-hook' })]), field);

    expect(report.scrimmed).toEqual([]);
    expect(after.nodes[0].scrim).toBeUndefined();
  });

  it('washes a half-bright, half-dark backdrop at the weakest opacity that works', async () => {
    const field = await analyzeImageField(await png((x) => (x < 0.5 ? [4, 4, 4] : [252, 252, 252])));
    // Spans both halves, so no flat ink can be legible across it.
    const plan = planOf([copyNode({ id: 'primary-hook', x: 0.08, y: 0.4, width: 0.84, height: 0.16 })]);

    const { plan: after, report } = fit(plan, field);

    expect(report.scrimmed.length).toBe(1);
    expect(after.nodes[0].scrim!.opacity).toBeGreaterThan(0);
    expect(after.nodes[0].scrim!.opacity).toBeLessThanOrEqual(0.85);
    expect(['up', 'down', 'left', 'right']).toContain(after.nodes[0].scrim!.direction);
  });
});

describe('fitCopyToField — hierarchy', () => {
  it('fixes an inverted hierarchy', async () => {
    const field = await analyzeImageField(await flatField(24));
    const plan = planOf([
      copyNode({ id: 'primary-hook', fontScale: 0.03 }),
      copyNode({ id: 'supporting-note', y: 0.5, fontScale: 0.09, lines: ['Since 1994'] }),
    ]);

    const { plan: after, report } = fit(plan, field);
    const primary = after.nodes.find((n) => n.id === 'primary-hook')!;
    const supporting = after.nodes.find((n) => n.id === 'supporting-note')!;

    expect(report.resized.length).toBeGreaterThan(0);
    expect(supporting.fontScale).toBeLessThan(primary.fontScale);
  });

  it('raises type that came back below the optical floor', async () => {
    const field = await analyzeImageField(await flatField(24));
    const plan = planOf([copyNode({ id: 'supporting-note', fontScale: 0.004, lines: ['Since 1994'] })]);

    const { plan: after, report } = fit(plan, field);

    expect(after.nodes[0].fontScale).toBeGreaterThanOrEqual(typeSystem().opticalFloor);
    expect(report.resized.length).toBe(1);
  });

  it('leaves a deliberately enormous first read enormous', async () => {
    const field = await analyzeImageField(await flatField(24));
    const plan = planOf([
      copyNode({ id: 'primary-hook', fontScale: 0.24, height: 0.34 }),
      copyNode({ id: 'supporting-note', y: 0.6, fontScale: 0.02, lines: ['Since 1994'] }),
    ]);

    const { plan: after, report } = fit(plan, field);

    expect(after.nodes.find((n) => n.id === 'primary-hook')!.fontScale).toBe(0.24);
    expect(report.resized).toEqual([]);
  });
});

describe('crossingIsDeclared', () => {
  it('reads a declared crossing out of any of the behaviour fields', () => {
    expect(crossingIsDeclared(concept({ typeBehavior: 'type crosses the product' }))).toBe(true);
    expect(crossingIsDeclared(concept({ overlapRelationships: ['headline over the subject'] }))).toBe(true);
    expect(crossingIsDeclared(concept({ spatialRelationship: 'the word is locked into the colour block' }))).toBe(true);
  });

  it('does not invent a crossing from an ordinary description', () => {
    expect(crossingIsDeclared(concept({ typeBehavior: 'a quiet caption beneath the image' }))).toBe(false);
    expect(crossingIsDeclared(concept())).toBe(false);
  });
});
