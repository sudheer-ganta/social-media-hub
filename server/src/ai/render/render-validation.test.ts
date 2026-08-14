/**
 * Checkerboard detector — unit tests.
 *
 * Run: cd server && npx vitest run src/ai/render/render-validation.test.ts
 */
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { detectCheckerboard } from './render-validation';

/** A classic alpha-grid: alternating light-grey/white square tiles. */
async function checkerboardPng(width: number, height: number, tile: number, from = 200, to = 240): Promise<Buffer> {
  const raw = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dark = (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0;
      raw[y * width + x] = dark ? from : to;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

async function photoLikePng(width: number, height: number): Promise<Buffer> {
  // Smooth gradients + soft blobs — nothing periodic.
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = Math.round(120 + 80 * Math.sin(x / 97) * Math.cos(y / 71));
      raw[i + 1] = Math.round(100 + 60 * Math.cos(x / 53));
      raw[i + 2] = Math.round(90 + 50 * Math.sin(y / 83));
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe('detectCheckerboard', () => {
  it('flags a full-frame transparency checkerboard', async () => {
    const image = await checkerboardPng(512, 512, 16);
    const scan = await detectCheckerboard(image);
    expect(scan.detected).toBe(true);
  });

  it('flags a checkerboard band in the lower third — the actual dogfood failure', async () => {
    const photo = await photoLikePng(512, 340);
    const board = await checkerboardPng(512, 172, 16);
    const image = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#888888' } })
      .composite([
        { input: photo, top: 0, left: 0 },
        { input: board, top: 340, left: 0 },
      ])
      .png()
      .toBuffer();
    const scan = await detectCheckerboard(image);
    expect(scan.detected).toBe(true);
  });

  it('passes a photographic image', async () => {
    const image = await photoLikePng(512, 512);
    const scan = await detectCheckerboard(image);
    expect(scan.detected).toBe(false);
  });

  it('passes a dark checker pattern (a real chessboard is not an alpha grid)', async () => {
    const image = await checkerboardPng(512, 512, 32, 20, 235);
    const scan = await detectCheckerboard(image);
    expect(scan.detected).toBe(false);
  });
});
