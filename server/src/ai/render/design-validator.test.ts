import { describe, expect, it } from 'vitest';
import { validateDesign } from './design-validator';
import type { ContentInput, LayoutPlan } from './layout-plan';

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
