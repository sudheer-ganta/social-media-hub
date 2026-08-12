import { describe, expect, it } from 'vitest';
import { describeMedia, describeShape, aspectRatioLabel } from './media-assets';

/**
 * What FlowPost records about media — and, just as much, what it refuses to.
 *
 * The refusal is the feature. No network returns per-asset metrics, so nothing
 * produced here may carry a platform number: a carousel's 126 interactions
 * across 3 slides must never become "42 each". These tests assert the *shape*
 * of what comes back is purely descriptive.
 *
 * The parsing is defensive because `posts.media` is a JSONB column the browser
 * writes and has been through more than one shape — pre-video rows have no
 * `mimeType` or `durationMs`, and the oldest posts have no `media` array at all.
 *
 * Run: cd server && npx vitest run src/analytics/media-assets.test.ts
 */

describe('describeMedia', () => {
  it('describes an image with its shape', () => {
    const [asset] = describeMedia({
      media: [
        { id: 'm1', type: 'image', width: 1080, height: 1350, mimeType: 'image/jpeg', url: 'u' },
      ],
    });

    expect(asset).toMatchObject({
      id: 'm1',
      position: 0,
      kind: 'image',
      width: 1080,
      height: 1350,
      aspectRatioLabel: '4:5',
      mimeType: 'image/jpeg',
    });
  });

  it('describes a video with its duration', () => {
    const [asset] = describeMedia({
      media: [
        {
          id: 'm1',
          type: 'video',
          width: 1080,
          height: 1920,
          durationMs: 10_005,
          posterUrl: 'p',
          url: 'u',
        },
      ],
    });

    expect(asset).toMatchObject({
      kind: 'video',
      durationMs: 10_005,
      aspectRatioLabel: '9:16',
      posterUrl: 'p',
    });
  });

  it('preserves order as position', () => {
    const assets = describeMedia({
      media: [
        { id: 'a', type: 'image', url: '1' },
        { id: 'b', type: 'image', url: '2' },
        { id: 'c', type: 'image', url: '3' },
      ],
    });

    // Array position *is* publish order — the same fact the composer writes.
    expect(assets.map((a) => [a.id, a.position])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('never attaches a metric to an asset', () => {
    const [asset] = describeMedia({
      media: [{ id: 'm1', type: 'image', width: 1080, height: 1080, url: 'u' }],
    });

    // The whole point. Nothing here may carry a platform number, because no
    // platform reports one per asset.
    for (const forbidden of ['likes', 'reach', 'impressions', 'engagement', 'views']) {
      expect(asset).not.toHaveProperty(forbidden);
    }
  });

  it('carries no duration on an image, even if one is stored', () => {
    const [asset] = describeMedia({
      media: [{ id: 'm1', type: 'image', durationMs: 5000, url: 'u' }],
    });
    expect(asset.durationMs).toBeNull();
  });

  it('nulls a dimension nothing recorded rather than guessing', () => {
    const [asset] = describeMedia({
      media: [{ id: 'm1', type: 'image', url: 'u' }],
    });

    expect(asset.width).toBeNull();
    expect(asset.height).toBeNull();
    expect(asset.aspectRatio).toBeNull();
    expect(asset.aspectRatioLabel).toBeNull();
  });

  it('marks a cropped asset', () => {
    const [asset] = describeMedia({
      media: [{ id: 'm1', type: 'image', crop: { w: 0.6, h: 1 }, url: 'u' }],
    });
    expect(asset.cropped).toBe(true);
  });

  it('falls back to image_url on a post written before the media column', () => {
    // Real single-image posts. Excluding them would understate the format
    // history they belong to.
    const assets = describeMedia({ media: null, image_url: 'https://cdn/photo.jpg' });

    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ kind: 'image', url: 'https://cdn/photo.jpg' });
    // Honest about how little was recorded then.
    expect(assets[0].id).toBeNull();
    expect(assets[0].width).toBeNull();
  });

  it('returns nothing for a text post', () => {
    // A fact, not a gap.
    expect(describeMedia({ media: [], image_url: null })).toEqual([]);
    expect(describeMedia({ media: null, image_url: null })).toEqual([]);
  });

  it('survives a malformed entry rather than throwing', () => {
    // A bad row must not take out the analytics page for the whole post.
    const assets = describeMedia({
      media: [null, 'nonsense', { id: 'ok', type: 'image', url: 'u' }] as unknown,
    });

    expect(assets).toHaveLength(1);
    expect(assets[0].id).toBe('ok');
  });

  it('files an unrecognised type as unknown rather than assuming image', () => {
    const [asset] = describeMedia({
      media: [{ id: 'm1', type: 'document', url: 'u' }],
    });
    expect(asset.kind).toBe('unknown');
  });
});

describe('describeShape', () => {
  it.each([
    [[], 'Text only'],
    [[{ id: 'a', type: 'image', url: 'u' }], 'Image'],
    [[{ id: 'a', type: 'video', url: 'u' }], 'Video'],
    [
      [
        { id: 'a', type: 'image', url: 'u' },
        { id: 'b', type: 'image', url: 'u' },
      ],
      '2 images',
    ],
    [
      [
        { id: 'a', type: 'image', url: 'u' },
        { id: 'b', type: 'video', url: 'u' },
      ],
      '2 items',
    ],
  ])('describes %#', (media, expected) => {
    expect(describeShape(describeMedia({ media }))).toBe(expected);
  });
});

describe('aspectRatioLabel', () => {
  it.each([
    [1080 / 1920, '9:16'],
    [1080 / 1350, '4:5'],
    [1, '1:1'],
    [1920 / 1080, '16:9'],
  ])('names the common shape %#', (ratio, expected) => {
    expect(aspectRatioLabel(ratio)).toBe(expected);
  });

  it('falls back to a decimal for an uncommon shape', () => {
    expect(aspectRatioLabel(2.5)).toBe('2.50:1');
  });
});
