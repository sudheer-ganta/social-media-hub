import { describe, expect, it } from 'vitest';
import { aggregateShape, captionShape, voiceDistance } from './measure';
import { sanitiseBehaviour } from './types';
import { renderStyleSection } from './render';
import type { StyleProfile } from './types';

/**
 * The measured half of a style profile, and the guard that keeps the
 * qualitative half from turning into a word list.
 *
 * The captions below are the kind this product exists to write. Every one of
 * them would be "corrected" by a grammar-aware pipeline, and the measurements
 * have to describe them accurately rather than penalise them.
 */

const CASUAL = [
  'ofc',
  'im bored tbh',
  'corporate drama',
  'flexing',
  'ya maal hai re',
  'unfortunately i ate',
  'no nangu pangu on sat night',
  'chalta firta cocaine hai cocaine',
];

const FORMAL = [
  'Delighted to share that our team has been recognised for its work this year.',
  'A wonderful evening with colleagues at the annual conference.',
  'Grateful for the opportunity to speak at this event.',
  'Reflecting on an excellent quarter for the whole business.',
];

describe('captionShape', () => {
  it('reads a one-word caption as one word', () => {
    const shape = captionShape('ofc');
    expect(shape.words).toBe(1);
    expect(shape.oneWord).toBe(true);
    expect(shape.fragment).toBe(true);
    expect(shape.endsWithTerminalPunctuation).toBe(false);
  });

  it('spots romanised Hindi from its particles, not its subject', () => {
    expect(captionShape('ya maal hai re').romanisedHindi).toBe(true);
    expect(captionShape('gym jaa raha hu ya shaadi mein').romanisedHindi).toBe(true);
    expect(captionShape('just got back from the gym').romanisedHindi).toBe(false);
  });

  it('spots Devanagari', () => {
    expect(captionShape('बहुत बढ़िया').devanagari).toBe(true);
  });

  it('does not call a punctuated sentence a fragment', () => {
    expect(captionShape('This was a lovely evening.').fragment).toBe(false);
  });

  it('counts emoji rather than characters', () => {
    expect(captionShape('gym 🔥🔥').emoji).toBe(2);
    expect(captionShape('nothing here').emoji).toBe(0);
  });
});

describe('aggregateShape', () => {
  const casual = aggregateShape(CASUAL);
  const formal = aggregateShape(FORMAL);

  it('describes a casual writer as short, lowercase and unpunctuated', () => {
    expect(casual.medianWords).toBeLessThanOrEqual(4);
    expect(casual.allLowercaseRate).toBe(1);
    expect(casual.terminalPunctuationRate).toBe(0);
    expect(casual.fragmentRate).toBe(1);
  });

  it('picks up the language mix as a rate', () => {
    expect(casual.scriptMix.romanisedHindi).toBeGreaterThan(0.2);
    expect(formal.scriptMix.romanisedHindi).toBe(0);
  });

  it('describes a formal writer as the opposite', () => {
    expect(formal.medianWords).toBeGreaterThan(8);
    expect(formal.terminalPunctuationRate).toBe(1);
    expect(formal.allLowercaseRate).toBe(0);
  });

  it('survives an empty history', () => {
    const empty = aggregateShape([]);
    expect(empty.medianWords).toBe(0);
    expect(empty.oneWordRate).toBe(0);
  });
});

describe('voiceDistance', () => {
  const casual = aggregateShape(CASUAL);

  it('rates a caption in their own register as close', () => {
    expect(voiceDistance(captionShape('bro what'), casual)).toBeLessThan(0.2);
  });

  it('rates a marketing paragraph as far away', () => {
    const distance = voiceDistance(
      captionShape(
        'Delighted to share a wonderful evening celebrating everything our incredible team has achieved this year.',
      ),
      casual,
    );
    expect(distance).toBeGreaterThan(0.5);
  });

  it('does not punish a one-word caption from a short writer', () => {
    expect(voiceDistance(captionShape('ofc'), casual)).toBeLessThan(0.2);
  });
});

describe('the no-vocabulary guard', () => {
  it('accepts a behaviour', () => {
    expect(sanitiseBehaviour('jokes at their own expense')).toBe(
      'jokes at their own expense',
    );
  });

  it('rejects a quoted example', () => {
    expect(sanitiseBehaviour('favours "bro" and "ate"')).toBeNull();
    expect(sanitiseBehaviour('says ‘unfortunately’ a lot')).toBeNull();
  });

  it('rejects a word list wearing a sentence', () => {
    expect(sanitiseBehaviour('bro, ate, drama, cocaine')).toBeNull();
  });

  it('keeps a description that happens to contain commas', () => {
    expect(
      sanitiseBehaviour('flat about big things, dramatic about small ones'),
    ).not.toBeNull();
  });
});

describe('renderStyleSection', () => {
  const profile = (overrides: Partial<StyleProfile> = {}): StyleProfile => ({
    version: 1,
    confidence: 'high',
    sampleCount: 30,
    global: { measured: aggregateShape(CASUAL) },
    situational: [],
    avoids: [],
    builtAt: new Date().toISOString(),
    ...overrides,
  });

  it('turns rates into instructions, never numbers', () => {
    const section = renderStyleSection(profile());
    expect(section).toContain('Almost always all lowercase');
    expect(section).toContain('Fragments, not sentences');
    // The thing that must never appear: a raw rate.
    expect(section).not.toMatch(/0\.\d/);
  });

  it('renders nothing at cold start', () => {
    expect(renderStyleSection(profile({ confidence: 'none' }))).toBeNull();
    expect(renderStyleSection(null)).toBeNull();
  });

  it('flags a thin profile as one to hold loosely', () => {
    expect(renderStyleSection(profile({ confidence: 'low' }))).toContain(
      'hold the rest loosely',
    );
  });
});
