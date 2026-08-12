import { describe, expect, it } from 'vitest';
import { resolveContentType, inferFromCount } from './content-type';
import { capabilitiesFor } from '../../providers/capabilities';
import { PublishError } from './publish-error';

/**
 * The resolver, and mostly the *null* half of it.
 *
 * Roughly two thirds of what is asserted below is that nothing changed. That
 * ratio is deliberate: the explicit path is a new feature and can be argued
 * about, where the null path decides what happens to posts already sitting in
 * the database and schedules already armed. A regression there fires at 09:00
 * tomorrow on somebody's feed, with no deploy nearby to blame.
 */

const image = { kind: 'image' as const };
const video = { kind: 'video' as const };

const linkedin = capabilitiesFor('linkedin');
const instagram = capabilitiesFor('instagram');
const facebook = capabilitiesFor('facebook');
const x = capabilitiesFor('x');

describe('null content_type — the behaviour that must not change', () => {
  // Test 1
  it('resolves no media to a text post', () => {
    const resolved = resolveContentType(null, [], linkedin);
    expect(resolved.contentType).toBe('TEXT');
    expect(resolved.explicit).toBe(false);
  });

  // Test 2
  it('resolves one item to an image post', () => {
    expect(resolveContentType(null, [image], linkedin).contentType).toBe('IMAGE');
  });

  // Test 3
  it('resolves two or more items to a carousel', () => {
    expect(resolveContentType(null, [image, image], linkedin).contentType).toBe(
      'CAROUSEL',
    );
    expect(
      resolveContentType(null, [image, image, image], linkedin).contentType,
    ).toBe('CAROUSEL');
  });

  // Test 27
  it('treats undefined and empty string the same as null', () => {
    for (const absent of [undefined, null, '']) {
      expect(resolveContentType(absent, [image], linkedin).contentType).toBe(
        'IMAGE',
      );
    }
  });

  it('never throws, whatever the media and whatever the network', () => {
    // The whole point. A validation added to this path could only ever turn a
    // post that used to publish into one that does not.
    for (const capabilities of [linkedin, instagram, facebook, x]) {
      for (const media of [[], [image], [image, image], [video], Array(30).fill(image)]) {
        expect(() => resolveContentType(null, media, capabilities)).not.toThrow();
      }
    }
  });

  it('is never STORY or REEL, however the media looks', () => {
    // A Story is only ever published because somebody asked for one. One video
    // resolving to REEL is exactly the guess this feature exists to stop.
    expect(resolveContentType(null, [video], instagram).contentType).toBe('IMAGE');
    expect(inferFromCount(1)).toBe('IMAGE');
  });

  it('reports no capability rather than throwing for a format the network lacks', () => {
    // Instagram has no TEXT. The old path let this reach the Instagram
    // validator, which refuses it with "Instagram posts need an image" — a
    // better message than anything this layer could produce, so it is left to.
    const resolved = resolveContentType(null, [], instagram);
    expect(resolved.contentType).toBe('TEXT');
    expect(resolved.capability).toBeUndefined();
  });
});

describe('explicit content_type', () => {
  // Tests 4, 5
  it('accepts IMAGE and CAROUSEL where the network publishes them', () => {
    expect(resolveContentType('IMAGE', [image], instagram).explicit).toBe(true);
    expect(resolveContentType('CAROUSEL', [image, image], instagram).contentType).toBe(
      'CAROUSEL',
    );
  });

  // Test 6
  it('accepts REEL on Instagram', () => {
    const resolved = resolveContentType('REEL', [video], instagram);
    expect(resolved.contentType).toBe('REEL');
    expect(resolved.capability?.transport).toBe('url');
  });

  // Test 7
  it('accepts STORY on Instagram, and only because it was asked for', () => {
    expect(resolveContentType('STORY', [image], instagram).contentType).toBe('STORY');
  });

  // Test 8
  it('accepts VIDEO on LinkedIn and X', () => {
    expect(resolveContentType('VIDEO', [video], linkedin).capability?.transport).toBe(
      'chunked',
    );
    expect(resolveContentType('VIDEO', [video], x).capability?.transport).toBe(
      'chunked',
    );
  });

  // Test 9
  it('refuses a format the network does not publish, and names what it does', () => {
    expect(() => resolveContentType('REEL', [video], facebook, 'Facebook')).toThrow(
      PublishError,
    );

    try {
      resolveContentType('STORY', [image], linkedin, 'LinkedIn');
      expect.unreachable('should have refused');
    } catch (error) {
      const message = (error as PublishError).message;
      expect(message).toContain("LinkedIn doesn't publish Stories");
      // Names an alternative rather than dead-ending.
      expect(message).toContain('Post');
      // No provider internals leak into what a member reads.
      expect(message).not.toMatch(/media_type|HTTP|400|undefined/);
    }
  });

  it('refuses Facebook Reels specifically, because the capability is absent', () => {
    // Not a branch anywhere — Facebook simply declares no REEL entry, and this
    // is what that absence produces.
    expect(facebook.REEL).toBeUndefined();
    expect(() => resolveContentType('REEL', [video], facebook, 'Facebook')).toThrow(
      /Facebook doesn't publish Reels/,
    );
  });

  it('refuses a value outside the vocabulary', () => {
    expect(() => resolveContentType('SNAP', [image], instagram)).toThrow(
      /doesn't publish "SNAP"/,
    );
  });

  it('leaves the post unchanged on every refusal', () => {
    // Nothing has been sent at this point, so the claim is released rather than
    // the post being marked FAILED with a network-shaped error.
    try {
      resolveContentType('REEL', [video], facebook, 'Facebook');
    } catch (error) {
      expect((error as PublishError).leavesPostUnchanged).toBe(true);
    }
  });
});

