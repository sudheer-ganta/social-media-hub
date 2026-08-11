import { looksLikeCta } from './metrics';
import type {
  BrandProfile,
  CaptionMetrics,
  CaptionMode,
  ChecklistItem,
  ChecklistSeverity,
  DimensionScore,
  PlatformFit,
  PrePublishChecklist,
  ScoreDimension,
} from '../types';

/**
 * The pre-publish checklist.
 *
 * ─── Why this exists alongside the reach score ───────────────────────────────
 * A score tells you how good the post is. It does not tell you what to do
 * about it, and "74/100" is not a thing anyone can act on at the moment they
 * are about to hit publish.
 *
 * A checklist is the same information in the form the moment actually calls
 * for: a short list of ticks, and for every empty box, the specific fix. It is
 * the difference between a grade and a pre-flight card.
 *
 * ─── What goes in it ─────────────────────────────────────────────────────────
 * Only items with an unambiguous fix. "Strengthen the hook" is a score, not a
 * checklist item — there is no state in which it is definitively ticked.
 * "Reduce hashtags from 8 to 5" is a checklist item: countable, fixable, and
 * verifiably done afterwards.
 *
 * That is why most of the items below are computed from `metrics.ts` and
 * `platform-rules.ts` rather than from the model. The two that do read model
 * scores use a hard threshold, so they still resolve to a yes or a no.
 */

/**
 * How much an unticked item costs the readiness percentage.
 *
 * Severity-weighted rather than a raw pass count, because a raw count lies in
 * both directions: eight ticked polish items would hide one caption that
 * exceeds X's character limit, and one unticked polish item on an otherwise
 * perfect post would drop it below 100 for no reason worth reporting.
 */
const SEVERITY_COST: Record<ChecklistSeverity, number> = {
  blocker: 5,
  important: 2,
  polish: 1,
};

/** A model score at or below this fails its checklist item. */
const FAILING_SCORE = 5;

function item(
  id: string,
  label: string,
  passed: boolean,
  severity: ChecklistSeverity,
  fix: string,
): ChecklistItem {
  return { id, label, passed, severity, ...(passed ? {} : { fix }) };
}

export interface ChecklistInput {
  caption: string;
  metrics: CaptionMetrics;
  /** Inline tags plus the separate tag list, de-duplicated. */
  hashtagCount: number;
  hasImage: boolean;
  platforms: readonly PlatformFit[];
  scores: Partial<Record<ScoreDimension, DimensionScore>>;
  brand?: BrandProfile;
  /** Personal keeps only the items that are true in both modes. */
  mode?: CaptionMode;
}

