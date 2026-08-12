import { hookLine } from './metrics';
import type { CaptionMetrics, PlatformCheck, PlatformFit } from '../types';

/**
 * Platform Intelligence.
 *
 * One rule set per network, and every rule in here is arithmetic against a
 * published limit: how many characters show before "…see more", how many
 * hashtags stop helping, where a call to action has to sit to be seen. None of
 * it is a judgement, so none of it goes to a model — see the header of
 * `metrics.ts` for why that line is drawn where it is.
 *
 * ─── Keeping the logic isolated ──────────────────────────────────────────────
 * Each network owns one `PlatformRules` object and nothing reaches across.
 * Adding TikTok means adding an entry to {@link PLATFORM_RULES}; changing
 * LinkedIn's truncation point when LinkedIn changes it means editing one
 * number in one object. The scoring code below never names a network.
 *
 * A network with no entry falls through to {@link GENERIC_RULES}, which checks
 * only the things true of every feed. That matters because the composer already
 * offers platforms this backend cannot publish to yet — an unrecognised id
 * should produce weaker advice, never an error and never a zero.
 */

/** A caption this short is a fragment; every length check is skipped below it. */
const MIN_MEANINGFUL_LENGTH = 12;

interface PlatformRules {
  /** Display name used in advice text. */
  label: string;
  /** Characters visible before the feed truncates. */
  visibleBeforeFold: number;
  /** Hard ceiling the network enforces, if any. */
  maxCharacters?: number;
  /** The band where hashtag count stops helping and starts hurting. */
  hashtags: { min: number; max: number };
  /** Longest paragraph, in words, before the block reads as a wall. */
  maxParagraphWords: number;
  emoji: 'welcome' | 'sparing' | 'avoid';
  /** Extra advice that is always true for this network, not tied to a check. */
  notes?: string[];
}

const PLATFORM_RULES: Record<string, PlatformRules> = {
  linkedin: {
    label: 'LinkedIn',
    // The first ~210 characters render before "…see more" on desktop. Mobile
    // cuts earlier still, so this is the generous end of the real budget.
    visibleBeforeFold: 210,
    maxCharacters: 3000,
    hashtags: { min: 1, max: 3 },
    maxParagraphWords: 60,
    emoji: 'sparing',
    notes: [
      'Break the copy into two- or three-line blocks — an unbroken paragraph is scrolled past on LinkedIn more than on any other feed.',
    ],
  },
  instagram: {
    label: 'Instagram',
    visibleBeforeFold: 125,
    maxCharacters: 2200,
    hashtags: { min: 3, max: 10 },
    maxParagraphWords: 45,
    emoji: 'welcome',
  },
  facebook: {
    label: 'Facebook',
    visibleBeforeFold: 250,
    hashtags: { min: 0, max: 2 },
    maxParagraphWords: 50,
    emoji: 'welcome',
  },
  x: {
    label: 'X',
    visibleBeforeFold: 280,
    maxCharacters: 280,
    hashtags: { min: 0, max: 2 },
    maxParagraphWords: 40,
    emoji: 'sparing',
  },
  threads: {
    label: 'Threads',
    visibleBeforeFold: 200,
    maxCharacters: 500,
    hashtags: { min: 0, max: 1 },
    maxParagraphWords: 40,
    emoji: 'welcome',
  },
  tiktok: {
    label: 'TikTok',
    visibleBeforeFold: 100,
    maxCharacters: 2200,
    hashtags: { min: 3, max: 5 },
    maxParagraphWords: 30,
    emoji: 'welcome',
  },
  youtube: {
    label: 'YouTube',
    visibleBeforeFold: 157,
    maxCharacters: 5000,
    hashtags: { min: 0, max: 3 },
    maxParagraphWords: 70,
    emoji: 'sparing',
  },
};

const GENERIC_RULES: PlatformRules = {
  label: 'this network',
  visibleBeforeFold: 200,
  hashtags: { min: 0, max: 10 },
  maxParagraphWords: 60,
  emoji: 'sparing',
};

function rulesFor(platform: string): PlatformRules {
  return PLATFORM_RULES[platform.toLowerCase()] ?? GENERIC_RULES;
}

function check(
  id: string,
  label: string,
  status: PlatformCheck['status'],
  detail: string,
): PlatformCheck {
  return { id, label, status, detail };
}

/**
 * The hashtags counted here are the ones *in the caption text*.
 *
 * The tag list travels separately through the studio, so the total a network
 * actually sees is the sum of both — which is why this takes an explicit
 * `hashtagCount` rather than reading `metrics.hashtagCount`. A caption with two
 * inline tags plus an eight-tag list is a ten-tag post, and only counting one
 * of the two is how a hashtag-stuffing warning fails to fire.
 */
