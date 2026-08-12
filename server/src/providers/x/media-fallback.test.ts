import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * X's text-only fallback: when a refused image becomes a published text post,
 * and — far more importantly — when it must not.
 *
 * ─── What is actually being defended ─────────────────────────────────────────
 *
 * The recovery is one-way. You cannot un-publish a post, so a fallback that
 * fires on the wrong error produces something the member never asked for and
 * cannot take back. The allowlist in `media-fallback.ts` is what stops that,
 * and the bulk of this file is the *negative* cases: 401, 402, 403, 429, 5xx,
 * timeouts and anything unrecognised must still fail the whole publish.
 *
 * These drive the real publisher through a mocked axios, so what is asserted is
 * the request that actually went to `/2/tweets` — not an intention. A test that
 * checked a flag without checking the tweet body would pass while publishing
 * the media anyway.
 *
 * Run: cd server && npx vitest run src/providers/x/media-fallback.test.ts
 */

const post = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());
const put = vi.hoisted(() => vi.fn());

vi.mock('axios', () => {
  const isAxiosError = (error: unknown) =>
    Boolean(error && typeof error === 'object' && 'response' in error);
  return { default: { post, get, put, isAxiosError }, isAxiosError };
});

import { publish as publishToX } from './publisher';
import { publish as publishToLinkedIn } from '../linkedin/publisher';
import { publish as publishToInstagram } from '../meta/instagram/publisher';
import { timing as xTiming } from './media-upload';
import { isRecoverableMediaFailure, mediaDropReason } from './media-fallback';
import { ProviderError } from '../provider.interface';
import type { ProviderMediaAsset } from '../provider.interface';

xTiming.wait = async () => {};

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

/** An axios-shaped rejection carrying the status X answered with. */
function httpError(status: number, detail = 'nope') {
  return {
    response: { status, data: { title: 'error', detail } },
    config: { url: 'https://api.x.com/2/media/upload', method: 'post' },
    message: `Request failed with status code ${status}`,
  };
}

/** The JSON body of the `/2/tweets` call, or undefined if it never happened. */
function tweetBody() {
  const call = post.mock.calls.find((args) =>
    String(args[0]).endsWith('/tweets'),
  );
  return call?.[1] as { text: string; media?: { media_ids: string[] } } | undefined;
}

async function publishOneImage() {
  return publishToX({
    accessToken: 'token',
    providerAccountId: 'me',
    caption: 'hello world',
    media: [image()],
    contentType: 'IMAGE',
  });
}

beforeEach(() => {
  post.mockReset();
  get.mockReset();
  put.mockReset();
});

// ─── The classifier, in isolation ────────────────────────────────────────────

describe('isRecoverableMediaFailure', () => {
  it.each([400, 413, 415, 422])(
    'recovers a %s from the upload — a fact about the file',
    (status) => {
      expect(
        isRecoverableMediaFailure(new ProviderError('x', 502, 'x', status)),
      ).toBe(true);
    },
  );

  it.each([
    [401, 'a dead token'],
    [402, 'an empty API balance'],
    [403, 'a missing permission'],
    [429, 'a rate limit'],
    [500, 'an X outage'],
    [502, 'a bad gateway'],
    [503, 'a service outage'],
  ])('never recovers %i — %s', (status) => {
    expect(
      isRecoverableMediaFailure(new ProviderError('x', 502, 'x', status)),
    ).toBe(false);
  });

  it('never recovers a failure X never answered', () => {
    // A timeout or a dead socket. The upload may even have landed — we do not
    // know, and guessing in the direction of publishing is the unsafe guess.
    expect(isRecoverableMediaFailure(new ProviderError('timeout', 502, 'x'))).toBe(
      false,
    );
  });

  it('never recovers our own pre-flight validation', () => {
    // `media-rules.ts` refusing a GIF beside three photos is FlowPost
    // rejecting, not X. It leaves the post untouched and names the fix.
    expect(
      isRecoverableMediaFailure(new ProviderError('GIF must be alone', 400, 'x')),
    ).toBe(false);
  });

  it('never recovers something that is not a ProviderError at all', () => {
    expect(isRecoverableMediaFailure(new Error('boom'))).toBe(false);
    expect(isRecoverableMediaFailure(undefined)).toBe(false);
  });
});

