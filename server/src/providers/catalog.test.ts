import { describe, expect, it } from 'vitest';
import { PROVIDER_CATALOG, getCatalogEntry } from './catalog';
import { capabilitiesFor, supportedContentTypes } from './capabilities';

/**
 * The catalogue says what a member *can do*; the capability model says what the
 * publisher *will do*. This is the file that stops the two drifting.
 *
 * The audit found three places where they already had. All three were the same
 * failure — a sentence in the catalogue that nothing behind it enforced or
 * contradicted:
 *
 *   • Instagram Stories were described as impossible. They are not, and never
 *     were: `media_type=STORIES` has been on the same edge as a feed image for
 *     as long as `REELS` has.
 *   • Reels and Stories were listed as needing a permission FlowPost does not
 *     request. They need `instagram_business_content_publish`, which every
 *     connected account already holds.
 *   • X image publishing was marked `planned`. It had been shipped and working
 *     since Sprint 5.1.
 *
 * None of those was a bug in code. All three were a promise nobody checked,
 * which is exactly what a test can check.
 */

describe('the corrections the audit called for', () => {
  it('no longer claims Instagram Stories are impossible', () => {
    const instagram = getCatalogEntry('instagram')!;
    const stories = instagram.permissions.find(
      (permission) => permission.label === 'Publish Stories',
    );

    expect(stories).toBeDefined();
    expect(stories!.planned).toBeFalsy();
    expect(stories!.description).not.toMatch(/cannot|impossible|does not offer/i);
  });

  it('files Reels and Stories under the publishing scope FlowPost already holds', () => {
    const instagram = getCatalogEntry('instagram')!;

    for (const label of ['Publish Reels', 'Publish Stories', 'Publish Carousels']) {
      const permission = instagram.permissions.find(
        (entry) => entry.label === label,
      );
      expect(permission, label).toBeDefined();
      // The same grant a feed post uses. Not a new permission, and not null.
      expect(permission!.scope).toBe('instagram_business_content_publish');
    }
  });

  it('no longer describes X image publishing as planned', () => {
    const x = getCatalogEntry('x')!;
    const images = x.permissions.find(
      (permission) => permission.label === 'Attach Images',
    );

    expect(images).toBeDefined();
    expect(images!.planned).toBeFalsy();
    expect(images!.scope).toBe('media.write');
  });

  it('keeps Facebook Reels unavailable, and says why rather than pretending', () => {
    const facebook = getCatalogEntry('facebook')!;
    const reels = facebook.permissions.find(
      (permission) => permission.label === 'Publish Reels',
    );

    // Still planned — the permission has not been verified against Meta's
    // documentation, so it is not requested.
    expect(reels?.planned).toBe(true);
    expect(reels?.scope).toBeNull();
    expect(reels?.description).toMatch(/not verified|has not verified/i);

    // And the capability model agrees, which is what actually enforces it.
    expect(capabilitiesFor('facebook').REEL).toBeUndefined();
  });
});

describe('the catalogue and the capability model agree', () => {
  /** Words a permission label uses for a format the publisher must support. */
  const FORMAT_CLAIMS: Array<{ pattern: RegExp; contentType: string }> = [
    { pattern: /publish reels/i, contentType: 'REEL' },
    { pattern: /publish stories/i, contentType: 'STORY' },
    { pattern: /publish carousels|multi-photo|multi-image/i, contentType: 'CAROUSEL' },
    { pattern: /publish video|upload video/i, contentType: 'VIDEO' },
  ];

  it('never promises a format the publisher cannot produce', () => {
    for (const entry of PROVIDER_CATALOG) {
      const supported = supportedContentTypes(entry.id);

      for (const permission of entry.permissions) {
        // A planned permission is an honest "not yet" and is allowed to name
        // something unsupported — that is what planned means.
        if (permission.planned) continue;

        for (const claim of FORMAT_CLAIMS) {
          if (!claim.pattern.test(permission.label)) continue;
          expect(
            supported,
            `${entry.id} advertises "${permission.label}" with no ${claim.contentType} capability`,
          ).toContain(claim.contentType);
        }
      }
    }
  });

  it('never declares a capability the catalogue calls planned', () => {
    // The inverse, and the one that would produce the *worst* card: a working
    // feature shown greyed out with a clock beside it.
    for (const entry of PROVIDER_CATALOG) {
      const supported = supportedContentTypes(entry.id);

      for (const permission of entry.permissions) {
        if (!permission.planned) continue;

        for (const claim of FORMAT_CLAIMS) {
          if (!claim.pattern.test(permission.label)) continue;
          expect(
            supported,
            `${entry.id} shows "${permission.label}" as coming soon but publishes it`,
          ).not.toContain(claim.contentType);
        }
      }
    }
  });

  it('declares capabilities only for networks that are actually available', () => {
    for (const entry of PROVIDER_CATALOG) {
      if (entry.available) continue;
      expect(
        supportedContentTypes(entry.id),
        `${entry.id} is Coming Soon but declares formats`,
      ).toHaveLength(0);
    }
  });

  it('gives every available network at least one format', () => {
    for (const entry of PROVIDER_CATALOG) {
      if (!entry.available) continue;
      expect(supportedContentTypes(entry.id).length).toBeGreaterThan(0);
    }
  });

  it('keeps the media ceiling and the capability counts in step', () => {
    // `media.maxItems` is what the composer sizes its uploader by and what the
    // media service refuses to exceed before downloading anything. It has to be
    // the largest any one format takes, or one of the two is wrong.
    for (const entry of PROVIDER_CATALOG) {
      const capabilities = capabilitiesFor(entry.id);
      const largest = Math.max(
        0,
        ...Object.values(capabilities).map((capability) => capability.maxItems),
      );
      expect(entry.media.maxItems, entry.id).toBe(largest);
    }
  });

  it('agrees with the capability model about text-only posts', () => {
    // `requiresMedia` on the card and the absence of a TEXT capability are the
    // same statement. Instagram is the one network where both are true.
    for (const entry of PROVIDER_CATALOG) {
      if (!entry.available) continue;
      const hasTextOnly = capabilitiesFor(entry.id).TEXT !== undefined;
      expect(entry.media.requiresMedia, entry.id).toBe(!hasTextOnly);
    }
  });
});
