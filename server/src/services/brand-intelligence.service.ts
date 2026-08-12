import { analyticsRepository } from '../repositories/analytics.repository';
import { toCaptionedPublications } from '../analytics/publication-view';
import { chooseMetric, DEFAULT_TIMING_GATES } from '../analytics/timing';
import {
  learnHashtags,
  renderHashtagHistory,
  tagsInUse,
  type HashtagHistory,
} from '../ai/learning/hashtag-history';
import {
  learnPerformance,
  renderPerformanceSection,
  type PerformanceProfile,
} from '../ai/learning/performance';
import { EVIDENCE_GATES } from '../ai/learning/evidence';
import { voiceMix, type VoiceMix } from '../ai/learning/voice-mix';
import * as styleProfiles from '../repositories/style-profile.repository';
import type { StyleConfidence } from '../ai/style/types';
import type { AnalyticsScope } from '../analytics/window';

/**
 * What this account's own results have taught us, loaded for one generation.
 *
 * The bridge between the analytics tables and the writing prompts. Everything
 * downstream of here is pure: this reads once, hands the rows to
 * `ai/learning/*`, and renders two compact sections.
 *
 * ─── Compact, not concatenated ───────────────────────────────────────────────
 * The output is a handful of sentences with counts attached, never the history
 * itself. That is the same discipline `ai/style/retrieve.ts` keeps and for a
 * sharper reason here: a prompt carrying two hundred captions and their metrics
 * would be enormous, and a model given the raw table starts quoting numbers at
 * the member as though it had done statistics.
 *
 * ─── Personal and Brand cannot meet ──────────────────────────────────────────
 * One parameter, an {@link AnalyticsScope}, and every read behind it filters on
 * user *and* context *and* brand id together. There is no signature here that
 * can express "all of this member's posts".
 *
 * ─── It may not break a generation ───────────────────────────────────────────
 * Every failure is swallowed and logged, exactly as `loadStyleContext` does. A
 * member whose analytics cannot be read should get a caption written without
 * performance evidence, not an error — AI is an enhancement here, and so is the
 * evidence behind it.
 */

export interface BrandIntelligence {
  /** Rendered `## What has actually worked…`, or null when nothing cleared the floor. */
  performanceSection: string | null;
  /** Rendered `## This account’s own hashtag record`, or null. */
  hashtagSection: string | null;
  /** Tags the account genuinely uses — the spam filter's exemption list. */
  tagsInUse: Set<string>;
  /** The structured findings, for the Brand Intelligence panel. */
  performance: PerformanceProfile;
  hashtags: HashtagHistory;
  /** Scored publications behind all of it. Zero means "no evidence yet". */
  sampleSize: number;
}

export const EMPTY_BRAND_INTELLIGENCE: BrandIntelligence = {
  performanceSection: null,
  hashtagSection: null,
  tagsInUse: new Set(),
  performance: { platforms: [], sampleSize: 0 },
  hashtags: {
    frequent: [],
    strongerPosts: [],
    noDifference: [],
    sampleSize: 0,
    metric: null,
  },
  sampleSize: 0,
};

/**
 * Loads the performance evidence for one scope.
 *
 * One query and no model call, so it is cheap enough to sit on the generation
 * path beside `loadStyleContext`. Lifetime rather than the intelligence window:
 * twenty posts is the right sample for "what is working lately" and too small
 * for a claim about formats, and `evidence.ts` applies its own floors anyway.
 *
 * ponytail: reuses `findPublishedPublications`, which selects more per row than
 * this needs and carries one correlated subquery per publication. Correct at the
 * few hundred publications a real account has. If it gets slow, the upgrade is
 * one lean projection shared with `best-time.service.ts` — both want the same
 * columns — not a cache, because a stale answer here would be quoted as evidence.
 */
export async function loadBrandIntelligence(
  scope: AnalyticsScope,
): Promise<BrandIntelligence> {
  try {
    const rows = await analyticsRepository.findPublishedPublications(scope, {
      dimension: { kind: 'lifetime' },
    });

    const publications = toCaptionedPublications(rows);
    if (publications.length === 0) return EMPTY_BRAND_INTELLIGENCE;

    const performance = learnPerformance(publications, EVIDENCE_GATES);

    // Hashtag learning runs across the scope rather than per network, because a
    // tag is a piece of vocabulary the account uses rather than a property of
    // one feed. The metric is still chosen once so no two tags are compared on
    // different scales.
    const hashtags = learnHashtags(
      publications,
      chooseMetric(publications, {
        ...DEFAULT_TIMING_GATES,
        early: EVIDENCE_GATES.early,
      }),
      EVIDENCE_GATES,
    );

    return {
      performanceSection: renderPerformanceSection(performance),
      hashtagSection: renderHashtagHistory(hashtags),
      tagsInUse: tagsInUse(hashtags),
      performance,
      hashtags,
      sampleSize: performance.sampleSize,
    };
  } catch (error) {
    // A caption written without performance evidence is a good caption. An error
    // toast instead of a caption is not.
    console.warn('[ai] performance evidence unavailable, writing without it', {
      contextType: scope.contextType,
      detail: error instanceof Error ? error.message : String(error),
    });
    return EMPTY_BRAND_INTELLIGENCE;
  }
}

