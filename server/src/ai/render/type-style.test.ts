import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import path from 'path';
import { FONTS_ROOT, getFontDefinition } from '../typography/font-catalog';
import type { DesignNode } from './designer-composition';
import { applyTextStyles, summariseTypeset } from './type-style-apply';
import {
  assertFontSupportsText,
  fontPickerOptions,
  fontsSupportingText,
  parseTextStyles,
  SIZE_SCALE_MAX,
  SIZE_SCALE_MIN,
  TextStyleError,
} from './type-style';

describe('parseTextStyles', () => {
  it('accepts a family, weight, size and colour, normalising each', () => {
    const parsed = parseTextStyles({ headline: { fontFamily: 'Inter', fontWeight: 700, sizeScale: 1.2345, color: '#ABCDEF' } });
    expect(parsed.headline).toEqual({ fontFamily: 'Inter', fontWeight: 700, sizeScale: 1.23, color: '#abcdef' });
  });

  it('accepts a single property and leaves the rest automatic', () => {
    expect(parseTextStyles({ cta: { sizeScale: 0.8 } }).cta).toEqual({ sizeScale: 0.8 });
  });

  it.each([
    ['nothing', undefined],
    ['an empty object', {}],
    ['an array', []],
  ])('rejects %s', (_label, value) => {
    expect(() => parseTextStyles(value)).toThrow(TextStyleError);
  });

  it('rejects a line that cannot be restyled and a style that does not exist', () => {
    expect(() => parseTextStyles({ logo: { sizeScale: 1 } })).toThrow(/not a line/);
    expect(() => parseTextStyles({ headline: { italic: true } })).toThrow(/not a style/);
    expect(() => parseTextStyles({ headline: {} })).toThrow(/Choose a font/);
  });

  it('rejects fonts outside the catalog, odd weights, out-of-range sizes and bad colours', () => {
    expect(() => parseTextStyles({ headline: { fontFamily: 'Comic Sans MS' } })).toThrow(/not available/);
    expect(() => parseTextStyles({ headline: { fontWeight: 650 } })).toThrow(/Font weight/);
    expect(() => parseTextStyles({ headline: { sizeScale: SIZE_SCALE_MAX + 0.1 } })).toThrow(/Size must be/);
    expect(() => parseTextStyles({ headline: { sizeScale: SIZE_SCALE_MIN - 0.1 } })).toThrow(/Size must be/);
    expect(() => parseTextStyles({ headline: { color: 'red' } })).toThrow(/hex/);
    expect(() => parseTextStyles({ headline: { color: '#fff' } })).toThrow(/hex/);
  });
});

describe('fontPickerOptions', () => {
  it('points each weight at a served URL that maps to a real font file', () => {
    for (const option of fontPickerOptions()) {
      expect(Object.keys(option.files).map(Number).sort()).toEqual([...option.weights].sort());
      for (const url of Object.values(option.files)) {
        expect(url).toMatch(/^\/api\/fonts\/[a-z0-9-]+\/\d{3}-normal\.ttf$/);
        expect(existsSync(path.join(FONTS_ROOT, url.replace('/api/fonts/', '')))).toBe(true);
      }
    }
  });
});

describe('font support by script', () => {
  it('offers every font for Latin wording', () => {
    expect(fontsSupportingText('Fresh wording').length).toBe(fontPickerOptions().length);
  });

  it('offers only fonts that can draw Devanagari for Devanagari wording', () => {
    const supported = fontsSupportingText('नमस्ते');
    expect(supported.length).toBeGreaterThan(0);
    expect(supported.length).toBeLessThan(fontPickerOptions().length);
    for (const family of supported) expect(getFontDefinition(family)?.languageSupport).toContain('devanagari');
  });

  it('refuses a font that cannot draw the wording', () => {
    const latinOnly = fontPickerOptions().find((f) => !getFontDefinition(f.family)!.languageSupport.includes('devanagari'))!;
    expect(() => assertFontSupportsText(latinOnly.family, 'नमस्ते')).toThrow(/cannot display/);
  });
});

const CANVAS = { width: 1600, height: 1600 };

