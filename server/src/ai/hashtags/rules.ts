import { sharedHashtagBand } from '../analysis/platform-rules';

/**
 * The deterministic half of hashtag generation.
 *
 * Cleaning, the spam filter and the platform ceiling are arithmetic and string
 * work, so a model is not asked to do any of them. It is asked for *relevance*,
 * which is the only part of the job it is better at than a regular expression —
 * the same division of labour `ai/analysis` keeps between counted metrics and
 * judged ones.
 */

/**
 * Tags that are noise on essentially every post.
 *
 * Not banned outright. Two exemptions, both evidence-based:
 *  - the account has genuinely used the tag before (see `tagsInUse`), which is
 *    the only signal available for "this is actually their branded tag", and
 *  - the tag is a real word in the post's own subject matter, which the caller
 *    supplies as `relevant`.
 *
 * Without those exemptions this list would delete `#love` from a wedding
 * photographer and `#explore` from a travel account, which is a filter doing
 * more harm than the spam it removes.
 */
export const SPAM_TAGS = new Set([
  'viral',
  'viralpost',
  'viralreels',
  'fyp',
  'fypage',
  'foryou',
  'foryoupage',
  'explore',
  'explorepage',
  'trending',
  'trend',
  'instagood',
  'instadaily',
  'instalike',
  'instamood',
  'photooftheday',
  'picoftheday',
  'like4like',
  'l4l',
  'follow4follow',
  'f4f',
  'followme',
  'likeforlikes',
  'tagsforlikes',
  'bestoftheday',
  'igers',
  'love',
  'happy',
  'nofilter',
  'repost',
  'reels',
  'reelsinstagram',
  'reelitfeelit',
  'shorts',
]);

/** Longest tag any network renders sensibly. */
const MAX_TAG_LENGTH = 40;

/**
 * What a character in a hashtag may be.
 *
 * `\p{M}` — combining marks — is here for a reason worth stating: without it,
 * `#दिल्ली` cleans to `दलल`. Devanagari vowel signs and the virama are marks,
 * not letters, so a class of `\p{L}\p{N}_` deletes them and silently produces a
 * different word. The same is true of Arabic, Tamil, Thai and every script that
 * writes vowels as marks. This codebase already reasons about Devanagari and
 * romanised Hindi (see `ai/style/measure.ts`), so an Indic tag is an ordinary
 * case here rather than an edge one.
 */
const TAG_CHARACTERS = /[^\p{L}\p{N}\p{M}_]/gu;

/**
 * One tag, cleaned, or null when nothing usable is left.
 *
 * Strips a leading `#`, then everything that is not a letter, number or
 * underscore — punctuation and symbols inside a tag break it on every network.
 * Lowercased for comparison; the caller decides presentation.
 */
export function cleanTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  const cleaned = raw
    .trim()
    .replace(/^#+/, '')
    .replace(TAG_CHARACTERS, '')
    .toLowerCase()
    .slice(0, MAX_TAG_LENGTH);

  // A tag of one character is not a tag, and a purely numeric one is not
  // searchable on any network.
  if (cleaned.length < 2) return null;
  if (/^\d+$/.test(cleaned)) return null;

  return cleaned;
}

export interface FilterOptions {
  /** Tags this account has genuinely used before. Exempt from the spam list. */
  inUse?: Set<string>;
  /**
   * Words from the post's own subject — the image read, the topic, the caption.
   * A spam-listed tag that is a real word in the post survives.
   */
  relevant?: Set<string>;
}

/** Why a tag was dropped. Logged, and useful in a test failure. */
export type TagRejection = 'unusable' | 'duplicate' | 'spam';

export interface FilteredTags {
  tags: string[];
  rejected: Array<{ tag: string; reason: TagRejection }>;
}

/**
 * Cleans, dedupes and drops the noise, in that order and preserving order.
 *
 * Order matters: cleaning first means `#Viral` and `#viral!` both reach the spam
 * check as `viral`, and deduping before the spam check keeps the rejection log
 * honest about which rule actually removed a tag.
 */
export function filterTags(
  raw: unknown,
  options: FilterOptions = {},
): FilteredTags {
  const input = Array.isArray(raw) ? raw : [];
  const inUse = options.inUse ?? new Set<string>();
  const relevant = options.relevant ?? new Set<string>();

  const tags: string[] = [];
  const rejected: FilteredTags['rejected'] = [];
  const seen = new Set<string>();

  for (const entry of input) {
    const tag = cleanTag(entry);
    if (!tag) {
      if (typeof entry === 'string' && entry.trim()) {
        rejected.push({ tag: entry.trim(), reason: 'unusable' });
      }
      continue;
    }

    if (seen.has(tag)) {
      rejected.push({ tag, reason: 'duplicate' });
      continue;
    }
    seen.add(tag);

    if (SPAM_TAGS.has(tag) && !inUse.has(tag) && !relevant.has(tag)) {
      rejected.push({ tag, reason: 'spam' });
      continue;
    }

    tags.push(tag);
  }

  return { tags, rejected };
}

/**
 * How many tags to ask for, and the hard ceiling to trim to.
 *
 * Read from `analysis/platform-rules.ts` so a generated set is never one the
 * analyser would immediately mark down. Where selected networks have no
 * overlapping band at all — Instagram wants 3–10, X tolerates 0–2 — the ceiling
 * is the tightest one and `conflict` says so, because the honest advice in that
 * case is "few tags in the caption, the rest in a first comment on Instagram"
 * rather than a number that is wrong on one of the two.
 */
export interface HashtagBudget {
  min: number;
  max: number;
  /** True when the selected networks disagree about what a good count is. */
  conflict: boolean;
}

export function budgetFor(
  platforms: readonly string[],
  requested?: number,
): HashtagBudget {
  const band = sharedHashtagBand(platforms);
  const conflict = band.min > band.max;

  // On a conflict the tighter network wins: publishing three tags where two is
  // the ceiling is the mistake that actually costs reach.
  const max = conflict ? Math.min(band.min, band.max) : band.max;
  const min = Math.min(band.min, max);

  if (requested === undefined) return { min, max, conflict };

  // A caller's explicit count is respected up to the platform ceiling and never
  // through it — the member's number is a preference, the network's is a rule.
  return { min: Math.min(min, requested), max: Math.min(max, requested), conflict };
}

/**
 * Splits a set into what to publish and what to keep in reserve.
 *
 * Primary is what fits the tightest network's ceiling; secondary is the rest,
 * offered rather than applied. That split is why the generator can return more
 * than a cross-post allows without ever pushing a post over a limit.
 */
export function splitTags(
  tags: readonly string[],
  budget: HashtagBudget,
): { primary: string[]; secondary: string[] } {
  const cap = Math.max(0, budget.max);
  return { primary: tags.slice(0, cap), secondary: tags.slice(cap) };
}
