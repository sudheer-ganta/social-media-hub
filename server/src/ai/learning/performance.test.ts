/**
 * Brand performance learning: what it will say, and what it refuses to.
 *
 * Run: cd server && npx vitest run src/ai/learning/performance.test.ts
 *
 * The refusals are the point. This module is one careless change away from
 * telling a member "Instagram beats LinkedIn for you", which is a claim reach
 * and impressions cannot jointly support at any sample size.
 */

import { describe, expect, it } from 'vitest';
import { MediaType } from '../../generated/prisma/enums';
import {
  learnPerformance,
  lengthBandOf,
  renderPerformanceSection,
} from './performance';
import type { CaptionedPublication } from './hashtag-history';

function post(
  overrides: {
    provider?: string;
    mediaType?: MediaType | null;
    contentType?: MediaType | null;
    caption?: string;
    likes?: number | null;
    exposure?: number | null;
  } = {},
): CaptionedPublication {
  const {
    provider = 'instagram',
    mediaType = MediaType.IMAGE,
    contentType = null,
    caption = 'a perfectly ordinary caption of medium length that says something',
    likes = 50,
    exposure = 1000,
  } = overrides;

  return {
    provider,
    publishedAt: new Date('2026-03-10T15:00:00Z'),
    mediaType,
    contentType,
    engagement: likes,
    exposure,
    caption,
  };
}

function posts(count: number, overrides = {}) {
  return Array.from({ length: count }, () => post(overrides));
}

const SHORT = 'new drop';
const LONG = 'x'.repeat(400);

describe('lengthBandOf', () => {
  it('calls a line or so short', () => {
    expect(lengthBandOf('new drop')).toBe('short');
    expect(lengthBandOf('x'.repeat(80))).toBe('short');
  });

  it('calls the middle medium', () => {
    expect(lengthBandOf('x'.repeat(81))).toBe('medium');
    expect(lengthBandOf('x'.repeat(300))).toBe('medium');
  });

  it('calls past the fold long', () => {
    expect(lengthBandOf('x'.repeat(301))).toBe('long');
  });

  it('ignores surrounding whitespace', () => {
    expect(lengthBandOf(`   ${'x'.repeat(80)}   `)).toBe('short');
  });
});

describe('learnPerformance — the floor', () => {
  it('says nothing with no publications', () => {
    const profile = learnPerformance([]);
    expect(profile.platforms).toEqual([]);
    expect(renderPerformanceSection(profile)).toBeNull();
  });

  it('says nothing when nothing has been measured', () => {
    const profile = learnPerformance(posts(30, { likes: null }));
    expect(profile.sampleSize).toBe(0);
    expect(renderPerformanceSection(profile)).toBeNull();
  });

  it('never claims a format preference from one or two posts', () => {
    const profile = learnPerformance([
      ...posts(2, { mediaType: MediaType.CAROUSEL, likes: 900 }),
      ...posts(10, { mediaType: MediaType.IMAGE, likes: 50 }),
    ]);
    expect(profile.platforms[0].signals).toEqual([]);
    expect(renderPerformanceSection(profile)).toBeNull();
  });

  it('says nothing when there is only one group to compare', () => {
    // Everything is a carousel. "Carousels do best" is meaningless here.
    const profile = learnPerformance(posts(30, { mediaType: MediaType.CAROUSEL }));
    expect(
      profile.platforms[0].signals.filter((signal) =>
        signal.id.startsWith('media_type'),
      ),
    ).toEqual([]);
  });

  it('says nothing when the difference is not meaningful', () => {
    const profile = learnPerformance([
      ...posts(10, { mediaType: MediaType.CAROUSEL, likes: 52 }),
      ...posts(10, { mediaType: MediaType.IMAGE, likes: 50 }),
    ]);
    expect(
      profile.platforms[0].signals.filter((signal) =>
        signal.id.startsWith('media_type'),
      ),
    ).toEqual([]);
  });
});

describe('learnPerformance — what it finds', () => {
  it('finds the format above the account’s own median', () => {
    const profile = learnPerformance([
      ...posts(10, { mediaType: MediaType.CAROUSEL, likes: 500 }),
      ...posts(10, { mediaType: MediaType.IMAGE, likes: 50 }),
    ]);

    const signal = profile.platforms[0].signals.find((entry) =>
      entry.id.startsWith('media_type'),
    );
    expect(signal?.id).toBe('media_type:CAROUSEL');
    expect(signal?.detail).toMatch(/carousels sit above this account’s median on Instagram/);
    expect(signal?.observations).toBe(10);
    expect(signal?.strength).toBe('emerging');
  });

  it('finds the caption length that has outperformed', () => {
    const profile = learnPerformance([
      ...posts(12, { caption: SHORT, likes: 500 }),
      ...posts(12, { caption: LONG, likes: 40 }),
    ]);

    const signal = profile.platforms[0].signals.find((entry) =>
      entry.id.startsWith('caption_length'),
    );
    expect(signal?.id).toBe('caption_length:short');
    expect(signal?.detail).toMatch(/short captions.*outperformed the others on Instagram/);
  });

  it('calls twenty or more posts a strong signal', () => {
    const profile = learnPerformance([
      ...posts(25, { mediaType: MediaType.REEL, likes: 500 }),
      ...posts(25, { mediaType: MediaType.IMAGE, likes: 50 }),
    ]);
    const signal = profile.platforms[0].signals.find((entry) =>
      entry.id.startsWith('media_type'),
    );
    expect(signal?.strength).toBe('strong');
  });

  it('falls back to the requested format when the network gave none', () => {
    const profile = learnPerformance([
      ...posts(10, { mediaType: null, contentType: MediaType.REEL, likes: 500 }),
      ...posts(10, { mediaType: null, contentType: MediaType.IMAGE, likes: 50 }),
    ]);
    expect(
      profile.platforms[0].signals.find((entry) => entry.id.startsWith('media_type'))?.id,
    ).toBe('media_type:REEL');
  });

  it('ranks on counts for a network that reports no exposure', () => {
    const profile = learnPerformance([
      ...posts(10, {
        provider: 'facebook',
        exposure: null,
        mediaType: MediaType.CAROUSEL,
        likes: 400,
      }),
      ...posts(10, {
        provider: 'facebook',
        exposure: null,
        mediaType: MediaType.IMAGE,
        likes: 40,
      }),
    ]);
    expect(profile.platforms[0].metric).toBe('engagement');
    expect(profile.platforms[0].signals.length).toBeGreaterThan(0);
  });
});

