import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  getFontMetrics,
  measureText,
  measureMultiLineBlock,
} from './font-metrics.service';
import { fontFilePath, FONTS_ROOT } from './font-catalog';

describe('Authoritative Font Metrics Service', () => {
  describe('Font File Loading & Parsing', () => {
    it('loads and parses real local .ttf files from disk', () => {
      const interPath = fontFilePath('Inter', 400, 'normal');
      expect(fs.existsSync(interPath)).toBe(true);

      const metrics = getFontMetrics(interPath);
      expect(metrics.unitsPerEm).toBe(2048);
      expect(metrics.ascender).toBeGreaterThan(1500);
      expect(metrics.descender).toBeLessThan(0);
      expect(metrics.glyphAdvances.length).toBeGreaterThan(100);
      expect(metrics.unicodeToGlyph.size).toBeGreaterThan(100);
    });

    it('surfaces missing font asset paths clearly with explicit error', () => {
      const fakePath = path.join(FONTS_ROOT, 'non-existent-font', '999-normal.ttf');
      expect(() => getFontMetrics(fakePath)).toThrow(/Font file does not exist/);
    });
  });

  describe('Real Glyph Measurement', () => {
    it('measures exact glyph advances and widths for text strings', () => {
      const text = 'THE NEW AUTUMN DROP';
      const m1 = measureText({ family: 'Inter', weight: 400, text, fontSize: 50 });

      expect(m1.width).toBeGreaterThan(300);
      expect(m1.ascent).toBeGreaterThan(30);
      expect(m1.descent).toBeGreaterThan(5);
      expect(m1.glyphAdvances.length).toBe(text.length);
    });

    it('demonstrates that different fonts produce distinct physical widths for identical text', () => {
      const text = 'HANDCRAFTED LUXURY ESSENTIALS';
      const fontSize = 60;

      // Anton (condensed) vs Space Grotesk (geometric expanded) vs Playfair Display (serif)
      const antonMeasure = measureText({ family: 'Anton', weight: 400, text, fontSize });
      const spaceGroteskMeasure = measureText({ family: 'Space Grotesk', weight: 600, text, fontSize });
      const playfairMeasure = measureText({ family: 'Playfair Display', weight: 700, text, fontSize });

      expect(antonMeasure.width).toBeLessThan(spaceGroteskMeasure.width);
      expect(antonMeasure.width).toBeLessThan(playfairMeasure.width);

      // Anton width should be ~25-35% narrower than Space Grotesk
      const ratio = antonMeasure.width / spaceGroteskMeasure.width;
      expect(ratio).toBeLessThan(0.75);
      expect(ratio).toBeGreaterThan(0.55);
    });

    it('scales measured dimensions proportionally with font size', () => {
      const text = 'SLOW CRAFT COFFEE';
      const mSmall = measureText({ family: 'Lora', weight: 700, text, fontSize: 40 });
      const mLarge = measureText({ family: 'Lora', weight: 700, text, fontSize: 80 });

      // Exactly double font size should produce ~2x width
      expect(mLarge.width / mSmall.width).toBeCloseTo(2.0, 1);
      expect(mLarge.height / mSmall.height).toBeCloseTo(2.0, 1);
      expect(mLarge.ascent / mSmall.ascent).toBeCloseTo(2.0, 1);
    });

    it('measures multi-line blocks with exact line widths and total block height', () => {
      const lines = ['Discover our new', 'festive collection'];
      const fontSize = 48;

      const block = measureMultiLineBlock({
        family: 'Cormorant Garamond',
        weight: 700,
        lines,
        fontSize,
        lineHeightMultiplier: 1.15,
      });

      expect(block.lineWidths.length).toBe(2);
      expect(block.maxLineWidth).toBe(Math.max(...block.lineWidths));
      expect(block.totalHeight).toBeGreaterThan(fontSize * 1.5);
      expect(block.lineHeight).toBe(Math.round(fontSize * 1.15));
    });

    it('incorporates letterSpacing tracking accurately into real glyph advances', () => {
      const text = 'VILLY STUDIO';
      const mNoTracking = measureText({ family: 'Inter', weight: 700, text, fontSize: 50, letterSpacing: 0 });
      const mWithTracking = measureText({ family: 'Inter', weight: 700, text, fontSize: 50, letterSpacing: 0.05 }); // +5% of font size = 2.5px/char

      expect(mWithTracking.width).toBeGreaterThan(mNoTracking.width);
      const expectedDiff = Math.round(text.length * 0.05 * 50);
      expect(mWithTracking.width - mNoTracking.width).toBeCloseTo(expectedDiff, 0);
    });
  });

  describe('Integration with Renderer Asset Path', () => {
    it('uses the exact same fontFilePath as text-rasterizer and creative-renderer', () => {
      const family = 'Playfair Display';
      const weight = 700;
      const style = 'italic';

      const resolvedPath = fontFilePath(family, weight, style);
      expect(fs.existsSync(resolvedPath)).toBe(true);

      const metrics = getFontMetrics(resolvedPath);
      expect(metrics.fontPath).toBe(resolvedPath);
    });
  });
});
