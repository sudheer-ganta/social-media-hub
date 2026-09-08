import { renderBrandSection } from '../brand/brand-profile';
import { renderCreativeDnaSection } from '../brand/creative-dna';
import type {
  BrandProfile,
  CreativeConcept,
  CreativeIntentBrief,
  CreativeResearch,
  FunnelStage,
  MarketingGoal,
  RecentCreativeSignature,
  ReferenceStyleProfile,
  ResolvedCreativeDna,
} from '../types';

/**
 * The layer this pipeline was missing: an ANSWER TO "what is the idea?" that
 * exists before anything visual is decided.
 *
 * Every template collapse this stage exists to prevent had the same shape —
 * the pipeline went straight from "what event is this?" to "what layout do we
 * use?", so the event became the template and the layout became the idea. The
 * fix is not more rules about layouts; it is a stage whose only output is a
 * MECHANISM, chosen deliberately, that the graphic design must then express.
 *
 * Two properties of this prompt are load-bearing and must survive edits:
 *
 *  1. **`creativeMechanism` is free text, not an enum.** The examples below
 *     are examples. A model that can only pick from a list will pick the same
 *     item for the same kind of brief forever, which is a template with extra
 *     steps.
 *  2. **Domain context is described in MEANING, never in imagery.** The
 *     occasion says what it means to people and which visual moves are
 *     exhausted; it never says "add a lamp", "add gold", "add a family". What
 *     the creative shows is the mechanism's decision, downstream of here.
 */

export const CREATIVE_STRATEGY_PROMPT_VERSION = 1;

const SYSTEM_INSTRUCTION = `You are the Executive Creative Director of an independent agency, working at the stage BEFORE any design exists.

Nothing visual has been decided. No layout, no typography, no photography, no colour. You are not allowed to describe a layout, and you must not think in terms of "headline here, image there".

Your only output is a CREATIVE STRATEGY: what this communicates, and the MECHANISM by which it communicates.

==================================================
THE SEVEN QUESTIONS
==================================================

Answer these in order, internally, before writing anything:

1. WHAT is actually being communicated?
2. WHO is the audience, and what is true about them right now?
3. WHAT is the communication objective — what must change in the viewer?
4. WHAT is this brand's identity, and what would only this brand say?
5. WHAT emotional response is wanted?
6. WHAT creative mechanism could carry all of the above?
7. WHAT visual opportunity does that mechanism open up?

The mechanism (6) is the answer that matters. Everything downstream executes it.

==================================================
WHAT A CREATIVE MECHANISM IS
==================================================

A mechanism is HOW an idea reaches a person — the device, not the subject and not the style.

Examples of mechanisms — these are EXAMPLES, not a menu, and you are expected to invent mechanisms that are not on this list:
visual metaphor - typographic transformation - scale distortion - object juxtaposition -
editorial photography - documentary moment - product-as-hero - collage - cultural abstraction -
visual pun - negative-space storytelling - repetition - modular typography - tactile print treatment -
surreal transformation - cinematic crop - sequential storytelling - data visualisation -
product architecture - hand-built composition

Name the mechanism in your own words, specifically enough that two designers reading it would build the same kind of thing and could not mistake it for any other mechanism.

A mechanism is NOT:
- "a poster with the event name big" (that is a layout)
- "warm and festive" (that is a mood)
- "modern minimal" (that is a style)
- "show the product looking premium" (that is an absence of an idea)

==================================================
CONTEXT INFORMS. IT NEVER DICTATES.
==================================================

If the request involves an occasion, a festival, a fandom moment, a season, a milestone, a category convention or any other shared context, describe that context in terms of MEANING:
- what it means to the people it belongs to
- what it is emotionally associated with
- what must not be got wrong about it
- which visual moves have been so exhausted by other advertisers that using them would make this creative invisible

Symbols you list are AVAILABLE to the idea. They are not requirements, and listing one is not permission to decorate with it. The mechanism decides whether any of them appear at all.

An occasion never determines a composition. Two campaigns for the same occasion should be able to arrive at completely different mechanisms, and two campaigns for different occasions must not inherit the same visual language just because both are occasions.

==================================================
NAME WHAT IS FORBIDDEN
==================================================

List the specific cliches this creative is forbidden from using — both the generic advertising defaults and the exhausted moves for this particular context. Be concrete: "a family smiling around a table", "a glowing product on a gradient", "a big word on the left with a photograph on the right". Vague prohibitions ("avoid cliches") are worthless.

==================================================
BRAND IS A CONSTRAINT, NOT A TEMPLATE
==================================================

The brand constrains tone, vocabulary, palette and personality. It does NOT constrain the mechanism. The same brand must be able to produce a typographic piece, a photographic piece, a collage and a product piece and stay recognisably itself in all of them.

Return ONLY valid JSON matching the supplied schema.`;