function copy(id: string, x: number, y: number, width: number, height: number, lines: string[], overrides: Partial<DesignNode> = {}): DesignNode {
  return {
    id, kind: 'copy', x, y, width, height, lines, color: '#111111', surface: 'none', fontScale: 0.06,
    align: 'left', shape: 'rectangle', fontFamily: 'Inter', fontWeight: 400, ...overrides,
  };
}
const logo = (): DesignNode => ({
  id: 'brand-mark', kind: 'logo', x: 0.05, y: 0.88, width: 0.18, height: 0.08, lines: [], color: 'none', surface: 'none',
  fontScale: 0.045, align: 'left', shape: 'rectangle',
});
const roles = { 'primary-hook': 'HEADLINE', 'secondary-hook': 'SUPPORT' };
const rectsOverlap = (a: DesignNode, b: DesignNode) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe('applyTextStyles', () => {
  it('grows the type and its box into free space', () => {
    const headline = copy('primary-hook', 0.08, 0.1, 0.5, 0.12, ['Fresh wording']);
    const before = { scale: headline.fontScale, width: headline.width };
    const applied = applyTextStyles({ nodes: [headline, logo()], roleByNodeId: roles, styles: { HEADLINE: { sizeScale: 1.3 } }, canvas: CANVAS });
    expect(headline.fontScale).toBeCloseTo(before.scale * 1.3, 3);
    expect(headline.width).toBeGreaterThanOrEqual(before.width);
    expect(applied.HEADLINE.sizeScale).toBe(1.3);
  });

  it('shrinks type without moving its box', () => {
    const headline = copy('primary-hook', 0.08, 0.1, 0.5, 0.12, ['Fresh wording']);
    applyTextStyles({ nodes: [headline], roleByNodeId: roles, styles: { HEADLINE: { sizeScale: 0.7 } }, canvas: CANVAS });
    expect(headline.fontScale).toBeCloseTo(0.06 * 0.7, 3);
    expect(headline.x).toBeCloseTo(0.08, 3);
    expect(headline.width).toBeCloseTo(0.5, 3);
  });

  it('never grows into neighbouring text: it applies the largest size that fits and says so', () => {
    // Two lines need vertical room, and the neighbour sits just below the headline's box.
    const headline = copy('primary-hook', 0.08, 0.1, 0.5, 0.12, ['Fresh', 'wording']);
    const neighbour = copy('secondary-hook', 0.08, 0.225, 0.5, 0.06, ['Small print here'], { fontScale: 0.03 });
    const applied = applyTextStyles({
      nodes: [headline, neighbour, logo()], roleByNodeId: roles, styles: { HEADLINE: { sizeScale: SIZE_SCALE_MAX } }, canvas: CANVAS,
    });
    expect(applied.HEADLINE.sizeScale).toBeLessThan(SIZE_SCALE_MAX);
    expect(rectsOverlap(headline, neighbour)).toBe(false);
  });

  it('never grows onto the logo', () => {
    const headline = copy('primary-hook', 0.08, 0.7, 0.5, 0.12, ['Fresh wording']);
    const nodes = [headline, logo()];
    applyTextStyles({ nodes, roleByNodeId: roles, styles: { HEADLINE: { sizeScale: SIZE_SCALE_MAX } }, canvas: CANVAS });
    expect(rectsOverlap(headline, nodes[1])).toBe(false);
  });

  it('changes the family and picks the nearest weight that family has', () => {
    const headline = copy('primary-hook', 0.08, 0.1, 0.5, 0.16, ['Fresh wording']);
    const target = getFontDefinition('Anton')!;
    applyTextStyles({ nodes: [headline], roleByNodeId: roles, styles: { HEADLINE: { fontFamily: 'Anton' } }, canvas: CANVAS });
    expect(headline.fontFamily).toBe('Anton');
    expect(target.weights).toContain(headline.fontWeight);
  });

  it('keeps the box large enough for a heavier weight rather than overflowing it', () => {
    const headline = copy('primary-hook', 0.08, 0.1, 0.34, 0.1, ['Fresh wording here']);
    const inter = getFontDefinition('Inter')!;
    const heaviest = Math.max(...inter.weights);
    expect(() => applyTextStyles({
      nodes: [headline], roleByNodeId: roles, styles: { HEADLINE: { fontWeight: heaviest } }, canvas: CANVAS,
    })).not.toThrow();
    expect(headline.fontWeight).toBe(heaviest);
  });

  it('refuses a weight the family has no file for', () => {
    const headline = copy('primary-hook', 0.08, 0.1, 0.5, 0.12, ['Fresh wording']);
    const inter = getFontDefinition('Inter')!;
    const missing = [100, 200, 300, 400, 500, 600, 700, 800, 900].find((w) => !inter.weights.includes(w));
    if (missing === undefined) return; // every weight exists: nothing to refuse
    expect(() => applyTextStyles({
      nodes: [headline], roleByNodeId: roles, styles: { HEADLINE: { fontWeight: missing } }, canvas: CANVAS,
    })).toThrow(TextStyleError);
  });

  it('sets colour and leaves lines without a style untouched', () => {
    const headline = copy('primary-hook', 0.08, 0.1, 0.5, 0.12, ['Fresh wording']);
    const other = copy('secondary-hook', 0.08, 0.4, 0.5, 0.06, ['Small print here'], { fontScale: 0.03 });
    const snapshot = JSON.stringify(other);
    applyTextStyles({ nodes: [headline, other], roleByNodeId: roles, styles: { HEADLINE: { color: '#ff3300' } }, canvas: CANVAS });
    expect(headline.color).toBe('#ff3300');
    expect(JSON.stringify(other)).toBe(snapshot);
  });

  it('fails clearly when nothing fits, rather than producing clipped type', () => {
    // At the right edge: growing sideways leaves the canvas, and even the smallest size is too wide.
    const headline = copy('primary-hook', 0.9, 0.1, 0.02, 0.02, ['An extremely long headline that cannot possibly fit beside the canvas edge at all']);
    expect(() => applyTextStyles({
      nodes: [headline], roleByNodeId: roles, styles: { HEADLINE: { sizeScale: 1.1 } }, canvas: CANVAS,
    })).toThrow(/does not fit/);
  });
});

