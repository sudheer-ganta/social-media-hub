import { describe, expect, it } from 'vitest';
import { validateAgainstCapability } from './media-rules';
import { acceptedMimeTypes, capabilityFor } from './capabilities';
import { ProviderError } from './provider.interface';
import type { ProviderId, ProviderMediaAsset } from './provider.interface';

/**
 * The format matrix: every file type the composer's one picker accepts, against
 * every network that has to answer for it.
 *
 * ─── Why this is its own file ────────────────────────────────────────────────
 *
 * `media-rules.test.ts` tests the *rules* — counts, durations, ratios, and the
 * wording of a refusal. This tests the *matrix*, which is a different thing
 * that breaks in a different way: a network quietly losing a format it used to
 * accept, or gaining one it does not, is invisible to a rules test because
 * every rule still behaves correctly on the formats it is handed.
 *
 * The matrix is also the thing a member notices first. One "Add media" button
 * takes JPG, PNG, WEBP, GIF, MP4 and MOV, and which of those survive to a given
 * network is a per-network fact that must not drift silently.
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

function accepts(
  provider: ProviderId,
  contentType: Parameters<typeof capabilityFor>[1],
  item: ProviderMediaAsset,
): boolean {
  const capability = capabilityFor(provider, contentType);
  if (!capability) return false;

  try {
    validateAgainstCapability(capability, [item], provider, provider);
    return true;
  } catch (error) {
    // A refusal must be a stated 400, never a crash. Anything else means the
    // matrix broke in a way this test should not paper over.
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).status).toBe(400);
    return false;
  }
}

// ─── Still images ────────────────────────────────────────────────────────────

describe('JPG — the one format every network takes', () => {
  it.each([
    ['linkedin', 'IMAGE'],
    ['instagram', 'IMAGE'],
    ['facebook', 'IMAGE'],
    ['x', 'IMAGE'],
  ] as const)('publishes to %s as %s', (provider, contentType) => {
    expect(accepts(provider, contentType, asset({ mimeType: 'image/jpeg' }))).toBe(
      true,
    );
  });
});

describe('PNG', () => {
  it.each([
    ['linkedin', true],
    ['facebook', true],
    ['x', true],
    // Instagram's Content Publishing API takes JPEG and nothing else. The
    // media service rewrites a Cloudinary PNG to JPEG on the way out rather
    // than refusing the post — this is the rule that makes that necessary.
    ['instagram', false],
  ] as const)('%s accepts PNG: %s', (provider, expected) => {
    expect(accepts(provider, 'IMAGE', asset({ mimeType: 'image/png' }))).toBe(
      expected,
    );
  });
});

describe('WEBP — accepted by the uploader, by one network', () => {
  it('publishes to X', () => {
    expect(accepts('x', 'IMAGE', asset({ mimeType: 'image/webp' }))).toBe(true);
  });

  it.each(['linkedin', 'instagram', 'facebook'] as const)(
    'is refused by %s with a message naming what it does take',
    (provider) => {
      const capability = capabilityFor(provider, 'IMAGE')!;

      // The refusal has to name the alternatives. "WEBP not supported" leaves a
      // member guessing; listing JPEG and PNG tells them what to re-export as.
      expect(() =>
        validateAgainstCapability(
          capability,
          [asset({ mimeType: 'image/webp' })],
          provider,
          provider,
        ),
      ).toThrow(/JPEG/i);
    },
  );

  it('is offered by the uploader regardless, because one network takes it', () => {
    // The picker is per-network. Stopping a WEBP at the file dialog would be
    // wrong for an X-only post.
    expect(acceptedMimeTypes('x')).toContain('image/webp');
  });
});

describe('GIF', () => {
  it('publishes to X, which is the network that treats it specially', () => {
    expect(accepts('x', 'IMAGE', asset({ mimeType: 'image/gif' }))).toBe(true);
  });

  it('may not share an X post with other media', () => {
    const capability = capabilityFor('x', 'CAROUSEL')!;

    // Stated as data (`soloMimeTypes`) rather than as an `if (provider === 'x')`
    // — and the message says the actual problem and the actual fix.
    expect(() =>
      validateAgainstCapability(
        capability,
        [asset({ mimeType: 'image/gif' }), asset({ mimeType: 'image/jpeg' })],
        'x',
        'X',
      ),
    ).toThrow(/on its own/i);
  });

  it('publishes to LinkedIn and Facebook as an ordinary image', () => {
    expect(accepts('linkedin', 'IMAGE', asset({ mimeType: 'image/gif' }))).toBe(
      true,
    );
    expect(accepts('facebook', 'IMAGE', asset({ mimeType: 'image/gif' }))).toBe(
      true,
    );
  });

  it('is refused by Instagram, which takes JPEG only', () => {
    expect(accepts('instagram', 'IMAGE', asset({ mimeType: 'image/gif' }))).toBe(
      false,
    );
  });
});

// ─── Video ───────────────────────────────────────────────────────────────────

describe('MP4 — the one video format every network that takes video takes', () => {
  it.each([
    ['linkedin', 'VIDEO'],
    ['instagram', 'REEL'],
    ['instagram', 'STORY'],
    ['x', 'VIDEO'],
  ] as const)('publishes to %s as %s', (provider, contentType) => {
    expect(accepts(provider, contentType, video({ mimeType: 'video/mp4' }))).toBe(
      true,
    );
  });

  it('has nowhere to go on Facebook, which declares no video format', () => {
    // Not a refusal of MP4 — an absence of any Facebook content type that
    // carries video. Absence is the answer; see `capabilities.ts`.
    expect(capabilityFor('facebook', 'VIDEO')).toBeUndefined();
    expect(capabilityFor('facebook', 'REEL')).toBeUndefined();
  });
});

describe('MOV', () => {
  it.each([
    ['instagram', 'REEL'],
    ['instagram', 'STORY'],
    ['x', 'VIDEO'],
  ] as const)('publishes to %s as %s', (provider, contentType) => {
    expect(
      accepts(provider, contentType, video({ mimeType: 'video/quicktime' })),
    ).toBe(true);
  });

  it('is refused by LinkedIn, which takes MP4 only', () => {
    expect(
      accepts('linkedin', 'VIDEO', video({ mimeType: 'video/quicktime' })),
    ).toBe(false);
  });

  it('names MOV in the refusal, not `video/quicktime`', () => {
    const capability = capabilityFor('linkedin', 'VIDEO')!;

    try {
      validateAgainstCapability(
        capability,
        [video({ mimeType: 'video/quicktime' })],
        'linkedin',
        'LinkedIn',
      );
      throw new Error('expected a refusal');
    } catch (error) {
      const message = (error as ProviderError).message;
      expect(message).toContain('MOV');
      expect(message).not.toContain('quicktime');
    }
  });
});

// ─── Mixed selection ─────────────────────────────────────────────────────────

describe('mixed image and video in one selection', () => {
  it('is refused by every format, with a reason rather than a silent drop', () => {
    // The composer lets both into the tray — the file already knows which it
    // is, and making a member choose "Upload Image" first is the question this
    // whole design removed. What it must never do is publish one and discard
    // the other.
    for (const [provider, contentType] of [
      ['instagram', 'REEL'],
      ['instagram', 'CAROUSEL'],
      ['x', 'CAROUSEL'],
      ['linkedin', 'CAROUSEL'],
    ] as const) {
      const capability = capabilityFor(provider, contentType)!;

      expect(() =>
        validateAgainstCapability(
          capability,
          [asset(), video()],
          provider,
          provider,
        ),
      ).toThrow(ProviderError);
    }
  });

  it('explains an Instagram carousel’s images-only rule', () => {
    const capability = capabilityFor('instagram', 'CAROUSEL')!;

    try {
      validateAgainstCapability(
        capability,
        [asset(), asset(), asset(), video()],
        'instagram',
        'Instagram',
      );
      throw new Error('expected a refusal');
    } catch (error) {
      // "You selected 3 images + 1 video. Instagram Carousel requires images
      // only." — the shape of message the brief asks for: what is wrong, on
      // which format, and therefore what to do.
      const message = (error as ProviderError).message;
      expect(message).toMatch(/can't carry video/i);
      expect(message).toMatch(/Carousel/i);
      expect((error as ProviderError).status).toBe(400);
    }
  });

  it('offers both kinds from one picker on a network that takes both', () => {
    // The uploader's accept list is the union across a network's formats, so a
    // member is never stopped at the file dialog for choosing a video before
    // they have said whether it is a Reel or a Story.
    const instagram = acceptedMimeTypes('instagram');
    expect(instagram).toContain('image/jpeg');
    expect(instagram).toContain('video/mp4');

    const x = acceptedMimeTypes('x');
    expect(x).toContain('image/gif');
    expect(x).toContain('video/mp4');
  });
});