const str = (description: string) => ({ type: 'string', description });
const strArray = (description: string, maxItems = 6) => ({
  type: 'array',
  items: { type: 'string' },
  maxItems,
  description,
});

export const CREATIVE_STRATEGY_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: [
    'communicationIdea',
    'creativeMechanism',
    'emotionalDirection',
    'brandConnection',
    'visualOpportunity',
    'prohibitedVisualCliches',
  ],
  properties: {
    communicationIdea: str('The one thing this creative communicates, in a single sentence. Not a slogan — the idea.'),
    creativeMechanism: str(
      'The device by which it communicates, named in your own words. Free text — invent one if none of the named examples fits. Never a layout, a mood or a style.',
    ),
    emotionalDirection: str('The feeling the viewer is left with.'),
    visualMetaphor: str('The metaphor, if this idea is built on one. Empty string if it is not — most ideas are not.'),
    narrativeDevice: str('The narrative device, if the idea uses one (sequence, reveal, before/after, fragment). Empty string otherwise.'),
    audienceTension: str('The tension in the audience\'s life this idea speaks to. Empty string if the idea is not built on one.'),
    brandConnection: str('Why this idea belongs to THIS brand and would not fit its competitor.'),
    visualOpportunity: str(
      'The specific visual opportunity the mechanism opens up — what a designer can now do that they could not before. Still not a layout.',
    ),
    distinctiveness: str('What makes this different from a conventional social-media template for the same request.'),
    prohibitedVisualCliches: strArray(
      'Named, concrete cliches this creative is forbidden from using — generic ad defaults AND the exhausted moves for this specific context.',
      8,
    ),
    domainContext: {
      type: 'object',
      description:
        'The occasion/topic/category context, described in MEANING only. Omit entirely when the request carries no shared context.',
      properties: {
        occasion: str('The occasion or topic in the member\'s own terms. Empty string if there is none.'),
        meaning: str('What it means to the people it belongs to.'),
        relevantSymbols: strArray('Symbols genuinely associated with it. AVAILABLE to the idea, never required by it.', 8),
        emotionalAssociations: strArray('What it is emotionally associated with.', 6),
        sensitivities: strArray('What a creative must not get wrong about it.', 6),
        visualClichesToAvoid: strArray('The exhausted visual moves every other advertiser already uses for it.', 8),
      },
    },
  },
};

export interface BuiltCreativeStrategyPrompt {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  temperature: number;
  version: number;
}

function renderRecentSection(recent?: RecentCreativeSignature[]): string | null {
  if (!recent?.length) return null;
  return [
    '## This brand\'s recent creatives — the mechanism you choose must not repeat these',
    ...recent.map(
      (s) => `- ${s.artDirectionFamily}, mode ${s.mode}, palette: ${s.palette.join(', ') || 'unspecified'}`,
    ),
  ].join('\n');
}

function renderReferenceSection(style?: ReferenceStyleProfile): string | null {
  if (!style?.analysed) return null;
  const lines = [
    style.visualLanguage && `- Visual language the member likes: ${style.visualLanguage}`,
    style.creativeMechanisms.length && `- Mechanisms visible in their references: ${style.creativeMechanisms.join('; ')}`,
    style.doNotCopy.length && `- Never reproduce: ${style.doNotCopy.join('; ')}`,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);
  if (!lines.length) return null;
  return `## Reference taste (influences feel, never the mechanism)\n${lines.join('\n')}`;
}

function renderResearchSection(research?: CreativeResearch): string | null {
  const lines = [
    research?.creativeMechanisms.length && `- Mechanisms seen in strong work: ${research.creativeMechanisms.join('; ')}`,
    research?.ideasToAvoid.length && `- Already exhausted: ${research.ideasToAvoid.join('; ')}`,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);
  if (!lines.length) return null;
  return `## Research (technique inspiration only)\n${lines.join('\n')}`;
}

