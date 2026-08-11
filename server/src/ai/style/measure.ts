import { contentTokens, normalise, tokens } from '../personal/filters';

/**
 * The half of a style profile that is arithmetic.
 *
 * Same division of labour as `analysis/metrics.ts`, and for the same reason
 * given at the top of `prompts/analysis.prompt.ts`: a model asked to count is
 * slower, occasionally wrong, and — the part that actually changes the output —
 * spends attention on counting that it would otherwise spend on judging. Every
 * number below is computed here and handed to the model as ground truth, so the
 * only thing it is ever asked about someone's writing is the part a number
 * cannot hold.
 *
 * ─── What this file is forbidden from producing ──────────────────────────────
 * Vocabulary. Not one field here stores a word this person used. A profile that
 * remembers "they say bro" produces captions that say bro; a profile that
 * remembers "94% of their captions are under six words, almost never
 * punctuated, and mix scripts a third of the time" produces captions that sound
 * like them without reusing anything they wrote.
 *
 * The romanised-Hindi marker list below is the one place words appear, and it
 * is a *detector* — it never leaves this file and nothing derived from it is
 * stored beyond a ratio.
 */

/** Emoji, matching `personal/filters.ts`. */
const EMOJI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;

/**
 * Function words that mark a caption as romanised Hindi.
 *
 * Particles and auxiliaries only — the words that appear in *any* Hinglish
 * sentence regardless of subject. Content words would make this a topic
 * detector rather than a language one.
 *
 * ─── The words deliberately not in here ──────────────────────────────────────
 * Anything that is also a common English word. `the` is the transliteration of
 * थे and belongs in a complete list — and putting it in one made "just got back
 * from the gym" read as Hinglish, which is to say it made *most English
 * sentences* read as Hinglish. `hi`, `to`, `me` and `so` are out for the same
 * reason. Losing a few genuine matches is the cheap error here; the expensive
 * one is telling the writer that a member who writes in English mixes scripts,
 * because it will then write them Hinglish captions.
 */
const ROMANISED_HINDI_MARKERS = new Set([
  'hai', 'hain', 'hu', 'hun', 'tha', 'thi', 'raha', 'rahi',
  'rahe', 'kar', 'karo', 'karke', 'ka', 'ki', 'ke', 'ko', 'mein',
  'aur', 'yeh', 'woh', 'toh', 'bhi', 'nahi', 'nahin', 'kya',
  'kyu', 'kyun', 'bahut', 'bohot', 'thoda', 'matlab', 'yaar', 'bhai',
  'abey', 'arre', 'acha', 'accha', 'mera', 'meri', 'tera', 'teri', 'apna',
]);

const DEVANAGARI = /\p{Script=Devanagari}/u;

/** A caption long enough that it is explaining itself rather than just landing. */
const EXPLAINING_WORDS = 15;
/** Under this, with no full stop, is a fragment rather than a sentence. */
const FRAGMENT_WORDS = 8;

/** What one caption looks like, mechanically. */
export interface CaptionShape {
  words: number;
  oneWord: boolean;
  allLowercase: boolean;
  startsLowercase: boolean;
  endsWithTerminalPunctuation: boolean;
  /** Short and unpunctuated — a thought rather than a sentence. */
  fragment: boolean;
  emoji: number;
  hashtags: number;
  mentions: number;
  devanagari: boolean;
  romanisedHindi: boolean;
  /** Long enough that it is spelling the context out. */
  explaining: boolean;
}