// ─── The panel ───────────────────────────────────────────────────────────────

/**
 * What Brand Intelligence knows, as the settings panel shows it.
 *
 * Informational, not a questionnaire. Nothing here is an input to generation —
 * the generator reads the same underlying profile directly — so a member can
 * ignore this screen entirely and still get everything the feature does. It
 * exists to answer "what has FlowPost worked out about us", which is a fair
 * question to be able to ask of something writing in your voice.
 *
 * Served through the API rather than read from the browser because
 * `style_profiles` has RLS enabled with no policies: PostgREST cannot see it at
 * all, by design.
 */
export interface BrandIntelligenceView {
  scope: { contextType: string; brandId: string | null };
  /** Where the writing sits between the measurable registers. Empty when unknown. */
  voice: VoiceMix;
  /** How much writing the voice read rests on, and how much to trust it. */
  style: {
    confidence: StyleConfidence;
    sampleCount: number;
    builtAt: string | null;
    /** Recurring situations the account writes about, most-evidenced first. */
    themes: Array<{ situation: string; posts: number }>;
  };
  /** Per-network findings, each scored against that network's own median. */
  performance: PerformanceProfile;
  /** The account's own tag record. */
  hashtags: {
    frequent: HashtagHistory['frequent'];
    strongerPosts: HashtagHistory['strongerPosts'];
    noDifference: HashtagHistory['noDifference'];
    sampleSize: number;
  };
  /** Measured publications behind the performance findings. */
  sampleSize: number;
}

/**
 * Everything the Brand Intelligence panel renders, for one scope.
 *
 * Two reads and no model call. Both are allowed to come back empty, and empty is
 * rendered as "not enough yet" rather than as zeroes — see the panel.
 */
export async function brandIntelligenceView(
  scope: AnalyticsScope,
): Promise<BrandIntelligenceView> {
  const [stored, intelligence] = await Promise.all([
    styleProfiles
      .find({
        userId: scope.userId,
        contextType: scope.contextType,
        brandId: scope.brandId,
      })
      // A missing or unreadable profile is "nothing learned yet", not an error.
      .catch(() => null),
    loadBrandIntelligence(scope),
  ]);

  const profile = stored?.profile ?? null;

  return {
    scope: { contextType: scope.contextType, brandId: scope.brandId },
    voice: voiceMix(
      // Only a profile that reports itself usable feeds the mix. Reading a
      // register off four captions would be a number with nothing behind it.
      profile && profile.confidence !== 'none' ? profile.global.measured : null,
      stored?.sampleCount ?? 0,
    ),
    style: {
      confidence: profile?.confidence ?? 'none',
      sampleCount: stored?.sampleCount ?? 0,
      builtAt: stored?.builtAt.toISOString() ?? null,
      themes: (profile?.situational ?? [])
        .map((entry) => ({ situation: entry.situation, posts: entry.n }))
        .sort((a, b) => b.posts - a.posts),
    },
    performance: intelligence.performance,
    hashtags: {
      frequent: intelligence.hashtags.frequent,
      strongerPosts: intelligence.hashtags.strongerPosts,
      noDifference: intelligence.hashtags.noDifference,
      sampleSize: intelligence.hashtags.sampleSize,
    },
    sampleSize: intelligence.sampleSize,
  };
}

/**
 * Forgets what has been learned about how this scope writes.
 *
 * Only the derived profile goes. The posts stay, so the next generation rebuilds
 * from the same history — a reset clears a reading the member thinks is wrong, it
 * does not delete their work. Performance findings are not stored at all; they
 * are recomputed on every read, so there is nothing there to reset.
 */
export async function resetLearning(scope: AnalyticsScope): Promise<{ cleared: boolean }> {
  const removed = await styleProfiles.remove({
    userId: scope.userId,
    contextType: scope.contextType,
    brandId: scope.brandId,
  });

  console.info('[ai] style learning reset', {
    contextType: scope.contextType,
    cleared: removed > 0,
  });

  return { cleared: removed > 0 };
}

export const brandIntelligenceService = {
  loadBrandIntelligence,
  brandIntelligenceView,
  resetLearning,
};