describe('applyTextStyles with tightly packed layouts', () => {
  // The layout engine packs lines closely: here the headline sits 0.2% of the canvas under the paragraph above it.
  const packed = () => {
    const paragraph = copy('secondary-hook', 0.08, 0.28, 0.5, 0.05, ['Introducing our Chef Special', 'Korean Style Momos'], { fontScale: 0.025 });
    const headline = copy('primary-hook', 0.08, 0.332, 0.88, 0.1, ['Crafted with love'], { fontFamily: 'Poppins', fontWeight: 700 });
    return { paragraph, headline, nodes: [paragraph, headline, logo()] };
  };

  it('changes only the colour without needing any room: nothing is re-fitted', () => {
    const { headline, nodes } = packed();
    const before = { x: headline.x, y: headline.y, width: headline.width, height: headline.height, scale: headline.fontScale };
    const applied = applyTextStyles({ nodes, roleByNodeId: roles, styles: { HEADLINE: { color: '#ffffff' } }, canvas: CANVAS });
    expect(headline.color).toBe('#ffffff');
    expect({ x: headline.x, y: headline.y, width: headline.width, height: headline.height, scale: headline.fontScale }).toEqual(before);
    expect(applied.HEADLINE).toEqual({ color: '#ffffff', sizeScale: 1 });
  });

  it('accepts the size it already has, even beside a neighbour closer than the usual gap', () => {
    const { headline, nodes } = packed();
    expect(() => applyTextStyles({ nodes, roleByNodeId: roles, styles: { HEADLINE: { sizeScale: 1 } }, canvas: CANVAS })).not.toThrow();
    expect(headline.fontScale).toBeCloseTo(0.06, 4);
  });

  it('changes the font beside a tight neighbour, keeping the box where it was', () => {
    const { headline, paragraph, nodes } = packed();
    applyTextStyles({ nodes, roleByNodeId: roles, styles: { HEADLINE: { fontFamily: 'Montserrat', fontWeight: 700 } }, canvas: CANVAS });
    expect(headline.fontFamily).toBe('Montserrat');
    expect(rectsOverlap(headline, paragraph)).toBe(false);
  });

  it('never moves a box closer to a neighbour than it already was', () => {
    const { headline, paragraph, nodes } = packed();
    const gapBefore = headline.y - (paragraph.y + paragraph.height);
    applyTextStyles({ nodes, roleByNodeId: roles, styles: { HEADLINE: { sizeScale: 1.4 } }, canvas: CANVAS });
    expect(headline.y - (paragraph.y + paragraph.height)).toBeGreaterThanOrEqual(gapBefore - 1e-6);
  });

  it('shrinks to fit rather than failing when a requested size has nowhere to grow', () => {
    const { headline, nodes } = packed();
    const applied = applyTextStyles({ nodes, roleByNodeId: roles, styles: { HEADLINE: { sizeScale: SIZE_SCALE_MAX } }, canvas: CANVAS });
    expect(applied.HEADLINE.sizeScale).toBeGreaterThan(0);
    expect(headline.fontScale).toBeGreaterThan(0);
  });
});

