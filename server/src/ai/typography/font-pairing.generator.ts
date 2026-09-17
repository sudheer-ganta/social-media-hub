import { existsSync } from 'fs';
import type { AiTextProvider } from '../providers';
import type { CreativeResearch } from '../types';
import { fontFilePath, nearestAvailableWeight, type FontDefinition } from './font-catalog';
import type { CaseHint, TrackingHint } from './style-profiles';

/**
 * The AI half of type pairing: a designer choosing between fonts that would all
 * work, on grounds a scoring function cannot reach.
 *
 * `selectTypography` has always accepted a `provider` and `research` and used
 * neither — the AI path was specified and never built, so pairing was decided
 * entirely by additive scoring. Scoring is very good at ruling fonts OUT (wrong
 * script, illegible at body size, wrong category for the selected style) and
 * weak at the last step, where three or four families all score within a point
 * of each other and the right answer depends on what the campaign is trying to
 * say. That last step is this.
 *
 * It is a CHOOSER OVER A SHORTLIST, never a free pick over the catalog, because
 * the scoring stage enforces three constraints that must not be reopened:
 *
 *   - script coverage — a family without Devanagari renders Devanagari as tofu,
 *   - readability — a display-only face is unreadable at body size,
 *   - the member's selected Style DNA category, which typography may not
 *     reinterpret (font-selector.ts documents this having already been a bug
 *     once, when the category was merely a scoring bonus).
 *
 * A model asked for a family by name would break all three silently. Asked to
 * choose among eight families that already satisfy them, it cannot.
 *
 * Never throws. Any failure — provider error, malformed reply, a family that is
 * not on the shortlist, a weight with no file on disk — returns null, and the
 * caller keeps the deterministic pick it already had.
 */

export interface RolePairingIntent {
  caseIntent: CaseHint;
  trackingIntent: TrackingHint;
}

export interface FontPairingChoice {
  headlineFamily: string;
  bodyFamily: string;
  accentFamily?: string;
  headlineWeight?: number;
  bodyWeight?: number;
  intents: { headline: RolePairingIntent; body: RolePairingIntent };
  reasoning: string;
}

const CASE_HINTS: CaseHint[] = ['upper', 'title', 'sentence', 'none'];
const TRACKING_HINTS: TrackingHint[] = ['tight', 'normal', 'wide'];

const SYSTEM_INSTRUCTION = `You are a typographer choosing the type pairing for one piece of brand communication.

Every font offered to you is already technically valid for its role — correct script coverage, readable at that size, and within the visual language the brand selected. You are not filtering; you are choosing, on typographic grounds:

- CONTRAST WITHOUT CONFLICT. A pairing must differ clearly in at least one dimension — classification, construction, weight, era, width — while sharing at least one point of harmony. Two faces from the same classification and era are the worst outcome: different enough that a reader notices two fonts, not different enough to read as intentional.
- The headline carries the voice. The body must disappear into readability and never compete.
- Match the FORMALITY of the message, not its topic. A serious message in a playful face misreads, and so does the reverse.
- A pairing listed as a curated partner of the headline is usually right, and is not automatically right — say so if you are overriding it.

Choose the pairing that makes THIS message land. Return ONLY the JSON object.`;

const SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['headlineFamily', 'bodyFamily', 'headlineCase', 'headlineTracking', 'bodyCase', 'bodyTracking', 'reasoning'],
  properties: {
    headlineFamily: { type: 'string', description: 'Exactly one family name from the headline shortlist.' },
    bodyFamily: { type: 'string', description: 'Exactly one family name from the body shortlist. Must not be the headline family unless the weights differ sharply.' },
    accentFamily: { type: 'string', description: 'Optional. One family from the accent shortlist, only if an eyebrow or annotation genuinely needs a third voice. Omit when it does not.' },
    headlineCase: { type: 'string', enum: CASE_HINTS, description: 'How the first read should be cased.' },
    headlineTracking: { type: 'string', enum: TRACKING_HINTS, description: 'Letter-spacing character for the first read.' },
    bodyCase: { type: 'string', enum: CASE_HINTS },
    bodyTracking: { type: 'string', enum: TRACKING_HINTS },
    reasoning: { type: 'string', description: 'One or two sentences: what makes this pairing right for this message, and where the contrast lives.' },
  },
};

/** What the model needs to reason typographically — never a bare list of names. */
function describe(font: FontDefinition, pairsWithHeadline?: string[]): string {
  const facts = [
    font.category,
    font.width !== 'normal' ? font.width : null,
    `formality ${font.formality}/5`,
    `reads well: ${font.readability}`,
    font.personality.slice(0, 4).join('/'),
    pairsWithHeadline?.includes(font.family) ? 'curated partner of the chosen headline' : null,
  ].filter(Boolean);
  return `- ${font.family} — ${facts.join('; ')}`;
}

export interface FontPairingInput {
  provider: AiTextProvider;
  /** Shortlists from the deterministic ranking, best-first. The model may only choose from these. */
  candidates: { headline: FontDefinition[]; body: FontDefinition[]; accent: FontDefinition[] };
  context: {
    concept?: string;
    mood?: string;
    brandName?: string;
    visualStyle?: string;
    styleName?: string;
    industry?: string;
    /** The actual words the type will set — length and register both matter. */
    copy: string[];
    research?: CreativeResearch;
  };
}

