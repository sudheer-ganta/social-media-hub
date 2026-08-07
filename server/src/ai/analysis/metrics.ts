import type { CaptionMetrics } from '../types';

/**
 * Everything about a caption that can be counted.
 *
 * ─── The rule this file exists to enforce ────────────────────────────────────
 * **A model is never asked a question `String.prototype` can answer.**
 *
 * Character count, hashtag count, paragraph count, reading time — these are
 * arithmetic. Asking a model for them costs a round trip, costs tokens, and is
 * occasionally wrong: a model asked to count the hashtags in an eleven-tag
 * caption will confidently answer ten often enough to matter, and a scoring
 * system built on that number inherits the error silently.
 *
 * So the split through the whole analyser is:
 *
 *   deterministic code → what the caption *is*   (this file)
 *   the model          → whether it is any good  (analysis.prompt.ts)
 *
 * These metrics are computed first and passed *into* the prompt as stated fact,
 * which has a second benefit beyond correctness: a model that does not have to
 * count can spend its attention on the judgement it is actually there for.
 */

/** Average adult reading speed for social copy. Deliberately not book-reading speed. */
const WORDS_PER_MINUTE = 200;

/**
 * Emoji, including the multi-codepoint ones.
 *
 * `\p{Extended_Pictographic}` matches the base characters; the rest of the
 * pattern absorbs skin-tone modifiers, variation selectors and ZWJ sequences so
 * that a single 👩‍👩‍👧‍👦 counts as one emoji rather than four. Getting this wrong
 * in the other direction is what makes an emoji-usage check fire on a caption
 * with one family emoji in it.
 */
const EMOJI =
  /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|️)?(?:‍\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|️)?)*/gu;

const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu;
const MENTION = /(^|\s)@[\p{L}\p{N}_.]+/gu;
const URL = /https?:\/\/\S+|\bwww\.\S+/gi;

/** Sentence terminators, including the ones a social caption actually uses. */
const SENTENCE_SPLIT = /[.!?…]+[\s"')\]]*/;

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Syllables in one English word, by the standard vowel-group heuristic.
 *
 * Approximate by construction — it reads "queue" as two and "fire" as one. That
 * is tolerable because the only consumer is {@link readingEase}, which is
 * itself a band rather than a measurement, and the error averages out across a
 * caption. It is not tolerable to present the output as precise, which is why
 * `readingEase` is reported as a 0–100 score and never as a grade level.
 */
function syllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length === 0) return 0;
  if (clean.length <= 3) return 1;

  const groups = clean
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);

  return Math.max(1, groups?.length ?? 1);
}

/**
 * Flesch Reading Ease, 0–100. Higher is easier.
 *
 * Calibrated on English prose, and this app generates in whatever language the
 * user asked for. Rather than report a meaningless number for Japanese, the
 * analyser treats reading ease as *one input among several* and the readability
 * dimension is scored by the model, which can read the language it is looking
 * at. This number is context handed to it, not a verdict handed down.
 */
function readingEase(text: string): number {
  const wordList = words(text);
  const sentenceCount = Math.max(1, countSentences(text));
  if (wordList.length === 0) return 0;

  const syllableTotal = wordList.reduce((sum, word) => sum + syllables(word), 0);
  const score =
    206.835 -
    1.015 * (wordList.length / sentenceCount) -
    84.6 * (syllableTotal / wordList.length);

  return Math.round(Math.min(100, Math.max(0, score)));
}

function countSentences(text: string): number {
  const stripped = text.replace(URL, ' ').trim();
  if (!stripped) return 0;
  const parts = stripped.split(SENTENCE_SPLIT).filter((part) => part.trim().length > 0);
  // A caption with no terminal punctuation at all is still one sentence, not
  // zero — and dividing by zero is how a readability score becomes Infinity.
  return Math.max(1, parts.length);
}

/**
 * Paragraphs, in the sense a feed renders them: blocks separated by a blank
 * line. A caption written as six consecutive single lines is one paragraph by
 * this count, which is exactly the shape the LinkedIn spacing check is looking
 * for.
 */
function countParagraphs(text: string): number {
  return text.split(/\n\s*\n/).filter((block) => block.trim().length > 0).length;
}

function longestParagraph(text: string): number {
  const blocks = text.split(/\n\s*\n/).filter((block) => block.trim().length > 0);
  return blocks.reduce((max, block) => Math.max(max, words(block).length), 0);
}

