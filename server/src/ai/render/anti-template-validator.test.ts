import { describe, it, expect } from 'vitest';
import { validateAntiTemplateQuality } from './anti-template-validator';
import type { DesignerPlan, DesignNode } from './designer-composition';

const node = (id: string, kind: DesignNode['kind'], x: number, y: number, width: number, height: number, fontScale = 0.045, align: DesignNode['align'] = 'left'): DesignNode => ({
  id,
  kind,
  x,
  y,
  width,
  height,
  lines: ['Sample line'],
  color: '#111111',
  surface: 'none',
  fontScale,
  align,
  shape: 'rectangle',
});

const plan = (nodes: DesignNode[]): DesignerPlan => ({ background: '#111111', rationale: '', visualPrompt: '', nodes });

describe('validateAntiTemplateQuality', () => {
  it('rejects a rigid 3-block vertical template (image top, text bottom)', () => {
    const result = validateAntiTemplateQuality(plan([
      node('product-0', 'product', 0.05, 0.05, 0.9, 0.45),
      node('copy-0', 'copy', 0.05, 0.55, 0.9, 0.12, 0.12),
      node('copy-1', 'copy', 0.05, 0.7, 0.9, 0.08, 0.035),
      node('logo', 'logo', 0.75, 0.85, 0.2, 0.1),
    ]));
    expect(result.passed).toBe(false);
    expect(result.violations.join(' ')).toContain('Predictable template stack');
  });

  it('rejects dead-center symmetry across all elements', () => {
    const result = validateAntiTemplateQuality(plan([
      node('product-0', 'product', 0.2, 0.1, 0.6, 0.4, 0.045, 'center'),
      node('copy-0', 'copy', 0.15, 0.52, 0.7, 0.1, 0.12, 'center'),
      node('copy-1', 'copy', 0.15, 0.64, 0.7, 0.08, 0.038, 'center'),
      node('logo', 'logo', 0.4, 0.78, 0.2, 0.08, 0.045, 'center'),
    ]));
    expect(result.passed).toBe(false);
    expect(result.violations.join(' ')).toContain('Dead-center template layout');
  });

  // Reproduces the real "bts-return-event" render: giant headline top-left, a
  // rule, a badge, the photo floating in its own rectangle, logo bottom-left.
  it('rejects a photo floating in its own rectangle with type parked beside it', () => {
    const result = validateAntiTemplateQuality(plan([
      node('copy-0', 'copy', 0.05, 0.07, 0.85, 0.13, 0.13),
      node('shape-0', 'shape', 0.05, 0.38, 0.9, 0.012),
      node('copy-1', 'copy', 0.05, 0.41, 0.5, 0.04, 0.028),
      node('product-0', 'product', 0.37, 0.44, 0.58, 0.48),
      node('logo', 'logo', 0.07, 0.87, 0.22, 0.06),
    ]));
    expect(result.passed).toBe(false);
    expect(result.violations.join(' ')).toContain('No figure/ground integration');
    expect(result.violations.join(' ')).toContain('Dead band across the canvas');
  });

  it('rejects uniform copy weights even when the layout is asymmetric', () => {
    const result = validateAntiTemplateQuality(plan([
      node('copy-0', 'copy', 0.06, 0.10, 0.5, 0.10, 0.040),
      node('copy-1', 'copy', 0.06, 0.22, 0.5, 0.08, 0.036),
      node('copy-2', 'copy', 0.06, 0.32, 0.5, 0.08, 0.034),
      node('product-0', 'product', 0.30, 0.30, 0.85, 0.60),
      node('logo', 'logo', 0.06, 0.86, 0.2, 0.07),
    ]));
    expect(result.passed).toBe(false);
    expect(result.violations.join(' ')).toContain('Equal visual weights');
  });

  it('approves a composition that bleeds, overlaps and commits to a hierarchy', () => {
    const result = validateAntiTemplateQuality(plan([
      node('product-0', 'product', 0.34, -0.06, 0.72, 0.78), // cropped by two edges
      node('copy-0', 'copy', 0.04, 0.16, 0.62, 0.26, 0.13), // runs across the photo
      node('copy-1', 'copy', 0.04, 0.46, 0.34, 0.09, 0.03),
      node('shape-0', 'shape', 0.0, 0.60, 0.55, 0.30),
      node('logo', 'logo', 0.05, 0.86, 0.18, 0.08),
    ]));
    expect(result.passed).toBe(true);
    expect(result.strengths.join(' ')).toContain('Decisive type scale contrast');
    expect(result.strengths.join(' ')).toContain('Typography composed across the imagery');
  });

  it('holds the layout to the blueprint\u2019s stated image role', () => {
    const result = validateAntiTemplateQuality(
      plan([
        node('product-0', 'product', 0.55, 0.30, 0.30, 0.25),
        node('copy-0', 'copy', 0.05, 0.10, 0.6, 0.2, 0.13),
        node('copy-1', 'copy', 0.05, 0.34, 0.4, 0.08, 0.03),
        node('shape-0', 'shape', 0.5, 0.28, 0.45, 0.3),
        node('logo', 'logo', 0.05, 0.80, 0.18, 0.08),
      ]),
      { imageRole: 'full-bleed' } as never,
    );
    expect(result.violations.join(' ')).toContain('full-bleed');
  });
});
