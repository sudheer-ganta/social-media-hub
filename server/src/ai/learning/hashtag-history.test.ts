/**
 * What this account's own hashtag record shows, and how carefully it is said.
 *
 * Run: cd server && npx vitest run src/ai/learning/hashtag-history.test.ts
 *
 * Two things are load-bearing here and neither is the arithmetic: a tag used
 * once must never become a claim, and no sentence this file produces may say a
 * hashtag *caused* anything.
 */

import { describe, expect, it } from 'vitest';
import {
  evidenceFor,
  isStatable,
  renderSignal,
  EVIDENCE_GATES,
  EVIDENCE_LABEL,
  EVIDENCE_PHRASE,
} from './evidence';
import {
  extractTags,
  learnHashtags,
  renderHashtagHistory,
  tagsInUse,
  type CaptionedPublication,
} from './hashtag-history';

function post(
  caption: string,
  overrides: { likes?: number | null; exposure?: number | null } = {},
): CaptionedPublication {
  const { likes = 50, exposure = 1000 } = overrides;
  return {
    provider: 'instagram',
    publishedAt: new Date('2026-03-10T15:00:00Z'),
    mediaType: null,
    contentType: null,
    engagement: likes,
    exposure,
    caption,
  };
}

function posts(count: number, caption: string, overrides = {}) {
  return Array.from({ length: count }, () => post(caption, overrides));
}

describe('evidenceFor', () => {
  it('refuses to state anything below three observations', () => {
    expect(evidenceFor(0)).toBe('insufficient');
    expect(evidenceFor(1)).toBe('insufficient');
    expect(evidenceFor(2)).toBe('insufficient');
    expect(isStatable(evidenceFor(2))).toBe(false);
  });

  it('tiers upward as the count grows', () => {
    expect(evidenceFor(3)).toBe('early');
    expect(evidenceFor(7)).toBe('early');
    expect(evidenceFor(8)).toBe('emerging');
    expect(evidenceFor(19)).toBe('emerging');
    expect(evidenceFor(20)).toBe('strong');
    expect(evidenceFor(200)).toBe('strong');
  });

  it('takes its gates as a parameter rather than hardcoding them', () => {
    expect(evidenceFor(4, { early: 5, emerging: 10, strong: 20 })).toBe('insufficient');
    expect(EVIDENCE_GATES.early).toBe(3);
  });

  it('labels every tier for the UI', () => {
    expect(EVIDENCE_LABEL.early).toBe('Early signal');
    expect(EVIDENCE_LABEL.emerging).toBe('Emerging pattern');
    expect(EVIDENCE_LABEL.strong).toBe('Strong signal');
  });

  it('never phrases a claim causally', () => {
    for (const phrase of Object.values(EVIDENCE_PHRASE)) {
      expect(phrase).not.toMatch(/causes|because of|drives|makes|due to/i);
    }
  });

  it('quotes the sample in a rendered signal', () => {
    expect(
      renderSignal({
        id: 'media_type:CAROUSEL',
        strength: 'emerging',
        detail: 'carousels earn more saves',
        observations: 11,
      }),
    ).toBe('- an emerging pattern: carousels earn more saves (11 posts)');
  });
});

describe('extractTags', () => {
  it('reads tags without their hash, lowercased', () => {
    expect(extractTags('New drop #StreetwearIndia #OversizedFits')).toEqual([
      'streetwearindia',
      'oversizedfits',
    ]);
  });

  it('counts a tag repeated in one caption once', () => {
    expect(extractTags('#same and #Same again')).toEqual(['same']);
  });

  it('keeps Devanagari intact, matras included', () => {
    // A class of \p{L}\p{N}_ would yield 'द' here and quietly key a different tag.
    expect(extractTags('घर से #दिल्ली')).toEqual(['दिल्ली']);
  });

  it('finds nothing in a caption with no tags', () => {
    expect(extractTags('just a caption')).toEqual([]);
  });

  it('stops at punctuation', () => {
    expect(extractTags('#one, #two.')).toEqual(['one', 'two']);
  });
});

