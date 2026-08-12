import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What each network is actually *sent* when a member publishes media.
 *
 * Every HTTP call is captured and asserted on. The point is not that the code
 * runs — it is that a Reel goes out as `media_type=REELS` with a `video_url`, a
 * Story as `STORIES` with no caption, and an X video as INIT/APPEND/FINALIZE
 * with real segments. Those are the four requests nobody can verify by reading,
 * and the four that are expensive to get wrong: a malformed container fails
 * minutes later on Meta's side, and a skipped FINALIZE produces a post with a
 * media id that references nothing.
 *
 * The other half is the promise that a failed upload never becomes a successful
 * publish. That one is asserted directly, per network.
 */

const post = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());
const put = vi.hoisted(() => vi.fn());

vi.mock('axios', () => {
  const isAxiosError = (error: unknown) =>
    Boolean(error && typeof error === 'object' && 'response' in error);
  return {
    default: { post, get, put, isAxiosError },
    isAxiosError,
  };
});

import { publish as publishToX } from './x/publisher';
import { timing as xTiming } from './x/media-upload';
import { publish as publishToInstagram } from './meta/instagram/publisher';
import { timing as igTiming } from './meta/instagram/publisher';
import { ProviderError } from './provider.interface';
import type { ProviderMediaAsset } from './provider.interface';

// Nothing here should actually sleep. The schedules are minutes long.
xTiming.wait = async () => {};
igTiming.wait = async () => {};

function image(overrides: Partial<ProviderMediaAsset> = {}): ProviderMediaAsset {
  return {
    kind: 'image',
    mimeType: 'image/jpeg',
    data: Buffer.alloc(2048),
    byteLength: 2048,
    sourceUrl: 'https://res.cloudinary.com/demo/image/upload/v1/photo.jpg',
    width: 1080,
    height: 1080,
    altText: null,
    ...overrides,
  };
}

function video(overrides: Partial<ProviderMediaAsset> = {}): ProviderMediaAsset {
  return {
    kind: 'video',
    mimeType: 'video/mp4',
    data: null,
    byteLength: 12 * 1024 * 1024,
    sourceUrl: 'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4',
    width: 1080,
    height: 1920,
    durationMs: 18_000,
    posterUrl: null,
    altText: null,
    ...overrides,
  };
}

/** A stream of `bytes` bytes, in 1MB pieces. Never held whole. */
function streamOf(bytes: number) {
  return async () => {
    const { Readable } = await import('node:stream');
    const piece = 1024 * 1024;
    return Readable.from(
      (function* () {
        for (let sent = 0; sent < bytes; sent += piece) {
          yield Buffer.alloc(Math.min(piece, bytes - sent));
        }
      })(),
    );
  };
}

/** The form fields one captured multipart call carried. */
function fieldsOf(call: unknown[]): Record<string, unknown> {
  const form = call[1] as FormData;
  return Object.fromEntries(form.entries());
}

beforeEach(() => {
  post.mockReset();
  get.mockReset();
  put.mockReset();
});

// ─── X ───────────────────────────────────────────────────────────────────────

