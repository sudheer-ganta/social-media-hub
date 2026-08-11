/**
 * What a personal caption is not allowed to be.
 *
 * Everything in this file could have been a paragraph in the prompt. It is
 * here instead for three reasons, and the third is the one that matters:
 *
 *  1. It is free. No tokens, no round trip, no latency.
 *  2. It is reviewable. A banned-phrase list in code can be read, tested and
 *     argued with by someone who will never open a prompt file.
 *  3. **A model asked not to write something has to think about it.** Telling a
 *     model "never say it's giving" spends part of its attention holding a
 *     phrase in mind. Checking afterwards costs it nothing, and the prompt gets
 *     to be about what to write instead of about what to avoid.
 *
 * Two jobs: reject copy that reads as AI, and reject a joke this person has
 * already made. The second is the harder one and the more important — a system
 * that learns someone's voice and then replays their greatest hits is a
 * template generator wearing a style profile.
 */

// ─── Normalisation ───────────────────────────────────────────────────────────

/** Emoji, symbols, and the variation selectors that trail them. */
const EMOJI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;

/**
 * One caption, reduced to the words in it.
 *
 * Case, punctuation and emoji are exactly the things this product refuses to
 * "correct", so they are stripped for comparison and never for storage: "ya
 * maal hai re" and "Ya maal hai re!!" are the same joke twice.
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(EMOJI, ' ')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(text: string): string[] {
  const normalised = normalise(text);
  return normalised ? normalised.split(' ') : [];
}

/**
 * Words that carry no joke.
 *
 * English function words plus the romanised Hindi particles that show up in
 * every Hinglish caption ever written. Without the second group, "ye toh bahut
 * hi zyada hai" and "ye toh bahut hi kam hai" score as near-identical on
 * content overlap, which they are not.
 *
 * Deliberately short. A long stopword list starts eating the words that
 * actually distinguish two captions.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'so', 'to', 'of', 'in', 'on',
  'at', 'by', 'for', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'i', 'me', 'my', 'you', 'your', 'it', 'its', 'this', 'that', 'these',
  'those', 'he', 'she', 'they', 'we', 'us', 'them', 'his', 'her', 'their',
  'do', 'does', 'did', 'no', 'not', 'as', 'like', 'just', 'now', 'then',
  'hai', 'hain', 'ho', 'hu', 'hun', 'tha', 'thi', 'the', 'ka', 'ki', 'ke',
  'ko', 'se', 'me', 'mein', 'par', 'aur', 'ye', 'yeh', 'wo', 'woh', 'toh',
  'to', 'bhi', 'hi', 'na', 'nahi', 'kya', 'ab', 'jo', 'ek',
]);

export function contentTokens(text: string): string[] {
  return tokens(text).filter((token) => !STOPWORDS.has(token));
}

// ─── Similarity ──────────────────────────────────────────────────────────────

function dice<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

function trigrams(text: string): Set<string> {
  const padded = normalise(text);
  const set = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i += 1) set.add(padded.slice(i, i + 3));
  return set;
}

/** Character-level overlap. Catches a caption reworded a word at a time. */
export function trigramSimilarity(a: string, b: string): number {
  return dice(trigrams(a), trigrams(b));
}

/** Content-word overlap. Catches the same joke with one noun swapped. */
export function tokenSimilarity(a: string, b: string): number {
  return dice(new Set(contentTokens(a)), new Set(contentTokens(b)));
}

/**
 * The opening two words of a short caption — its joke frame.
 *
 * "to be like dua lipa" and "to be like zendaya" share almost no content words
 * and only 0.55 of their trigrams, so the two tests above both wave them
 * through. They are obviously the same joke. On a short caption the frame *is*
 * the joke, and the words after it are only the punchline being swapped out.
 *
 * Only applied to short captions: two long captions that happen to open "i
 * think" are not related, while two four-word ones that do almost always are.
 */
const FRAME_MAX_TOKENS = 5;

function frame(text: string): string | null {
  const words = tokens(text);
  if (words.length < 2 || words.length > FRAME_MAX_TOKENS) return null;
  return `${words[0]} ${words[1]}`;
}

/** Any hit means "this is a caption they have already written". */
const TRIGRAM_THRESHOLD = 0.6;
const TOKEN_THRESHOLD = 0.5;

/**
 * Whether `candidate` is a rerun of `previous`, and which test caught it.
 *
 * ponytail: lexical only. It will miss a genuinely reworded joke that shares no
 * words with the original ("corporate drama" → "the office is a soap opera").
 * Upgrade to embedding cosine when that shows up in real output; the three
 * tests below cover the swap-one-word case, which is what actually happens.
 */
export function repeatReason(candidate: string, previous: string): string | null {
  if (!normalise(candidate) || !normalise(previous)) return null;

  if (normalise(candidate) === normalise(previous)) return 'identical';

  const trigram = trigramSimilarity(candidate, previous);
  if (trigram >= TRIGRAM_THRESHOLD) {
    return `too close to a previous caption (${trigram.toFixed(2)} character overlap)`;
  }

  const token = tokenSimilarity(candidate, previous);
  if (token >= TOKEN_THRESHOLD) {
    return `same joke as a previous caption (${token.toFixed(2)} word overlap)`;
  }

  const candidateFrame = frame(candidate);
  if (candidateFrame && candidateFrame === frame(previous)) {
    return `same joke frame as a previous caption ("${candidateFrame}…")`;
  }

  return null;
}

/** The first rerun found across a list, or null. */
export function repeatsAny(candidate: string, previous: string[]): string | null {
  for (const entry of previous) {
    const reason = repeatReason(candidate, entry);
    if (reason) return reason;
  }
  return null;
}

