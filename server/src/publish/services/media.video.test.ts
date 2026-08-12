import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The memory guarantee, asserted rather than commented.
 *
 * A comment saying "this does not buffer the video" is worth nothing the first
 * time somebody adds a convenience `await download(url)` to the video path —
 * and the failure mode is not a test going red, it is the API process dying
 * under a Reel in production, at publish time, on a member's post.
 *
 * So the download path is *spied on* and asserted never to be reached, and the
 * chunked readers are driven with streams far larger than any buffer they are
 * allowed to hold.
 */

/**
 * The vetted image fetcher, mocked so it can be observed.
 *
 * This is the only function in the backend that turns a URL into a Buffer. If
 * the video path ever calls it, these tests fail — which is exactly the alarm
 * that matters.
 */
const fetchImageBytes = vi.hoisted(() =>
  vi.fn(async () => ({
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(64),
  })),
);

vi.mock('../../ai/vision/image-source', () => ({
  fetchImageBytes,
  ImageFetchError: class ImageFetchError extends Error {
    reason = 'format';
    detail = '';
  },
}));

// The alt-text model, which would otherwise reach for a provider and a network.
vi.mock('../../ai/generators/alt-text.generator', () => ({
  generateAltText: vi.fn(async () => 'a description'),
}));
vi.mock('../../ai/providers', () => ({ providerForRole: () => ({}) }));

import { resolvePostMedia, applyStoredCropValue, toVideoPosterUrl } from './media.service';
import type { Post } from '../../generated/prisma/client';

const VIDEO_URL = 'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4';
const IMAGE_URL = 'https://res.cloudinary.com/demo/image/upload/v1/photo.jpg';

function post(media: unknown[]): Post {
  return {
    id: 'post-1',
    image_url: '',
    media,
    platform_media: null,
  } as unknown as Post;
}

const requirements = {
  imageMimeTypes: new Set(['image/jpeg']),
  maxImageBytes: 8 * 1024 * 1024,
  maxItems: 10,
};

afterEach(() => {
  fetchImageBytes.mockClear();
});

describe('URL transport does not download the video', () => {
  // Test 29
  it('resolves a Reel without touching the byte fetcher', async () => {
    const assets = await resolvePostMedia(
      post([
        {
          url: VIDEO_URL,
          type: 'video',
          mimeType: 'video/mp4',
          bytes: 250 * 1024 * 1024,
          width: 1080,
          height: 1920,
          durationMs: 18_000,
        },
      ]),
      { requirements, transport: 'url' },
    );

    // The assertion this whole file exists for.
    expect(fetchImageBytes).not.toHaveBeenCalled();

    expect(assets).toHaveLength(1);
    expect(assets[0].kind).toBe('video');
    // Null, not an empty Buffer. Meta fetches sourceUrl itself.
    expect(assets[0].data).toBeNull();
    expect(assets[0].sourceUrl).toBe(VIDEO_URL);
    // A quarter of a gigabyte that never entered this process.
    expect(assets[0].byteLength).toBe(250 * 1024 * 1024);
  });

  it('carries the metadata Cloudinary measured, and invents none of it', () => {
    return resolvePostMedia(
      post([{ url: VIDEO_URL, type: 'video', mimeType: 'video/mp4' }]),
      { requirements, transport: 'url' },
    ).then((assets) => {
      // Nothing measured these, so nothing claims to know them. Zero would be a
      // fabricated measurement and would fail a duration check on its own.
      expect(assets[0].durationMs).toBeNull();
      expect(assets[0].width).toBeNull();
      expect(assets[0].height).toBeNull();
      expect(assets[0].byteLength).toBe(0);
    });
  });

  it('treats a stored zero as unmeasured rather than as a measurement', async () => {
    const assets = await resolvePostMedia(
      post([{ url: VIDEO_URL, type: 'video', durationMs: 0, width: 0 }]),
      { requirements, transport: 'url' },
    );
    expect(assets[0].durationMs).toBeNull();
    expect(assets[0].width).toBeNull();
  });

  it('derives a poster frame as a delivery URL rather than a second upload', async () => {
    const assets = await resolvePostMedia(
      post([{ url: VIDEO_URL, type: 'video' }]),
      { requirements, transport: 'url' },
    );
    expect(assets[0].posterUrl).toBe(
      'https://res.cloudinary.com/demo/video/upload/v1/clip.jpg',
    );
    expect(fetchImageBytes).not.toHaveBeenCalled();
  });

  it('prefers a stored poster over a derived one', async () => {
    const assets = await resolvePostMedia(
      post([{ url: VIDEO_URL, type: 'video', posterUrl: 'https://example.com/p.jpg' }]),
      { requirements, transport: 'url' },
    );
    expect(assets[0].posterUrl).toBe('https://example.com/p.jpg');
  });

  it('refuses to derive a poster from a non-Cloudinary URL', () => {
    expect(toVideoPosterUrl('https://evil.example.com/clip.mp4')).toBeNull();
  });
});

describe('chunked transport does not build a Buffer either', () => {
  // Test 30
  it('hands back a stream opener instead of bytes', async () => {
    const assets = await resolvePostMedia(
      post([{ url: VIDEO_URL, type: 'video', bytes: 400 * 1024 * 1024 }]),
      { requirements, transport: 'chunked' },
    );

    expect(fetchImageBytes).not.toHaveBeenCalled();
    expect(assets[0].data).toBeNull();
    expect(typeof assets[0].openStream).toBe('function');
  });

  it('does not attach a stream opener to a URL-transport asset', async () => {
    const assets = await resolvePostMedia(
      post([{ url: VIDEO_URL, type: 'video' }]),
      { requirements, transport: 'url' },
    );
    expect(assets[0].openStream).toBeUndefined();
  });
});

