import type { MeasuredStyle } from './measure';

/**
 * How one person writes.
 *
 * ─── The rule this whole file exists to enforce ──────────────────────────────
 * **Behaviour, never vocabulary.** There is no field here that can hold a word
 * somebody used, and `sanitiseBehaviour` below actively rejects one that tries
 * to smuggle a phrase through in a description.
 *
 * The difference decides whether the product works. A profile that remembers
 * "they say bro, ate, drama" produces captions containing bro, ate and drama —
 * their greatest hits, replayed, which is a template generator with extra
 * steps. A profile that remembers "median four words, almost never punctuated,
 * mixes scripts a third of the time, jokes at their own expense, names a
 * reference and never explains it" produces a *new* joke that sounds like them.
 *
 * ─── The three blocks ────────────────────────────────────────────────────────
 *   global       how they write, across everything.
 *   situational  how they write about a gym photo specifically, which is often
 *                a different person from how they write about a holiday.
 *   references   whether they reach for culture at all, what kind, and how they
 *                handle it — bare, or explained. The kinds are categories
 *                ("celebrity", "song"); never a name.
 */

/** Fewer signals than this is not a style, it is a coincidence. */
export const STYLE_MIN_SAMPLES = 5;

/** Below this, the measured block is reported but the behaviour block is not. */
export const STYLE_CONFIDENT_SAMPLES = 20;

export const STYLE_PROFILE_VERSION = 1;

/**
 * How much of this to believe.
 *
 * `none` is a real, honest answer and the reason the prompt has a cold-start
 * branch. A new member gets told there is no style yet rather than handed a
 * personality inferred from three captions — which would be both wrong and,
 * to them, obviously wrong.
 */
export type StyleConfidence = 'none' | 'low' | 'medium' | 'high';

/**
 * The qualitative half. Every value is a short phrase describing *what they do*.
 *
 * Deliberately six named slots rather than free-form prose: a model given a
 * blank page writes a paragraph of character sketch, and a character sketch is
 * exactly the thing that gets performed rather than followed.
 */
export interface BehaviourStyle {
  /** e.g. "says the least that will do". */
  brevity: string;
  /** e.g. "self-deprecating, rarely at anyone else's expense". */
  humour: string;
  /** e.g. "flat about big things, dramatic about small ones". */
  emotionalRange: string;
  /** e.g. "often unrelated to the picture entirely". */
  randomness: string;
  /** e.g. "assumes you already know; explains nothing". */
  contextDependence: string;
  /** e.g. "poses as unbothered while obviously bothered". */
  selfPresentation: string;
}

/** How they write about one kind of post. */
export interface SituationalStyle {
  /** One of the buckets in `retrieve.ts`. */
  situation: string;
  /** How many captions this is drawn from. */
  n: number;
  measured: MeasuredStyle;
  /** One line on what changes about them here. */
  behaviour: string;
}

/**
 * Whether they reach for culture, and how.
 *
 * `kinds` holds categories and nothing else. "celebrity" is a behaviour;
 * "Dua Lipa" is vocabulary, and storing it would put her name in the next
 * caption whether or not the picture had anything to do with her.
 */
export interface ReferenceStyle {
  /** 0–1. How often a caption of theirs reaches for one. */
  rate: number;
  /** Categories only: celebrity, song, film, tv, meme, sport, game, politics. */
  kinds: string[];
  /** e.g. "names it bare, never explains it". */
  handling: string;
}

export interface StyleProfile {
  version: number;
  confidence: StyleConfidence;
  /** Weighted signals behind it. See `signals.ts` for what counts. */
  sampleCount: number;
  global: {
    measured: MeasuredStyle;
    /** Absent below STYLE_MIN_SAMPLES — see StyleConfidence. */
    behaviour?: BehaviourStyle;
  };
  situational: SituationalStyle[];
  references?: ReferenceStyle;
  /** Behaviours they avoid. Never words. */
  avoids: string[];
  builtAt: string;
}

/** The categories a reference may be filed under. Closed on purpose. */
export const REFERENCE_KINDS = [
  'celebrity',
  'song',
  'film',
  'tv',
  'meme',
  'sport',
  'game',
  'politics',
  'internet',
] as const;

/**
 * Strips anything that looks like vocabulary out of a behavioural description.
 *
 * The second half of the no-vocabulary rule, and the half that runs. The
 * profile prompt asks the model not to name words; this makes it true.
 *
 * Two rejections:
 *  - a quoted phrase, which is how a model shows you an example, and
 *  - a bare comma-list of short words, which is how it produces a lexicon while
 *    technically answering the question it was asked.
 *
 * Returns null for anything that fails, and the caller drops the field rather
 * than storing a poisoned one — a missing behaviour costs the prompt one line,
 * while a behaviour reading `favours "bro" and "ate"` costs it the product.
 */
export function sanitiseBehaviour(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 120);
  if (!trimmed) return null;

  // A quotation mark of any flavour means an example is being shown.
  if (/["'“”‘’`]/.test(trimmed)) return null;

  // Four or more comma-separated fragments of one or two words each is a word
  // list with commas in it, whatever the sentence around it claims.
  const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 4 && parts.every((part) => part.split(/\s+/).length <= 2)) {
    return null;
  }

  return trimmed;
}
