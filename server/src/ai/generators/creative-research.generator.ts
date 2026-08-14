import { buildResearchQuery, buildResearchSynthesis, type CreativeResearchContext } from '../prompts/creative-research.prompt';
import { groundedSearch } from '../research/gemini-grounded-search';
import type { AiTextProvider } from '../providers';
import type { CreativeResearch, RawCreativeResearchPayload } from '../types';

/**
 * Stage zero of a generation, ahead of the creative-direction call: research
 * how real campaigns are art-directed for this specific brand/request via
 * Gemini + Google Search grounding, then abstract it into patterns before
 * anything is generated. Purely additive context for the direction prompt.
 *
 * Never throws. A blank research object with `researchPerformed: false`
 * degrades the direction to "reason from craft knowledge alone" — the exact
 * tolerance `analyseImage` has for a failed fetch. Grounding failing,
 * `GEMINI_API_KEY` being unset, or the synthesis call itself failing all land
 * in the same place: generation proceeds without it.
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
  compositionPatterns: [],
  productTreatmentPatterns: [],
  ideasToAvoid: [],
  originalityDirection: '',
};

function normalise(
  payload: RawCreativeResearchPayload,
  extra: { researchPerformed: boolean; sources: CreativeResearch['sources'] },
): CreativeResearch {
  return {
    researchPerformed: extra.researchPerformed,
    sources: extra.sources,
    referenceCount: extra.sources.length,
    creativeMechanisms: asStringArray(payload.creativeMechanisms, 8),
    visualPatterns: asStringArray(payload.visualPatterns, 8),
    typographyPatterns: asStringArray(payload.typographyPatterns, 4),
    compositionPatterns: asStringArray(payload.compositionPatterns, 6),
    productTreatmentPatterns: asStringArray(payload.productTreatmentPatterns, 6),
    ideasToAvoid: asStringArray(payload.ideasToAvoid, 6),
    originalityDirection:
      typeof payload.originalityDirection === 'string' ? payload.originalityDirection.trim().slice(0, 300) : '',
  };
}

export interface GenerateCreativeResearchOptions {
  /** The text-only provider used for the ungrounded synthesis call. Grounding itself always uses GEMINI_RESEARCH_MODEL — see gemini-grounded-search.ts. */
  provider: AiTextProvider;
  context: CreativeResearchContext;
}

/**
 * One research operation: one grounded call (Gemini decides how many search
 * queries it needs) followed by one synthesis call — never three independent
 * requests, and never mandatory for generation to proceed.
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
    // Research is an enhancement, not a requirement — a failed synthesis call
    // must not block generation any more than a failed grounding call does.
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
  });

  return research;
}