describe('mediaDropReason', () => {
  it('names what the member attached', () => {
    expect(mediaDropReason([image()])).toContain('image');
    expect(mediaDropReason([image({ mimeType: 'image/gif' })])).toContain('GIF');
    expect(mediaDropReason([image({ kind: 'video' })])).toContain('video');
    expect(mediaDropReason([image(), image()])).toContain('images');
  });

  it('says the text was published, so the sentence stands alone', () => {
    expect(mediaDropReason([image()])).toBe(
      "X couldn't attach the image, so FlowPost published the text only.",
    );
  });

  it('leaks no diagnostics', () => {
    const reason = mediaDropReason([image()]);
    expect(reason).not.toMatch(/HTTP|\d{3}|api\.x\.com|cloudinary|\{/);
  });
});

// ─── 1. Media succeeds → text + media ────────────────────────────────────────

describe('when the media uploads', () => {
  it('publishes text and media, and claims no fallback', async () => {
    post
      .mockResolvedValueOnce({ status: 200, data: { data: { id: 'media-1' } } })
      .mockResolvedValueOnce({ status: 201, data: { data: { id: 'tweet-1' } } });

    const result = await publishOneImage();

    expect(tweetBody()?.media).toEqual({ media_ids: ['media-1'] });
    expect(result.urn).toBe('tweet-1');
    // Absent, not false: an ordinary publish says nothing about fallbacks.
    expect(result.mediaDropped).toBeUndefined();
    expect(result.publishedAs).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });
});

// ─── 2. Unsupported media → text-only fallback ───────────────────────────────

describe('when X refuses the media', () => {
  beforeEach(() => {
    post
      .mockRejectedValueOnce(httpError(400, 'Unsupported media type'))
      .mockResolvedValueOnce({ status: 201, data: { data: { id: 'tweet-1' } } });
  });

  it('publishes the text with no media key at all', async () => {
    await publishOneImage();

    const body = tweetBody();
    expect(body?.text).toBe('hello world');
    // Not an empty array — X rejects `media_ids: []`. The key is omitted.
    expect(body?.media).toBeUndefined();
  });

  it('reports the fallback rather than a plain success', async () => {
    const result = await publishOneImage();

    expect(result.publishedAs).toBe('text_only_fallback');
    expect(result.mediaDropped).toBe(true);
    expect(result.urn).toBe('tweet-1');
  });

  it('never drops media without a reason', async () => {
    // The invariant the whole feature rests on: a dropped asset that produces
    // no sentence is a silent drop wearing a success.
    const result = await publishOneImage();

    expect(result.reason).toBeTruthy();
    expect(result.reason).toContain('published the text only');
  });

  it('attaches no media ids from a partially uploaded set', async () => {
    // Two images, the second refused. A carousel missing its second picture is
    // not what the member composed, so the first is abandoned rather than
    // published alone.
    post.mockReset();
    post
      .mockResolvedValueOnce({ status: 200, data: { data: { id: 'media-1' } } })
      .mockRejectedValueOnce(httpError(415))
      .mockResolvedValueOnce({ status: 201, data: { data: { id: 'tweet-1' } } });

    const result = await publishToX({
      accessToken: 'token',
      providerAccountId: 'me',
      caption: 'two pictures',
      media: [image(), image()],
      contentType: 'CAROUSEL',
    });

    expect(tweetBody()?.media).toBeUndefined();
    expect(result.mediaDropped).toBe(true);
  });

  it.each([400, 413, 415, 422])('falls back on a %i', async (status) => {
    post.mockReset();
    post
      .mockRejectedValueOnce(httpError(status))
      .mockResolvedValueOnce({ status: 201, data: { data: { id: 'tweet-1' } } });

    expect((await publishOneImage()).mediaDropped).toBe(true);
  });
});

// ─── 3. Everything that must NOT fall back ───────────────────────────────────

describe('failures that must fail the whole publish', () => {
  it.each([
    [401, 'a dead token'],
    [402, 'credits depleted'],
    [403, 'a missing media.write'],
    [429, 'a rate limit'],
    [500, 'an X outage'],
    [503, 'a service outage'],
  ])('does not fall back on %i (%s)', async (status) => {
    post.mockRejectedValueOnce(httpError(status));

    await expect(publishOneImage()).rejects.toBeInstanceOf(ProviderError);

    // And — the assertion that matters most — no post was created. A publish
    // the member cannot undo must not happen on any of these.
    expect(tweetBody()).toBeUndefined();
  });

  it('does not fall back on a network timeout', async () => {
    // No `response`, so not an axios HTTP error: X never answered and the
    // upload may or may not have landed.
    post.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));

    await expect(publishOneImage()).rejects.toBeInstanceOf(ProviderError);
    expect(tweetBody()).toBeUndefined();
  });

  it('does not fall back when X returns 200 with no media id', async () => {
    // An unrecognised shape. Unknown means fail.
    post.mockResolvedValueOnce({ status: 200, data: { data: {} } });

    await expect(publishOneImage()).rejects.toBeInstanceOf(ProviderError);
    expect(tweetBody()).toBeUndefined();
  });

  it('preserves the upstream status so the service can still translate it', async () => {
    // 402 must keep reaching the "top up your plan" branch rather than being
    // swallowed by a fallback that never fires.
    post.mockRejectedValueOnce(httpError(402, 'credits depleted'));

    await expect(publishOneImage()).rejects.toMatchObject({
      upstreamStatus: 402,
    });
  });

  it('does not fall back when the *post* is rejected after the media uploaded', async () => {
    // A 400 from `/2/tweets` — a duplicate, say. The media was fine; stripping
    // it and retrying would neither fix the problem nor be wanted, which is why
    // the recovery wraps the upload loop and nothing else.
    post
      .mockResolvedValueOnce({ status: 200, data: { data: { id: 'media-1' } } })
      .mockRejectedValueOnce(httpError(400, 'duplicate content'));

    await expect(publishOneImage()).rejects.toBeInstanceOf(ProviderError);
  });
});

