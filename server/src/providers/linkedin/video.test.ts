import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LinkedIn video, and the two things about it that are easy to get wrong.
 *
 * The protocol is not "upload the file" — LinkedIn hands back a *list* of byte
 * ranges and expects each filled with exactly those bytes, then every ETag
 * echoed back in order. Miss one, or reorder them, and finalize fails; skip
 * finalize and the URN exists but cannot be attached to a post.
 *
 * The second is that none of it may happen in a Buffer. A 500MB PUT body is not
 * something the API process can hold while serving everyone else.
 */

const post = vi.hoisted(() => vi.fn());
const put = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());

vi.mock('axios', () => {
  const isAxiosError = (error: unknown) =>
    Boolean(error && typeof error === 'object' && 'response' in error);
  return { default: { post, put, get, isAxiosError }, isAxiosError };
});

import { uploadVideo } from './video';
import { uploadMedia } from './media';
import { validateMedia } from './validator';
import type { ProviderMediaAsset } from '../provider.interface';
import { capabilityFor } from '../capabilities';

function video(bytes = 12 * 1024 * 1024): ProviderMediaAsset {
  return {
    kind: 'video',
    mimeType: 'video/mp4',
    data: null,
    byteLength: bytes,
    sourceUrl: 'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4',
    width: 1920,
    height: 1080,
    durationMs: 30_000,
    altText: null,
    openStream: async () => {
      const { Readable } = await import('node:stream');
      const piece = 1024 * 1024;
      return Readable.from(
        (function* () {
          for (let sent = 0; sent < bytes; sent += piece) {
            yield Buffer.alloc(Math.min(piece, bytes - sent));
          }
        })(),
      );
    },
  };
}

/** Three 4MB slots over a 12MB file, as LinkedIn would describe them. */
function threeSlots() {
  return {
    status: 200,
    data: {
      value: {
        video: 'urn:li:video:abc',
        uploadToken: 'token-1',
        uploadInstructions: [
          { uploadUrl: 'https://upload.li/1', firstByte: 0, lastByte: 4 * 1024 * 1024 - 1 },
          { uploadUrl: 'https://upload.li/2', firstByte: 4 * 1024 * 1024, lastByte: 8 * 1024 * 1024 - 1 },
          { uploadUrl: 'https://upload.li/3', firstByte: 8 * 1024 * 1024, lastByte: 12 * 1024 * 1024 - 1 },
        ],
      },
    },
  };
}

beforeEach(() => {
  post.mockReset();
  put.mockReset();
  get.mockReset();
});