export async function generateFontPairing({ provider, candidates, context }: FontPairingInput): Promise<FontPairingChoice | null> {
  if (!candidates.headline.length || !candidates.body.length) return null;
  const startedAt = Date.now();

  const headlinePairs = candidates.headline[0]?.pairsWith;
  const prompt = [
    '## The message this type has to carry',
    context.brandName ? `Brand: ${context.brandName}` : null,
    context.concept ? `Creative idea: ${context.concept}` : null,
    context.mood ? `Tone: ${context.mood}` : null,
    context.visualStyle ? `Visual language: ${context.visualStyle}` : null,
    context.styleName ? `Selected design style: ${context.styleName}` : null,
    context.industry ? `Category: ${context.industry}` : null,
    context.copy.length ? `The words being set:\n${context.copy.map((c) => `  "${c}"`).join('\n')}` : null,
    context.research?.typographyInsights?.length
      ? `\nResearch on typography for this audience:\n${context.research.typographyInsights.map((t) => `  - ${t}`).join('\n')}`
      : null,
    '',
    '## Headline shortlist (choose one)',
    candidates.headline.map((f) => describe(f)).join('\n'),
    '',
    '## Body shortlist (choose one)',
    candidates.body.map((f) => describe(f, headlinePairs)).join('\n'),
    candidates.accent.length ? '\n## Accent shortlist (optional — omit unless a third voice is genuinely needed)' : null,
    candidates.accent.length ? candidates.accent.map((f) => describe(f)).join('\n') : null,
    '',
    'Choose the pairing. Return ONLY the JSON object.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  try {
    const raw = (await provider.generateJson({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt,
      responseSchema: SCHEMA,
      temperature: 0.25,
    })) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return null;

    // Only a family the model was actually offered for that role is accepted.
    const pick = (value: unknown, pool: FontDefinition[]): FontDefinition | undefined => {
      if (typeof value !== 'string') return undefined;
      const wanted = value.trim().toLowerCase();
      return pool.find((f) => f.family.toLowerCase() === wanted);
    };

    const headline = pick(raw.headlineFamily, candidates.headline);
    const body = pick(raw.bodyFamily, candidates.body);
    if (!headline || !body) {
      console.warn('[font-pairing] model chose a family it was not offered; keeping the deterministic pairing', {
        headlineFamily: raw.headlineFamily,
        bodyFamily: raw.bodyFamily,
      });
      return null;
    }

    // One family for both roles is only a pairing if the weights carry the
    // contrast — otherwise the hierarchy has nothing to stand on.
    const headlineWeight = nearestAvailableWeight(headline.family, 700);
    const bodyWeight = nearestAvailableWeight(body.family, 400);
    if (headline.family === body.family && Math.abs(headlineWeight - bodyWeight) < 200) {
      console.warn('[font-pairing] one family at one weight is not a pairing; keeping the deterministic pairing', {
        family: headline.family,
      });
      return null;
    }

    const accent = pick(raw.accentFamily, candidates.accent);

    // The renderer rasterizes from font FILES, and designCreative throws outright
    // on a face it cannot load. A pick whose file is missing has to fail here,
    // where the fallback is a good pairing, rather than there, where it is an
    // error the member sees.
    const required: Array<[string, number]> = [
      [headline.family, headlineWeight],
      [body.family, bodyWeight],
    ];
    if (accent) required.push([accent.family, nearestAvailableWeight(accent.family, 400)]);
    const missing = required.filter(([family, weight]) => !existsSync(fontFilePath(family, weight)));
    if (missing.length) {
      console.warn('[font-pairing] chosen face has no font file on this renderer; keeping the deterministic pairing', {
        missing: missing.map(([family, weight]) => `${family} ${weight}`),
      });
      return null;
    }

    const asCase = (value: unknown, fallback: CaseHint): CaseHint =>
      CASE_HINTS.includes(value as CaseHint) ? (value as CaseHint) : fallback;
    const asTracking = (value: unknown, fallback: TrackingHint): TrackingHint =>
      TRACKING_HINTS.includes(value as TrackingHint) ? (value as TrackingHint) : fallback;

    const choice: FontPairingChoice = {
      headlineFamily: headline.family,
      bodyFamily: body.family,
      ...(accent && { accentFamily: accent.family }),
      headlineWeight,
      bodyWeight,
      intents: {
        headline: { caseIntent: asCase(raw.headlineCase, 'none'), trackingIntent: asTracking(raw.headlineTracking, 'normal') },
        body: { caseIntent: asCase(raw.bodyCase, 'sentence'), trackingIntent: asTracking(raw.bodyTracking, 'normal') },
      },
      reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : '',
    };

    console.info('[font-pairing] pairing chosen', {
      durationMs: Date.now() - startedAt,
      headline: choice.headlineFamily,
      body: choice.bodyFamily,
      accent: choice.accentFamily,
    });
    return choice;
  } catch (error) {
    console.warn('[font-pairing] unavailable; keeping the deterministic pairing', {
      detail: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