// ─── The fallback is X-only ──────────────────────────────────────────────────

describe('the other networks are unchanged', () => {
  /**
   * The same 400 that recovers on X must still fail everywhere else.
   *
   * The recovery lives in `providers/x/publisher.ts` and nowhere near the
   * shared publish path, so this is really asserting that it was not
   * accidentally generalised — the kind of thing a later refactor "tidying up
   * duplicate error handling" would do without noticing.
   */
  it('LinkedIn still fails the whole publish when its image upload is refused', async () => {
    post.mockRejectedValueOnce(httpError(400, 'unsupported image'));

    await expect(
      publishToLinkedIn({
        accessToken: 'token',
        providerAccountId: 'member-1',
        caption: 'hello',
        media: [image()],
        contentType: 'IMAGE',
      }),
    ).rejects.toThrow();

    // No post body was ever sent — no text-only LinkedIn share appeared.
    const posted = post.mock.calls.find((args) =>
      String(args[0]).includes('/rest/posts'),
    );
    expect(posted).toBeUndefined();
  });

  it('Instagram still fails the whole publish when its container is refused', async () => {
    post.mockRejectedValueOnce(httpError(400, 'unsupported media'));

    await expect(
      publishToInstagram({
        accessToken: 'token',
        providerAccountId: 'ig-1',
        caption: 'hello',
        media: [image()],
        contentType: 'IMAGE',
      }),
    ).rejects.toThrow();

    // Instagram has no text-only edge at all, so a fallback here could not
    // even be expressed — which is exactly why it must never be attempted.
    const published = post.mock.calls.find((args) =>
      String(args[0]).includes('media_publish'),
    );
    expect(published).toBeUndefined();
  });
});

// ─── Text posts are untouched ────────────────────────────────────────────────

describe('a post with no media', () => {
  it('publishes normally and claims no fallback', async () => {
    post.mockResolvedValueOnce({
      status: 201,
      data: { data: { id: 'tweet-1' } },
    });

    const result = await publishToX({
      accessToken: 'token',
      providerAccountId: 'me',
      caption: 'just words',
      contentType: 'TEXT',
    });

    expect(result.mediaDropped).toBeUndefined();
    expect(tweetBody()?.media).toBeUndefined();
  });
});
