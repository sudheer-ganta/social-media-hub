import { resolveBrandProfile } from '../brand/brand-profile';
import { buildAnalysisPrompt, improvableDimensions } from '../prompts/analysis.prompt';
import { AiProviderError, type AiTextProvider } from '../providers';
import { buildChecklist } from '../analysis/checklist';
import { looksLikeCta, measureCaption } from '../analysis/metrics';
import { checkPlatforms, platformFitScore } from '../analysis/platform-rules';
import { computeReachScore, explainScore } from '../analysis/scoring';
import { ANALYSIS_VERSION } from '../analysis/version';
import { loadStyleContext } from '../style/profile.service';
import { situationForRequest } from '../style/retrieve';
import { DEFAULT_WEIGHTS, PERSONAL_DIMENSIONS, WEIGHTS_VERSION } from '../analysis/weights';
import type {
  AnalysisRequest,
  CaptionAnalysis,
  CaptionMode,
  Confidence,
  DimensionScore,
  EngagementForecast,
  Improvement,
  Likelihood,
  RawAnalysisPayload,
  ScoreDimension,
} from '../types';

/**
 * Marketing Intelligence — the second engine.
 *
 * Creative Intelligence (`creative-intelligence.generator.ts`) writes the copy.
 * This one judges it, and it is a separate call against a separate prompt for
 * the reason set out at the top of `prompts/analysis.prompt.ts`: a model that
 * writes and then scores its own writing scores it well.
 *
 * ─── The flow ────────────────────────────────────────────────────────────────
 *
 *   caption ─┬→ [measure]        counted facts        ─┐
 *            ├→ [platform rules] mechanical verdicts   ├→ [model] judgements
 *   brand ───┴→ [Brand Intelligence] resolved profile ─┘        │
 *                                                               ▼
 *                              [score] ← weights → reach score, explanation
 *                                 │
 *                                 └→ [checklist] → readiness
 *
 * Only the middle box is a model call. Everything to the left of it is
 * arithmetic, and everything to the right of it is arithmetic over the model's
 * seven numbers. That ordering is the whole design: the model is asked exactly
 * one question — *is this any good, and why* — and nothing else.
 *
 * Provider-injected and not a class, matching the other generator.
 */

/**
 * A caption shorter than this cannot be meaningfully judged.
 *
 * Mode-dependent because the two modes disagree about what "too short to judge"
 * means. Twelve characters of marketing copy is a failed generation. Two
 * characters of personal copy can be the whole post and entirely deliberate —
 * see `MIN_CAPTION_LENGTH_BY_MODE` in `services/ai.service.ts`.
 */
const MIN_ANALYSABLE_LENGTH: Record<CaptionMode, number> = {
  brand: 12,
  personal: 2,
};

const CONFIDENCES: Confidence[] = ['High', 'Medium', 'Low'];
const LIKELIHOODS: Likelihood[] = ['Low', 'Medium', 'High'];

function asString(value: unknown, max = 400): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function asStringArray(value: unknown, maxItems: number, max = 300): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item, max))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