export function buildChecklist({
  caption,
  metrics,
  hashtagCount,
  hasImage,
  platforms,
  scores,
  brand,
  mode = 'brand',
}: ChecklistInput): PrePublishChecklist {
  const items: ChecklistItem[] = [];
  const personal = mode === 'personal';

  // ── Blockers: things that make the post fail on arrival ──────────────────
  //
  // The only section that runs in full for both modes. A caption too long for
  // Instagram fails on arrival whoever wrote it and whatever it was trying to
  // do — that is arithmetic against a published limit, not a marketing opinion.
  //
  // Everything below this section is gated. A personal post has no CTA to be
  // missing, no hashtag band to sit in, no hook to survive the fold and no
  // readability target to hit, and an unticked box for each would tell somebody
  // their perfectly good two-word caption is 40% ready to publish.

  const overLimit = platforms.flatMap((fit) =>
    fit.checks.filter((c) => c.id === 'length-limit' && c.status === 'fail').map(() => fit),
  );
  items.push(
    item(
      'within-platform-limits',
      'Fits every platform’s character limit',
      overLimit.length === 0,
      'blocker',
      overLimit.length > 0
        ? `Too long for ${overLimit.map((fit) => fit.platform).join(', ')}. Trim it before publishing.`
        : '',
    ),
  );

  // A banned word reaching a published post is a brand-safety failure, not a
  // style note — it is the one thing in here the user explicitly forbade.
  const bannedHits = (brand?.wordsToAvoid ?? []).filter((word) =>
    new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(caption),
  );
  if (brand?.wordsToAvoid.length) {
    items.push(
      item(
        'no-banned-words',
        'Avoids your brand’s banned words',
        bannedHits.length === 0,
        'blocker',
        `Remove: ${bannedHits.join(', ')}.`,
      ),
    );
  }

  // ── Important: things that cost real reach ───────────────────────────────

  if (personal) {
    // One item, and it is the only pre-publish question a personal post has.
    items.push(
      item(
        'image-attached',
        'Has an image',
        hasImage,
        'polish',
        'Posts with a picture travel further. Not required.',
      ),
    );
    return { items, readiness: readinessOf(items) };
  }

  const foldWarnings = platforms.filter((fit) =>
    fit.checks.some((c) => c.id === 'hook-before-fold' && c.status !== 'pass'),
  );
  items.push(
    item(
      'strong-opening-line',
      'Opening line survives the feed cut-off',
      foldWarnings.length === 0,
      'important',
      `The first line is cut short on ${foldWarnings.map((fit) => fit.platform).join(', ')}. Move the point to the front.`,
    ),
  );

  const hook = scores.hook;
  if (hook) {
    items.push(
      item(
        'hook-lands',
        'Hook earns the second line',
        hook.score > FAILING_SCORE,
        'important',
        hook.reason,
      ),
    );
  }

  const hasCta = looksLikeCta(caption, metrics);
  items.push(
    item(
      'clear-cta',
      'Asks the reader to do something',
      hasCta,
      'important',
      'Close with one clear next step — a question, a link, or an instruction.',
    ),
  );

  items.push(
    item(
      'image-attached',
      'Has an image',
      hasImage,
      'important',
      'Posts with a visual reach further on every network here. Attach one if you can.',
    ),
  );

  // Hashtag counts come from platform rules so the advice names a real band
  // rather than a number invented here.
  const tagWarnings = platforms.filter((fit) =>
    fit.checks.some((c) => c.id === 'hashtag-count' && c.status !== 'pass'),
  );
  items.push(
    item(
      'hashtag-count',
      'Hashtag count suits every platform',
      tagWarnings.length === 0,
      'important',
      tagWarnings[0]?.checks.find((c) => c.id === 'hashtag-count')?.detail ??
        `Adjust the ${hashtagCount} hashtags to suit each network.`,
    ),
  );

  // ── Polish: worth doing, never worth blocking on ─────────────────────────

  items.push(
    item(
      'readable-blocks',
      'Broken into readable blocks',
      metrics.wordCount < 60 || metrics.paragraphCount > 1,
      'polish',
      'Add a blank line between thoughts — one long block gets scrolled past.',
    ),
  );

  items.push(
    item(
      'sentence-length',
      'Sentences are easy to scan',
      metrics.averageWordsPerSentence <= 25,
      'polish',
      `Sentences average ${metrics.averageWordsPerSentence} words. Split the longest ones.`,
    ),
  );

  const readability = scores.readability;
  if (readability) {
    items.push(
      item(
        'reads-easily',
        'Reads easily at a glance',
        readability.score > FAILING_SCORE,
        'polish',
        readability.reason,
      ),
    );
  }

  return { items, readiness: readinessOf(items) };
}

/**
 * 0–100: the share of severity-weighted checks that passed.
 *
 * An empty list scores 100 rather than dividing by zero. That is only reachable
 * if every item was conditional and none applied, which in practice means there
 * was nothing to get wrong.
 */
function readinessOf(items: readonly ChecklistItem[]): number {
  const total = items.reduce((sum, entry) => sum + SEVERITY_COST[entry.severity], 0);
  if (total === 0) return 100;

  const earned = items.reduce(
    (sum, entry) => sum + (entry.passed ? SEVERITY_COST[entry.severity] : 0),
    0,
  );

  return Math.round((earned / total) * 100);
}
