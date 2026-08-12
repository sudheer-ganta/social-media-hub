import { describe, expect, it } from 'vitest';
import { inspectQuality, validateAgainstCapability } from './media-rules';
import { capabilityFor } from './capabilities';
import { ProviderError } from './provider.interface';
import type { ProviderMediaAsset } from './provider.interface';

/**
 * The shared media checks, and — just as much — what they say when they fail.
 *
 * Half of these assertions are about the *message*. That is not decoration:
 * "This video is 2 seconds. Instagram Reels need at least 3 seconds." is a
 * thing a member can act on in ten seconds, and `media_type=REELS / HTTP 400`
 * is a thing they open a support ticket about. So the wording is tested like
 * behaviour, including the negative — that no provider internals leak into it.
 */

function asset(overrides: Partial<ProviderMediaAsset> = {}): ProviderMediaAsset {
  return {
    kind: 'image',
    mimeType: 'image/jpeg',
    data: Buffer.alloc(0),
    byteLength: 1024,
    sourceUrl: 'https://res.cloudinary.com/demo/image/upload/v1/photo.jpg',
    width: 1080,
    height: 1080,
    altText: null,
    ...overrides,
  };
}

function video(overrides: Partial<ProviderMediaAsset> = {}): ProviderMediaAsset {
  return asset({
    kind: 'video',
    mimeType: 'video/mp4',
    data: null,
    byteLength: 12 * 1024 * 1024,
    sourceUrl: 'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4',
    width: 1080,
    height: 1920,
    durationMs: 18_000,
    ...overrides,
  });
}

const reel = capabilityFor('instagram', 'REEL')!;
const story = capabilityFor('instagram', 'STORY')!;
const igPost = capabilityFor('instagram', 'IMAGE')!;
const xImage = capabilityFor('x', 'IMAGE')!;
const xCarousel = capabilityFor('x', 'CAROUSEL')!;
const xVideo = capabilityFor('x', 'VIDEO')!;
const liVideo = capabilityFor('linkedin', 'VIDEO')!;

/** Every member-facing message has to survive this. */
function expectNoInternals(message: string) {
  expect(message).not.toMatch(
    /media_type|image_url|video_url|cloudinary|HTTP \d|\bundefined\b|\bnull\b|\{|\}/i,
  );
}

describe('wrong media kind', () => {
  // Test 10
  it('refuses a video on a format that takes images, and says what to do', () => {
    try {
      validateAgainstCapability(igPost, [video()], 'instagram', 'Instagram');
      expect.unreachable('should have refused');
    } catch (error) {
      const message = (error as ProviderError).message;
      expect(message).toContain("can't carry video");
      expect(message).toContain('choose a format that publishes video');
      expectNoInternals(message);
    }
  });

  it('refuses an image on a Reel', () => {
    expect(() =>
      validateAgainstCapability(reel, [asset()], 'instagram', 'Instagram'),
    ).toThrow(/needs a video, not an image/);
  });

  it('accepts either on a Story, because a Story takes either', () => {
    expect(() =>
      validateAgainstCapability(story, [asset()], 'instagram', 'Instagram'),
    ).not.toThrow();
    expect(() =>
      validateAgainstCapability(story, [video({ durationMs: 20_000 })], 'instagram', 'Instagram'),
    ).not.toThrow();
  });
});

