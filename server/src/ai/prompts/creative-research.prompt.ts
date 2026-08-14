/**
 * Two prompts for one research operation:
 *
 *   buildResearchQuery       the grounded call — Gemini + Google Search,
 *                            free text out, asked to research technique,
 *                            never to reproduce a specific ad.
 *   buildResearchSynthesis   the ordinary JSON call — turns that free text
 *                            (or, absent grounding, nothing) into the
 *                            structured CreativeResearch patterns.
 *
 * See `ai/research/gemini-grounded-search.ts` for why these are two separate
 * Gemini calls rather than one.
 */

export const CREATIVE_RESEARCH_PROMPT_VERSION = 2;

export interface CreativeResearchContext {
  /** The member's raw request — what drives the query, not a generic category search. */
  request: string;
  brandName?: string;
  industry?: string;
  audience?: string;
  goal: string;
  funnelStage: string;
  platforms: string[];
  products?: string[];
}

function renderContextLines(context: CreativeResearchContext): string[] {
  return [
    context.brandName && `Brand: ${context.brandName}`,
    context.industry && `Industry: ${context.industry}`,
    context.products?.length && `Product/service: ${context.products.join(', ')}`,
    context.audience && `Audience: ${context.audience}`,
    `Goal: ${context.goal}`,
    `Funnel stage: ${context.funnelStage}`,
    context.platforms.length && `Platform: ${context.platforms.join(', ')}`,
    `Request: "${context.request}"`,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);
}

// ─── Stage 1: the grounded call ───────────────────────────────────────────────

const GROUNDED_SYSTEM_INSTRUCTION = `You are FlowPost's creative research director.

Research current, publicly available advertising and visual-design patterns relevant to this campaign. You are researching CREATIVE TECHNIQUES, not copying campaigns.

Study multiple relevant sources. Extract abstract patterns such as:
- visual metaphors
- unexpected scale
- juxtaposition
- editorial composition
- typography treatment
- color relationships
- whitespace
- product presentation
- storytelling mechanisms
- cultural visual cues
- campaign formats

Do NOT:
- reproduce a specific advertisement
- reproduce a Pinterest composition
- copy another brand's logo
- copy exact campaign wording
- recreate a single reference
- instruct anyone to imitate one source

Return an abstraction of the creative landscape — patterns and mechanisms in your own words, in plain prose. The goal is to help FlowPost create something ORIGINAL for the selected brand.`;

export function buildResearchQuery(context: CreativeResearchContext): {
  systemInstruction: string;
  prompt: string;
} {
  const prompt = [
    '## Campaign context',
    ...renderContextLines(context),
    '',
    'Research creative advertising concepts for this category, current visual campaign patterns, and relevant design inspiration — derived from the actual request above, not a generic search. Summarise what you find as abstracted patterns and mechanisms, in a few short paragraphs.',
  ].join('\n');

  return { systemInstruction: GROUNDED_SYSTEM_INSTRUCTION, prompt };
}

// ─── Stage 2: normalise into CreativeResearch ─────────────────────────────────

const SYNTHESIS_SYSTEM_INSTRUCTION = `You are a research analyst turning creative-research notes into a structured brief. You extract patterns, never content to reproduce.

Rules you never break:
- Extract the mechanism, not the content. "Product used as visual metaphor" is a pattern. A specific composition, headline or brand's exact treatment is not something to repeat.
- Actively flag generic AI-template patterns (centered product + gradient, giant headline, floating 3D objects, generic stock-office scenes, glowing dashboards) as ideasToAvoid when relevant — the goal is a memorable creative, not another one of those.
- If no research notes were provided, reason from general knowledge of advertising and design craft for this category — do not invent specific campaigns or attribute a pattern to a named brand you were not shown.
- Return only the JSON object described. No commentary, no markdown fences.`;

const stringArray = (description: string, maxItems: number) => ({
  type: 'array',
  maxItems,
  items: { type: 'string' },
  description,
});

export const CREATIVE_RESEARCH_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    creativeMechanisms: stringArray(
      'The underlying creative mechanism behind strong examples — e.g. "unexpected scale", "product as metaphor", "editorial storytelling".',
      8,
    ),
    visualPatterns: stringArray('Recurring visual patterns — not tied to any one reference.', 8),
    typographyPatterns: stringArray('Recurring typography/layout character, if relevant to this request.', 4),
    compositionPatterns: stringArray('Recurring composition/framing choices.', 6),
    productTreatmentPatterns: stringArray('Recurring ways a product/subject is presented.', 6),
    ideasToAvoid: stringArray('Generic/overused patterns to actively avoid for this request.', 6),
    originalityDirection: {
      type: 'string',
      description: 'One sentence: how this request\'s creative should differ from what was studied.',
    },
  },
  required: ['creativeMechanisms', 'originalityDirection'],
};

export interface BuiltResearchSynthesisPrompt {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  temperature: number;
  version: number;
}

export function buildResearchSynthesis(
  context: CreativeResearchContext,
  groundedText: string | null,
): BuiltResearchSynthesisPrompt {
  const prompt = [
    '## Campaign context',
    ...renderContextLines(context),
    '',
    groundedText
      ? `## Research notes\n${groundedText}`
      : 'No live research was available for this request — reason from your own knowledge of strong advertising and design craft for this category instead.',
    '',
    'Cluster what you notice into abstracted patterns per the schema, and give one clear direction for how an original creative for THIS request should differ from what was studied.',
    'Return a single JSON object matching the provided schema. Nothing else.',
  ].join('\n');

  return {
    systemInstruction: SYNTHESIS_SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: CREATIVE_RESEARCH_RESPONSE_SCHEMA,
    temperature: 0.6,
    version: CREATIVE_RESEARCH_PROMPT_VERSION,
  };
}
