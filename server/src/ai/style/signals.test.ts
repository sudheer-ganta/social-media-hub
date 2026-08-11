import { describe, expect, it } from 'vitest';
import {
  deriveSignals,
  sampleWeight,
  situationOf,
  SIGNAL_WEIGHT,
  type HistoryPost,
} from './signals';

/**
 * The weighting is the part of style memory with real consequences and no
 * visible failure mode: get it wrong and nothing breaks, the profile is just
 * quietly built from the wrong evidence and every caption is slightly off.
 *
 * `now` is passed in throughout so the recency decay is tested against fixed
 * dates rather than against the wall clock.
 */

const NOW = new Date('2026-08-11T12:00:00Z').getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000);

const post = (overrides: Partial<HistoryPost> = {}): HistoryPost => ({
  id: 'post-1',
  title: 'gym',
  caption: '',
  published: true,
  updatedAt: daysAgo(1),
  offered: [],
  ...overrides,
});

describe('what a post says about its author', () => {
  it('treats an untouched pick as a selection', () => {
    const [signal] = deriveSignals(
      [post({ caption: 'corporate drama', offered: ['corporate drama', 'office hours'] })],
      [],
      NOW,
    );

    expect(signal.kind).toBe('published_selected');
  });

  it('treats an edited pick as the strongest signal there is', () => {
    // The case the whole design turns on. They took a suggestion, changed it,
    // and published what they changed it to — the edit is the most precise
    // statement of their voice the system will ever get.
    const signals = deriveSignals(
      [
        post({
          caption: 'ok corporate drama fr',
          offered: ['ok corporate drama today', 'a day at the office'],
        }),
      ],
      [],
      NOW,
    );

    expect(signals[0].kind).toBe('published_edited');
    expect(SIGNAL_WEIGHT.published_edited).toBeGreaterThan(
      SIGNAL_WEIGHT.published_selected,
    );
  });

  it('treats a caption unlike anything offered as their own writing', () => {
    const signals = deriveSignals(
      [post({ caption: 'ya maal hai re', offered: ['A day well spent at the gym.'] })],
      [],
      NOW,
    );

    expect(signals.find((s) => s.text === 'ya maal hai re')?.kind).toBe(
      'published_written',
    );
  });

  it('records the options they did not take, quietly', () => {
    const signals = deriveSignals(
      [post({ caption: 'flexing', offered: ['flexing', 'Feeling strong today 💪'] })],
      [],
      NOW,
    );

    const unused = signals.find((s) => s.text === 'Feeling strong today 💪');
    expect(unused?.kind).toBe('generated_unused');
    expect(unused!.weight).toBeLessThan(signals[0].weight);
  });

  it('does not promote a draft to a publication', () => {
    const [signal] = deriveSignals(
      [post({ caption: 'im bored tbh', published: false, offered: ['im bored tbh'] })],
      [],
      NOW,
    );

    expect(signal.kind).toBe('selected');
  });
});

describe('explicit events', () => {
  it('counts a regenerate as evidence against', () => {
    const signals = deriveSignals([], [
      {
        postId: null,
        action: 'caption.regenerated',
        text: 'Embracing the grind today',
        createdAt: daysAgo(2),
      },
    ], NOW);

    expect(signals[0].kind).toBe('rejected');
    expect(signals[0].weight).toBeLessThan(0);
  });

  it('does not double-count a selection that later became a published post', () => {
    const signals = deriveSignals(
      [post({ caption: 'flexing', offered: ['flexing'] })],
      [
        {
          postId: 'post-1',
          action: 'caption.selected',
          text: 'flexing',
          createdAt: daysAgo(1),
        },
      ],
      NOW,
    );

    expect(signals.filter((s) => s.text === 'flexing')).toHaveLength(1);
    // The stronger of the two survives.
    expect(signals[0].kind).toBe('published_selected');
  });
});

describe('recency', () => {
  it('halves a caption’s weight roughly every six months', () => {
    const recent = deriveSignals([post({ id: 'a', caption: 'flexing' })], [], NOW);
    const old = deriveSignals(
      [post({ id: 'b', caption: 'flexing', updatedAt: daysAgo(180) })],
      [],
      NOW,
    );

    expect(old[0].weight / recent[0].weight).toBeCloseTo(0.5, 1);
  });

  it('never lets an old caption outweigh a recent one of the same kind', () => {
    const signals = deriveSignals(
      [
        post({ id: 'a', caption: 'new one', updatedAt: daysAgo(2) }),
        post({ id: 'b', caption: 'old one', updatedAt: daysAgo(400) }),
      ],
      [],
      NOW,
    );

    expect(signals[0].text).toBe('new one');
  });
});

describe('situations', () => {
  it.each([
    [{ subject: 'man lifting a barbell' }, 'gym'],
    [{ setting: 'airport terminal' }, 'travel'],
    [{ subject: 'plate of pasta' }, 'food'],
    [{ subject: 'armoured fantasy character' }, 'art_media'],
    [{ subject: 'a perfectly ordinary doorway' }, 'other'],
  ])('files %j under %s', (context, expected) => {
    expect(situationOf(context)).toBe(expected);
  });

  it('reads the title when there is no image', () => {
    expect(situationOf({ title: 'leg day again' })).toBe('gym');
  });
});

describe('sampleWeight', () => {
  it('counts only the positive signals', () => {
    const signals = deriveSignals(
      [post({ caption: 'flexing', offered: ['flexing', 'Feeling strong 💪'] })],
      [
        {
          postId: null,
          action: 'caption.regenerated',
          text: 'Embracing the grind',
          createdAt: daysAgo(1),
        },
      ],
      NOW,
    );

    // Two positives (the pick and the unused option); the rejection is not a
    // sample of how they write.
    expect(sampleWeight(signals)).toBe(2);
  });
});