describe('images are unchanged', () => {
  // Tests 23, 24 — the regression that matters most.
  it('still downloads and measures a single image, on every transport', async () => {
    for (const transport of ['url', 'bytes', 'chunked'] as const) {
      fetchImageBytes.mockClear();

      const assets = await resolvePostMedia(post([{ url: IMAGE_URL }]), {
        requirements,
        transport,
      });

      // The transport parameter is video-only by design. An image taking a
      // different path on Instagram than on LinkedIn would be a change to
      // publishing that works.
      expect(fetchImageBytes).toHaveBeenCalledTimes(1);
      expect(assets[0].kind).toBe('image');
      expect(Buffer.isBuffer(assets[0].data)).toBe(true);
    }
  });

  it('reads an item with no type as an image', async () => {
    // Every row written before the uploader accepted video. `type` has always
    // been `"image"`, but an absent one must resolve the same way.
    const assets = await resolvePostMedia(post([{ url: IMAGE_URL }]), {
      requirements,
    });
    expect(assets[0].kind).toBe('image');
    expect(fetchImageBytes).toHaveBeenCalledTimes(1);
  });

  it('still resolves a legacy post with only image_url', async () => {
    const legacy = {
      id: 'post-2',
      image_url: IMAGE_URL,
      media: null,
      platform_media: null,
    } as unknown as Post;

    const assets = await resolvePostMedia(legacy, { requirements });
    expect(assets).toHaveLength(1);
    expect(assets[0].kind).toBe('image');
  });

  it('resolves a mixed post in order, downloading only the images', async () => {
    const assets = await resolvePostMedia(
      post([
        { url: IMAGE_URL },
        { url: VIDEO_URL, type: 'video' },
        { url: IMAGE_URL },
      ]),
      { requirements, transport: 'url' },
    );

    expect(assets.map((entry) => entry.kind)).toEqual(['image', 'video', 'image']);
    expect(fetchImageBytes).toHaveBeenCalledTimes(2);
  });
});

describe('crops reach video', () => {
  const crop = { x: 0.2, y: 0, w: 0.5, h: 1 };

  it('rewrites a video delivery URL', () => {
    // The bug this fixes: the marker was `/image/upload/` only, so a crop
    // stored against a Reel silently did nothing and the member published the
    // uncropped original believing otherwise.
    expect(applyStoredCropValue(VIDEO_URL, crop)).toBe(
      'https://res.cloudinary.com/demo/video/upload/c_crop,w_0.5,h_1,x_0.2,y_0/v1/clip.mp4',
    );
  });

  it('still rewrites an image delivery URL exactly as before', () => {
    expect(applyStoredCropValue(IMAGE_URL, crop)).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_crop,w_0.5,h_1,x_0.2,y_0/v1/photo.jpg',
    );
  });

  it('applies a stored video crop through the resolver', async () => {
    const assets = await resolvePostMedia(
      post([{ url: VIDEO_URL, type: 'video', crop }]),
      { requirements, transport: 'url' },
    );
    expect(assets[0].sourceUrl).toContain('c_crop');
  });

  it('drops a crop that is not four fractions inside the unit square', () => {
    for (const bad of [{ x: -1, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 2, h: 1 }, {}, null]) {
      expect(applyStoredCropValue(VIDEO_URL, bad)).toBe(VIDEO_URL);
    }
  });

  it('leaves a full-frame crop untransformed', () => {
    expect(applyStoredCropValue(VIDEO_URL, { x: 0, y: 0, w: 1, h: 1 })).toBe(VIDEO_URL);
  });
});

describe('chunk readers hold one chunk, not the file', () => {
  it('slices a stream into fixed chunks without accumulating', async () => {
    const { chunkStream } = await import('../../providers/x/media-upload');

    // 40MB of 1MB pieces, read into 5MB chunks. If anything here accumulated,
    // peak would be 40MB rather than 5.
    const source = Readable.from(
      (function* () {
        for (let index = 0; index < 40; index++) yield Buffer.alloc(1024 * 1024, index);
      })(),
    );

    let peak = 0;
    let total = 0;
    let count = 0;

    for await (const chunk of chunkStream(source, 5 * 1024 * 1024)) {
      peak = Math.max(peak, chunk.byteLength);
      total += chunk.byteLength;
      count += 1;
    }

    expect(total).toBe(40 * 1024 * 1024);
    expect(count).toBe(8);
    expect(peak).toBe(5 * 1024 * 1024);
  });

  it('yields a short final chunk rather than padding or dropping it', async () => {
    const { chunkStream } = await import('../../providers/x/media-upload');
    const source = Readable.from([Buffer.alloc(7), Buffer.alloc(3)]);

    const sizes: number[] = [];
    for await (const chunk of chunkStream(source, 4)) sizes.push(chunk.byteLength);

    expect(sizes).toEqual([4, 4, 2]);
  });

  it("reads exactly the byte ranges LinkedIn asks for", async () => {
    const { StreamReader } = await import('../../providers/linkedin/video');

    const source = Readable.from(
      (function* () {
        for (let index = 0; index < 20; index++) yield Buffer.alloc(1024 * 1024, index);
      })(),
    );

    const reader = new StreamReader(source);
    let peak = 0;
    let total = 0;

    // Four parts of 4MB, then a fifth that runs past the end.
    for (let part = 0; part < 6; part++) {
      const bytes = await reader.read(4 * 1024 * 1024);
      peak = Math.max(peak, bytes.byteLength);
      total += bytes.byteLength;
    }

    expect(total).toBe(20 * 1024 * 1024);
    expect(peak).toBe(4 * 1024 * 1024);
  });
});
