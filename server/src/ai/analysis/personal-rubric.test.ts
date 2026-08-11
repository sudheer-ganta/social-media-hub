import { describe, expect, it } from 'vitest';
import { buildChecklist } from './checklist';
import { measureCaption } from './metrics';
import { computeReachScore } from './scoring';
import { DEFAULT_WEIGHTS, PERSONAL_DIMENSIONS, normaliseWeights } from './weights';
import { improvableDimensions } from '../prompts/analysis.prompt';
import type { DimensionScore, ScoreDimension } from '../types';

/**
 * The personal rubric, and specifically the promise that it does not punish a
 * personal caption for being one.
 *
 * "ofc" is the test case throughout. It is a real caption somebody would post,
 * it is two characters, it has no hook, no CTA, no hashtags, no punctuation and
 * no capital letter — and under the brand rubric it would fail five checks and
 * score close to zero. Under this one it has to be able to score full marks.
 */

const perfect = (reason: string): DimensionScore => ({
  score: 10,
  confidence: 'High',
  reason,
});

describe('the personal dimensions', () => {
  it('does not include the marketing axes', () => {
    for (const dimension of ['hook', 'cta', 'hashtags', 'platformFit', 'readability', 'audienceFit']) {
      expect(PERSONAL_DIMENSIONS).not.toContain(dimension);
    }
  });

  it('judges voice, humanness, originality and the image', () => {
    expect([...PERSONAL_DIMENSIONS]).toEqual([
      'voiceMatch',
      'humanness',
      'originality',
      'visual',
    ]);
  });

  it('has a weight for every one of them', () => {
    for (const dimension of PERSONAL_DIMENSIONS) {
      expect(DEFAULT_WEIGHTS[dimension]).toBeGreaterThan(0);
    }
  });

  it('renormalises to 1 with or without an image', () => {
    const withImage = normaliseWeights([...PERSONAL_DIMENSIONS]);
    const textOnly = normaliseWeights(
      PERSONAL_DIMENSIONS.filter((d) => d !== 'visual'),
    );

    const total = (weights: Partial<Record<ScoreDimension, number>>) =>
      Object.values(weights).reduce((sum, weight) => sum + (weight ?? 0), 0);

    expect(total(withImage)).toBeCloseTo(1, 5);
    expect(total(textOnly)).toBeCloseTo(1, 5);
  });

  it('lets a text-only personal caption reach 100', () => {
    // The same guarantee a text-only brand post has: no dimension it never had
    // may cap its score.
    const { reachScore } = computeReachScore({
      scores: {
        voiceMatch: perfect('exactly how they write'),
        humanness: perfect('reads like a person'),
        originality: perfect('a joke they have not made'),
      },
    });

    expect(reachScore).toBe(100);
  });
});

describe('improvements can only point at personal axes', () => {
  it('never offers hashtags as a personal improvement', () => {
    const personal = improvableDimensions([...PERSONAL_DIMENSIONS], 'personal');
    expect(personal).not.toContain('hashtags');
  });

  it('still offers them to a brand post carrying none', () => {
    // The existing behaviour, unchanged: "you have no tags" is a real
    // improvement for a business post.
    const brand = improvableDimensions(['hook', 'cta'], 'brand');
    expect(brand).toContain('hashtags');
  });
});

describe('the pre-publish checklist', () => {
  const checklistFor = (caption: string, mode: 'personal' | 'brand') =>
    buildChecklist({
      caption,
      metrics: measureCaption(caption),
      hashtagCount: 0,
      hasImage: true,
      platforms: [],
      scores: {},
      mode,
    });

  it('finds nothing wrong with a two-character personal caption', () => {
    const checklist = checklistFor('ofc', 'personal');

    expect(checklist.items.every((entry) => entry.passed)).toBe(true);
    expect(checklist.readiness).toBe(100);
  });

  it('does not ask a personal post for a call to action or hashtags', () => {
    const ids = checklistFor('ofc', 'personal').items.map((entry) => entry.id);

    expect(ids).not.toContain('clear-cta');
    expect(ids).not.toContain('hashtag-count');
    expect(ids).not.toContain('strong-opening-line');
    expect(ids).not.toContain('readable-blocks');
    expect(ids).not.toContain('sentence-length');
  });

  it('still asks a brand post for all of them', () => {
    // The counterpart assertion: nothing above has been removed from Brand.
    const ids = checklistFor('A short brand caption.', 'brand').items.map(
      (entry) => entry.id,
    );

    expect(ids).toContain('clear-cta');
    expect(ids).toContain('hashtag-count');
    expect(ids).toContain('readable-blocks');
    expect(ids).toContain('within-platform-limits');
  });

  it('keeps the platform character limit in both modes', () => {
    // The one blocker that is arithmetic against a published limit rather than
    // a marketing opinion, and so is true whoever wrote the post.
    const ids = checklistFor('ofc', 'personal').items.map((entry) => entry.id);
    expect(ids).toContain('within-platform-limits');
  });
});
