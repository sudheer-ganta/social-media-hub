import { buildStyleProfilePrompt } from '../prompts/style-profile.prompt';
import type { AiTextProvider } from '../providers';
import * as history from '../../repositories/caption-history.repository';
import * as store from '../../repositories/style-profile.repository';
import { aggregateShape } from './measure';
import { deriveSignals, sampleWeight, type CaptionSignal } from './signals';
import { retrieveExamples, type RetrievedExamples } from './retrieve';
import { focusSituation, renderStyleSection } from './render';
import {
  sanitiseBehaviour,
  STYLE_CONFIDENT_SAMPLES,
  STYLE_MIN_SAMPLES,
  STYLE_PROFILE_VERSION,
  type BehaviourStyle,
  type ReferenceStyle,
  type SituationalStyle,
  type StyleConfidence,
  type StyleProfile,
} from './types';

/**
 * Style memory, from the outside.
 *
 * One function matters on the request path — {@link loadStyleContext} — and it
 * must be fast and must never fail: a member whose profile cannot be read
 * should get a caption written without one, not an error. Every failure in
 * this file is swallowed and logged for that reason, the same way image
 * analysis is in `image-analysis.generator.ts`.
 *
 * ─── When the profile is built ───────────────────────────────────────────────
 * Never during a generation. Building one means reading two hundred posts and
 * making a model call, and the member is sitting in front of a spinner. Instead
 * the request path reads whatever is stored, uses it, responds — and only then
 * checks whether it has gone stale and rebuilds in the background.
 *
 * The practical effect is that a profile is always one generation behind, which
 * costs nothing: nobody's writing style changes between two captions.
 */

/** Rebuild once this many new posts have landed since the last build. */
const REBUILD_AFTER_NEW_POSTS = 5;
/** Or once it is this old, whichever comes first. */
const REBUILD_AFTER_DAYS = 14;

export interface StyleScope {
  userId: string;
  contextType: string;
  brandId?: string | null;
}

/** Everything the personal prompt needs to know about this member. */
export interface StyleContext {
  /** The rendered `## How this person posts` block, or null at cold start. */
  section: string | null;
  /** The rendered evidence block, or null when there is no history. */
  evidence: string | null;
  /** The raw captions behind that block, for the repetition check. */
  history: string[];
  /** The measured half, for ranking candidates. Null at cold start. */
  measured: StyleProfile['global']['measured'] | null;
  /** Which bucket this post fell in. Logged, never shown. */
  situation: string;
}

const EMPTY: StyleContext = {
  section: null,
  evidence: null,
  history: [],
  measured: null,
  situation: 'other',
};

/**
 * Loads what is known about how this member writes.
 *
 * Two reads and no model call: the stored profile, and the history the examples
 * are drawn from. The second is what makes retrieval work — the profile
 * describes them in general, while the examples are specifically the captions
 * that resemble the post they are writing now.
 */
export async function loadStyleContext(
  scope: StyleScope,
  situation: string,
  /**
   * The heading the rendered block carries.
   *
   * A parameter because the same pipeline now serves both a member and a brand,
   * and "How this person posts" above a brand's learned voice is wrong in a way
   * a model will follow. Rendering stays here rather than being done by the
   * caller — a caller holding the raw profile would eventually render it a
   * second, slightly different way.
   */
  heading?: string,
): Promise<StyleContext & { signals: CaptionSignal[] }> {
  try {
    const [stored, posts, events] = await Promise.all([
      store.find(scope),
      history.findHistory(scope.userId, scope.contextType, scope.brandId),
      history.findFeedbackEvents(scope.userId, scope.contextType, scope.brandId),
    ]);

    const signals = deriveSignals(posts, events);
    const examples: RetrievedExamples = retrieveExamples(signals, situation);
    const profile = stored?.profile ?? null;

    return {
      // Only the situational block matching this post is rendered — the other
      // three would be six lines about holidays in front of a gym photo.
      section: renderStyleSection(focusSituation(profile, situation), heading),
      evidence: examples.section,
      history: examples.captions,
      measured: profile && profile.confidence !== 'none' ? profile.global.measured : null,
      situation,
      signals,
    };
  } catch (error) {
    // A member with no style memory writes captions perfectly well. A member
    // staring at an error message does not.
    console.warn('[ai] style memory unavailable, writing without it', {
      userId: scope.userId,
      detail: error instanceof Error ? error.message : String(error),
    });
    return { ...EMPTY, situation, signals: [] };
  }
}

/** Whether the stored profile has fallen far enough behind to be worth rebuilding. */
function isStale(
  stored: store.StoredStyleProfile | null,
  signals: CaptionSignal[],
  postIds: string[],
): boolean {
  if (sampleWeight(signals) < STYLE_MIN_SAMPLES) return false;
  if (!stored) return true;

  const known = new Set(stored.sourcePostIds);
  const fresh = postIds.filter((id) => id && !known.has(id)).length;
  if (fresh >= REBUILD_AFTER_NEW_POSTS) return true;

  const ageDays = (Date.now() - stored.builtAt.getTime()) / 86_400_000;
  return ageDays >= REBUILD_AFTER_DAYS;
}

function confidenceFor(samples: number): StyleConfidence {
  if (samples < STYLE_MIN_SAMPLES) return 'none';
  if (samples >= STYLE_CONFIDENT_SAMPLES) return 'high';
  if (samples >= STYLE_MIN_SAMPLES * 2) return 'medium';
  return 'low';
}