// ─── Anti-AI ─────────────────────────────────────────────────────────────────

/**
 * Phrases that mean a model wrote this.
 *
 * Two groups. The first is generic social-media filler that has never once been
 * typed by a person about their own photograph. The second is AI's impression
 * of internet slang — worse than the first, because it is trying.
 *
 * Matched against the normalised caption, so punctuation and casing cannot
 * smuggle one through.
 */
const AI_PHRASES = [
  // Filler
  'embracing the journey', 'living my best life', 'making memories',
  'chasing dreams', 'good vibes', 'grateful for', 'blessed to',
  'here is to', 'heres to', 'where dreams meet', 'in a world where',
  'every step of the way', 'unwavering', 'little moments', 'soaking it all in',
  'life update', 'happy place', 'my heart is full', 'cherish',
  // Marketing verbs
  'level up', 'unlock', 'elevate', 'unleash', 'dive in', 'game changer',
  'look no further', 'say goodbye to', 'introducing', 'picture this',
  // AI doing Gen Z
  'main character energy', 'it is giving', 'its giving', 'no cap',
  'understood the assignment', 'serving looks', 'ate and left no crumbs',
  'bestie', 'slay', 'rizz', 'living rent free', 'the assignment',
  'core memory', 'iykyk', 'lets gooo', 'obsessed with this',
];

/** Engagement bait. None of it belongs on a personal post. */
const BAIT_PHRASES = [
  'comment below', 'let me know in the comments', 'double tap', 'tag someone',
  'tag a friend', 'link in bio', 'drop a', 'who else', 'thoughts',
  'swipe up', 'follow for more', 'save this', 'share this',
];

const MAX_EMOJI = 2;

function countEmoji(text: string): number {
  return (text.match(EMOJI) ?? []).length;
}

/**
 * Whether the caption is just a description of the photograph.
 *
 * The bar is high on purpose: three or more things Vision actually saw, in a
 * caption long enough to be a sentence, joined by a copula. "gym jaa raha hu ya
 * shaadi mein" names one thing and is not a description; "a man in a black suit
 * standing in a stone hall" names three and is.
 *
 * ponytail: crude noun matching against the observation fields. It cannot tell
 * a description from a joke that happens to reuse three nouns. The length and
 * copula conditions are what keep the false-positive rate survivable — revisit
 * with a proper check only if real captions start getting caught.
 */
function describesTheImage(text: string, observations: string[]): boolean {
  const words = tokens(text);
  if (words.length < 8) return false;
  if (!/\b(is|are|was|were)\b/.test(normalise(text))) return false;

  const nouns = new Set(
    observations.flatMap((entry) => contentTokens(entry)).filter((w) => w.length > 3),
  );
  const hits = new Set(words.filter((word) => nouns.has(word)));
  return hits.size >= 3;
}

export interface AiRejectOptions {
  /** Vision's observation fields, for the describes-the-photo check. */
  observations?: string[];
}

/**
 * Why this caption reads as machine-written, or null if it does not.
 *
 * Returns a reason rather than a boolean so the repair pass can quote it and
 * the log can explain a short list of options to whoever is debugging one.
 */
export function aiRejectReason(
  text: string,
  { observations = [] }: AiRejectOptions = {},
): string | null {
  const flat = normalise(text);
  if (!flat) return 'empty';

  const phrase = AI_PHRASES.find((entry) => flat.includes(entry));
  if (phrase) return `AI phrase: "${phrase}"`;

  const bait = BAIT_PHRASES.find((entry) => flat.includes(entry));
  if (bait) return `engagement bait: "${bait}"`;

  // Personal posts carry no tags. The composer no longer appends them either —
  // this catches the model adding its own.
  if (/#\w/.test(text)) return 'hashtag on a personal caption';

  if (countEmoji(text) > MAX_EMOJI) return 'emoji pile';

  if (describesTheImage(text, observations)) return 'describes the photo';

  return null;
}

// ─── The filter ──────────────────────────────────────────────────────────────

export interface Candidate {
  text: string;
  behaviour: string;
}

export interface DroppedCandidate extends Candidate {
  reason: string;
}

export interface FilterResult {
  kept: Candidate[];
  dropped: DroppedCandidate[];
}

export interface FilterOptions {
  /** This member's real captions, from `style/retrieve.ts`. */
  history?: string[];
  /** Vision's observation fields. */
  observations?: string[];
}

/**
 * Runs every candidate past both jobs.
 *
 * Order matters. Candidates are checked against history *and* against the
 * siblings already kept, so a batch that returns the same joke three times
 * keeps one of them rather than all three — the model reaching for its own
 * favourite is exactly as much of a template as reaching for the member's.
 *
 * Nothing is dropped silently: everything rejected comes back in `dropped`
 * with its reason, so a short list of options is explainable rather than
 * mysterious.
 */
export function filterCandidates(
  candidates: Candidate[],
  { history = [], observations = [] }: FilterOptions = {},
): FilterResult {
  const kept: Candidate[] = [];
  const dropped: DroppedCandidate[] = [];

  for (const candidate of candidates) {
    const text = candidate.text.trim();
    if (!text) {
      dropped.push({ ...candidate, reason: 'empty' });
      continue;
    }

    const aiReason = aiRejectReason(text, { observations });
    if (aiReason) {
      dropped.push({ ...candidate, reason: aiReason });
      continue;
    }

    const repeat = repeatsAny(text, [
      ...history,
      ...kept.map((entry) => entry.text),
    ]);
    if (repeat) {
      dropped.push({ ...candidate, reason: repeat });
      continue;
    }

    kept.push({ ...candidate, text });
  }

  return { kept, dropped };
}
