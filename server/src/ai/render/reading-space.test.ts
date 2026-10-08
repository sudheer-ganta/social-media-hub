import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { analyzeImageField } from './image-field';
import { createBrandDesignRepresentation, createCanvasRepresentation, createDesignField } from './design-representation';
import { discoverOptimizedComposition } from './composition-evaluation';
import { PICTURE_SCALES, makeReadingSpace, needsReadingSpace, readingSpaceHelped } from './reading-space';

/** A picture busy everywhere: fine high-contrast detail across the whole frame, like a full frame of food or foliage. */
async function busyPicture(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const cell = ((x >> 2) + (y >> 2)) % 2 ? 235 : 25; // 4px checks: detail that survives resizing
      raw[i] = cell; raw[i + 1] = cell; raw[i + 2] = cell;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/** Brightness spread inside a region. Detail is a high number, a quiet area a low one. */
async function spread(image: Buffer, region: { left: number; top: number; width: number; height: number }): Promise<number> {
  // stats() looks at the whole input and ignores extract(), so cut the region out first.
  const cut = await sharp(image).extract(region).greyscale().png().toBuffer();
  return (await sharp(cut).stats()).channels[0]!.stdev;
}

describe('makeReadingSpace', () => {
  it('keeps the canvas size so every position stays valid', async () => {
    const out = await makeReadingSpace(await busyPicture(540, 675));
    expect(out.width).toBe(540);
    expect(out.height).toBe(675);
    const meta = await sharp(out.data).metadata();
    expect([meta.width, meta.height]).toEqual([540, 675]);
  });

  it('turns a frame full of detail into one with a quiet region below the picture', async () => {
    const busy = await busyPicture(540, 675);
    const bottom = { left: 40, top: 600, width: 460, height: 60 };

    const before = await spread(busy, bottom);
    const out = await makeReadingSpace(busy);
    const after = await spread(out.data, bottom);

    expect(before).toBeGreaterThan(60);
    // Detail was blurred away: the band is a fraction as busy as the picture was.
    expect(after).toBeLessThan(before * 0.25);
  });

  it('leaves the picture itself in place, only smaller', async () => {
    const out = await makeReadingSpace(await busyPicture(540, 675));
    expect(out.picture.width).toBeCloseTo(0.78, 2);
    expect(out.picture.height).toBeCloseTo(0.78, 2);
    expect(out.picture.x).toBeCloseTo((1 - 0.78) / 2, 2);
    // The middle of the picture is still full of detail.
    const centre = await spread(out.data, { left: 200, top: 250, width: 140, height: 140 });
    expect(centre).toBeGreaterThan(60);
  });

  it('opens space along the bottom, where the reader looks for the words', async () => {
    const out = await makeReadingSpace(await busyPicture(540, 675));
    const space = (1 - out.picture.y - out.picture.height) * 675;
    expect(space).toBeGreaterThan(675 * 0.15);
  });

  it('refuses a picture too small to work with', async () => {
    const tiny = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#888' } }).png().toBuffer();
    await expect(makeReadingSpace(tiny)).rejects.toThrow(/too small/);
  });
});

describe('when to make room', () => {
  it('only acts on a high or critical collision', () => {
    expect(needsReadingSpace({ risk: 'LOW', overlap: 0.05 })).toBe(false);
    expect(needsReadingSpace({ risk: 'MODERATE', overlap: 0.2 })).toBe(false);
    expect(needsReadingSpace({ risk: 'HIGH', overlap: 0.4 })).toBe(true);
    expect(needsReadingSpace({ risk: 'CRITICAL', overlap: 0.8 })).toBe(true);
  });

  it('keeps a second placement only if it is clearly safer', () => {
    expect(readingSpaceHelped({ risk: 'CRITICAL', overlap: 0.8 }, { risk: 'HIGH', overlap: 0.6 })).toBe(true);
    expect(readingSpaceHelped({ risk: 'HIGH', overlap: 0.5 }, { risk: 'LOW', overlap: 0.1 })).toBe(true);
    // The same risk with a barely smaller overlap is a shuffle, not a repair.
    expect(readingSpaceHelped({ risk: 'HIGH', overlap: 0.5 }, { risk: 'HIGH', overlap: 0.45 })).toBe(false);
    expect(readingSpaceHelped({ risk: 'HIGH', overlap: 0.5 }, { risk: 'HIGH', overlap: 0.35 })).toBe(true);
    // Never trade for something worse.
    expect(readingSpaceHelped({ risk: 'LOW', overlap: 0.1 }, { risk: 'HIGH', overlap: 0.1 })).toBe(false);
  });

  it('tries the gentler setting before the stronger one', () => {
    expect(PICTURE_SCALES[0]).toBeGreaterThan(PICTURE_SCALES[1]!);
  });
});

/**
 * The reason the repair exists, checked against the real placement search rather than
 * against a number: on a picture with detail everywhere the words land on the subject, and
 * with room made they land on the quiet backdrop.
 */
describe('against the real placement search', () => {
  const W = 1080;
  const H = 1350;

  /** Fine multi-scale detail edge to edge, with one large subject in the middle. */
  async function crowdedPicture(): Promise<Buffer> {
    const raw = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = (y * W + x) * 3;
        const d = Math.sin(x * 0.21) * Math.cos(y * 0.17) + Math.sin((x + y) * 0.05) + Math.sin(x * 0.7 + y * 0.4);
        const v = 128 + d * 40;
        let r = v + (x % 37) - 18, g = v * 0.8 + (y % 29) - 14, b = v * 0.6 + ((x ^ y) % 31) - 15;
        const dx = x - W / 2, dy = y - H / 2;
        const radius = Math.sqrt(dx * dx + dy * dy);
        if (radius < W * 0.36) { r = 230 - radius * 0.1; g = 160 - radius * 0.1; b = 90; }
        raw[i] = Math.max(0, Math.min(255, r)); raw[i + 1] = Math.max(0, Math.min(255, g)); raw[i + 2] = Math.max(0, Math.min(255, b));
      }
    }
    return sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  }

  async function collision(png: Buffer) {
    const field = createDesignField(await analyzeImageField(png));
    const result = discoverOptimizedComposition({
      copyItems: [
        { id: 'primary-hook', text: 'BEAT THE FINISH LINE.', role: 'headline' as const, priority: 1 },
        { id: 'supporting-note', text: 'Take 30% off all running shoes before time expires.', role: 'body' as const, priority: 3 },
      ],
      field,
      canvas: createCanvasRepresentation(W, H),
      brand: createBrandDesignRepresentation({ brandProfile: { name: 'Stride', tone: 'bold' }, creativeDna: { brandColors: ['#0f172a'] } }),
    });
    const state = result.bestState.textImageRelationshipState!;
    return { risk: state.legibilityRisk, overlap: state.evidence.observedOverlapRatio };
  }

  it('moves type off the subject on a crowded picture', async () => {
    const picture = await crowdedPicture();
    const before = await collision(picture);
    expect(needsReadingSpace(before)).toBe(true);

    // The strongest setting is the one that has to work on a truly crowded picture.
    const after = await collision((await makeReadingSpace(picture, PICTURE_SCALES[1])).data);
    expect(needsReadingSpace(after)).toBe(false);
    expect(after.overlap).toBeLessThan(before.overlap * 0.5);
    expect(readingSpaceHelped(before, after)).toBe(true);
  }, 60_000);
});
