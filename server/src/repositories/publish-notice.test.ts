/**
 * How a successful-but-degraded publication is written down.
 *
 * The X text-only fallback produces a row that is genuinely PUBLISHED and
 * genuinely missing the member's media. Three things have to be true of it, and
 * each has been a plausible way to get this wrong:
 *
 *  1. the notice is stored, so a *scheduled* fallback is still visible — the
 *     worker has no toast to show and the member would otherwise find out by
 *     scrolling their timeline;
 *  2. it is stored in its own column rather than in `errorMessage`, which is
 *     rendered wherever failures are and would make a live post look broken;
 *  3. a later clean retry clears it, because a stale "X couldn't attach the
 *     image" on a post whose image is now attached is worse than silence.
 *
 * Run: cd server && npx vitest run src/repositories/publish-notice.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.DATABASE_URL = 'postgresql://test/test';
});

const updates = vi.hoisted(() => ({ calls: [] as any[] }));

vi.mock('../config/prisma', () => ({
  prisma: {
    postPlatform: {
      update: vi.fn(async (args: any) => {
        updates.calls.push(args);
        return { id: 'pp-1', ...args.data };
      }),
    },
  },
}));

import { MediaType } from '../generated/prisma/enums';
import { markPlatformPublished } from './post.repository';

/** The `data` the last write carried. */
function written() {
  return updates.calls[updates.calls.length - 1].data;
}

beforeEach(() => {
  updates.calls = [];
  vi.clearAllMocks();
});

describe('a publication whose media was dropped', () => {
  it('stores the notice alongside a PUBLISHED status', async () => {
    await markPlatformPublished('post-1', 'x', 'tweet-1', {
      notice: "X couldn't attach the image, so FlowPost published the text only.",
      mediaType: MediaType.TEXT,
    });

    const data = written();

    // Published, not failed. The post is live.
    expect(data.status).toBe('PUBLISHED');
    expect(data.publishedId).toBe('tweet-1');
    expect(data.notice).toContain('published the text only');
  });

  it('keeps the notice out of errorMessage', async () => {
    await markPlatformPublished('post-1', 'x', 'tweet-1', {
      notice: 'X refused the image.',
    });

    // Rendered wherever failures are rendered — a notice there would report a
    // broken publish that is not broken.
    expect(written().errorMessage).toBeNull();
  });

  it('records the *observed* format as TEXT, because that is what X received', async () => {
    await markPlatformPublished('post-1', 'x', 'tweet-1', {
      notice: 'X refused the image.',
      mediaType: MediaType.TEXT,
      // The member still asked for an image post, and that request survives.
      contentType: MediaType.IMAGE,
    });

    const data = written();

    // Recording IMAGE here would tell analytics this account publishes images
    // that get no image engagement. The requested/observed split is exactly
    // what keeps both facts.
    expect(data.mediaType).toBe(MediaType.TEXT);
    expect(data.contentType).toBe(MediaType.IMAGE);
  });

  it('sets publishedAt like any other successful publish', async () => {
    await markPlatformPublished('post-1', 'x', 'tweet-1', {
      notice: 'X refused the image.',
    });

    // A degraded publish is still a publication and must enter analytics —
    // the window orders on this column.
    expect(written().publishedAt).toBeInstanceOf(Date);
  });
});

describe('an ordinary publication', () => {
  it('writes a null notice rather than leaving one behind', async () => {
    await markPlatformPublished('post-1', 'linkedin', 'urn:li:share:1', {
      permalink: 'https://linkedin.com/feed/update/urn:li:share:1',
    });

    expect(written().notice).toBeNull();
  });

  it('clears a notice a previous attempt left', async () => {
    // The retry case. The member removed the offending file and published
    // again; the old sentence no longer describes anything.
    await markPlatformPublished('post-1', 'x', 'tweet-1', {
      notice: 'X refused the image.',
    });
    expect(written().notice).toBeTruthy();

    await markPlatformPublished('post-1', 'x', 'tweet-2', {});
    expect(written().notice).toBeNull();
    expect(written().errorMessage).toBeNull();
  });
});
