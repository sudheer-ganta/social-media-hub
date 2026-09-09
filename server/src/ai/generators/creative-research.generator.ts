import { buildResearchQuery, buildResearchSynthesis, type CreativeResearchContext } from '../prompts/creative-research.prompt';
import { groundedSearch } from '../research/gemini-grounded-search';
import type { AiTextProvider } from '../providers';
import type { CreativeResearch, RawCreativeResearchPayload } from '../types';

/**
 * Stage zero of a generation — research the brand type, occasion, style, and
 * engagement patterns BEFORE any creative decision is made.
 *
 * Three parallel research tracks are now built into the grounded query:
 *   1. Brand × Occasion: how this type of brand actually markets for this event
 *   2. Style references: how the selected design style is executed by professionals
 *   3. Engagement intelligence: what composition/copy decisions drive stops and clicks
 *
 * The structured output feeds directly into:
 *   - Font selection (typographyInsights drive AI font choice)
 *   - Copy decisions (engagementInsights set copy volume targets)
 *   - Composition (compositionInsights inform layout decisions)
 *   - Direction (brandOccasionPatterns keep the creative on-brand for the occasion)
 *
 * Never throws. A blank research object degrades gracefully.
 */

function asStringArray(value: unknown, maxItems: number, max = 200): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim().slice(0, max) : ''))
        .filter((item) => item.length > 0),
    ),
  ].slice(0, maxItems);
}

export const EMPTY_CREATIVE_RESEARCH: CreativeResearch = {
  researchPerformed: false,
  sources: [],
  referenceCount: 0,
  creativeMechanisms: [],
  visualPatterns: [],
  typographyPatterns: [],
  typographyInsights: [],
  compositionPatterns: [],
  compositionInsights: [],
  brandOccasionPatterns: [],
  engagementInsights: [],
  productTreatmentPatterns: [],
  ideasToAvoid: [],
  originalityDirection: '',
};

function normalise(
  payload: RawCreativeResearchPayload,
  extra: { researchPerformed: boolean; sources: CreativeResearch['sources'] },
): CreativeResearch {
  const typographyInsights = asStringArray(payload.typographyInsights, 6);
  const compositionInsights = asStringArray(payload.compositionInsights, 6);
  return {
    researchPerformed: extra.researchPerformed,
    sources: extra.sources,
    referenceCount: extra.sources.length,
    creativeMechanisms: asStringArray(payload.creativeMechanisms, 8),
    visualPatterns: asStringArray(payload.visualPatterns, 8),
    // Legacy fields kept for backward compat — populated from new fields when possible
    typographyPatterns: typographyInsights.length > 0 ? typographyInsights : asStringArray(payload.typographyPatterns, 4),
    typographyInsights,
    compositionPatterns: compositionInsights.length > 0 ? compositionInsights : asStringArray(payload.compositionPatterns, 6),
    compositionInsights,
    brandOccasionPatterns: asStringArray(payload.brandOccasionPatterns, 6),
    engagementInsights: asStringArray(payload.engagementInsights, 6),
    productTreatmentPatterns: asStringArray(payload.productTreatmentPatterns, 6),
    ideasToAvoid: asStringArray(payload.ideasToAvoid, 6),
    originalityDirection:
      typeof payload.originalityDirection === 'string' ? payload.originalityDirection.trim().slice(0, 300) : '',
  };
}

export interface GenerateCreativeResearchOptions {
  /** The text-only provider used for the ungrounded synthesis call. Grounding itself always uses GEMINI_RESEARCH_MODEL. */
  provider: AiTextProvider;
  context: CreativeResearchContext;
}

/**
 * One research operation: one grounded call (three tracks) followed by one
 * synthesis call. Never mandatory for generation to proceed.
 */
export async function generateCreativeResearch({
  provider,
  context,
}: GenerateCreativeResearchOptions): Promise<CreativeResearch> {
  const startedAt = Date.now();

  const query = buildResearchQuery(context);
  const grounded = await groundedSearch(query.systemInstruction, query.prompt);

  const built = buildResearchSynthesis(context, grounded?.text ?? null);

  let payload: RawCreativeResearchPayload | undefined;
  try {
    payload = (await provider.generateJson({
      systemInstruction: built.systemInstruction,
      prompt: built.prompt,
      responseSchema: built.responseSchema,
      temperature: built.temperature,
    })) as RawCreativeResearchPayload;
  } catch (error) {
    console.warn('[creative] research synthesis failed, generating without it', {
      detail: error instanceof Error ? error.message : String(error),
    });
    return EMPTY_CREATIVE_RESEARCH;
  }

  if (!payload || typeof payload !== 'object') return EMPTY_CREATIVE_RESEARCH;

  const research = normalise(payload, {
    researchPerformed: Boolean(grounded),
    sources: grounded?.sources ?? [],
  });

  console.info('[creative] research complete', {
    durationMs: Date.now() - startedAt,
    researchPerformed: research.researchPerformed,
    referenceCount: research.referenceCount,
    mechanisms: research.creativeMechanisms.length,
    typographyInsights: research.typographyInsights.length,
    engagementInsights: research.engagementInsights.length,
    brandOccasionPatterns: research.brandOccasionPatterns.length,
  });

  return research;
}