describe('LinkedIn video upload', () => {
  // Test 21
  it('initializes, fills every slot, and finalizes with the ETags in order', async () => {
    post.mockResolvedValueOnce(threeSlots()).mockResolvedValueOnce({ status: 200, data: {} });
    put
      .mockResolvedValueOnce({ status: 200, headers: { etag: '"part-a"' } })
      .mockResolvedValueOnce({ status: 200, headers: { etag: '"part-b"' } })
      .mockResolvedValueOnce({ status: 200, headers: { etag: '"part-c"' } });

    const uploaded = await uploadVideo({
      accessToken: 'token',
      ownerUrn: 'urn:li:person:me',
      asset: video(),
    });

    // The real size. LinkedIn sizes the slots from it, so a wrong number
    // produces slots that cannot be filled.
    expect(post.mock.calls[0][1]).toEqual({
      initializeUploadRequest: {
        owner: 'urn:li:person:me',
        fileSizeBytes: 12 * 1024 * 1024,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    });

    // Each slot got exactly the bytes it asked for — nothing padded, nothing
    // short, nothing left over.
    expect(put).toHaveBeenCalledTimes(3);
    for (const call of put.mock.calls) {
      expect((call[1] as Buffer).byteLength).toBe(4 * 1024 * 1024);
    }

    // Quoted ETags are rejected on finalize, so the quotes come off.
    expect(post.mock.calls[1][1]).toEqual({
      finalizeUploadRequest: {
        video: 'urn:li:video:abc',
        uploadToken: 'token-1',
        uploadedPartIds: ['part-a', 'part-b', 'part-c'],
      },
    });

    expect(uploaded.urn).toBe('urn:li:video:abc');
    expect(uploaded.kind).toBe('video');
  });

  it('never holds more than one part in memory', async () => {
    // 200MB, in 4MB slots. Peak PUT body is what proves nothing accumulated.
    const slots = Array.from({ length: 50 }, (_, index) => ({
      uploadUrl: `https://upload.li/${index}`,
      firstByte: index * 4 * 1024 * 1024,
      lastByte: (index + 1) * 4 * 1024 * 1024 - 1,
    }));

    post
      .mockResolvedValueOnce({
        status: 200,
        data: { value: { video: 'urn:li:video:big', uploadToken: '', uploadInstructions: slots } },
      })
      .mockResolvedValueOnce({ status: 200, data: {} });
    put.mockResolvedValue({ status: 200, headers: { etag: 'part' } });

    await uploadVideo({
      accessToken: 'token',
      ownerUrn: 'urn:li:person:me',
      asset: video(200 * 1024 * 1024),
    });

    const peak = Math.max(
      ...put.mock.calls.map((call) => (call[1] as Buffer).byteLength),
    );
    expect(peak).toBe(4 * 1024 * 1024);
    expect(put).toHaveBeenCalledTimes(50);
  });

  it('fails rather than finalizing when a part returns no ETag', async () => {
    post.mockResolvedValueOnce(threeSlots());
    put.mockResolvedValueOnce({ status: 200, headers: {} });

    await expect(
      uploadVideo({ accessToken: 'token', ownerUrn: 'urn:li:person:me', asset: video() }),
    ).rejects.toThrow(/no ETag/);

    // Only the initialize call. Finalizing with a missing part would produce a
    // URN that cannot be attached, and a post referencing it would fail later
    // with a far worse message.
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('refuses an asset with no stream rather than uploading nothing', async () => {
    await expect(
      uploadVideo({
        accessToken: 'token',
        ownerUrn: 'urn:li:person:me',
        asset: { ...video(), openStream: undefined },
      }),
    ).rejects.toThrow(/could not be read/);

    expect(post).not.toHaveBeenCalled();
  });
});

describe('LinkedIn media routing', () => {
  it('routes a video to the Videos API and never probes the Images API', async () => {
    post.mockResolvedValueOnce(threeSlots()).mockResolvedValueOnce({ status: 200, data: {} });
    put.mockResolvedValue({ status: 200, headers: { etag: 'p' } });

    const result = await uploadMedia({
      accessToken: 'token',
      ownerUrn: 'urn:li:person:me',
      assets: [video()],
    });

    expect(result.media[0].urn).toBe('urn:li:video:abc');
    expect(post.mock.calls[0][0]).toContain('/videos?action=initializeUpload');
  });

  it('refuses a video mixed with an image rather than half-uploading', async () => {
    const image: ProviderMediaAsset = {
      kind: 'image',
      mimeType: 'image/jpeg',
      data: Buffer.alloc(16),
      byteLength: 16,
      sourceUrl: 'https://res.cloudinary.com/demo/image/upload/v1/p.jpg',
      width: 100,
      height: 100,
      altText: null,
    };

    await expect(
      uploadMedia({
        accessToken: 'token',
        ownerUrn: 'urn:li:person:me',
        assets: [video(), image],
      }),
    ).rejects.toThrow(/one video on its own/);

    // Nothing was uploaded. LinkedIn has no post body carrying both, so any
    // upload here would be work thrown away.
    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});

describe('LinkedIn images are unchanged', () => {
  // Test 24
  it('still applies the image rules when no capability is supplied', () => {
    const heic: ProviderMediaAsset = {
      kind: 'image',
      mimeType: 'image/heic',
      data: Buffer.alloc(16),
      byteLength: 16,
      sourceUrl: 'https://res.cloudinary.com/demo/image/upload/v1/p.heic',
      width: 100,
      height: 100,
      altText: null,
    };

    expect(() => validateMedia([heic])).toThrow(/JPG, PNG and GIF/);
  });

  it('still refuses an image over the pixel ceiling', () => {
    const huge: ProviderMediaAsset = {
      kind: 'image',
      mimeType: 'image/jpeg',
      data: Buffer.alloc(16),
      byteLength: 16,
      sourceUrl: 'https://res.cloudinary.com/demo/image/upload/v1/p.jpg',
      width: 9000,
      height: 9000,
      altText: null,
    };

    expect(() => validateMedia([huge], capabilityFor('linkedin', 'IMAGE'))).toThrow(
      /pixel limit/,
    );
  });

  it('accepts a video only under the video capability', () => {
    expect(() => validateMedia([video()], capabilityFor('linkedin', 'IMAGE'))).toThrow();
    expect(() =>
      validateMedia([video()], capabilityFor('linkedin', 'VIDEO')),
    ).not.toThrow();
  });
});