/**
 * The first line, which is the only part of a caption guaranteed to be read.
 *
 * Taken as the first *line* rather than the first sentence: feeds truncate on
 * rendered lines, and a caption whose opening sentence runs across a manual
 * line break has already been cut before its full stop arrives.
 */
export function hookLine(caption: string): string {
  return caption.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? '';
}

/** Counts one caption. Pure, total, and never throws — an empty string is valid input. */
export function measureCaption(caption: string): CaptionMetrics {
  const text = caption ?? '';
  const wordList = words(text);
  const sentenceCount = countSentences(text);
  const hook = hookLine(text);

  return {
    characterCount: text.length,
    wordCount: wordList.length,
    sentenceCount,
    paragraphCount: countParagraphs(text),
    lineCount: text.split(/\r?\n/).filter((line) => line.trim().length > 0).length,
    emojiCount: count(text, EMOJI),
    hashtagCount: count(text, HASHTAG),
    mentionCount: count(text, MENTION),
    linkCount: count(text, URL),
    readingTimeSeconds: Math.max(
      1,
      Math.ceil((wordList.length / WORDS_PER_MINUTE) * 60),
    ),
    averageWordsPerSentence:
      sentenceCount > 0
        ? Math.round((wordList.length / sentenceCount) * 10) / 10
        : 0,
    longestParagraphWords: longestParagraph(text),
    readingEase: readingEase(text),
    hookCharacterCount: hook.length,
    endsWithQuestion: /\?[\s"')\]]*$/.test(text.trim()),
  };
}

/**
 * Whether the caption asks the reader to do something.
 *
 * A heuristic, and labelled as one wherever it is consumed. It catches the
 * explicit forms — an imperative verb, a link, a question — and misses the
 * implicit ones ("we open at nine"), which is why the `cta` dimension is scored
 * by the model and this only feeds the checklist. A checklist item that says
 * "no clear CTA" on a caption that has a subtle one is a nudge; a *score* that
 * marked it down would be wrong.
 */
export function looksLikeCta(caption: string, metrics: CaptionMetrics): boolean {
  if (metrics.linkCount > 0) return true;
  if (metrics.endsWithQuestion) return true;

  // Checked against the closing sentences, where a call to action actually
  // lives. Two refinements, each of which fixed a real misread:
  //
  //  1. **Sentences, not a percentage of the string.** Slicing at a character
  //     offset cuts words in half, and a tail beginning "…k a winter date" no
  //     longer contains "book" — so a caption closing on a perfectly clear
  //     "Book a winter date" was reported as having no CTA at all.
  //
  //  2. **The verb has to be imperative.** A call to action is an instruction,
  //     which in English puts the verb at the front of its clause. Matching the
  //     verb anywhere fires on "We share a lot of stories about this room",
  //     where "share" is describing what the brand does, not asking anything.
  //     Requiring clause-initial position costs nothing real — nobody writes a
  //     CTA with the verb buried mid-clause — and removes the whole class.
  return closingClauses(caption).some((clause) => CTA_OPENING.test(clause));
}

/**
 * The CTA verbs, anchored to the start of a clause.
 *
 * The optional prefix absorbs the connectives a CTA is commonly hung off
 * ("so book now", "→ shop the collection") and any leading emoji, which is a
 * near-universal convention for pointing at a link.
 */
const CTA_OPENING =
  /^(?:\p{Extended_Pictographic}|[→⇒>▶•\-–—\s"'(])*(?:and|then|so|now|just|please|go|why not)?\s*(?:comment|drop|share|save|tag|book|shop|order|call|dm|message|sign up|subscribe|register|join|download|learn more|read more|find out|click|swipe|visit|explore|get yours|check out|grab|claim|discover|try)\b/iu;

/**
 * The closing sentences, split further into clauses.
 *
 * Clause-level rather than sentence-level because a CTA is regularly the second
 * half of a sentence — "Doors open at seven, book before they go" is one
 * sentence and two instructions, and only the second one is the ask.
 */
function closingClauses(caption: string, sentenceCount = 2): string[] {
  const sentences = caption
    .replace(URL, ' ')
    .split(SENTENCE_SPLIT)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(-sentenceCount);

  return sentences
    .flatMap((sentence) => sentence.split(/[,;:\n]+|\s+[–—]\s+/))
    .map((clause) => clause.trim())
    .filter(Boolean);
}
