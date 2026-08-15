/**
 * The real-logo guarantee.
 *
 * The campaign pass designs everything else, but the mark is never drawn by a
 * model — it is the member's own file, at its own pixels, dropped into the
 * zone the prompt kept clear. These tests cover the part that decides where
 * that is, plus one real sharp round trip proving the composite actually
 * lands.
 *
 * Run: cd server && npx vitest run src/ai/render/logo-composite.test.ts
 */
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { compositeLogo, resolveLogoPlacement } from './logo-composite';

const CANVAS = { width: 1000, height: 1000 };
const SQUARE_LOGO = { width: 200, height: 200 };

describe('resolveLogoPlacement', () => {
  it('reads the layout\'s own placement prose rather than defaulting to one corner', () => {
    const topLeft = resolveLogoPlacement('top-left, small', CANVAS, SQUARE_LOGO);
    const bottomRight = resolveLogoPlacement('bottom-right corner', CANVAS, SQUARE_LOGO);

    expect(topLeft.left).toBeLessThan(CANVAS.width / 2);
    expect(topLeft.top).toBeLessThan(CANVAS.height / 2);
    expect(bottomRight.left).toBeGreaterThan(CANVAS.width / 2);
    expect(bottomRight.top).toBeGreaterThan(CANVAS.height / 2);
  });

  it('centres horizontally for a masthead placement', () => {
    const spot = resolveLogoPlacement('top centre, masthead', CANVAS, SQUARE_LOGO);
    expect(Math.abs(spot.left + spot.width / 2 - CANVAS.width / 2)).toBeLessThanOrEqual(1);
  });

  it('keeps the mark inside the canvas with a real margin', () => {
    for (const placement of ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-centre']) {
      const spot = resolveLogoPlacement(placement, CANVAS, SQUARE_LOGO);
      expect(spot.left).toBeGreaterThanOrEqual(0);
      expect(spot.top).toBeGreaterThanOrEqual(0);
      expect(spot.left + spot.width).toBeLessThanOrEqual(CANVAS.width);
      expect(spot.top + spot.height).toBeLessThanOrEqual(CANVAS.height);
    }
  });

  it('never upscales a small logo past its own resolution — an enlarged mark is a blurry mark', () => {
    const tiny = resolveLogoPlacement('bottom-right', CANVAS, { width: 40, height: 40 });
    expect(tiny.width).toBe(40);
    expect(tiny.height).toBe(40);
  });

  it('preserves a wide logo\'s aspect ratio instead of squashing it into a square', () => {
    const wide = resolveLogoPlacement('bottom-right', CANVAS, { width: 400, height: 100 });
    // Whole pixels only, so 4:1 lands a fraction either side of exact.
    expect(wide.width / wide.height).toBeGreaterThan(3.8);
    expect(wide.width / wide.height).toBeLessThan(4.2);
  });
});

describe('compositeLogo', () => {
  const canvas = () =>
    sharp({ create: { width: 800, height: 800, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const logo = () =>
    sharp({ create: { width: 120, height: 120, channels: 3, background: '#ff0000' } }).png().toBuffer();

  it('returns a PNG at the campaign creative\'s own dimensions', async () => {
    const output = await compositeLogo({ image: await canvas(), logo: await logo(), placement: 'bottom-right' });
    const meta = await sharp(output).metadata();

    expect(meta.format).toBe('png');
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(800);
  });

  it('actually paints the logo where the placement says, and nowhere else', async () => {
    const output = await compositeLogo({ image: await canvas(), logo: await logo(), placement: 'bottom-right' });

    const sample = async (left: number, top: number) => {
      const { data } = await sharp(output).extract({ left, top, width: 8, height: 8 }).raw().toBuffer({ resolveWithObject: true });
      return { r: data[0], g: data[1], b: data[2] };
    };

    // Bottom-right carries the mark; the opposite corner is untouched paper.
    const marked = await sample(730, 730);
    const clean = await sample(20, 20);
    expect(marked.r).toBeGreaterThan(200);
    expect(marked.g).toBeLessThan(60);
    expect(clean).toMatchObject({ r: 255, g: 255, b: 255 });
  });

  it('puts the mark in a different corner when the layout asks for one', async () => {
    const output = await compositeLogo({ image: await canvas(), logo: await logo(), placement: 'top-left, integrated' });
    const { data } = await sharp(output).extract({ left: 60, top: 60, width: 8, height: 8 }).raw().toBuffer({ resolveWithObject: true });

    expect(data[0]).toBeGreaterThan(200);
    expect(data[1]).toBeLessThan(60);
  });

  it('throws on an unreadable base image so the caller can fall back cleanly', async () => {
    await expect(
      compositeLogo({ image: Buffer.from('not an image'), logo: await logo(), placement: 'bottom-right' }),
    ).rejects.toThrow();
  });
});