describe('applyTextStyles with new wording', () => {
  const layout = () => {
    const headline = copy('primary-hook', 0.08, 0.1, 0.6, 0.12, ['Crafted in Crimson.'], { fontScale: 0.06 });
    const other = copy('secondary-hook', 0.08, 0.4, 0.5, 0.06, ['Small print here'], { fontScale: 0.03 });
    return { headline, other, nodes: [headline, other, logo()] };
  };

  it('keeps the edited line in its own box and every other line exactly as it was', () => {
    const { headline, other, nodes } = layout();
    const box = { x: headline.x, y: headline.y, width: headline.width, height: headline.height };
    const untouched = JSON.stringify(other);
    applyTextStyles({ nodes, roleByNodeId: roles, styles: {}, texts: { 'primary-hook': 'Crafted with love' }, canvas: CANVAS });
    expect({ x: headline.x, y: headline.y, width: headline.width, height: headline.height }).toEqual(box);
    expect(headline.lines.join(' ')).toBe('Crafted with love');
    expect(JSON.stringify(other)).toBe(untouched);
  });

  it('keeps the size when shorter wording fits', () => {
    const { headline, nodes } = layout();
    applyTextStyles({ nodes, roleByNodeId: roles, styles: {}, texts: { 'primary-hook': 'Crafted' }, canvas: CANVAS });
    expect(headline.fontScale).toBe(0.06);
  });

  it('steps the size down inside the box when longer wording needs it', () => {
    const { headline, nodes } = layout();
    applyTextStyles({ nodes, roleByNodeId: roles, styles: {}, texts: { 'primary-hook': 'Crafted in Crimson with slow patient love and quiet care for every single guest at our table' }, canvas: CANVAS });
    expect(headline.fontScale).toBeLessThan(0.06);
    expect(headline.width).toBe(0.6);
  });

  it('refuses wording that cannot fit the box at any legible size', () => {
    const { nodes } = layout();
    expect(() => applyTextStyles({
      nodes, roleByNodeId: roles, styles: {}, canvas: CANVAS,
      texts: { 'primary-hook': 'An extremely long headline that will never fit a box this small '.repeat(4) },
    })).toThrow(/too long/);
  });

  it('measures sizes against the saved base, so 100% means the size the layout engine chose', () => {
    const { headline, nodes } = layout();
    headline.fontScale = 0.045; // earlier edit shrank it from a base of 0.06
    const applied = applyTextStyles({
      nodes, roleByNodeId: roles, styles: { HEADLINE: { sizeScale: 1 } }, canvas: CANVAS, baseScales: { 'primary-hook': 0.06 },
    });
    expect(headline.fontScale).toBeCloseTo(0.06, 3);
    expect(applied.HEADLINE.sizeScale).toBe(1);
  });

  it('applies new wording and a new font together, re-breaking the wording in the new face', () => {
    const { headline, nodes } = layout();
    applyTextStyles({
      nodes, roleByNodeId: roles, styles: { HEADLINE: { fontFamily: 'Montserrat', fontWeight: 700 } }, canvas: CANVAS,
      texts: { 'primary-hook': 'Crafted with love' },
    });
    expect(headline.fontFamily).toBe('Montserrat');
    expect(headline.lines.join(' ')).toBe('Crafted with love');
  });
});

describe('summariseTypeset', () => {
  it('reports the font, weight, size and colour typeset per role', () => {
    const headline = copy('primary-hook', 0.08, 0.1, 0.5, 0.12, ['Fresh wording'], { color: '#222222' });
    expect(summariseTypeset([headline, logo()], roles)).toEqual({
      HEADLINE: { fontFamily: 'Inter', fontWeight: 400, fontScale: 0.06, color: '#222222' },
    });
  });
});
