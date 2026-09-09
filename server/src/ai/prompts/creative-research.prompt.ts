/**
 * Two prompts for one research operation:
 *
 *   buildResearchQuery       the grounded call — Gemini + Google Search,
 *                            free text out. Now searches THREE tracks:
 *                            1. Brand-type × Occasion: "how restaurants do Diwali marketing"
 *                            2. Visual design patterns for the selected style: "editorial social design typography 2024"
 *                            3. Engagement & composition best practices for this platform/occasion combo
 *
 *   buildResearchSynthesis   the ordinary JSON call — turns that free text into the
 *                            structured CreativeResearch object, now with richer
 *                            font/layout/engagement signals the composer will use.
 *
 * See `ai/research/gemini-grounded-search.ts` for why these are two separate
 * Gemini calls rather than one.
 */

export const CREATIVE_RESEARCH_PROMPT_VERSION = 3;

export interface CreativeResearchContext {
  /** The member's raw request — drives the query, not a generic category search. */
  request: string;
  brandName?: string;
  industry?: string;
  audience?: string;
  goal: string;
  funnelStage: string;
  platforms: string[];
  products?: string[];
  /** The FlowPost style name (e.g. "Editorial", "Minimal Doodles") — used to search real visual references for this style. */
  selectedStyleName?: string;
  /** Extracted event/occasion from the request (e.g. "Diwali", "Christmas", "product launch") */
  occasion?: string;
}

function renderContextLines(context: CreativeResearchContext): string[] {
  return [
    context.brandName && `Brand: ${context.brandName}`,
    context.industry && `Industry/Brand type: ${context.industry}`,
    context.products?.length && `Product/service: ${context.products.join(', ')}`,
    context.audience && `Audience: ${context.audience}`,
    `Goal: ${context.goal}`,
    `Funnel stage: ${context.funnelStage}`,
    context.platforms.length && `Platform: ${context.platforms.join(', ')}`,
    context.selectedStyleName && `Design style: ${context.selectedStyleName}`,
    context.occasion && `Occasion/Campaign: ${context.occasion}`,
    `Request: "${context.request}"`,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);
}

// ─── Stage 1: the grounded call ───────────────────────────────────────────────

const GROUNDED_SYSTEM_INSTRUCTION = `You are FlowPost's creative research director. Your job is to find real-world design intelligence before a creative is made.

Research THREE tracks simultaneously using Google Search:

TRACK 1 — BRAND × OCCASION RESEARCH
How do brands in this specific industry/category actually market for this occasion or campaign type?
- Search: "[industry] [occasion] marketing campaign design visual"
- What visual approaches, moods, copy styles do these brands use?
- What makes their creatives actually connect with people vs feel generic?
- What content do consumers respond to in this category for this occasion?

TRACK 2 — DESIGN STYLE RESEARCH (if a style is selected)
How do professional designers actually execute this visual style for social media?
- Search: "[style name] social media design typography composition 2024"
- What fonts, color approaches, layout patterns are genuinely associated with this style?
- What does outstanding execution look like vs mediocre template execution?
- Real designer insights, not Pinterest boards.

TRACK 3 — ENGAGEMENT & COMPOSITION INTELLIGENCE
What composition and typography decisions drive highest engagement on social media for this type of content?
- Search: "social media marketing design engagement typography [platform]"
- How much copy performs best for this platform and goal?
- What visual hierarchy decisions (size contrast, whitespace, focal point) drive stops and clicks?
- What makes someone stop scrolling vs scroll past?

Extract PATTERNS and PRINCIPLES — never reproduce a specific ad, headline, or brand's exact treatment.
Return rich prose covering all three tracks. The AI composer will use this to make every single design decision.`;