describe('X — images', () => {
  // Test 15
  it('uploads one image, then attaches its id to the post', async () => {
    post
      .mockResolvedValueOnce({ status: 200, data: { data: { id: 'media-1' } } })
      .mockResolvedValueOnce({ status: 201, data: { data: { id: 'tweet-1' } } });

    const result = await publishToX({
      accessToken: 'token',
      providerAccountId: 'me',
      caption: 'hello',
      media: [image()],
      contentType: 'IMAGE',
    });

    expect(fieldsOf(post.mock.calls[0]).media_category).toBe('tweet_image');
    expect(post.mock.calls[1][1]).toEqual({
      text: 'hello',
      media: { media_ids: ['media-1'] },
    });
    expect(result.mediaUrns).toEqual(['media-1']);
  });

  // Test 16
  it('uploads four images and preserves their order as render order', async () => {
    for (const id of ['m1', 'm2', 'm3', 'm4']) {
      post.mockResolvedValueOnce({ status: 200, data: { data: { id } } });
    }
    post.mockResolvedValueOnce({ status: 201, data: { data: { id: 'tweet-2' } } });

    await publishToX({
      accessToken: 'token',
      providerAccountId: 'me',
      caption: 'four',
      media: [image(), image(), image(), image()],
      contentType: 'CAROUSEL',
    });

    expect(post.mock.calls[4][1]).toEqual({
      text: 'four',
      media: { media_ids: ['m1', 'm2', 'm3', 'm4'] },
    });
  });

  // Test 17
  it('uploads a GIF through the chunked flow, as tweet_gif', async () => {
    post
      .mockResolvedValueOnce({ status: 200, data: { data: { id: 'gif-1' } } }) // INIT
      .mockResolvedValueOnce({ status: 200, data: {} }) // APPEND
      .mockResolvedValueOnce({ status: 200, data: {} }) // FINALIZE
      .mockResolvedValueOnce({ status: 201, data: { data: { id: 'tweet-3' } } });
    get.mockResolvedValue({ status: 200, data: {} });

    await publishToX({
      accessToken: 'token',
      providerAccountId: 'me',
      caption: 'gif',
      media: [
        image({
          mimeType: 'image/gif',
          data: null,
          byteLength: 2 * 1024 * 1024,
          openStream: streamOf(2 * 1024 * 1024),
        }),
      ],
      contentType: 'IMAGE',
    });

    const init = fieldsOf(post.mock.calls[0]);
    expect(init.command).toBe('INIT');
    expect(init.media_category).toBe('tweet_gif');
    expect(fieldsOf(post.mock.calls[2]).command).toBe('FINALIZE');
  });

  // Test 18
  it('uploads a video in ordered 5MB segments and waits for the transcode', async () => {
    post
      .mockResolvedValueOnce({ status: 200, data: { data: { id: 'vid-1' } } }) // INIT
      .mockResolvedValue({ status: 200, data: {} }); // APPEND ×3, FINALIZE
    get
      .mockResolvedValueOnce({
        status: 200,
        data: { data: { processing_info: { state: 'in_progress', check_after_secs: 1 } } },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { data: { processing_info: { state: 'succeeded' } } },
      });

    // The tweet call is the last `post`, so it needs its own answer.
    post.mockResolvedValue({ status: 200, data: {} });
    post.mockImplementation(async (_url: string, body: unknown) => {
      if (body instanceof FormData) {
        const command = body.get('command');
        if (command === 'INIT') return { status: 200, data: { data: { id: 'vid-1' } } };
        return { status: 200, data: {} };
      }
      return { status: 201, data: { data: { id: 'tweet-4' } } };
    });

    const result = await publishToX({
      accessToken: 'token',
      providerAccountId: 'me',
      caption: 'a video',
      media: [
        video({
          byteLength: 12 * 1024 * 1024,
          openStream: streamOf(12 * 1024 * 1024),
        }),
      ],
      contentType: 'VIDEO',
    });

    const forms = post.mock.calls
      .map((call) => call[1])
      .filter((body): body is FormData => body instanceof FormData);

    const commands = forms.map((form) => form.get('command'));
    expect(commands).toEqual(['INIT', 'APPEND', 'APPEND', 'APPEND', 'FINALIZE']);

    // Segment indexes are sequential and start at zero. Out of order, or with a
    // gap, and FINALIZE is rejected.
    expect(
      forms.filter((form) => form.get('command') === 'APPEND').map((form) => form.get('segment_index')),
    ).toEqual(['0', '1', '2']);

    // The real size, from Cloudinary's metadata. X sizes its own buffers from
    // this, so counting the stream instead would mean reading it twice.
    expect(forms[0].get('total_bytes')).toBe(String(12 * 1024 * 1024));

    expect(result.mediaUrns).toEqual(['vid-1']);
  });

  // Test 32
  it('never publishes when the media upload fails', async () => {
    post.mockRejectedValueOnce({
      response: { status: 500, data: {} },
      isAxiosError: true,
    });

    await expect(
      publishToX({
        accessToken: 'token',
        providerAccountId: 'me',
        caption: 'hello',
        media: [image()],
        contentType: 'IMAGE',
      }),
    ).rejects.toThrow();

    // The critical half: `/2/tweets` was never reached, so there is no post on
    // the timeline quietly missing its image.
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('never publishes when the transcode fails, and says why', async () => {
    post.mockImplementation(async (_url: string, body: unknown) => {
      if (body instanceof FormData) {
        return body.get('command') === 'INIT'
          ? { status: 200, data: { data: { id: 'vid-2' } } }
          : { status: 200, data: {} };
      }
      return { status: 201, data: { data: { id: 'tweet-5' } } };
    });
    get.mockResolvedValue({
      status: 200,
      data: {
        data: {
          processing_info: {
            state: 'failed',
            error: { message: 'UnsupportedVideoCodec' },
          },
        },
      },
    });

    await expect(
      publishToX({
        accessToken: 'token',
        providerAccountId: 'me',
        caption: 'a video',
        media: [video({ openStream: streamOf(1024 * 1024) })],
        contentType: 'VIDEO',
      }),
    ).rejects.toThrow(/UnsupportedVideoCodec/);

    expect(post.mock.calls.some((call) => !(call[1] instanceof FormData))).toBe(false);
  });

  // Test 33
  it('gives a clean, actionable error when the app lacks media.write', async () => {
    post.mockRejectedValueOnce({
      response: { status: 403, data: {} },
      isAxiosError: true,
    });

    try {
      await publishToX({
        accessToken: 'token',
        providerAccountId: 'me',
        caption: 'hello',
        media: [image()],
        contentType: 'IMAGE',
      });
      expect.unreachable('should have failed');
    } catch (error) {
      const message = (error as ProviderError).message;
      expect(message).toContain('Reconnect your X');
      expect(message).not.toMatch(/403|HTTP|media_category/);
    }
  });
});

// ─── Instagram ───────────────────────────────────────────────────────────────

/** Container-create, status-poll, publish, permalink — the four IG calls. */
function stubInstagram(containerId = 'container-1', mediaId = 'media-1') {
  post.mockImplementation(async (url: string) => {
    if (url.includes('media_publish')) {
      return { status: 200, data: { id: mediaId } };
    }
    return { status: 200, data: { id: containerId } };
  });
  get.mockImplementation(async (url: string, config: { params?: Record<string, unknown> }) => {
    if (config?.params?.fields === 'permalink') {
      return { status: 200, data: { permalink: 'https://instagram.com/p/abc' } };
    }
    return { status: 200, data: { status_code: 'FINISHED' } };
  });
}

describe('Instagram — Reels', () => {
  // Test 19
  it('creates a REELS container from the hosted video URL', async () => {
    stubInstagram();

    const result = await publishToInstagram({
      accessToken: 'token',
      providerAccountId: 'ig-1',
      caption: 'my reel',
      media: [video()],
      contentType: 'REEL',
    });

    const params = post.mock.calls[0][2].params;
    expect(params.media_type).toBe('REELS');
    // The Cloudinary URL, handed over for Meta to fetch. Nothing was downloaded
    // to produce it — see `media.video.test.ts`.
    expect(params.video_url).toBe(
      'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4',
    );
    expect(params.image_url).toBeUndefined();
    expect(params.caption).toBe('my reel');

    expect(result.urn).toBe('media-1');
    expect(result.url).toBe('https://instagram.com/p/abc');
  });

  it('refuses a Reel with an image attached', async () => {
    await expect(
      publishToInstagram({
        accessToken: 'token',
        providerAccountId: 'ig-1',
        caption: 'nope',
        media: [image()],
        contentType: 'REEL',
      }),
    ).rejects.toThrow(/needs a video, not an image/);

    expect(post).not.toHaveBeenCalled();
  });

  it('refuses a Reel that is too long before spending a request', async () => {
    await expect(
      publishToInstagram({
        accessToken: 'token',
        providerAccountId: 'ig-1',
        caption: 'long',
        media: [video({ durationMs: 20 * 60 * 1000 })],
        contentType: 'REEL',
      }),
    ).rejects.toThrow(/too long/);

    expect(post).not.toHaveBeenCalled();
  });
});

describe('Instagram — Stories', () => {
  // Test 20
  it('creates a STORIES container and sends no caption', async () => {
    stubInstagram('story-container', 'story-media');

    await publishToInstagram({
      accessToken: 'token',
      providerAccountId: 'ig-1',
      caption: 'this text goes nowhere',
      media: [image()],
      contentType: 'STORY',
    });

    const params = post.mock.calls[0][2].params;
    expect(params.media_type).toBe('STORIES');
    expect(params.image_url).toBeTruthy();
    // Meta ignores `caption` on a STORIES container. Sending one would be a
    // promise the API does not keep.
    expect(params.caption).toBeUndefined();
  });

  it('takes a video Story too', async () => {
    stubInstagram();

    await publishToInstagram({
      accessToken: 'token',
      providerAccountId: 'ig-1',
      caption: '',
      media: [video({ durationMs: 20_000 })],
      contentType: 'STORY',
    });

    const params = post.mock.calls[0][2].params;
    expect(params.media_type).toBe('STORIES');
    expect(params.video_url).toBeTruthy();
  });

  it('is never reached without being asked for', async () => {
    stubInstagram();

    // One image, no content type — the null path. This must be a feed post.
    await publishToInstagram({
      accessToken: 'token',
      providerAccountId: 'ig-1',
      caption: 'an ordinary post',
      media: [image()],
    });

    expect(post.mock.calls[0][2].params.media_type).toBeUndefined();
  });
});

describe('Instagram — existing posts are unchanged', () => {
  // Test 23
  it('publishes a single image exactly as before: no media_type, caption on the container', async () => {
    stubInstagram();

    await publishToInstagram({
      accessToken: 'token',
      providerAccountId: 'ig-1',
      caption: 'a photo',
      media: [image()],
      contentType: 'IMAGE',
    });

    const params = post.mock.calls[0][2].params;
    expect(params.media_type).toBeUndefined();
    expect(params.image_url).toBeTruthy();
    expect(params.caption).toBe('a photo');
    expect(params.is_carousel_item).toBeUndefined();
  });

  it('publishes a carousel exactly as before: children, then a CAROUSEL parent', async () => {
    let created = 0;
    post.mockImplementation(async (url: string) => {
      if (url.includes('media_publish')) return { status: 200, data: { id: 'media-1' } };
      created += 1;
      return { status: 200, data: { id: `container-${created}` } };
    });
    get.mockResolvedValue({ status: 200, data: { status_code: 'FINISHED' } });

    await publishToInstagram({
      accessToken: 'token',
      providerAccountId: 'ig-1',
      caption: 'three photos',
      media: [image(), image(), image()],
      contentType: 'CAROUSEL',
    });

    const children = post.mock.calls.slice(0, 3).map((call) => call[2].params);
    for (const child of children) {
      expect(child.is_carousel_item).toBe(true);
      // Meta ignores a child's caption; the parent carries the text.
      expect(child.caption).toBeUndefined();
    }

    const parent = post.mock.calls[3][2].params;
    expect(parent.media_type).toBe('CAROUSEL');
    expect(parent.children).toBe('container-1,container-2,container-3');
    expect(parent.caption).toBe('three photos');
  });
});
