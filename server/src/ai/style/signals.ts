import { contentTokens, normalise, trigramSimilarity } from '../personal/filters';

/**
 * Turning a member's post history into evidence about how they write.
 *
 * ─── Why there is no events table ────────────────────────────────────────────
 * Because the two most valuable signals are already recorded, by accident of a
 * decision made long before any of this existed: every generation is written
 * back to `posts.ai_studio_output.contentVariations`, and what the member
 * actually kept is in `posts.caption`. Comparing those two answers, for free
 * and retroactively, the question a feedback pipeline is usually built to
 * capture — which option did they pick, and did they change it first.
 *
 * A `caption_feedback` table would have recorded the same facts a second time,
 * for posts going forward only, and would have started empty.
 *
 * ─── The signal that matters most ────────────────────────────────────────────
 * `published_edited`, and it is not close. When somebody takes a generated
 * caption, changes four words and publishes it, those four words are the most
 * precise style information this system will ever receive: they are the exact
 * distance between what a machine thought they sounded like and what they
 * actually sound like. It outranks a clean selection deliberately — an
 * untouched pick means "fine", an edited one means "here is what was wrong".
 *
 * Everything here is pure. Prisma lives in `repositories/caption-history` and
 * hands rows in, which is what makes the weighting testable without a database.
 */

/** What a caption tells us, strongest first. */
export type SignalKind =
  | 'published_edited'
  | 'published_selected'
  | 'published_written'
  | 'selected'
  | 'saved'
  | 'generated_unused'
  | 'rejected';

/**
 * How much each kind counts.
 *
 * Negative for `rejected` on purpose: it does not merely fail to be evidence
 * of their voice, it is evidence *against* — a direction they were offered and
 * turned down. It never reaches the prompt as an example (see `retrieve.ts`);
 * it reaches the profile builder as something to avoid.
 */
export const SIGNAL_WEIGHT: Record<SignalKind, number> = {
  published_edited: 1.2,
  published_selected: 1.0,
  published_written: 1.0,
  selected: 0.7,
  saved: 0.5,
  generated_unused: 0.2,
  rejected: -0.3,
};

/** Half-life of a caption's relevance, in days. */
const DECAY_DAYS = 180;

/** Above this, the caption came back unchanged. Below 0.6, it is a different one. */
const UNCHANGED_SIMILARITY = 0.98;
const EDITED_SIMILARITY = 0.6;

export interface CaptionSignal {
  postId: string;
  text: string;
  kind: SignalKind;
  /** Signal weight after recency decay. Can be negative. */
  weight: number;
  /** Which bucket this post falls in — see `situationOf`. */
  situation: string;
  ageDays: number;
}

/** One post, as much of it as this module needs. */
export interface HistoryPost {
  id: string;
  title: string;
  caption: string;
  published: boolean;
  updatedAt: Date;
  /** Captions the model offered for this post, from the studio envelope. */
  offered: string[];
  /** What Vision saw, if it was stored. Used for bucketing. */
  subject?: string;
  themes?: string[];
  setting?: string;
}

/**
 * One explicit event, from `activity_logs`.
 *
 * Only the two things the post row cannot reconstruct: a caption the member
 * chose but never saved, and one they regenerated away from.
 */
export interface HistoryEvent {
  postId: string | null;
  action: 'caption.selected' | 'caption.regenerated';
  text: string;
  createdAt: Date;
}

// ─── Situations ──────────────────────────────────────────────────────────────

/**
 * The buckets a post can fall into.
 *
 * Coarse on purpose. The job is to retrieve *gym captions when the new post is
 * a gym photo*, and ten buckets does that; fifty would leave every bucket with
 * one caption in it, which is the same as having none.
 *
 * ponytail: keyword matching against what Vision saw. It cannot tell a gym
 * from a physiotherapy room, and it files anything unusual under "other".
 * Upgrade to embedding similarity when a real member's posts start landing in
 * "other" more often than not — that is the signal that this has stopped
 * discriminating, and it is worth watching before it is worth fixing.
 */
const SITUATIONS: Array<[string, string[]]> = [
  ['gym', ['gym', 'workout', 'weights', 'barbell', 'dumbbell', 'fitness', 'muscle', 'training', 'treadmill', 'physique', 'reps', 'cardio', 'lifting', 'leg']],
  ['outfit', ['outfit', 'dress', 'suit', 'fashion', 'wearing', 'clothing', 'shoes', 'jewellery', 'jewelry', 'style', 'mirror']],
  ['travel', ['beach', 'mountain', 'airport', 'hotel', 'city', 'street', 'landscape', 'sunset', 'ocean', 'temple', 'holiday', 'trip']],
  ['food', ['food', 'meal', 'coffee', 'restaurant', 'plate', 'dessert', 'breakfast', 'dinner', 'lunch', 'drink', 'cocktail']],
  ['work', ['office', 'desk', 'laptop', 'meeting', 'conference', 'workspace', 'screen', 'monitor', 'whiteboard']],
  ['night_out', ['party', 'club', 'bar', 'concert', 'crowd', 'nightlife', 'wedding', 'celebration', 'dancing']],
  ['pet', ['dog', 'cat', 'puppy', 'kitten', 'pet', 'animal']],
  ['selfie', ['selfie', 'portrait', 'face', 'headshot', 'smiling']],
  ['art_media', ['film', 'movie', 'game', 'character', 'poster', 'artwork', 'painting', 'anime', 'screenshot', 'fantasy']],
];