/** A previous strategy this one must NOT repeat — the redesign pass switches the idea, not the layout. */
export interface PreviousStrategySummary {
  creativeMechanism: string;
  communicationIdea: string;
  visualMetaphor?: string;
  reason?: string;
}

export function buildCreativeStrategyPrompt(context: {
  request: string;
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  platforms: string[];
  hasAssets: boolean;
  brand: BrandProfile;
  creativeDna: ResolvedCreativeDna;
  concept?: CreativeConcept;
  intent?: CreativeIntentBrief;
  research?: CreativeResearch;
  recentSignatures?: RecentCreativeSignature[];
  referenceStyle?: ReferenceStyleProfile;
  previousStrategy?: PreviousStrategySummary;
}): BuiltCreativeStrategyPrompt {
  const { concept, intent, previousStrategy } = context;

  const prompt = [
    `What is the creative strategy for this request: "${context.request}"?`,

    [
      '## Communication context',
      `- Marketing goal: ${context.goal}`,
      `- Funnel stage: ${context.funnelStage}`,
      context.platforms.length ? `- Platforms: ${context.platforms.join(', ')}` : null,
      context.hasAssets
        ? '- The member attached their own image(s). The mechanism may use them as material, or may not use them at all — an attached asset is not an instruction to build a photo layout.'
        : '- No image was attached. The mechanism decides whether this creative needs imagery at all.',
    ]
      .filter((line): line is string => typeof line === 'string')
      .join('\n'),

    intent
      ? [
        '## What the member actually asked for (facts, not visual direction)',
        intent.event && `- Occasion/topic named: ${intent.event}`,
        intent.offer && `- Offer: ${intent.offer}`,
        intent.audience && `- Audience: ${intent.audience}`,
        intent.venueType && `- Venue/context: ${intent.venueType}`,
        intent.requiredClaims.length
          ? `- Must be communicated: ${intent.requiredClaims.map((c) => `"${c}"`).join(', ')}`
          : null,
        '',
        'These are FACTS the creative must carry. None of them describes how the creative should look.',
      ]
        .filter((line): line is string => typeof line === 'string' && line.length > 0)
        .join('\n')
      : null,

    concept
      ? [
        '## The chosen advertising idea this strategy must serve',
        `- ${concept.conceptName}: ${concept.bigIdea}`,
        `- Its mechanism, as proposed: ${concept.visualMechanism}`,
        concept.visualMetaphor && `- Metaphor: ${concept.visualMetaphor}`,
        concept.productRole && `- How the product participates: ${concept.productRole}`,
        '',
        'Sharpen this into a strategy. Do not replace it with a different idea.',
      ]
        .filter((line): line is string => typeof line === 'string' && line.length > 0)
        .join('\n')
      : null,

    renderBrandSection(context.brand),
    renderCreativeDnaSection(context.creativeDna),
    renderReferenceSection(context.referenceStyle),
    renderResearchSection(context.research),
    renderRecentSection(context.recentSignatures),

    previousStrategy
      ? [
        '## REJECTED STRATEGY — do not return to it',
        `- Rejected mechanism: "${previousStrategy.creativeMechanism}"`,
        `- Rejected idea: "${previousStrategy.communicationIdea}"`,
        previousStrategy.visualMetaphor && `- Rejected metaphor: "${previousStrategy.visualMetaphor}"`,
        previousStrategy.reason && `- Why it failed: ${previousStrategy.reason}`,
        '',
        'Your new strategy must communicate the same facts through a GENUINELY DIFFERENT mechanism — a different device, a different metaphor (or none), a different relationship between the elements. Restyling the rejected idea is a failure.',
      ]
        .filter((line): line is string => typeof line === 'string' && line.length > 0)
        .join('\n')
      : null,

    'Answer the seven questions internally, then return a single JSON object matching the schema. No commentary.',
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n\n');

  return {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: CREATIVE_STRATEGY_RESPONSE_SCHEMA,
    temperature: 0.8,
    version: CREATIVE_STRATEGY_PROMPT_VERSION,
  };
}