/** The model's half of the profile, with the no-vocabulary rule enforced. */
function readBehaviour(payload: Record<string, unknown>): BehaviourStyle | undefined {
  const raw = payload.behaviour;
  if (!raw || typeof raw !== 'object') return undefined;

  const source = raw as Record<string, unknown>;
  const keys: Array<keyof BehaviourStyle> = [
    'brevity',
    'humour',
    'emotionalRange',
    'randomness',
    'contextDependence',
    'selfPresentation',
  ];

  const cleaned: Partial<BehaviourStyle> = {};
  for (const key of keys) {
    const value = sanitiseBehaviour(source[key]);
    if (value) cleaned[key] = value;
  }

  // All or nothing. A half-filled behaviour block renders as three bullets that
  // read like a complete description of somebody, and it is not one.
  return keys.every((key) => cleaned[key]) ? (cleaned as BehaviourStyle) : undefined;
}

function readReferences(
  payload: Record<string, unknown>,
  signals: CaptionSignal[],
): ReferenceStyle | undefined {
  const raw = payload.references;
  if (!raw || typeof raw !== 'object') return undefined;

  const source = raw as Record<string, unknown>;
  const handling = sanitiseBehaviour(source.handling);
  const kinds = Array.isArray(source.kinds)
    ? source.kinds.filter((kind): kind is string => typeof kind === 'string').slice(0, 5)
    : [];

  if (!handling || kinds.length === 0) return undefined;

  // The rate is ours to compute, not the model's to estimate — it is a count,
  // and a model asked for one guesses. A caption naming a proper noun the image
  // analysis never mentioned is the closest cheap proxy for "made a reference".
  const withCapitals = signals.filter(
    (signal) => signal.weight > 0 && /\b\p{Lu}\p{Ll}+/u.test(signal.text),
  ).length;
  const positive = signals.filter((signal) => signal.weight > 0).length || 1;

  return {
    rate: Number((withCapitals / positive).toFixed(2)),
    kinds,
    handling,
  };
}

function readSituational(
  payload: Record<string, unknown>,
  signals: CaptionSignal[],
): SituationalStyle[] {
  const raw = Array.isArray(payload.situational) ? payload.situational : [];

  return raw
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const source = entry as Record<string, unknown>;
      const situation = typeof source.situation === 'string' ? source.situation : '';
      const behaviour = sanitiseBehaviour(source.behaviour);
      if (!situation || !behaviour) return [];

      const matching = signals.filter(
        (signal) => signal.situation === situation && signal.weight > 0,
      );
      if (matching.length === 0) return [];

      return [
        {
          situation,
          n: matching.length,
          measured: aggregateShape(matching.map((signal) => signal.text)),
          behaviour,
        },
      ];
    })
    .slice(0, 4);
}

/**
 * Builds and stores one profile.
 *
 * Exported for the scripts and for tests; the request path calls
 * {@link refreshStyleProfileInBackground} instead, which is this behind a
 * staleness check.
 */
export async function buildStyleProfile(
  scope: StyleScope,
  provider: AiTextProvider,
  signals: CaptionSignal[],
  postIds: string[],
): Promise<StyleProfile | null> {
  const positive = signals.filter((signal) => signal.weight > 0);
  const samples = positive.length;
  if (samples < STYLE_MIN_SAMPLES) return null;

  const situations = [...new Set(positive.map((signal) => signal.situation))];
  const built = buildStyleProfilePrompt(signals, situations);

  const payload = (await provider.generateJson({
    systemInstruction: built.systemInstruction,
    prompt: built.prompt,
    responseSchema: built.responseSchema,
    temperature: built.temperature,
  })) as Record<string, unknown>;

  const avoids = Array.isArray(payload.avoids)
    ? payload.avoids
        .map(sanitiseBehaviour)
        .filter((entry): entry is string => entry !== null)
        .slice(0, 5)
    : [];

  const profile: StyleProfile = {
    version: STYLE_PROFILE_VERSION,
    confidence: confidenceFor(samples),
    sampleCount: samples,
    global: {
      // Measured here, never asked for. See `measure.ts`.
      measured: aggregateShape(positive.map((signal) => signal.text)),
      ...(readBehaviour(payload) && { behaviour: readBehaviour(payload) }),
    },
    situational: readSituational(payload, signals),
    ...(readReferences(payload, signals) && {
      references: readReferences(payload, signals),
    }),
    avoids,
    builtAt: new Date().toISOString(),
  };

  await store.save(scope, { profile, sampleCount: samples, sourcePostIds: postIds });

  console.info('[ai] style profile built', {
    userId: scope.userId,
    contextType: scope.contextType,
    samples,
    confidence: profile.confidence,
    situations: profile.situational.map((entry) => entry.situation),
    // Proves the guard ran. A profile that lost its behaviour block to the
    // vocabulary filter is worth seeing in the log.
    hasBehaviour: Boolean(profile.global.behaviour),
  });

  return profile;
}

/**
 * Rebuilds the profile if it has gone stale, without making anyone wait.
 *
 * Called after the response has been sent. Nothing awaits it and nothing
 * depends on it — the next generation reads whatever this leaves behind, and if
 * it fails, that generation uses the older profile.
 */
export function refreshStyleProfileInBackground(
  scope: StyleScope,
  provider: AiTextProvider,
  signals: CaptionSignal[],
): void {
  void (async () => {
    try {
      const stored = await store.find(scope);
      const postIds = [...new Set(signals.map((signal) => signal.postId).filter(Boolean))];
      if (!isStale(stored, signals, postIds)) return;

      await buildStyleProfile(scope, provider, signals, postIds);
    } catch (error) {
      console.warn('[ai] style profile rebuild failed, keeping the previous one', {
        userId: scope.userId,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  })();
}
