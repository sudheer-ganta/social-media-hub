/**
 * The AI module.
 *
 * Layered the same way the integrations module is:
 *
 *   routes/ai.routes.ts        HTTP: validate, call, serialize
 *     └─ services/ai.service.ts   application layer, defaults and policy
 *          └─ ai/generators        the flow: prompt → provider → clean result
 *               ├─ ai/prompts      every word the model is told
 *               ├─ ai/brand        Brand Intelligence — resolves one profile
 *               ├─ ai/analysis     deterministic scoring: metrics, rules, weights
 *               ├─ ai/vision       fetches the image the model looks at
 *               └─ ai/providers    one file per vendor, behind one interface
 *
 * Nothing above `ai/providers` knows a vendor's name, and nothing outside
 * `ai/providers/gemini.provider.ts` can see the API key.
 *
 * ─── Two engines ─────────────────────────────────────────────────────────────
 *
 *                        User upload
 *                             │
 *                         [Vision]
 *                             │
 *                   [Brand Intelligence]
 *                             │
 *              ┌──────────────┴──────────────┐
 *              ▼                             ▼
 *   [Creative Intelligence]      [Marketing Intelligence]
 *      captions, angles,             reach score, checklist,
 *      hashtags, platforms           forecast, improvements
 *
 * They are separate calls against separate prompts. A model that writes copy
 * and then scores its own copy scores it well — see the header of
 * `prompts/analysis.prompt.ts`. The practical payoff is that analysis runs over
 * whatever is in the editor, including a caption the user wrote themselves.
 *
 * `ai/analysis` holds the half of scoring that is arithmetic — character
 * budgets, hashtag bands, reading time, the weighted roll-up. The model is only
 * asked what arithmetic cannot answer.
 */

export * from './types';
export {
  AiProviderError,
  activeProvider,
  aiProviders,
  providerForRole,
  type AiProviderId,
  type AiRole,
  type AiTextProvider,
} from './providers';
export {
  buildCaptionPrompt,
  CAPTION_PROMPT_VERSION,
} from './prompts/caption.prompt';
export {
  buildPersonalPrompt,
  PERSONAL_PROMPT_VERSION,
  PROMPT_LINE_BUDGET,
} from './prompts/personal.prompt';
export {
  buildVisionPrompt,
  VISION_PROMPT_VERSION,
} from './prompts/vision.prompt';
export {
  buildAltTextPrompt,
  ALT_TEXT_PROMPT_VERSION,
} from './prompts/alt-text.prompt';
export {
  buildAnalysisPrompt,
  buildAnalysisResponseSchema,
} from './prompts/analysis.prompt';
export {
  buildImprovePrompt,
  buildImproveResponseSchema,
  IMPROVE_PROMPT_VERSION,
  TARGET_KIND,
} from './prompts/improve.prompt';

// ─── Brand Intelligence ──────────────────────────────────────────────────────
export {
  resolveBrandProfile,
  renderBrandSection,
  isBrandProfileEmpty,
} from './brand/brand-profile';

// ─── The two engines ─────────────────────────────────────────────────────────
//
// One entry point, two brains behind it: `generateCaption` runs the shared
// stage one and then forks on `request.mode`. Personal's half lives in
// `generators/personal-caption.generator.ts` and reaches none of the marketing
// machinery below.
export { generateCaption } from './generators/creative-intelligence.generator';
export { writePersonalCaption } from './generators/personal-caption.generator';

// ─── Personal: the deterministic half ────────────────────────────────────────
export {
  aiRejectReason,
  filterCandidates,
  repeatReason,
  repeatsAny,
  tokenSimilarity,
  trigramSimilarity,
  type Candidate,
  type FilterResult,
} from './personal/filters';
export { rankCandidates, type RankedCandidate } from './personal/score';
export {
  aggregateShape,
  captionShape,
  imageConnection,
  voiceDistance,
  type CaptionShape,
  type MeasuredStyle,
} from './style/measure';
export { analyseCaption } from './generators/marketing-intelligence.generator';
export { analyseImage } from './generators/image-analysis.generator';
// Not a third engine — a repair pass over one named part of a post that the
// second engine already flagged. See the header of the generator.
export { improveCaption } from './generators/targeted-improvement.generator';

// ─── Deterministic scoring ───────────────────────────────────────────────────
export { measureCaption, looksLikeCta, hookLine } from './analysis/metrics';
export {
  checkPlatform,
  checkPlatforms,
  platformFitScore,
  platformLabel,
} from './analysis/platform-rules';
export { computeReachScore, explainScore, DIMENSION_LABELS } from './analysis/scoring';
export { buildChecklist } from './analysis/checklist';
export {
  DEFAULT_WEIGHTS,
  normaliseWeights,
  WEIGHTS_VERSION,
  type ScoringWeights,
} from './analysis/weights';
export { ANALYSIS_VERSION, ANALYSIS_PROMPT_VERSION } from './analysis/version';
export { generateAltText } from './generators/alt-text.generator';
export {
  fetchImageBytes,
  fetchInlineImage,
  ImageFetchError,
  type FetchedImage,
  type FetchImageOptions,
} from './vision/image-source';
