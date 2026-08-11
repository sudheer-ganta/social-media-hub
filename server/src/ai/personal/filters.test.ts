import { describe, expect, it } from 'vitest';
import {
  aiRejectReason,
  filterCandidates,
  repeatReason,
  tokenSimilarity,
  trigramSimilarity,
} from './filters';

/**
 * The filter is the half of the personal brain that does not involve a model,
 * which makes it the half that can actually be tested. Everything here is a
 * case that has to keep working: a joke reused with one word swapped, a caption
 * that reads as AI, and — just as important — the short, lowercase,
 * unpunctuated captions this product exists to stop "fixing".
 */

const candidate = (text: string) => ({ text, behaviour: 'test' });

describe('repetition — the same joke wearing different words', () => {
  it('catches a content word swapped out', () => {
    // The case from the brief. Two words, one shared, and it is the shared one
    // that carries the joke.
    expect(repeatReason('corporate chaos', 'corporate drama')).not.toBeNull();
    expect(tokenSimilarity('corporate chaos', 'corporate drama')).toBeGreaterThanOrEqual(0.5);
  });

  it('catches a caption reworded a word at a time', () => {
    expect(repeatReason('unfortunately i drank', 'unfortunately i ate')).not.toBeNull();
    expect(trigramSimilarity('unfortunately i drank', 'unfortunately i ate')).toBeGreaterThan(0.6);
  });

  it('catches a shared joke frame on a short caption', () => {
    // Neither similarity test fires here — no shared content words, and only
    // 0.55 of the trigrams. The frame is the whole joke.
    expect(repeatReason('to be like zendaya', 'to be like dua lipa')).not.toBeNull();
  });

  it('catches the same caption in different casing and punctuation', () => {
    expect(repeatReason('Ya maal hai re!!', 'ya maal hai re')).toBe('identical');
  });

  it('lets a genuinely different caption through', () => {
    expect(repeatReason('protein ne personality bana di', 'corporate drama')).toBeNull();
    expect(repeatReason('im bored tbh', 'god knew what he was doing')).toBeNull();
  });

  it('does not treat two long captions as related for opening the same way', () => {
    // The frame rule is for short captions only. Two paragraphs that both open
    // "i think" are not the same joke.
    const a = 'i think the best part of the whole evening was nobody taking a single photo';
    const b = 'i think we have collectively agreed to never speak about what happened next';
    expect(repeatReason(a, b)).toBeNull();
  });
});

describe('anti-AI', () => {
  it('rejects the filler', () => {
    expect(aiRejectReason('living my best life')).not.toBeNull();
    expect(aiRejectReason('embracing the journey ✨')).not.toBeNull();
    expect(aiRejectReason('time to level up')).not.toBeNull();
  });

  it('rejects AI doing Gen Z', () => {
    expect(aiRejectReason("it's giving main character energy")).not.toBeNull();
    expect(aiRejectReason('bestie really understood the assignment')).not.toBeNull();
  });

  it('rejects engagement bait and hashtags', () => {
    expect(aiRejectReason('who else is up right now')).not.toBeNull();
    expect(aiRejectReason('gym done #fitness')).toBe('hashtag on a personal caption');
  });

  it('rejects an emoji pile', () => {
    expect(aiRejectReason('gym 🔥🔥🔥💪')).toBe('emoji pile');
  });

  it('rejects a caption that just describes the photo', () => {
    const observations = ['man in a black suit', 'stone hall', 'candles', 'staircase'];
    const description = 'a man in a black suit is standing in a stone hall near the candles';
    expect(aiRejectReason(description, { observations })).toBe('describes the photo');
  });

  it('does not mistake a short caption for a description', () => {
    // Same nouns available; the caption is a joke, not an inventory.
    const observations = ['man in a black suit', 'stone hall', 'candles'];
    expect(aiRejectReason('suit did numbers', { observations })).toBeNull();
  });
});

describe('what must never be filtered', () => {
  // The whole point of Personal. Each of these would be "improved" by a
  // marketing pipeline and each is correct exactly as typed.
  const good = [
    'ofc',
    'bro',
    'flexing',
    'im bored tbh',
    'corporate drama',
    'unfortunately i ate',
    'no nangu pangu on sat night',
    'chalta firta cocaine hai cocaine',
    'okok this is the last spam or is it',
    'god knew what he was doing',
    'ya maal hai re',
  ];

  it.each(good)('keeps %j', (text) => {
    expect(aiRejectReason(text)).toBeNull();
  });

  it('keeps them through the whole filter', () => {
    const { kept, dropped } = filterCandidates(good.map(candidate));
    expect(dropped).toEqual([]);
    expect(kept).toHaveLength(good.length);
  });
});

describe('filterCandidates', () => {
  it('drops a candidate that repeats one already kept', () => {
    const { kept, dropped } = filterCandidates([
      candidate('corporate drama'),
      candidate('corporate chaos'),
      candidate('protein ne personality bana di'),
    ]);

    expect(kept.map((c) => c.text)).toEqual([
      'corporate drama',
      'protein ne personality bana di',
    ]);
    expect(dropped).toHaveLength(1);
  });

  it('drops a candidate that repeats the member’s history', () => {
    const { kept, dropped } = filterCandidates([candidate('corporate chaos')], {
      history: ['corporate drama'],
    });

    expect(kept).toEqual([]);
    // Which of the three tests catches it is not the contract — that it is
    // caught is. These two happen to trip the character-overlap check first,
    // on the shared "corporate " prefix, before the word-overlap check sees
    // them; `tokenSimilarity` is asserted directly above for that path.
    expect(dropped[0].reason).toMatch(/previous caption/);
  });

  it('reports a reason for everything it drops', () => {
    const { dropped } = filterCandidates([
      candidate('living my best life'),
      candidate('   '),
    ]);

    expect(dropped).toHaveLength(2);
    expect(dropped.every((item) => item.reason.length > 0)).toBe(true);
  });
});
