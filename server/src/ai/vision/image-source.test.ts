import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { cloudinaryAvifWorkaroundUrl, convertAvifIfNeeded } from './image-source';

/**
 * Phase 5 (style-fidelity audit): a reference image stored as AVIF used to be
 * silently dropped — rejected by the fetcher's mime allowlist, logged, and
 * generation proceeded with referenceCount: 0. These prove the two recovery
 * paths that replace that silent drop: rewriting a Cloudinary delivery URL
 * to request JPEG, and decoding+re-encoding AVIF bytes in-process when the
 * rewrite doesn't apply (a non-Cloudinary host, say).
 */

describe('cloudinaryAvifWorkaroundUrl', () => {
  it('rewrites a Cloudinary AVIF delivery URL to request JPEG', () => {
    const url = 'https://res.cloudinary.com/dx8gkv9yq/image/upload/v1788770284/pgxksxouiwlv7bour04t.avif';
    const rewritten = cloudinaryAvifWorkaroundUrl(url);
    expect(rewritten).toBe('https://res.cloudinary.com/dx8gkv9yq/image/upload/f_jpg/v1788770284/pgxksxouiwlv7bour04t.avif');
  });

  it('does not touch a Cloudinary URL that already carries its own transformation', () => {
    const url = 'https://res.cloudinary.com/dx8gkv9yq/image/upload/f_auto,q_auto/v1788770284/pgxksxouiwlv7bour04t.avif';
    expect(cloudinaryAvifWorkaroundUrl(url)).toBeUndefined();
  });

  it('does not touch a non-AVIF Cloudinary URL', () => {
    const url = 'https://res.cloudinary.com/dx8gkv9yq/image/upload/v1788770284/pgxksxouiwlv7bour04t.png';
    expect(cloudinaryAvifWorkaroundUrl(url)).toBeUndefined();
  });

  it('does not touch an AVIF URL from a non-Cloudinary host', () => {
    const url = 'https://cdn.example.com/assets/reference.avif';
    expect(cloudinaryAvifWorkaroundUrl(url)).toBeUndefined();
  });

  it('handles a query string after the .avif extension', () => {
    const url = 'https://res.cloudinary.com/dx8gkv9yq/image/upload/v1/ref.avif?_a=BAMAJaG40';
    const rewritten = cloudinaryAvifWorkaroundUrl(url);
    expect(rewritten).toBe('https://res.cloudinary.com/dx8gkv9yq/image/upload/f_jpg/v1/ref.avif?_a=BAMAJaG40');
  });
});

describe('convertAvifIfNeeded', () => {
  async function tinyAvif(): Promise<Buffer> {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 20, g: 120, b: 200 } } })
      .png()
      .toBuffer();
    return sharp(png).avif().toBuffer();
  }

  it('converts real AVIF bytes into a decodable PNG', async () => {
    const avif = await tinyAvif();
    const converted = await convertAvifIfNeeded(avif, 'image/avif');
    expect(converted).toBeDefined();
    expect(converted?.mimeType).toBe('image/png');
    // Prove it's genuinely a valid, decodable image — not just relabelled bytes.
    const metadata = await sharp(converted!.buffer).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(8);
    expect(metadata.height).toBe(8);
  });

  it('does nothing for a non-AVIF mime type — never touches bytes it does not need to', async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const result = await convertAvifIfNeeded(png, 'image/png');
    expect(result).toBeUndefined();
  });

  it('returns undefined rather than throwing when the bytes are not actually a decodable image', async () => {
    const garbage = Buffer.from('not an image', 'utf8');
    const result = await convertAvifIfNeeded(garbage, 'image/avif');
    expect(result).toBeUndefined();
  });
});