describe('explicit content_type — item counts', () => {
  it('refuses a Reel with no media', () => {
    expect(() => resolveContentType('REEL', [], instagram)).toThrow(/need a video/);
  });

  it('refuses a carousel of one', () => {
    expect(() => resolveContentType('CAROUSEL', [image], instagram)).toThrow(
      /at least 2 items/,
    );
  });

  it('refuses more items than the format holds, and says how many to remove', () => {
    expect(() =>
      resolveContentType('CAROUSEL', Array(12).fill(image), instagram),
    ).toThrow(/holds 10 items.*remove 2/);
  });

  it('refuses a Story carrying two items', () => {
    expect(() => resolveContentType('STORY', [image, image], instagram)).toThrow(
      /holds 1 item/,
    );
  });

  it('refuses media on a text post', () => {
    expect(() => resolveContentType('TEXT', [image], linkedin, 'LinkedIn')).toThrow(
      /can't carry media/,
    );
  });
});

describe('capability catalogue consistency', () => {
  // Test 28
  it('gives every declared format a coherent shape', () => {
    for (const providerId of ['linkedin', 'instagram', 'facebook', 'x']) {
      for (const [name, capability] of Object.entries(capabilitiesFor(providerId))) {
        expect(capability.label, `${providerId}.${name} label`).toBeTruthy();
        expect(capability.minItems).toBeLessThanOrEqual(capability.maxItems);
        expect(capability.minItems).toBeGreaterThanOrEqual(0);

        // requiresMedia and the counts have to agree, or the composer offers a
        // format that cannot be satisfied.
        expect(capability.requiresMedia).toBe(capability.minItems > 0);

        // A format that carries items has to say what they may be.
        if (capability.maxItems > 0) {
          expect(
            capability.image ?? capability.video,
            `${providerId}.${name} declares items but no media rules`,
          ).toBeDefined();
        }

        for (const constraints of [capability.image, capability.video]) {
          if (!constraints) continue;
          expect(constraints.mimeTypes.length).toBeGreaterThan(0);
          expect(constraints.maxBytes).toBeGreaterThan(0);
          if (
            constraints.minDurationMs !== undefined &&
            constraints.maxDurationMs !== undefined
          ) {
            expect(constraints.minDurationMs).toBeLessThan(constraints.maxDurationMs);
          }
        }

        if (capability.aspectRatio) {
          const { min, max, recommendedMin, recommendedMax } = capability.aspectRatio;
          expect(min).toBeLessThanOrEqual(max);
          // The soft window has to sit inside the hard one, or the composer
          // would advise a crop the network then refuses.
          if (recommendedMin !== undefined) {
            expect(recommendedMin).toBeGreaterThanOrEqual(min);
          }
          if (recommendedMax !== undefined) {
            expect(recommendedMax).toBeLessThanOrEqual(max);
          }
        }
      }
    }
  });

  it('declares the transports the audit specified, per network', () => {
    // Meta pulls; LinkedIn and X images push; large uploads stream. A change
    // here is a change to how much of a file ends up in this process' heap.
    expect(instagram.REEL?.transport).toBe('url');
    expect(instagram.STORY?.transport).toBe('url');
    expect(instagram.IMAGE?.transport).toBe('url');
    expect(facebook.IMAGE?.transport).toBe('url');
    expect(linkedin.IMAGE?.transport).toBe('bytes');
    expect(linkedin.VIDEO?.transport).toBe('chunked');
    expect(x.IMAGE?.transport).toBe('bytes');
    expect(x.VIDEO?.transport).toBe('chunked');
  });

  it('gives no video format the bytes transport', () => {
    // The rule the memory story rests on: nothing that can be a gigabyte is
    // allowed to take the path that produces a Buffer.
    for (const providerId of ['linkedin', 'instagram', 'facebook', 'x']) {
      for (const [name, capability] of Object.entries(capabilitiesFor(providerId))) {
        if (!capability.video) continue;
        expect(
          capability.transport,
          `${providerId}.${name} would buffer a whole video`,
        ).not.toBe('bytes');
      }
    }
  });

  // Test 31
  it('gives Stories a 24-hour metrics horizon and nothing else a horizon at all', () => {
    expect(instagram.STORY?.metricsHorizonMs).toBe(24 * 60 * 60 * 1000);

    for (const providerId of ['linkedin', 'instagram', 'facebook', 'x']) {
      for (const [name, capability] of Object.entries(capabilitiesFor(providerId))) {
        if (name === 'STORY') continue;
        expect(
          capability.metricsHorizonMs,
          `${providerId}.${name} would change the analytics cadence`,
        ).toBeUndefined();
      }
    }
  });

  it('leaves YouTube with nothing declared', () => {
    // No implementation, so no promises. Absence is the statement.
    expect(Object.keys(capabilitiesFor('youtube'))).toHaveLength(0);
    expect(Object.keys(capabilitiesFor('tiktok'))).toHaveLength(0);
  });
});
