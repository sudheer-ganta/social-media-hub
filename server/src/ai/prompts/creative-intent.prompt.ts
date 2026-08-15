/**
 * Stage zero: read the member's request literally, before anyone gets
 * creative with it.
 *
 * This prompt has exactly one job and is deliberately joyless about it — it
 * extracts what the member actually said and nothing else. The creative
 * director downstream reinterprets HOW those facts are communicated; it may
 * never reinterpret the facts themselves, and it cannot honour a requirement
 * nobody wrote down.
 */

export const CREATIVE_INTENT_PROMPT_VERSION = 1;

const SYSTEM_INSTRUCTION = `You extract structured requirements from a marketing request. You are not a copywriter, a strategist, or a creative director — you are the person who writes down what the client said.

Rules you never break:
- Extract ONLY what the request states or unambiguously implies. Never invent an offer, a date, a location, a discount, a product, an event, or an audience the request did not mention. An empty string is always the correct answer for something that was not said.
- Never generalise a specific thing into a generic one. "BTS is coming back" is an event about BTS — not "a music event", not "festive content". "Korean food" is Korean food — not "our menu". "50% off" is 50% off — not "a special offer".
- requiredClaims are the HARD REQUIREMENTS: the specific facts the member supplied that the finished creative must communicate to be correct. Write each one as the shortest phrase that still carries the fact, using the member's own words wherever possible — e.g. ["BTS comeback", "Korean food", "50% off"]. Include named people/groups, named products, categories, offers, events, dates, locations, and explicit calls to action. Do NOT include vibe, tone, style, or art-direction wishes — those are creative freedom, not requirements.
- optionalDetails are things the member mentioned that the creative may legitimately drop — mood words, stylistic preferences, background colour.
- Requirements a request implies but does not state belong nowhere. "We are a restaurant" is a venueType, not a requiredClaim, unless the member asked for it to appear.
- confidence maps a field name to 0–100 for any field you were less than certain about. Omit fields you are sure of.
- Return only the JSON object described. No commentary, no markdown fences.`;

export const CREATIVE_INTENT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    event: { type: 'string', description: 'The specific event or occasion, if the request named one. Empty string otherwise.' },
    culturalContext: { type: 'string', description: 'The cultural/subcultural context the request sits in, if any — e.g. "K-pop / BTS fandom". Empty string otherwise.' },
    productCategory: { type: 'string', description: 'What is being promoted, as specifically as the request states it — e.g. "Korean food". Empty string otherwise.' },
    offer: { type: 'string', description: 'The exact offer, verbatim — e.g. "50% off". Empty string when the request states no offer. NEVER invent one.' },
    promotionType: { type: 'string', description: 'What kind of promotion this is — e.g. "event promotion", "weekend promotion", "brand awareness". Empty string if unclear.' },
    venueType: { type: 'string', description: 'The kind of business/venue, if stated — e.g. "restaurant". Empty string otherwise.' },
    audience: { type: 'string', description: 'Who this is aimed at, if stated or unambiguously implied by the subject — e.g. "BTS / K-pop fans". Empty string otherwise.' },
    requiredClaims: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string' },
      description: 'The hard requirements — short phrases naming the facts the finished creative must communicate. Empty array when the request states no specific facts.',
    },
    optionalDetails: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string' },
      description: 'Mentioned details the creative may drop — mood, style, preference. Empty array if none.',
    },
    confidence: {
      type: 'object',
      description: 'Field name → 0–100, only for fields you were unsure about.',
      properties: {
        event: { type: 'integer' },
        productCategory: { type: 'integer' },
        offer: { type: 'integer' },
        audience: { type: 'integer' },
      },
    },
  },
  required: ['requiredClaims'],
};

export interface BuiltCreativeIntentPrompt {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  temperature: number;
  version: number;
}

export function buildCreativeIntentPrompt(context: {
  request: string;
  /** The brand's own description — context for reading the request, never a source of requirements. */
  brandDescription?: string;
  industry?: string;
}): BuiltCreativeIntentPrompt {
  const prompt = [
    `Extract the requirements from this request, verbatim where possible:\n"${context.request}"`,
    context.brandDescription || context.industry
      ? [
          '## Who is asking (background only — never a source of requirements)',
          context.brandDescription && `- Brand: ${context.brandDescription}`,
          context.industry && `- Industry: ${context.industry}`,
          '- This describes the business in general. The request above is what THIS campaign is about. If the two differ — a multi-cuisine restaurant asking for a Korean-food campaign — the request wins, and the brand background contributes nothing to requiredClaims.',
        ]
          .filter(Boolean)
          .join('\n')
      : null,
    'Return a single JSON object matching the provided schema. Nothing else.',
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n\n');

  return {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: CREATIVE_INTENT_RESPONSE_SCHEMA,
    // The lowest in the pipeline: this stage must not be creative.
    temperature: 0.1,
    version: CREATIVE_INTENT_PROMPT_VERSION,
  };
}
