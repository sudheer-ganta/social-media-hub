import { buildCreativeIntentPrompt } from '../prompts/creative-intent.prompt';
import type { AiTextProvider } from '../providers';
import type { CreativeIntentBrief, RawCreativeIntentPayload } from '../types';

/**
 * Turns the member's natural-language request into a
 * {@link CreativeIntentBrief} — the hard requirements every later stage is
 * validated against.
 *
 * Runs first, ahead of research and concepts, and degrades silently: a failed
 * extraction returns `extracted: false` with no claims, which leaves the
 * pipeline exactly as it behaved before intent existed rather than blocking a
 * generation on a bookkeeping call.
 */

const MAX_CLAIM_LENGTH = 80;

function asString(value: unknown, max = 160): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function asClaims(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => asString(item, MAX_CLAIM_LENGTH))
        .filter((item) => item.length > 0),
    ),
  ].slice(0, maxItems);
}

function asConfidence(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 12)) {
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(parsed)) out[key.slice(0, 40)] = Math.min(100, Math.max(0, Math.round(parsed)));
  }
  return out;
}

export const EMPTY_INTENT: CreativeIntentBrief = {
  extracted: false,
  event: '',
  culturalContext: '',
  productCategory: '',
  offer: '',
  promotionType: '',
  venueType: '',
  audience: '',
  requiredClaims: [],
  optionalDetails: [],
  confidence: {},
};

/** Bounds a model-shaped (or wire-shaped) intent payload. */
export function normaliseIntent(payload: RawCreativeIntentPayload): CreativeIntentBrief {
  return {
    extracted: true,
    event: asString(payload.event),
    culturalContext: asString(payload.culturalContext),
    productCategory: asString(payload.productCategory),
    offer: asString(payload.offer, 80),
    promotionType: asString(payload.promotionType, 80),
    venueType: asString(payload.venueType, 80),
    audience: asString(payload.audience),
    requiredClaims: asClaims(payload.requiredClaims, 8),
    optionalDetails: asClaims(payload.optionalDetails, 6),
    confidence: asConfidence(payload.confidence),
  };
}

export interface GenerateCreativeIntentOptions {
  provider: AiTextProvider;
  request: string;
  brandDescription?: string;
  industry?: string;
}

export async function generateCreativeIntent({
  provider,
  request,
  brandDescription,
  industry,
}: GenerateCreativeIntentOptions): Promise<CreativeIntentBrief> {
  const startedAt = Date.now();
  const built = buildCreativeIntentPrompt({
    request,
    ...(brandDescription && { brandDescription }),
    ...(industry && { industry }),
  });

  try {
    const payload = (await provider.generateJson({
      systemInstruction: built.systemInstruction,
      prompt: built.prompt,
      responseSchema: built.responseSchema,
      temperature: built.temperature,
    })) as RawCreativeIntentPayload;

    const intent = normaliseIntent(payload);
    console.info('[creative] intent extracted', {
      model: provider.model,
      durationMs: Date.now() - startedAt,
      requiredClaims: intent.requiredClaims,
      offer: intent.offer,
      event: intent.event,
    });
    return intent;
  } catch (error) {
    // Never fatal: a request with no extracted requirements simply has no
    // requirements to validate against, which is the pre-intent behaviour.
    console.warn('[creative] intent extraction failed, continuing without hard requirements', {
      detail: error instanceof Error ? error.message : String(error),
    });
    return EMPTY_INTENT;
  }
}

/**
 * Renders the brief as the `## What the member actually asked for` block every
 * downstream prompt opens with. The heading is deliberately blunt: this is the
 * one section a creative idea is never allowed to negotiate with.
 */
export function renderIntentSection(intent?: CreativeIntentBrief): string | null {
  if (!intent?.extracted) return null;
  const lines = [
    intent.event && `- Event/occasion: ${intent.event}`,
    intent.culturalContext && `- Cultural context: ${intent.culturalContext}`,
    intent.productCategory && `- What is being promoted: ${intent.productCategory}`,
    intent.offer && `- Offer: ${intent.offer}`,
    intent.promotionType && `- Promotion type: ${intent.promotionType}`,
    intent.venueType && `- Venue/business type: ${intent.venueType}`,
    intent.audience && `- Audience: ${intent.audience}`,
    intent.optionalDetails.length && `- Optional details (may be dropped): ${intent.optionalDetails.join('; ')}`,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);

  const requirements = intent.requiredClaims.length
    ? [
        '',
        `HARD REQUIREMENTS — the finished creative MUST visibly communicate every one of these: ${intent.requiredClaims
          .map((claim) => `"${claim}"`)
          .join(', ')}.`,
        'You have complete freedom over HOW these are communicated — the idea, the metaphor, the wording, the art direction are all yours. You have no freedom to remove, replace, weaken, generalise or contradict them. A clever concept that drops the offer, the event, or the product is a failed concept, not a bold one.',
      ].join('\n')
    : '';

  if (lines.length === 0 && !requirements) return null;
  return `## What the member actually asked for (this campaign, not the brand in general)\n${lines.join('\n')}${requirements}`;
}
