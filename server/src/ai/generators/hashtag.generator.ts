import { buildHashtagPrompt, HASHTAG_PROMPT_VERSION } from '../prompts/hashtags.prompt';
import { budgetFor, filterTags, splitTags } from '../hashtags/rules';
import type { AiTextProvider } from '../providers';
import type {
  BrandProfile,
  CaptionMode,
  HashtagResult,
  ImageAnalysis,
} from '../types';

/**
 * Choosing hashtags: prompt → provider → clean → cap.
 *
 * The model's answer is a *suggestion list*, never the result. Everything it
 * returns goes through `hashtags/rules.ts` — cleaned, deduplicated, spam-filtered
 * and trimmed to the tightest selected network's ceiling — so the worst a bad
 * generation can produce is a short list, not an invalid one.
 *
 * ─── Empty is a success ──────────────────────────────────────────────────────
 * A post that reads better without tags returns `primary: []` and a note saying
 * why, with `ok: true`. This is the one generator in the module where an empty
 * result is not degradation, and callers must not treat it as a failure to retry.
 */

export interface HashtagRequest {
  mode: CaptionMode;
  /** Networks this will publish to. Decides the ceiling and the register. */
  platforms: string[];
  /** The caption as it stands, member's edits included. */
  caption: string;
  topic: string;
  language: string;
  /** A member's own preferred count. Capped by the network, never through it. */
  requestedCount?: number;
  imageAnalysis?: ImageAnalysis | null;
  brand?: BrandProfile | null;
  /** Rendered history from `ai/learning/hashtag-history.ts`. */
  historySection?: string | null;
  /** Tags the account genuinely uses — exempt from the spam filter. */
  tagsInUse?: Set<string>;
}

/**
 * Words from the post itself, for the spam filter's relevance exemption.
 *
 * `#love` is reach-farming on a product launch and is the entire subject of a
 * wedding photographer's post. The only cheap evidence for telling those apart is
 * whether the word actually appears in the post's own subject matter, so that is
 * what is collected: the topic, the caption, and what Vision saw.
 */
function relevantWords(request: HashtagRequest): Set<string> {
  const source = [
    request.topic,
    request.caption,
    request.imageAnalysis?.primarySubject ?? '',
    request.imageAnalysis?.sceneDescription ?? '',
    request.imageAnalysis?.setting ?? '',
    request.imageAnalysis?.mood ?? '',
    ...(request.imageAnalysis?.themes ?? []),
    ...(request.imageAnalysis?.objects ?? []),
  ].join(' ');

  return new Set(
    (source.toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) ?? []).filter(
      (word) => word.length > 2,
    ),
  );
}

/**
 * Hashtags for one post.
 *
 * Throws only when the provider itself fails — the caller decides whether a
 * caption still publishes without tags, and in every path through the API it
 * does. See the route.
 */
export async function generateHashtags(
  request: HashtagRequest,
  { provider }: { provider: AiTextProvider },
): Promise<HashtagResult> {
  const started = Date.now();
  const budget = budgetFor(request.platforms, request.requestedCount);

  // Nothing to ask for. A member who set the count to zero, or a network
  // combination with no room, does not need a model call to be told so.
  if (budget.max === 0) {
    return {
      primary: [],
      secondary: [],
      note: 'No hashtags for this one — the selected networks leave no room for them.',
      platforms: request.platforms,
      budget: { min: budget.min, max: budget.max, conflict: budget.conflict },
      rejected: [],
      meta: {
        provider: provider.id,
        model: provider.model,
        durationMs: 0,
        promptVersion: HASHTAG_PROMPT_VERSION,
      },
    };
  }

  const built = buildHashtagPrompt({
    mode: request.mode,
    platforms: request.platforms,
    caption: request.caption,
    topic: request.topic,
    budget,
    imageAnalysis: request.imageAnalysis ?? null,
    brand: request.brand ?? null,
    historySection: request.historySection ?? null,
    language: request.language,
  });

  const payload = (await provider.generateJson({
    systemInstruction: built.systemInstruction,
    prompt: built.prompt,
    responseSchema: built.responseSchema,
    temperature: built.temperature,
  })) as { primary?: unknown; secondary?: unknown; note?: unknown };

  const options = {
    inUse: request.tagsInUse ?? new Set<string>(),
    relevant: relevantWords(request),
  };

  const primaryFiltered = filterTags(payload.primary, options);
  const secondaryFiltered = filterTags(payload.secondary, options);

  // Deduplicate across the two lists as well as within each: a tag promoted to
  // primary must not also appear as an optional extra.
  const claimed = new Set(primaryFiltered.tags);
  const secondaryTags = secondaryFiltered.tags.filter((tag) => !claimed.has(tag));

  // The ceiling is applied after filtering, not before: dropping four spam tags
  // and then keeping only three of what is left would waste the good ones.
  const split = splitTags(primaryFiltered.tags, budget);

  const note =
    typeof payload.note === 'string' && payload.note.trim()
      ? payload.note.trim().slice(0, 200)
      : split.primary.length === 0
        ? 'This post reads better without hashtags.'
        : '';

  return {
    primary: split.primary,
    // Whatever did not fit the ceiling, plus the model's own extras.
    secondary: [...split.secondary, ...secondaryTags].slice(0, 8),
    note,
    platforms: request.platforms,
    budget: { min: budget.min, max: budget.max, conflict: budget.conflict },
    // Returned for the log and for a test, never shown to a member.
    rejected: [...primaryFiltered.rejected, ...secondaryFiltered.rejected],
    meta: {
      provider: provider.id,
      model: provider.model,
      durationMs: Date.now() - started,
      promptVersion: HASHTAG_PROMPT_VERSION,
    },
  };
}
