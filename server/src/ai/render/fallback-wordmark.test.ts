import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { buildFallbackWordmark, wordmarkText } from './fallback-wordmark';

/** Where the white lettering actually is, found from the pixels rather than from the layout maths. */
async function inkBounds(base64: string) {
  const { data, info } = await sharp(Buffer.from(base64, 'base64')).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = -1, minY = info.height, maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * info.channels;
      // White-ish and opaque: the letters, not the dark plate around them.
      if (data[i]! > 200 && data[i + 1]! > 200 && data[i + 2]! > 200 && data[i + 3]! > 200) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  return { width: info.width, height: info.height, minX, maxX, minY, maxY };
}

describe('wordmarkText', () => {
  it('keeps letters and digits and uppercases them', () => {
    expect(wordmarkText('Flow Post 2.0')).toBe('FLOW POST 2.0');
  });

  it('strips anything that could break the SVG', () => {
    expect(wordmarkText('A&B <Co> "Ltd"')).toBe('AB CO LTD');
  });

  it('falls back to BRAND for an empty or symbol-only name, and caps the length', () => {
    expect(wordmarkText('')).toBe('BRAND');
    expect(wordmarkText('!!!')).toBe('BRAND');
    expect(wordmarkText('x'.repeat(100)).length).toBeLessThanOrEqual(30);
    expect(wordmarkText('The Independent Watchmakers Collective of Geneva')).toBe('THE INDEPENDENT WATCHMAKERS');
  });
});

describe('buildFallbackWordmark', () => {
  it('draws a short name with room on every side', async () => {
    const { mimeType, data } = await buildFallbackWordmark('Rally');
    expect(mimeType).toBe('image/png');
    const b = await inkBounds(data);
    expect(b.maxX).toBeGreaterThan(b.minX);
    expect(b.minX).toBeGreaterThanOrEqual(20);
    expect(b.width - 1 - b.maxX).toBeGreaterThanOrEqual(20);
    expect(b.minY).toBeGreaterThanOrEqual(12);
    expect(b.height - 1 - b.maxY).toBeGreaterThanOrEqual(12);
  });

  it('fits a long name inside its plate instead of running off both edges', async () => {
    // "FLOWPOST STUDIOS" was cut to "LOWPOST STUDIO" by the old fixed-size version.
    for (const name of ['FlowPost Studios', 'The Independent Watchmakers Collective of Geneva']) {
      const b = await inkBounds((await buildFallbackWordmark(name)).data);
      expect(b.minX).toBeGreaterThanOrEqual(20);
      expect(b.width - 1 - b.maxX).toBeGreaterThanOrEqual(20);
      expect(b.width).toBeLessThanOrEqual(600);
    }
  });

  it('puts the lettering on a dark plate so it reads on a light picture', async () => {
    const { data } = await buildFallbackWordmark('Rally');
    const { data: px, info } = await sharp(Buffer.from(data, 'base64')).raw().toBuffer({ resolveWithObject: true });
    const centreLeft = ((Math.floor(info.height / 2)) * info.width + 6) * info.channels;
    // Left padding, vertically centred: opaque and dark.
    expect(px[centreLeft + 3]!).toBeGreaterThan(150);
    expect(px[centreLeft]!).toBeLessThan(60);
  });

  it('does not throw on awkward input', async () => {
    await expect(buildFallbackWordmark('')).resolves.toBeDefined();
    await expect(buildFallbackWordmark('日本語 <script>')).resolves.toBeDefined();
  });
});