describe('wrong MIME type', () => {
  // Test 11
  it('refuses a PNG on Instagram and lists what is accepted', () => {
    try {
      validateAgainstCapability(
        igPost,
        [asset({ mimeType: 'image/png' })],
        'instagram',
        'Instagram',
      );
      expect.unreachable('should have refused');
    } catch (error) {
      const message = (error as ProviderError).message;
      expect(message).toContain('PNG');
      expect(message).toContain('Accepted: JPEG');
      expectNoInternals(message);
    }
  });

  it('refuses a WEBM video on a Reel', () => {
    expect(() =>
      validateAgainstCapability(
        reel,
        [video({ mimeType: 'video/webm' })],
        'instagram',
        'Instagram',
      ),
    ).toThrow(/doesn't accept WEBM/);
  });

  it('renders quicktime as MOV rather than as a MIME subtype', () => {
    expect(() =>
      validateAgainstCapability(
        igPost,
        [asset({ mimeType: 'video/quicktime' })],
        'instagram',
        'Instagram',
      ),
    ).toThrow(/MOV|video/);
  });
});

describe('duration', () => {
  // Test 12
  it('refuses a Reel that is too short', () => {
    try {
      validateAgainstCapability(
        reel,
        [video({ durationMs: 2_000 })],
        'instagram',
        'Instagram',
      );
      expect.unreachable('should have refused');
    } catch (error) {
      const message = (error as ProviderError).message;
      expect(message).toContain('2 seconds');
      expect(message).toContain('at least 3 seconds');
      expectNoInternals(message);
    }
  });

  // Test 13
  it('refuses a Reel that is too long, and says to trim it', () => {
    expect(() =>
      validateAgainstCapability(
        reel,
        [video({ durationMs: 20 * 60 * 1000 })],
        'instagram',
        'Instagram',
      ),
    ).toThrow(/too long for a Instagram Reel.*Trim it/s);
  });

  it("refuses a minute-long Story video, because a Story's ceiling is its own", () => {
    // The same file is a perfectly good Reel. Two capability entries rather
    // than one with a flag is what makes that expressible.
    const ninetySeconds = video({ durationMs: 90_000 });
    expect(() =>
      validateAgainstCapability(story, [ninetySeconds], 'instagram', 'Instagram'),
    ).toThrow(/too long/);
    expect(() =>
      validateAgainstCapability(reel, [ninetySeconds], 'instagram', 'Instagram'),
    ).not.toThrow();
  });

  it('passes an unknown duration rather than failing on it', () => {
    // Null means Cloudinary reported nothing, which is not evidence the video
    // is wrong. Refusing here would fail posts the network would have taken.
    for (const durationMs of [null, undefined]) {
      expect(() =>
        validateAgainstCapability(reel, [video({ durationMs })], 'instagram', 'Instagram'),
      ).not.toThrow();
    }
  });
});

describe('size', () => {
  it('refuses an oversized image against the format ceiling', () => {
    expect(() =>
      validateAgainstCapability(
        igPost,
        [asset({ byteLength: 9 * 1024 * 1024 })],
        'instagram',
        'Instagram',
      ),
    ).toThrow(/over Instagram's 8.0MB limit/);
  });

  it('gives a GIF its own larger ceiling on X', () => {
    // 8MB is over X's 5MB photo limit and under its 15MB GIF limit. One
    // constraint object, two ceilings, because that is X's actual rule.
    const gif = asset({ mimeType: 'image/gif', byteLength: 8 * 1024 * 1024 });
    expect(() => validateAgainstCapability(xImage, [gif], 'x', 'X')).not.toThrow();

    expect(() =>
      validateAgainstCapability(
        xImage,
        [asset({ byteLength: 8 * 1024 * 1024 })],
        'x',
        'X',
      ),
    ).toThrow(/over X's 5.0MB limit/);
  });

  it('refuses an empty file', () => {
    expect(() =>
      validateAgainstCapability(igPost, [asset({ byteLength: 0 })], 'instagram', 'Instagram'),
    ).toThrow(/empty/);
  });

  it('renders a video ceiling in GB rather than four digits of MB', () => {
    expect(() =>
      validateAgainstCapability(
        reel,
        [video({ byteLength: 2 * 1024 * 1024 * 1024 })],
        'instagram',
        'Instagram',
      ),
    ).toThrow(/1\.0GB limit/);
  });
});

describe("X's GIF rule, expressed as data", () => {
  // Test 17's validation half
  it('refuses a GIF sharing a post', () => {
    const gif = asset({ mimeType: 'image/gif' });
    expect(() =>
      validateAgainstCapability(xCarousel, [gif, asset()], 'x', 'X'),
    ).toThrow(/publishes a GIF on its own/);
  });

  it('accepts a GIF on its own', () => {
    expect(() =>
      validateAgainstCapability(
        xImage,
        [asset({ mimeType: 'image/gif' })],
        'x',
        'X',
      ),
    ).not.toThrow();
  });

  it('says a GIF cannot share a post rather than that GIFs are unsupported', () => {
    // The distinction is the whole message. "X doesn't accept GIF" is false and
    // unactionable; naming the real rule tells the member what to remove.
    try {
      validateAgainstCapability(
        xCarousel,
        [asset({ mimeType: 'image/gif' }), asset()],
        'x',
        'X',
      );
      expect.unreachable('should have refused');
    } catch (error) {
      const message = (error as ProviderError).message;
      expect(message).toContain('publishes a GIF on its own');
      expect(message).not.toContain("doesn't accept");
      expectNoInternals(message);
    }
  });
});

describe('aspect ratio', () => {
  // Test 14
  it("refuses a shape outside the network's accepted range", () => {
    // 3000×200 is 15:1 — past Instagram's 1.91:1 feed ceiling.
    try {
      validateAgainstCapability(
        igPost,
        [asset({ width: 3000, height: 200 })],
        'instagram',
        'Instagram',
      );
      expect.unreachable('should have refused');
    } catch (error) {
      const message = (error as ProviderError).message;
      expect(message).toContain("which Instagram won't publish");
      expect(message).toContain('Crop it to 1:1');
      expectNoInternals(message);
    }
  });

  it('accepts a 16:9 video as a Reel, because Meta does', () => {
    // The soft/hard split. Refusing this would be FlowPost inventing a limit;
    // publishing it silently letterboxed would be FlowPost hiding one. It is
    // accepted, and the warning below is what the member sees.
    expect(() =>
      validateAgainstCapability(
        reel,
        [video({ width: 1920, height: 1080 })],
        'instagram',
        'Instagram',
      ),
    ).not.toThrow();
  });

  it('passes unknown dimensions', () => {
    expect(() =>
      validateAgainstCapability(
        igPost,
        [asset({ width: null, height: null })],
        'instagram',
        'Instagram',
      ),
    ).not.toThrow();
  });
});

describe('quality advice — warnings, never errors', () => {
  it('warns about a 16:9 Reel and names the crop', () => {
    const advice = inspectQuality(reel, { kind: 'video', width: 1920, height: 1080 });
    const framing = advice.find((entry) => entry.kind === 'aspect-ratio');
    expect(framing?.message).toContain('16:9');
    expect(framing?.message).toContain('9:16');
    expect(framing?.suggestedRatio).toBe('9:16');
  });

  it('warns about a soft resolution without blocking it', () => {
    const advice = inspectQuality(reel, { kind: 'video', width: 720, height: 1280 });
    expect(advice.some((entry) => entry.kind === 'resolution')).toBe(true);
    expect(() =>
      validateAgainstCapability(
        reel,
        [video({ width: 720, height: 1280 })],
        'instagram',
        'Instagram',
      ),
    ).not.toThrow();
  });

  it('says nothing about a 1080×1920 Reel', () => {
    expect(inspectQuality(reel, { kind: 'video', width: 1080, height: 1920 })).toEqual(
      [],
    );
  });

  it('reaches a different verdict per network for one video', () => {
    // The same file, three formats. A global "is this video good?" check could
    // not produce this, which is why the capability is the source of truth.
    const shot = { kind: 'video' as const, width: 1080, height: 1080 };
    expect(inspectQuality(reel, shot).length).toBeGreaterThan(0);
    expect(inspectQuality(xVideo, shot)).toEqual([]);
    expect(inspectQuality(liVideo, shot)).toEqual([]);
  });
});