export const OTHER_SITUATION = 'other';

/** Which bucket a post belongs to, from what Vision saw plus the title. */
export function situationOf(context: {
  subject?: string;
  themes?: string[];
  setting?: string;
  title?: string;
}): string {
  const words = new Set(
    contentTokens(
      [context.subject, context.setting, context.title, ...(context.themes ?? [])]
        .filter(Boolean)
        .join(' '),
    ),
  );

  for (const [situation, keywords] of SITUATIONS) {
    if (keywords.some((keyword) => words.has(keyword))) return situation;
  }

  return OTHER_SITUATION;
}

// ─── Derivation ──────────────────────────────────────────────────────────────

function decay(ageDays: number): number {
  return 0.5 ** (ageDays / DECAY_DAYS);
}

function daysSince(date: Date, now: number): number {
  return Math.max(0, (now - date.getTime()) / 86_400_000);
}

/**
 * What one post says about how its author writes.
 *
 * The caption they kept produces exactly one signal, and which one depends on
 * how it relates to what they were offered:
 *
 *   identical to an option   they picked it            → selected
 *   close to an option       they picked it and fixed it → **edited**
 *   like none of them        they wrote it themselves  → written
 *
 * and every option they did not take produces a weak one of its own, because
 * "shown this and did not use it" is real information, just much quieter than
 * "used this".
 */
function signalsForPost(post: HistoryPost, now: number): CaptionSignal[] {
  const ageDays = daysSince(post.updatedAt, now);
  const factor = decay(ageDays);
  const situation = situationOf({
    subject: post.subject,
    themes: post.themes,
    setting: post.setting,
    title: post.title,
  });

  const caption = post.caption.trim();
  const signals: CaptionSignal[] = [];

  const push = (text: string, kind: SignalKind) => {
    signals.push({
      postId: post.id,
      text,
      kind,
      weight: Number((SIGNAL_WEIGHT[kind] * factor).toFixed(4)),
      situation,
      ageDays: Math.round(ageDays),
    });
  };

  let matchedIndex = -1;
  let bestSimilarity = 0;

  if (caption) {
    post.offered.forEach((option, index) => {
      const similarity =
        normalise(option) === normalise(caption)
          ? 1
          : trigramSimilarity(option, caption);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        matchedIndex = index;
      }
    });

    if (bestSimilarity >= UNCHANGED_SIMILARITY) {
      push(caption, post.published ? 'published_selected' : 'selected');
    } else if (bestSimilarity >= EDITED_SIMILARITY) {
      // The good one. What they typed, not what they were given.
      push(caption, post.published ? 'published_edited' : 'selected');
    } else {
      matchedIndex = -1;
      push(caption, post.published ? 'published_written' : 'saved');
    }
  }

  post.offered.forEach((option, index) => {
    if (index === matchedIndex) return;
    const text = option.trim();
    if (text) push(text, 'generated_unused');
  });

  return signals;
}

/**
 * Every signal a member's history carries, strongest first.
 *
 * `now` is a parameter rather than a call to `Date.now()` so the decay curve
 * can be tested against fixed dates instead of against the wall clock.
 */
export function deriveSignals(
  posts: HistoryPost[],
  events: HistoryEvent[] = [],
  now: number = Date.now(),
): CaptionSignal[] {
  const signals = posts.flatMap((post) => signalsForPost(post, now));

  // The explicit half. A selection that never reached a post row, and a
  // regenerate — the only two things the comparison above cannot see.
  for (const event of events) {
    const text = event.text.trim();
    if (!text) continue;

    const ageDays = daysSince(event.createdAt, now);
    const kind: SignalKind =
      event.action === 'caption.selected' ? 'selected' : 'rejected';

    signals.push({
      postId: event.postId ?? '',
      text,
      kind,
      weight: Number((SIGNAL_WEIGHT[kind] * decay(ageDays)).toFixed(4)),
      situation: OTHER_SITUATION,
      ageDays: Math.round(ageDays),
    });
  }

  return dedupe(signals).sort((a, b) => b.weight - a.weight);
}

/**
 * One caption, one signal — the strongest one it earned.
 *
 * Necessary because the same text legitimately arrives twice: an explicit
 * `caption.selected` event and then, once the post is saved and published, the
 * derived `published_selected`. Counting both would let a member who happens to
 * click before saving weigh twice as much as one who does not.
 */
function dedupe(signals: CaptionSignal[]): CaptionSignal[] {
  const best = new Map<string, CaptionSignal>();

  for (const signal of signals) {
    const key = normalise(signal.text);
    if (!key) continue;
    const existing = best.get(key);
    if (!existing || signal.weight > existing.weight) best.set(key, signal);
  }

  return [...best.values()];
}

/** The weighted total, which is what decides whether a profile is usable. */
export function sampleWeight(signals: CaptionSignal[]): number {
  return signals.filter((signal) => signal.weight > 0).length;
}