export function buildResearchQuery(context: CreativeResearchContext): {
  systemInstruction: string;
  prompt: string;
} {
  const tracks: string[] = [];

  // Track 1: Brand × Occasion (always)
  const brandContext = [context.industry, context.brandName].filter(Boolean).join(' ');
  const occasionContext = context.occasion || context.request;
  tracks.push(`TRACK 1 — BRAND × OCCASION: How do ${brandContext || 'brands'} market for ${occasionContext}? What visual and creative approaches actually connect with people?`);

  // Track 2: Style references (when a style is selected)
  if (context.selectedStyleName) {
    tracks.push(`TRACK 2 — STYLE REFERENCES: How is "${context.selectedStyleName}" design style executed in professional social media marketing? Real font choices, composition patterns, color approaches for this style — not template descriptions.`);
  }

  // Track 3: Engagement intelligence (always)
  const platformStr = context.platforms.join('/') || 'social media';
  tracks.push(`TRACK 3 — ENGAGEMENT INTELLIGENCE: For a ${context.goal.replace(/_/g, ' ')} creative on ${platformStr} — what composition, copy volume, and visual hierarchy decisions drive the strongest engagement? What stops scrolling?`);

  const prompt = [
    '## Campaign context',
    ...renderContextLines(context),
    '',
    '## Research tracks to cover',
    ...tracks.map((t, i) => `${i + 1}. ${t}`),
    '',
    'Search all three tracks. Return your findings as rich prose covering each track. The downstream AI composer will read this and make ALL design decisions from it.',
  ].join('\n');

  return { systemInstruction: GROUNDED_SYSTEM_INSTRUCTION, prompt };
}

// ─── Stage 2: normalise into CreativeResearch ─────────────────────────────────

const SYNTHESIS_SYSTEM_INSTRUCTION = `You are a research analyst turning creative-research notes into a structured brief for an AI graphic designer.

The AI designer will read your output and make ALL of these decisions:
- Which fonts to use (from a fixed list of 26 available families)
- How much text to place on the design
- What font sizes and scale contrast to use
- Where to place elements
- What visual approach to take

Your job: extract the PATTERNS and PRINCIPLES that will guide those decisions.

Rules you never break:
- Extract the mechanism, not the content. "Product used as visual metaphor" is a pattern. A specific headline or brand treatment is not.
- Make your typographyInsights genuinely useful — if research shows editorial designs use large serif headlines at 3-5x the body size, SAY THAT.
- Make your engagementInsights actionable — "minimal text, 1-3 words at extreme scale" is useful. "Use good typography" is not.
- Flag generic AI-template patterns (centered product + gradient, giant headline, floating 3D objects, generic stock scenes) as ideasToAvoid.
- If no research was available, reason from strong knowledge of advertising craft for this category.
- Return only the JSON. No commentary, no markdown fences.`;

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
    visualPatterns: stringArray('Recurring visual patterns observed — color moods, lighting, textures, not tied to any one reference.', 8),
    typographyInsights: stringArray(
      'SPECIFIC typography insights: font character (elegant serif vs bold display vs clean sans), scale relationships seen (headline 4x body, etc.), case treatment, tracking. Make this actionable for font selection.',
      6,
    ),
    compositionInsights: stringArray(
      'Specific composition patterns: where focal points sit, how negative space is used, how image and text relate. Actionable for layout decisions.',
      6,
    ),
    engagementInsights: stringArray(
      'What drives engagement for this brand type + occasion + platform: how much copy, what visual hierarchy, what emotional tone, what stops scrolling. Be specific.',
      6,
    ),
    brandOccasionPatterns: stringArray(
      'How this specific brand category approaches this occasion in their marketing: mood, cultural references, what resonates with their audience.',
      6,
    ),
    productTreatmentPatterns: stringArray('Recurring ways a product/subject is presented in strong examples.', 4),
    ideasToAvoid: stringArray('Generic/overused patterns to actively avoid — template looks, AI clichés, category defaults.', 6),
    originalityDirection: {
      type: 'string',
      description: 'One sentence: what would make a creative for THIS brand/occasion/style genuinely memorable and different from the category average.',
    },
  },
  required: ['creativeMechanisms', 'typographyInsights', 'engagementInsights', 'originalityDirection'],
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
      ? `## Research findings\n${groundedText}`
      : 'No live research was available — reason from strong knowledge of advertising craft, visual design, and engagement patterns for this specific brand category and occasion.',
    '',
    'Extract the patterns per the schema. Make typography and engagement insights SPECIFIC and ACTIONABLE — the AI designer reading this will make all font and layout decisions from your output.',
    'Return a single JSON object matching the provided schema.',
  ].join('\n');

  return {
    systemInstruction: SYNTHESIS_SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: CREATIVE_RESEARCH_RESPONSE_SCHEMA,
    temperature: 0.5,
    version: CREATIVE_RESEARCH_PROMPT_VERSION,
  };
}
