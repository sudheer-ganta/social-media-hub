/**
 * The voice mix: a reading of measured caption shape, not an opinion.
 *
 * Run: cd server && npx vitest run src/ai/learning/voice-mix.test.ts
 *
 * Two properties matter more than any individual percentage. The mix must sum to
 * 100 so the panel adds up, and it must be *stable* — the same measurement has to
 * produce the same numbers every time, which is the whole reason this is
 * arithmetic rather than a model call.
 */

import { describe, expect, it } from 'vitest';
import { MIXED_REGISTERS, REGISTER_LABEL, voiceMix } from './voice-mix';
import type { MeasuredStyle } from '../style/measure';

function measured(overrides: Partial<MeasuredStyle> = {}): MeasuredStyle {
  return {
    medianWords: 20,
    p90Words: 40,
    oneWordRate: 0,
    allLowercaseRate: 0,
    lowercaseStartRate: 0,
    terminalPunctuationRate: 0.5,
    fragmentRate: 0,
    emojiRate: 0,
    hashtagRate: 0,
    mentionRate: 0,
    scriptMix: { english: 1, romanisedHindi: 0, devanagari: 0 },
    explainsContextRate: 0.5,
    ...overrides,
  };
}

/** The register with the largest share. */
function top(style: MeasuredStyle): string {
  return voiceMix(style, 30).entries[0].register;
}

describe('voiceMix — honesty', () => {
  it('reports nothing at all with no captions behind it', () => {
    expect(voiceMix(measured(), 0)).toEqual({
      entries: [],
      sampleCount: 0,
      basis: 'measured_caption_shape',
    });
  });

  it('reports nothing when there is no profile', () => {
    expect(voiceMix(null, 40).entries).toEqual([]);
  });

  it('states what the percentages are a reading of', () => {
    expect(voiceMix(measured(), 30).basis).toBe('measured_caption_shape');
  });

  it('quotes the sample the measurement rests on', () => {
    expect(voiceMix(measured(), 42).sampleCount).toBe(42);
  });

  it('is stable — the same measurement gives the same numbers', () => {
    const style = measured({ emojiRate: 0.6, allLowercaseRate: 0.4 });
    expect(voiceMix(style, 30)).toEqual(voiceMix(style, 30));
  });
});

describe('voiceMix — the arithmetic', () => {
  it('sums to exactly 100', () => {
    const styles = [
      measured(),
      measured({ emojiRate: 1, allLowercaseRate: 1, fragmentRate: 1 }),
      measured({ medianWords: 90, terminalPunctuationRate: 1 }),
      measured({ medianWords: 2, oneWordRate: 0.9 }),
      measured({ hashtagRate: 1, emojiRate: 0.5 }),
    ];

    for (const style of styles) {
      const mix = voiceMix(style, 30);
      const total = mix.entries.reduce((sum, entry) => sum + entry.percent, 0);
      expect(total).toBe(100);
    }
  });

  it('sorts strongest first', () => {
    const mix = voiceMix(measured({ emojiRate: 1, fragmentRate: 1 }), 30);
    const percents = mix.entries.map((entry) => entry.percent);
    expect([...percents].sort((a, b) => b - a)).toEqual(percents);
  });

  it('omits registers that round to nothing rather than showing 0%', () => {
    const mix = voiceMix(measured(), 30);
    expect(mix.entries.every((entry) => entry.percent > 0)).toBe(true);
  });

  it('never returns a register outside the mixed set', () => {
    const mix = voiceMix(measured({ emojiRate: 0.8 }), 30);
    for (const entry of mix.entries) {
      expect(MIXED_REGISTERS).toContain(entry.register);
    }
  });
});

describe('voiceMix — what it can actually tell apart', () => {
  it('reads a lowercase, clipped, unpunctuated account as Gen Z', () => {
    expect(
      top(
        measured({
          medianWords: 4,
          allLowercaseRate: 0.9,
          lowercaseStartRate: 0.95,
          terminalPunctuationRate: 0.05,
          oneWordRate: 0.3,
          fragmentRate: 0.8,
        }),
      ),
    ).toBe('gen_z');
  });

  it('reads long, punctuated, self-explaining captions as Educational', () => {
    expect(
      top(
        measured({
          medianWords: 80,
          terminalPunctuationRate: 1,
          explainsContextRate: 1,
          emojiRate: 0,
        }),
      ),
    ).toBe('educational');
  });

  it('reads an emoji-heavy, fragmentary account as Playful', () => {
    expect(
      top(
        measured({
          medianWords: 12,
          emojiRate: 1,
          fragmentRate: 0.9,
          terminalPunctuationRate: 0.1,
          allLowercaseRate: 0,
          lowercaseStartRate: 0,
        }),
      ),
    ).toBe('playful');
  });

  it('separates emoji-and-fragments from lowercase-and-clipped', () => {
    const playful = voiceMix(
      measured({ emojiRate: 1, fragmentRate: 0.9, terminalPunctuationRate: 0.1 }),
      30,
    );
    const genZ = voiceMix(
      measured({
        allLowercaseRate: 1,
        lowercaseStartRate: 1,
        terminalPunctuationRate: 0,
        medianWords: 3,
      }),
      30,
    );
    // The distinction that actually matters: these must not read the same.
    expect(playful.entries[0].register).not.toBe(genZ.entries[0].register);
  });

  it('gives an account with no emoji and no hashtag habit a premium share', () => {
    const mix = voiceMix(
      measured({ medianWords: 8, emojiRate: 0, hashtagRate: 0, terminalPunctuationRate: 1 }),
      30,
    );
    const premium = mix.entries.find((entry) => entry.register === 'premium');
    expect(premium?.percent).toBeGreaterThan(0);
  });

  it('never infers bold, controversial or promotional', () => {
    // Those are properties of what a caption argues, not of its shape. Claiming
    // to have measured them would be the panel's one dishonest number.
    expect(MIXED_REGISTERS).not.toContain('bold' as never);
    expect(MIXED_REGISTERS).not.toContain('controversial' as never);
    expect(MIXED_REGISTERS).not.toContain('promotional' as never);
  });

  it('labels every register it can report', () => {
    for (const register of MIXED_REGISTERS) {
      expect(REGISTER_LABEL[register]).toBeTruthy();
    }
  });
});