export interface PlatformCheckInput {
  caption: string;
  metrics: CaptionMetrics;
  /** Inline tags plus the separate tag list, de-duplicated by the caller. */
  hashtagCount: number;
  hasImage: boolean;
  hasCta: boolean;
}

function buildChecks(
  rules: PlatformRules,
  { caption, metrics, hashtagCount, hasCta }: PlatformCheckInput,
): PlatformCheck[] {
  const checks: PlatformCheck[] = [];
  const hook = hookLine(caption);

  // ── Does the hook survive the fold ──────────────────────────────────────
  if (metrics.characterCount >= MIN_MEANINGFUL_LENGTH) {
    const fits = hook.length > 0 && hook.length <= rules.visibleBeforeFold;
    checks.push(
      check(
        'hook-before-fold',
        `Hook lands before ${rules.label} truncates`,
        fits ? 'pass' : 'warn',
        fits
          ? `The opening line is ${hook.length} characters and ${rules.label} shows ${rules.visibleBeforeFold}.`
          : `The opening line runs ${hook.length} characters but only ${rules.visibleBeforeFold} show before "…see more". Cut it, or move the point to the front.`,
      ),
    );
  }

  // ── Hard character ceiling ──────────────────────────────────────────────
  if (rules.maxCharacters) {
    const over = metrics.characterCount > rules.maxCharacters;
    checks.push(
      check(
        'length-limit',
        `Within the ${rules.label} limit`,
        over ? 'fail' : 'pass',
        over
          ? `${metrics.characterCount} characters against a ${rules.maxCharacters} limit — ${rules.label} will reject or cut this.`
          : `${metrics.characterCount} of ${rules.maxCharacters} characters.`,
      ),
    );
  }

  // ── Hashtag band ────────────────────────────────────────────────────────
  const { min, max } = rules.hashtags;
  const tooMany = hashtagCount > max;
  const tooFew = hashtagCount < min;
  checks.push(
    check(
      'hashtag-count',
      `Hashtag count suits ${rules.label}`,
      tooMany ? 'warn' : tooFew ? 'warn' : 'pass',
      tooMany
        ? `${hashtagCount} hashtags. ${rules.label} rewards ${min}–${max}; past that they read as noise and stop earning reach.`
        : tooFew
          ? `${hashtagCount} hashtags. ${rules.label} posts do better with at least ${min}.`
          : `${hashtagCount} hashtags, inside the ${min}–${max} band ${rules.label} rewards.`,
    ),
  );

  // ── Paragraph shape ─────────────────────────────────────────────────────
  if (metrics.wordCount > rules.maxParagraphWords) {
    const wall = metrics.longestParagraphWords > rules.maxParagraphWords;
    checks.push(
      check(
        'paragraph-shape',
        'Broken into readable blocks',
        wall ? 'warn' : 'pass',
        wall
          ? `The longest block runs ${metrics.longestParagraphWords} words. On ${rules.label}, split anything over ${rules.maxParagraphWords} with a blank line.`
          : `Longest block is ${metrics.longestParagraphWords} words — comfortable for ${rules.label}.`,
      ),
    );
  }

  // ── Emoji register ──────────────────────────────────────────────────────
  const emojiOff =
    (rules.emoji === 'avoid' && metrics.emojiCount > 0) ||
    (rules.emoji === 'sparing' && metrics.emojiCount > 3);
  if (metrics.emojiCount > 0 || rules.emoji === 'welcome') {
    checks.push(
      check(
        'emoji-register',
        `Emoji use fits ${rules.label}`,
        emojiOff ? 'warn' : 'pass',
        emojiOff
          ? `${metrics.emojiCount} emoji. ${rules.label} reads best with ${rules.emoji === 'avoid' ? 'none' : 'no more than a few'}.`
          : `${metrics.emojiCount} emoji — appropriate for ${rules.label}.`,
      ),
    );
  }

  // ── Call to action ──────────────────────────────────────────────────────
  // Placement matters as much as presence on a feed that truncates: a CTA
  // below the fold is only read by people who already chose to expand.
  checks.push(
    check(
      'cta-present',
      'Asks the reader to do something',
      hasCta ? 'pass' : 'warn',
      hasCta
        ? 'There is a clear next step in the closing lines.'
        : 'No obvious call to action. Even a question at the end gives the reader somewhere to go.',
    ),
  );

  return checks;
}

/**
 * Advice that is not a pass/fail check — the thing to *do*, once the checks
 * have said what is wrong. Kept separate so the UI can render a short list of
 * actions without re-deriving them from check text.
 */