describe('learnPerformance — never comparing networks', () => {
  const mixed = [
    // Instagram, measured in reach: small numbers.
    ...posts(10, { provider: 'instagram', mediaType: MediaType.CAROUSEL, likes: 40, exposure: 1000 }),
    ...posts(10, { provider: 'instagram', mediaType: MediaType.IMAGE, likes: 4, exposure: 1000 }),
    // LinkedIn, measured in impressions: much bigger numbers on the same account.
    ...posts(10, { provider: 'linkedin', mediaType: MediaType.VIDEO, likes: 900, exposure: 1000 }),
    ...posts(10, { provider: 'linkedin', mediaType: MediaType.TEXT, likes: 90, exposure: 1000 }),
  ];

  it('keeps each network in its own bucket', () => {
    const profile = learnPerformance(mixed);
    expect(profile.platforms.map((platform) => platform.provider).sort()).toEqual([
      'instagram',
      'linkedin',
    ]);
    expect(profile.sampleSize).toBe(40);
  });

  it('scores each network against its own median, not a shared one', () => {
    const profile = learnPerformance(mixed);
    const instagram = profile.platforms.find((p) => p.provider === 'instagram');
    // Instagram's carousels win *within Instagram*, even though every LinkedIn
    // post has a bigger number than every Instagram post.
    expect(
      instagram?.signals.find((signal) => signal.id.startsWith('media_type'))?.id,
    ).toBe('media_type:CAROUSEL');
  });

  it('produces no signal that ranks one network against another', () => {
    const profile = learnPerformance(mixed);
    for (const platform of profile.platforms) {
      for (const signal of platform.signals) {
        // Every claim names at most the network it belongs to.
        const others = ['instagram', 'linkedin', 'facebook', 'x']
          .filter((provider) => provider !== platform.provider)
          .filter((provider) => signal.detail.toLowerCase().includes(provider));
        expect(others).toEqual([]);
      }
    }
  });

  it('warns the model off cross-network comparison in the rendered section', () => {
    const rendered = renderPerformanceSection(learnPerformance(mixed)) ?? '';
    expect(rendered).toMatch(/Never compare one network’s numbers with another’s/);
  });

  it('puts the network with the most evidence first', () => {
    const profile = learnPerformance([
      ...posts(5, { provider: 'x' }),
      ...posts(30, { provider: 'linkedin' }),
    ]);
    expect(profile.platforms[0].provider).toBe('linkedin');
  });
});

describe('renderPerformanceSection', () => {
  const profile = learnPerformance([
    ...posts(10, { mediaType: MediaType.CAROUSEL, likes: 500 }),
    ...posts(10, { mediaType: MediaType.IMAGE, likes: 50 }),
  ]);

  it('states correlation rather than rule', () => {
    const rendered = renderPerformanceSection(profile) ?? '';
    expect(rendered).toMatch(/correlations in its results, not rules/);
  });

  it('never uses causal language', () => {
    const rendered = renderPerformanceSection(profile) ?? '';
    expect(rendered).not.toMatch(/causes|caused|guarantees|will perform|always performs/i);
  });

  it('quotes the count behind every claim', () => {
    const rendered = renderPerformanceSection(profile) ?? '';
    for (const line of rendered.split('\n').filter((entry) => entry.startsWith('- '))) {
      expect(line).toMatch(/\(\d+ posts?\)/);
    }
  });

  it('hedges an early signal differently from a strong one', () => {
    const early = renderPerformanceSection(
      learnPerformance([
        ...posts(4, { mediaType: MediaType.CAROUSEL, likes: 500 }),
        ...posts(4, { mediaType: MediaType.IMAGE, likes: 50 }),
      ]),
    );
    expect(early).toMatch(/not worth relying on/);

    const strong = renderPerformanceSection(
      learnPerformance([
        ...posts(25, { mediaType: MediaType.CAROUSEL, likes: 500 }),
        ...posts(25, { mediaType: MediaType.IMAGE, likes: 50 }),
      ]),
    );
    expect(strong).toMatch(/a consistent pattern/);
  });

  it('tells the model to follow a signal only where it suits the post', () => {
    expect(renderPerformanceSection(profile)).toMatch(/only where it suits the post/);
  });
});
