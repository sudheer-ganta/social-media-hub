/**
 * Deterministic image measurement — unit tests.
 *
 * Run: cd server && npx vitest run src/ai/render/image-field.test.ts
 */
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { analyzeImageField, type FieldRect } from './image-field';

const png = (width: number, height: number, paint: (x: number, y: number) => [number, number, number]) => {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x / width, y / height);
      const i = (y * width + x) * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
};

const flat = (level: number) => png(256, 256, () => [level, level, level]);

/** A hard-edged dark block on white — the unambiguous "subject" case. */
const blockOnWhite = (block: FieldRect) =>
  png(256, 256, (x, y) =>
    x >= block.x && x < block.x + block.width && y >= block.y && y < block.y + block.height
      ? [20, 20, 20]
      : [250, 250, 250],
  );

describe('analyzeImageField', () => {
  it('finds the subject where the detail actually is', async () => {
    const block: FieldRect = { x: 0.55, y: 0.5, width: 0.3, height: 0.35 };
    const field = await analyzeImageField(await blockOnWhite(block));

    // The subject box is the block's edges, to within one grid tile either way.
    expect(field.subjectBox.x).toBeGreaterThan(0.45);
    expect(field.subjectBox.y).toBeGreaterThan(0.4);
    expect(field.subjectBox.x + field.subjectBox.width).toBeLessThan(0.95);
    expect(field.focalCentroid.x).toBeGreaterThan(0.5);
    expect(field.focalCentroid.y).toBeGreaterThan(0.5);
  });

  it('reports occlusion of the subject, not of the image', async () => {
    const field = await analyzeImageField(await blockOnWhite({ x: 0.55, y: 0.5, width: 0.3, height: 0.35 }));

    // A box over the opposite corner covers plenty of IMAGE and no SUBJECT.
    expect(field.occlusionOf({ x: 0.05, y: 0.05, width: 0.35, height: 0.2 })).toBeLessThan(0.05);
    // A box over the block covers the subject.
    expect(field.occlusionOf({ x: 0.5, y: 0.45, width: 0.45, height: 0.45 })).toBeGreaterThan(0.6);
  });

  it('ranks quiet regions away from the subject', async () => {
    const field = await analyzeImageField(await blockOnWhite({ x: 0.5, y: 0.55, width: 0.45, height: 0.4 }));
    const best = field.quietRects[0];

    expect(field.quietRects.length).toBeGreaterThan(0);
    expect(field.occlusionOf(best)).toBeLessThan(0.25);
    // The block's boundary is the busiest thing here; the chosen region is calmer.
    expect(field.busynessAt(best)).toBeLessThan(field.busynessAt({ x: 0.4, y: 0.5, width: 0.25, height: 0.15 }));
  });

  it('calls an even dark field dark and an even bright field light', async () => {
    const whole = { x: 0, y: 0, width: 1, height: 1 };
    expect((await analyzeImageField(await flat(18))).toneAt(whole).verdict).toBe('dark');
    expect((await analyzeImageField(await flat(242))).toneAt(whole).verdict).toBe('light');
  });

  it('calls a half-bright, half-dark box mixed — the only case that earns a scrim', async () => {
    const split = await png(256, 256, (x) => (x < 0.5 ? [8, 8, 8] : [250, 250, 250]));
    const field = await analyzeImageField(split);

    expect(field.toneAt({ x: 0, y: 0.3, width: 1, height: 0.3 }).verdict).toBe('mixed');
    // Either side on its own is even, so it needs no scrim.
    expect(field.toneAt({ x: 0.02, y: 0.3, width: 0.4, height: 0.3 }).verdict).toBe('dark');
    expect(field.toneAt({ x: 0.58, y: 0.3, width: 0.4, height: 0.3 }).verdict).toBe('light');
  });

  it('treats a smooth gradient as calm, not busy', async () => {
    const gradient = await png(256, 256, (_x, y) => {
      const v = Math.round(20 + y * 200);
      return [v, v, v];
    });
    const field = await analyzeImageField(gradient);

    expect(field.busynessAt({ x: 0, y: 0, width: 1, height: 1 })).toBeLessThan(0.1);
  });

  it('claims no subject at all on a flat field, so nothing is ever occluded', async () => {
    const field = await analyzeImageField(await flat(128));

    expect(field.subjectBox.width * field.subjectBox.height).toBe(0);
    expect(field.occlusionOf({ x: 0, y: 0, width: 1, height: 1 })).toBe(0);
    expect(field.focalCentroid).toEqual({ x: 0.5, y: 0.5 });
  });

  it('returns a neutral field instead of throwing on an unreadable buffer', async () => {
    const field = await analyzeImageField(Buffer.from('not an image'));

    expect(field.occlusionOf({ x: 0, y: 0, width: 1, height: 1 })).toBe(0);
    expect(field.quietRects.length).toBeGreaterThan(0);
    expect(field.toneAt({ x: 0, y: 0, width: 1, height: 1 }).stdDev).toBe(0);
  });
});
