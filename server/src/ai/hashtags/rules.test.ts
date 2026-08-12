/**
 * The deterministic half of hashtag generation.
 *
 * Run: cd server && npx vitest run src/ai/hashtags/rules.test.ts
 *
 * Everything here is a rule the model is not trusted with: what a usable tag
 * looks like, which tags are noise, how many a network tolerates, and what
 * happens when two selected networks disagree.
 */

import { describe, expect, it } from 'vitest';
import { budgetFor, cleanTag, filterTags, splitTags, SPAM_TAGS } from './rules';

describe('cleanTag', () => {
  it('strips the hash and lowercases', () => {
    expect(cleanTag('#StreetwearIndia')).toBe('streetwearindia');
  });

  it('strips punctuation and symbols that break a tag', () => {
    expect(cleanTag('#urban-style!')).toBe('urbanstyle');
    expect(cleanTag('#café☕')).toBe('café');
  });

  it('keeps underscores and digits', () => {
    expect(cleanTag('#gen_z_2026')).toBe('gen_z_2026');
  });

  it('keeps non-Latin scripts', () => {
    expect(cleanTag('#दिल्ली')).toBe('दिल्ली');
  });

  it('refuses a tag with nothing usable in it', () => {
    expect(cleanTag('#')).toBeNull();
    expect(cleanTag('#!!')).toBeNull();
    expect(cleanTag('   ')).toBeNull();
  });

  it('refuses a single character and a bare number', () => {
    expect(cleanTag('#a')).toBeNull();
    expect(cleanTag('#2026')).toBeNull();
  });

  it('refuses anything that is not a string', () => {
    expect(cleanTag(42)).toBeNull();
    expect(cleanTag(null)).toBeNull();
    expect(cleanTag({ tag: 'x' })).toBeNull();
  });

  it('truncates rather than emitting an unusable length', () => {
    expect(cleanTag(`#${'a'.repeat(80)}`)).toHaveLength(40);
  });
});

describe('filterTags', () => {
  it('cleans, keeps order and reports nothing when all are fine', () => {
    const result = filterTags(['#StreetwearIndia', 'OversizedFits', '#urban_style']);
    expect(result.tags).toEqual(['streetwearindia', 'oversizedfits', 'urban_style']);
    expect(result.rejected).toEqual([]);
  });

  it('drops duplicates that differ only in case or punctuation', () => {
    const result = filterTags(['#Streetwear', 'streetwear', '#streetwear!']);
    expect(result.tags).toEqual(['streetwear']);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected.every((entry) => entry.reason === 'duplicate')).toBe(true);
  });

  it('rejects the generic spam tags', () => {
    const result = filterTags(['#viral', '#fyp', '#explore', '#instagood', '#realtag']);
    expect(result.tags).toEqual(['realtag']);
    expect(result.rejected.map((entry) => entry.tag)).toEqual([
      'viral',
      'fyp',
      'explore',
      'instagood',
    ]);
    expect(result.rejected.every((entry) => entry.reason === 'spam')).toBe(true);
  });

  it('names the tags the brief called out', () => {
    for (const tag of ['viral', 'fyp', 'explore', 'trending', 'love', 'instagood']) {
      expect(SPAM_TAGS.has(tag)).toBe(true);
    }
  });

  it('keeps a spam-listed tag the account genuinely uses', () => {
    // Their own branded series. Their history is the only evidence that tells
    // this apart from noise.
    const result = filterTags(['#trending', '#viral'], {
      inUse: new Set(['trending']),
    });
    expect(result.tags).toEqual(['trending']);
  });

  it('keeps a spam-listed tag that is a real word in the post', () => {
    // A wedding photographer's #love is not reach-farming.
    const result = filterTags(['#love', '#fyp'], { relevant: new Set(['love']) });
    expect(result.tags).toEqual(['love']);
  });

  it('logs an unusable entry without dropping the rest', () => {
    const result = filterTags(['#!!', '#realtag']);
    expect(result.tags).toEqual(['realtag']);
    expect(result.rejected).toEqual([{ tag: '#!!', reason: 'unusable' }]);
  });

  it('treats anything that is not an array as no tags', () => {
    expect(filterTags(null).tags).toEqual([]);
    expect(filterTags('#one #two').tags).toEqual([]);
    expect(filterTags(undefined).tags).toEqual([]);
  });

  it('allows an empty result — no hashtags is a valid answer', () => {
    const result = filterTags(['#viral', '#fyp']);
    expect(result.tags).toEqual([]);
  });
});

describe('budgetFor', () => {
  it('reads one network’s band from the analyser’s own rules', () => {
    expect(budgetFor(['instagram'])).toEqual({ min: 3, max: 10, conflict: false });
    expect(budgetFor(['linkedin'])).toEqual({ min: 1, max: 3, conflict: false });
    expect(budgetFor(['x'])).toEqual({ min: 0, max: 2, conflict: false });
  });

  it('takes the overlap when networks agree', () => {
    // LinkedIn 1–3 and X 0–2 overlap at 1–2.
    expect(budgetFor(['linkedin', 'x'])).toEqual({ min: 1, max: 2, conflict: false });
  });

  it('flags a genuine conflict and takes the tighter ceiling', () => {
    // Instagram wants at least 3; X tolerates at most 2. There is no count that
    // suits both, and the tighter network wins.
    const budget = budgetFor(['instagram', 'x']);
    expect(budget.conflict).toBe(true);
    expect(budget.max).toBe(2);
    expect(budget.min).toBeLessThanOrEqual(budget.max);
  });

  it('honours a caller’s smaller request', () => {
    expect(budgetFor(['instagram'], 5)).toEqual({ min: 3, max: 5, conflict: false });
  });

  it('never lets a request exceed the network ceiling', () => {
    // A member asking for 30 tags on LinkedIn still gets 3.
    expect(budgetFor(['linkedin'], 30).max).toBe(3);
  });

  it('accepts a request of zero', () => {
    expect(budgetFor(['instagram'], 0)).toEqual({ min: 0, max: 0, conflict: false });
  });

  it('falls back to a generic band with no platforms named', () => {
    expect(budgetFor([])).toEqual({ min: 0, max: 10, conflict: false });
  });
});

describe('splitTags', () => {
  it('publishes up to the ceiling and reserves the rest', () => {
    const split = splitTags(['a', 'b', 'c', 'd', 'e'], { min: 1, max: 3, conflict: false });
    expect(split.primary).toEqual(['a', 'b', 'c']);
    expect(split.secondary).toEqual(['d', 'e']);
  });

  it('reserves nothing when everything fits', () => {
    const split = splitTags(['a', 'b'], { min: 0, max: 10, conflict: false });
    expect(split.primary).toEqual(['a', 'b']);
    expect(split.secondary).toEqual([]);
  });

  it('publishes nothing when the ceiling is zero', () => {
    const split = splitTags(['a', 'b'], { min: 0, max: 0, conflict: false });
    expect(split.primary).toEqual([]);
    expect(split.secondary).toEqual(['a', 'b']);
  });
});