function buildRecommendations(
  platform: string,
  rules: PlatformRules,
  input: PlatformCheckInput,
): string[] {
  const advice: string[] = [...(rules.notes ?? [])];
  const { metrics, hashtagCount, hasImage } = input;

  // Instagram's first comment is the standard place to park a tag block: it
  // keeps the caption readable without giving up the reach the tags carry.
  if (platform === 'instagram' && hashtagCount > 3) {
    advice.push(
      `Put the ${hashtagCount} hashtags in the first comment rather than the caption — same reach, and the caption stays readable.`,
    );
  }

  if (platform === 'linkedin' && metrics.paragraphCount <= 1 && metrics.wordCount > 60) {
    advice.push(
      'Add blank lines between thoughts. LinkedIn renders one block as a wall and the drop-off is measurable.',
    );
  }

  if (platform === 'linkedin' && hashtagCount > 3) {
    advice.push(
      'Trim to three hashtags at the very end. LinkedIn treats a tag wall as low-quality signal.',
    );
  }

  if (platform === 'instagram' && !hasImage) {
    advice.push('Instagram needs the visual — this post has no image attached.');
  }

  if (rules.maxCharacters && metrics.characterCount > rules.maxCharacters) {
    advice.push(
      `Cut ${metrics.characterCount - rules.maxCharacters} characters to fit ${rules.label}.`,
    );
  }

  return advice;
}

/**
 * Scores one network from its own checks.
 *
 * A `fail` costs more than a `warn` because the two mean different things: a
 * warning is copy that could be better, a failure is copy the network will
 * truncate or reject. Both are capped at zero rather than allowed to go
 * negative — a caption cannot be worse than unusable.
 */
function scoreFromChecks(checks: PlatformCheck[]): number {
  if (checks.length === 0) return 10;

  const penalty = checks.reduce((sum, item) => {
    if (item.status === 'fail') return sum + 3;
    if (item.status === 'warn') return sum + 1.5;
    return sum;
  }, 0);

  return Math.max(0, Math.round((10 - penalty) * 10) / 10);
}

/** Runs every rule for one network. */
export function checkPlatform(
  platform: string,
  input: PlatformCheckInput,
): PlatformFit {
  const rules = rulesFor(platform);
  const checks = buildChecks(rules, input);

  return {
    platform,
    score: scoreFromChecks(checks),
    checks,
    recommendations: buildRecommendations(platform.toLowerCase(), rules, input),
  };
}

/**
 * Runs every rule for every requested network.
 *
 * Returns an empty array when no platform was selected — a caption written
 * before the user picked where it is going has nothing to be checked against,
 * and inventing a default network would score it against rules it will never
 * be published under.
 */
export function checkPlatforms(
  platforms: readonly string[],
  input: PlatformCheckInput,
): PlatformFit[] {
  return platforms.map((platform) => checkPlatform(platform, input));
}

/** The 0–10 `platformFit` dimension: the weakest network, not the average. */
export function platformFitScore(fits: readonly PlatformFit[]): number | null {
  if (fits.length === 0) return null;
  // Deliberately the minimum. Publishing the same copy to three networks means
  // it goes out on the worst-fitting one too, and an average lets a strong
  // LinkedIn score hide a caption that will be cut off on X.
  return Math.min(...fits.map((fit) => fit.score));
}

/** The label a network is known by in advice text. Exported for the prompt. */
export function platformLabel(platform: string): string {
  return rulesFor(platform).label;
}

/**
 * The band where hashtag count stops helping on one network.
 *
 * Exported so the hashtag generator asks for a count this file would not mark
 * down. Before it, "how many hashtags suit LinkedIn" had one answer here and
 * another wherever generation happened to be written — and a generator that
 * produces eight tags for a network the analyser caps at three is a product
 * arguing with itself in front of the member.
 */
export function hashtagBandFor(platform: string): { min: number; max: number } {
  return rulesFor(platform).hashtags;
}

/**
 * The tightest band across several networks.
 *
 * `min` is the largest of the minimums and `max` the smallest of the maximums,
 * which is the only band that satisfies every selected network at once. A
 * cross-post to Instagram (3–10) and X (0–2) has no overlap at all, and the
 * empty result is the honest answer — the caller then knows to put the tags
 * where they suit rather than to split the difference and be wrong twice.
 */
export function sharedHashtagBand(
  platforms: readonly string[],
): { min: number; max: number } {
  if (platforms.length === 0) return { ...GENERIC_RULES.hashtags };

  const bands = platforms.map(hashtagBandFor);
  return {
    min: Math.max(...bands.map((band) => band.min)),
    max: Math.min(...bands.map((band) => band.max)),
  };
}