describe('learnHashtags', () => {
  it('says nothing at all with no measured posts', () => {
    const history = learnHashtags(
      posts(5, '#tag', { likes: null }),
      'engagement_rate',
    );
    expect(history.sampleSize).toBe(0);
    expect(history.frequent).toEqual([]);
    expect(renderHashtagHistory(history)).toBeNull();
  });

  it('never states a preference from one post', () => {
    const history = learnHashtags(
      [post('#onceonly'), ...posts(10, '#regular')],
      'engagement_rate',
    );
    expect(history.frequent.map((entry) => entry.tag)).not.toContain('onceonly');
    expect(history.frequent.map((entry) => entry.tag)).toContain('regular');
  });

  it('ranks the account’s habitual tags by use', () => {
    const history = learnHashtags(
      [...posts(10, '#often'), ...posts(4, '#sometimes')],
      'engagement_rate',
    );
    expect(history.frequent.map((entry) => entry.tag)).toEqual(['often', 'sometimes']);
    expect(history.frequent[0].uses).toBe(10);
    expect(history.frequent[0].strength).toBe('emerging');
  });

  it('finds tags whose posts sit above the account median', () => {
    const history = learnHashtags(
      [
        ...posts(5, '#strong', { likes: 500 }),
        ...posts(10, '#ordinary', { likes: 50 }),
      ],
      'engagement_rate',
    );
    expect(history.strongerPosts.map((entry) => entry.tag)).toEqual(['strong']);
    expect(history.strongerPosts[0].lift).toBeGreaterThan(0);
  });

  it('names the tags that make no measurable difference', () => {
    const history = learnHashtags(posts(12, '#habit #alsohabit'), 'engagement_rate');
    // Every post identical, so both tags sit exactly on the median.
    expect(history.noDifference.map((entry) => entry.tag).sort()).toEqual([
      'alsohabit',
      'habit',
    ]);
    expect(history.strongerPosts).toEqual([]);
  });

  it('drops unmeasured posts rather than scoring them as zero', () => {
    const history = learnHashtags(
      [...posts(6, '#measured'), ...posts(20, '#unmeasured', { likes: null })],
      'engagement_rate',
    );
    expect(history.sampleSize).toBe(6);
    expect(history.frequent.map((entry) => entry.tag)).toEqual(['measured']);
  });

  it('scores on counts when the network reports no exposure', () => {
    const history = learnHashtags(
      [
        ...posts(5, '#strong', { exposure: null, likes: 400 }),
        ...posts(8, '#ordinary', { exposure: null, likes: 40 }),
      ],
      'engagement',
    );
    expect(history.metric).toBe('engagement');
    expect(history.strongerPosts.map((entry) => entry.tag)).toEqual(['strong']);
  });
});

describe('renderHashtagHistory', () => {
  const history = learnHashtags(
    [
      ...posts(6, '#strongtag', { likes: 500 }),
      ...posts(10, '#deadtag', { likes: 50 }),
    ],
    'engagement_rate',
  );

  it('quotes the sample it measured', () => {
    expect(renderHashtagHistory(history)).toMatch(/Measured across 16 posts/);
  });

  it('states correlation and refuses cause', () => {
    const rendered = renderHashtagHistory(history) ?? '';
    expect(rendered).toMatch(/correlation, not a cause/);
    expect(rendered).not.toMatch(/caused|because these tags|drives engagement/i);
  });

  it('tells the model to use a strong tag only where it fits', () => {
    expect(renderHashtagHistory(history)).toMatch(/only where it genuinely fits/);
  });

  it('names the dead tags as not worth including out of habit', () => {
    const rendered = renderHashtagHistory(history) ?? '';
    expect(rendered).toMatch(/#deadtag/);
    expect(rendered).toMatch(/no reason to include these out of habit/i);
  });

  it('does not instruct the model to reuse the whole set verbatim', () => {
    const rendered = renderHashtagHistory(history) ?? '';
    expect(rendered).not.toMatch(/use all of|include every|reuse these/i);
  });
});

describe('tagsInUse', () => {
  it('reports the account’s own tags, which exempt them from the spam filter', () => {
    const history = learnHashtags(posts(9, '#trending'), 'engagement_rate');
    expect(tagsInUse(history).has('trending')).toBe(true);
  });

  it('is empty for an account with no record', () => {
    expect(tagsInUse(learnHashtags([], 'engagement')).size).toBe(0);
  });
});