/** Clamps a model's number into the 0–10 the weights assume. */
function asScore(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(10, Math.max(0, Math.round(parsed * 10) / 10));
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Which axes this caption can actually be scored on.
 *
 * `visual` needs an image and `hashtags` needs tags — see `analysis/weights.ts`
 * for why scoring a dimension that does not apply is worse than dropping it.
 * The remaining five apply to every caption there is.
 */
function applicableDimensions(
  request: AnalysisRequest,
  hashtagCount: number,
): ScoreDimension[] {
  // A personal caption is judged on a different set entirely — see
  // PERSONAL_DIMENSIONS. `visual` drops out the same way it does for a
  // text-only brand post, through the same renormalisation.
  if (request.mode === 'personal') {
    return PERSONAL_DIMENSIONS.filter(
      (dimension) => dimension !== 'visual' || request.hasImage,
    );
  }

  return [
    'hook',
    ...(request.hasImage ? (['visual'] as const) : []),
    'platformFit',
    'audienceFit',
    'cta',
    'readability',
    ...(hashtagCount > 0 ? (['hashtags'] as const) : []),
  ];
}

/**
 * Cleans the model's scores.
 *
 * A dimension missing from the reply, or returned with an empty reason, is
 * dropped rather than defaulted. A defaulted 5/10 with no reason is
 * indistinguishable in the UI from a real middling score, and it would be
 * weighted into the reach score as though the model had judged it — the
 * renormalisation in `weights.ts` exists precisely so that dropping it is safe.
 */
function normaliseScores(
  payload: RawAnalysisPayload,
  dimensions: readonly ScoreDimension[],
): Partial<Record<ScoreDimension, DimensionScore>> {
  const raw = payload.scores ?? {};
  const scores: Partial<Record<ScoreDimension, DimensionScore>> = {};

  for (const dimension of dimensions) {
    const entry = raw[dimension];
    if (!entry || typeof entry !== 'object') continue;

    const reason = asString(entry.reason, 300);
    if (!reason) continue;

    scores[dimension] = {
      score: asScore(entry.score),
      confidence: asEnum(entry.confidence, CONFIDENCES, 'Medium'),
      reason,
    };
  }

  return scores;
}

function normaliseEngagement(payload: RawAnalysisPayload): EngagementForecast {
  const raw = payload.engagement ?? {};
  return {
    saves: asEnum(raw.saves, LIKELIHOODS, 'Medium'),
    shares: asEnum(raw.shares, LIKELIHOODS, 'Medium'),
    comments: asEnum(raw.comments, LIKELIHOODS, 'Medium'),
    clicks: asEnum(raw.clicks, LIKELIHOODS, 'Medium'),
    rationale: asString(raw.rationale, 400),
  };
}

function normaliseImprovements(
  payload: RawAnalysisPayload,
  dimensions: readonly ScoreDimension[],
): Improvement[] {
  const raw = Array.isArray(payload.improvements) ? payload.improvements : [];

  return raw
    .map((entry) => {
      const suggestion = asString(entry?.suggestion, 400);
      const dimension = asString(entry?.dimension, 40) as ScoreDimension;
      // Improvements may name one dimension the scores do not — see
      // `improvableDimensions`. Anything outside that set is the model
      // inventing an axis, and is dropped as before.
      if (!suggestion || !improvableDimensions(dimensions).includes(dimension)) {
        return null;
      }

      const gain = typeof entry?.estimatedGain === 'number' ? entry.estimatedGain : 0;

      // The applyable half, kept to the dimension it belongs to. A `suggestedLine`
      // attached to a `readability` improvement is the model wandering, and a
      // client that applied it would be appending a question to a caption
      // nobody asked to have one — so it is dropped rather than rendered.
      const hashtags =
        dimension === 'hashtags'
          ? asStringArray(entry?.suggestedHashtags, 6, 60)
              .map((tag) => tag.replace(/^#+/, '').trim())
              .filter((tag) => /^[\p{L}\p{N}_]+$/u.test(tag))
          : [];
      // `hook` and `cta` are the two places a line can be *added* rather than
      // swapped in — one in front of the caption, one after it. Anywhere else
      // a "suggested line" could only mean replacing something already
      // written, so it is dropped.
      const line =
        dimension === 'cta' || dimension === 'hook'
          ? asString(entry?.suggestedLine, 200)
          : '';

      return {
        dimension,
        issue: asString(entry?.issue, 300),
        suggestion,
        // Capped at 25. A model will occasionally claim one rewrite is worth 60
        // points, which is not a thing any single change to a caption does, and
        // an inflated number here becomes an inflated promise in the UI.
        estimatedGain: Math.min(25, Math.max(0, Math.round(gain))),
        ...(hashtags.length > 0 && { suggestedHashtags: hashtags }),
        ...(line && { suggestedLine: line }),
      };
    })
    .filter((entry): entry is Improvement => entry !== null)
    .sort((a, b) => b.estimatedGain - a.estimatedGain)
    .slice(0, 5);
}

export interface MarketingIntelligenceDeps {
  provider: AiTextProvider;
}

/**
 * Analyses one caption.
 *
 * Throws {@link AiProviderError} for a transport failure and for the one case
 * the provider cannot detect: a reply with no usable dimension in it. Unlike
 * image analysis — which degrades to null because a missing analysis is better
 * than a missing caption — there is no degraded form of this result. A reach
 * score computed from nothing is a number that looks like a verdict and is not
 * one, so the request fails instead.
 */
export async function analyseCaption(
  request: AnalysisRequest,
  { provider }: MarketingIntelligenceDeps,
): Promise<CaptionAnalysis> {
  const startedAt = Date.now();

  if (request.caption.trim().length < MIN_ANALYSABLE_LENGTH[request.mode]) {
    throw new AiProviderError(
      'There is not enough caption here to analyse yet. Write a line or two first.',
      422,
      false,
      `caption length ${request.caption.trim().length}`,
    );
  }

  // ── Brand Intelligence ────────────────────────────────────────────────────
  const brand = resolveBrandProfile({
    brand: request.brand,
    imageAnalysis: request.imageAnalysis,
  });

  // ── Deterministic pass ────────────────────────────────────────────────────
  const metrics = measureCaption(request.caption);

  // Inline tags and the attached list are the same tags to a network, so the
  // union is what every count is taken against. Counting only one of the two
  // is how an eleven-tag post passes a "no more than ten" check.
  const inlineTags = (request.caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) =>
    tag.slice(1).toLowerCase(),
  );
  const hashtagCount = new Set([
    ...inlineTags,
    ...request.hashtags.map((tag) => tag.toLowerCase()),
  ]).size;

  const hasCta = looksLikeCta(request.caption, metrics);

  const platforms = checkPlatforms(request.platforms, {
    caption: request.caption,
    metrics,
    hashtagCount,
    hasImage: request.hasImage,
    hasCta,
  });

  // ── The one model call ────────────────────────────────────────────────────
  const dimensions = applicableDimensions(request, hashtagCount);

  // How this member writes, so `voiceMatch` is judged against them. Two reads
  // and no model call; a failure leaves the judge without it rather than
  // failing the analysis — see `style/profile.service.ts`.
  const style =
    request.mode === 'personal' && request.userId
      ? await loadStyleContext(
          { userId: request.userId, contextType: 'personal' },
          situationForRequest(request.imageAnalysis ?? null, request.caption),
        )
      : null;

  const built = buildAnalysisPrompt({
    request,
    brand,
    metrics,
    platforms,
    hashtagCount,
    dimensions,
    styleSection: style?.section ?? null,
    history: style?.history ?? [],
  });

  const payload = (await provider.generateJson({
    systemInstruction: built.systemInstruction,
    prompt: built.prompt,
    responseSchema: built.responseSchema,
    temperature: built.temperature,
  })) as RawAnalysisPayload;

  const scores = normaliseScores(payload, dimensions);

  if (Object.keys(scores).length === 0) {
    throw new AiProviderError(
      'The AI could not assess this caption. Please try again.',
      502,
      true,
      `no usable dimension: ${JSON.stringify(payload).slice(0, 300)}`,
    );
  }

  // ── The mechanical platform verdict overrides the model's ─────────────────
  //
  // `platformFit` is the one dimension where deterministic code knows better:
  // it is character budgets and hashtag bands, and those are measured, not
  // judged. The model is still asked for it — its reading of register and shape
  // is worth having — but the measured score wins where the two disagree, and
  // its reason is kept so the explanation still says something specific.
  const measuredFit = platformFitScore(platforms);
  if (measuredFit !== null && scores.platformFit) {
    scores.platformFit = {
      score: measuredFit,
      confidence: 'High',
      reason: scores.platformFit.reason,
    };
  }

  // ── Roll-up ───────────────────────────────────────────────────────────────
  const { reachScore, weights } = computeReachScore({ scores, weights: DEFAULT_WEIGHTS });

  const explanation = explainScore(scores, metrics, platforms);
  // Model-written strengths and weaknesses go in front of the derived ones:
  // they are the specific observations, and the derived lines are the
  // countable backstop.
  explanation.strengths = [
    ...asStringArray(payload.strengths, 4),
    ...explanation.strengths,
  ].slice(0, 6);
  explanation.weaknesses = [
    ...asStringArray(payload.weaknesses, 4),
    ...explanation.weaknesses,
  ].slice(0, 6);

  const checklist = buildChecklist({
    caption: request.caption,
    metrics,
    hashtagCount,
    hasImage: request.hasImage,
    platforms,
    scores,
    brand,
    mode: request.mode,
  });

  const durationMs = Date.now() - startedAt;

  console.info('[ai] caption analysed', {
    model: provider.model,
    durationMs,
    reachScore,
    readiness: checklist.readiness,
    dimensions: Object.keys(scores),
    platforms: request.platforms,
    brandCompleteness: brand.completeness,
  });

  return {
    reachScore,
    scores,
    weights,
    explanation,
    metrics,
    platforms,
    engagement: normaliseEngagement(payload),
    checklist,
    improvements: normaliseImprovements(payload, dimensions),
    brand,
    meta: {
      analysisVersion: ANALYSIS_VERSION,
      weightsVersion: WEIGHTS_VERSION,
      promptVersion: built.version,
      provider: provider.id,
      model: provider.model,
      durationMs,
      analysedAt: new Date().toISOString(),
    },
  };
}