export function captionShape(text: string): CaptionShape {
  const trimmed = text.trim();
  const words = tokens(trimmed);
  const letters = trimmed.replace(/[^\p{L}]/gu, '');

  return {
    words: words.length,
    oneWord: words.length === 1,
    allLowercase: letters.length > 0 && letters === letters.toLowerCase(),
    startsLowercase: /^\p{Ll}/u.test(trimmed),
    endsWithTerminalPunctuation: /[.!?]$/.test(trimmed),
    fragment: !/[.!?]$/.test(trimmed) && words.length <= FRAGMENT_WORDS,
    emoji: (trimmed.match(EMOJI) ?? []).length,
    hashtags: (trimmed.match(/#\w/g) ?? []).length,
    mentions: (trimmed.match(/@\w/g) ?? []).length,
    devanagari: DEVANAGARI.test(trimmed),
    romanisedHindi: words.some((word) => ROMANISED_HINDI_MARKERS.has(word)),
    explaining: words.length >= EXPLAINING_WORDS,
  };
}

/**
 * The `measured` block of a style profile.
 *
 * Rates rather than counts throughout, so a member with 8 captions and one with
 * 200 produce a profile the same renderer and the same distance function can
 * read. Every value is 0–1 except the two word counts.
 */
export interface MeasuredStyle {
  medianWords: number;
  p90Words: number;
  oneWordRate: number;
  allLowercaseRate: number;
  lowercaseStartRate: number;
  terminalPunctuationRate: number;
  fragmentRate: number;
  emojiRate: number;
  hashtagRate: number;
  mentionRate: number;
  scriptMix: {
    english: number;
    romanisedHindi: number;
    devanagari: number;
  };
  explainsContextRate: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index];
}

function rate(shapes: CaptionShape[], predicate: (s: CaptionShape) => boolean): number {
  if (shapes.length === 0) return 0;
  return Number((shapes.filter(predicate).length / shapes.length).toFixed(3));
}

/** Rolls a set of captions into the measured half of a profile. */
export function aggregateShape(captions: string[]): MeasuredStyle {
  const shapes = captions.map(captionShape).filter((shape) => shape.words > 0);
  const lengths = shapes.map((shape) => shape.words).sort((a, b) => a - b);

  return {
    medianWords: percentile(lengths, 0.5),
    p90Words: percentile(lengths, 0.9),
    oneWordRate: rate(shapes, (s) => s.oneWord),
    allLowercaseRate: rate(shapes, (s) => s.allLowercase),
    lowercaseStartRate: rate(shapes, (s) => s.startsLowercase),
    terminalPunctuationRate: rate(shapes, (s) => s.endsWithTerminalPunctuation),
    fragmentRate: rate(shapes, (s) => s.fragment),
    emojiRate: rate(shapes, (s) => s.emoji > 0),
    hashtagRate: rate(shapes, (s) => s.hashtags > 0),
    mentionRate: rate(shapes, (s) => s.mentions > 0),
    scriptMix: {
      english: rate(shapes, (s) => !s.romanisedHindi && !s.devanagari),
      romanisedHindi: rate(shapes, (s) => s.romanisedHindi),
      devanagari: rate(shapes, (s) => s.devanagari),
    },
    explainsContextRate: rate(shapes, (s) => s.explaining),
  };
}

/**
 * How far one caption sits from a measured style. 0 is identical, 1 is alien.
 *
 * Weighted by how loudly each trait announces that someone else wrote it.
 * Length leads: a member whose captions run four words getting back a
 * forty-word paragraph is the single most obvious failure this system has, and
 * no amount of correct casing rescues it. Punctuation and casing follow,
 * because they are what a reader clocks before they have read a word.
 *
 * Rates are compared against a binary — "does this caption do the thing" versus
 * "how often do they do the thing" — which is deliberately forgiving in the
 * middle: a member who is lowercase 50% of the time is charged 0.5 either way,
 * so neither choice is punished.
 */
export function voiceDistance(shape: CaptionShape, style: MeasuredStyle): number {
  const target = Math.max(style.medianWords, 1);
  // Ratio rather than difference: 4 words against a median of 3 is a fine
  // caption, 40 against 3 is a different person. An absolute gap cannot tell
  // those apart without knowing the median it is being measured against.
  const lengthRatio = Math.abs(Math.log2((shape.words || 1) / target));
  const lengthPenalty = Math.min(1, lengthRatio / 3);

  const terms: Array<[number, number]> = [
    [0.32, lengthPenalty],
    [0.16, Math.abs((shape.allLowercase ? 1 : 0) - style.allLowercaseRate)],
    [0.14, Math.abs((shape.endsWithTerminalPunctuation ? 1 : 0) - style.terminalPunctuationRate)],
    [0.12, Math.abs((shape.fragment ? 1 : 0) - style.fragmentRate)],
    [0.10, Math.abs((shape.emoji > 0 ? 1 : 0) - style.emojiRate)],
    [0.08, Math.abs((shape.romanisedHindi || shape.devanagari ? 1 : 0) - (style.scriptMix.romanisedHindi + style.scriptMix.devanagari))],
    [0.08, Math.abs((shape.explaining ? 1 : 0) - style.explainsContextRate)],
  ];

  const total = terms.reduce((sum, [weight, value]) => sum + weight * value, 0);
  return Number(Math.min(1, total).toFixed(3));
}

/**
 * Whether a caption picks up anything concrete from the picture.
 *
 * A bonus and never a requirement — "im bored tbh" under a photo of a mountain
 * is a perfectly good caption, and a system that scored it down for not
 * mentioning the mountain would be a marketing system again. It exists only to
 * break ties between candidates that are otherwise equally on-voice.
 */
export function imageConnection(text: string, observations: string[]): number {
  const nouns = new Set(
    observations.flatMap((entry) => contentTokens(entry)).filter((w) => w.length > 3),
  );
  if (nouns.size === 0 || !normalise(text)) return 0;
  return tokens(text).some((word) => nouns.has(word)) ? 1 : 0;
}
