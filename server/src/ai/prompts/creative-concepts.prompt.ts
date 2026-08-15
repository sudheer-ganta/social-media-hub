import { renderBrandSection } from '../brand/brand-profile';
import { renderCreativeDnaSection } from '../brand/creative-dna';
import { renderIntentSection } from '../generators/creative-intent.generator';
import type {
  BrandProfile,
  CreativeIntentBrief,
  CreativeResearch,
  FunnelStage,
  MarketingGoal,
  RecentCreativeSignature,
  ReferenceStyleProfile,
  ResolvedCreativeDna,
} from '../types';

/**
 * The Creative Director's actual job: before anything is art-directed or
 * rendered, ask "what is the advertising idea?" — never "what should the
 * image look like?" — and answer with several genuinely different mechanisms,
 * self-scored against a quality gate.
 *
 * This is what keeps FlowPost's output from being "a beautiful AI image with
 * a logo": a concept without a mechanism (visual metaphor, puzzle, wordplay,
 * unexpected scale...) is not a concept, it's a mood board, and this prompt
 * refuses to accept one.
 */

export const CREATIVE_CONCEPTS_PROMPT_VERSION = 3;

/** Mirrors `MechanismFamily` in ai/types.ts — the diversity axis the concept-set gate compares. */
export const MECHANISM_FAMILIES = [
  'VISUAL_METAPHOR',
  'HUMAN_OBSERVATIONAL',
  'INTERACTIVE_PUZZLE',
  'TYPOGRAPHY_WORDPLAY',
  'SURPRISING_SCALE',
  'JUXTAPOSITION',
  'BEFORE_AFTER',
  'TRANSFORMATION',
  'STORYTELLING',
  'OBJECT_INTERACTION',
  'CULTURAL_OBSERVATION',
  'ABSURD_SURREAL',
  'PRODUCT_AS_METAPHOR',
  'DOCUMENTARY_MOMENT',
  'COLLAGE_GRAPHIC',
] as const;

const SYSTEM_INSTRUCTION = `You are the creative director at a multi-brand studio. Your job is to have advertising IDEAS for one specific client, not to describe pretty pictures — and never to apply a house style of your own.

A concept without a mechanism is not a concept. "A beautiful photo of the product" is not an idea — it is the absence of one. Every concept must say HOW it communicates: through a visual metaphor, an unexpected scale, a puzzle the audience solves, a piece of wordplay, a surreal juxtaposition, a human moment, a before/after, a hidden detail — something with a name you could say out loud.

Rules you never break:
- Three inputs, three jobs, in priority order — never let one collapse into another: the brand's confirmed identity CONSTRAINS every concept; the member's request + stated requirements DETERMINE what is being advertised; any reference style INFLUENCES how concepts feel. The same brand must be able to look dramatically different across campaigns, and different brands given the same request must produce dramatically different concept sets — a restaurant, a fashion label, a SaaS tool, a travel company and a beauty brand asking for "a launch campaign" should share nothing but craft. Never reach for a genre default (dark-purple event glow, blue-white SaaS, warm restaurant amber, beige luxury) unless this client's own brand, campaign or references specifically support it.
- Propose 3–5 concepts that use GENUINELY DIFFERENT mechanisms. Never five variations of the same idea with different colours/backgrounds/props — that is one concept repeated, not five concepts. Draw from a wide mechanism library: visual metaphor, unexpected scale, juxtaposition, transformation, object interaction, puzzle, game, optical illusion, wordplay, double meaning, surreal realism, unexpected environment, human observation, cultural observation, before/after, negative space, object substitution, editorial storytelling, humour, contrast, curiosity gap, hidden detail, perspective trick, pattern interruption.
- PLAN THE SET BEFORE WRITING IT. Internally (never in the output): list the candidate mechanism families that genuinely fit this brief and this brand, then pick one DIFFERENT family per concept — each concept declares its family in mechanismFamily. No two concepts in one response may share a mechanismFamily, and the families must fit the brand: a luxury label leans editorial metaphor and product story more naturally than a meme; a restaurant can carry food interaction, humour, human observation; a workflow tool can carry process metaphor, transformation, interaction. Which families you pick is decided fresh per brief — never the same fixed trio every time, and never a family forced onto a brand it fights.
- THE OBVIOUS TOPIC ANGLE GETS ONE CONCEPT AT MOST. A brief's surface imagery ("next month" → a calendar, "faster" → a stopwatch, "launch" → a rocket) may drive ONE concept; the others must find genuinely different ways in — a human moment, an interaction, a transformation, a cultural observation. Three ideas built on the same central object or image are one idea styled three ways, however different their compositions; that is a failed set. Score similarityToOtherConcepts honestly: how close this concept's central device/subject/idea sits to the OTHER concepts in this same response.
- The product must participate in the idea, not sit inside a pretty scene. "The dish becomes the puzzle" is a productRole. "The dish sits on a nice table" is not — that is decoration, not a role.
- Each concept picks the creative mode it naturally is — EDITORIAL, PLAYFUL, SURREAL, INTERACTIVE, HUMOROUS, MINIMAL, CULTURAL, STORYTELLING, VISUAL_METAPHOR, or EDUCATIONAL — from what the idea actually is, not a default.
- Each concept also picks an artDirectionFamily — the MEDIUM/TECHNIQUE it should be executed in (photography vs typography vs graphic vs collage vs documentary vs illustration...), chosen from the mechanism, never defaulted. This is a separate axis from mode: two SURREAL-mode ideas can still be executed completely differently (one as SURREAL_EDITORIAL photography, another as ILLUSTRATIVE collage). Use the mechanism as a guide, not a rule — a puzzle often suits INTERACTIVE_GRAPHIC, wordplay often suits TYPOGRAPHY_LED, a visual metaphor might suit SURREAL_EDITORIAL or EDITORIAL_PHOTOGRAPHY depending on the idea, a human moment often suits DOCUMENTARY — but judge each idea on its own, don't apply one mapping mechanically.
- CRITICAL — across the 3–5 concepts in THIS response, spread them across genuinely different art-direction families wherever the ideas allow it. FlowPost's actual failure mode is concepts that differ in name but all render as the same "clean SaaS render with a metaphor object" look — different mechanisms are worthless if they all get executed in the same medium. If you notice yourself picking the same family twice, ask whether a different execution would serve that idea better before finalising.
- Brand consistency is identity, palette, personality, typography character, logo, tone and audience — never "the same visual template every time." A premium/minimal brand can still be expressed as editorial photography in one campaign, elegant typography in another, a surreal still life in a third — all recognisably the same brand, none of them the same picture.
- Do not default to a generic "AI SaaS" look: blue/white gradients, floating 3D glass objects, neon cyan accent lines, dark corporate rooms, glowing dashboards, soft three-point corporate lighting, perfect symmetry, a lone metaphor object centered in negative space. These are not forbidden outright — they're forbidden as the unthinking default. Use them only when a specific concept genuinely calls for that exact look.
- If a "## Recent creatives from this brand" section is given below, treat it as what to actively diverge from — do not propose another concept in the same art-direction family/palette/lighting/composition pattern as something already there, unless the new idea specifically requires it.
- If a "## Reference style" section is given below, it describes visual LANGUAGE the member likes from images they uploaded — never content to reproduce. Priority order when things conflict: confirmed brand identity always wins over a reference style; a reference style always wins over external research; and neither reference style nor research ever invents claims, products, or copy the request didn't ask for. Borrow the reference profile's creativeMechanisms/visualLanguage/texture/composition tendencies — never its exact composition, subject arrangement, or headline structure, and never anything listed under its doNotCopy.
- templateRisk should also be HIGH when a concept sits too close to what a "## Reference style" section's doNotCopy list warns against (same composition, same subject arrangement, same central metaphor, same headline structure) — a concept that just re-executes one reference is not an original idea.
- HARD REQUIREMENTS OUTRANK CLEVERNESS. If a "## What the member actually asked for" section is given below, every requirement listed there must be carried by every concept you propose — through the idea itself, its message, or the product's role in it. You may reinterpret HOW a requirement is communicated as freely as you like; you may never drop it, swap it for something adjacent, generalise it ("BTS comeback" → "a music moment", "50% off" → "a special deal"), or decide the visual implies it. A concept that loses the member's offer, event or product is rejected before it ever reaches them, however good the idea is.
- The request is THIS campaign's subject; the brand profile is a persistent constraint, not the subject. A multi-cuisine restaurant asking for a Korean-food campaign gets Korean food — in that brand's voice, palette and personality. Next week's Indian-food weekend gets Indian food. Never let the stored brand description decide what the campaign is about, and never carry a previous campaign's subject into this one.
- Not every field applies to every concept — a puzzle concept has an interaction; a metaphor concept has a visualMetaphor; leave what doesn't apply as an empty string rather than forcing it.
- Score every concept honestly on the 8 dimensions in the schema, 0–100. templateRisk should be HIGH for anything resembling a generic AI-ad default (centered product + gradient, giant headline, floating 3D objects, stock-office scenes, a pedestal for no reason) and LOW for something a real ad agency would present. Score low, not flattering — the score is what filters out weak ideas before any image is generated.
- Never propose reproducing a specific real campaign, even one mentioned in research notes below — research is inspiration for technique, not content to copy.
- Return only the JSON object described. No commentary, no markdown fences.`;

const stringField = (description: string) => ({ type: 'string', description });

const CONCEPT_SCHEMA = {
  type: 'object',
  properties: {
    conceptName: stringField('A short, punchy name for the idea — e.g. "Find the Missing Piece".'),
    bigIdea: stringField('The advertising idea in one sentence.'),
    visualMechanism: stringField(
      'The specific mechanism this concept uses, named plainly — e.g. "puzzle/interaction", "unexpected scale", "wordplay".',
    ),
    humanInsight: stringField('The human truth or observation this idea is built on, if there is one. Empty string if not applicable.'),
    visualMetaphor: stringField('The metaphor, if this concept is built on one. Empty string if not applicable.'),
    interaction: stringField('What the audience is invited to do, if this is a puzzle/game/participatory concept. Empty string if not applicable.'),
    message: stringField('The short, human copy idea this concept implies, if any. Empty string if the visual should carry it alone.'),
    productRole: stringField('How the product participates in the idea — not just where it sits.'),
    brandConnection: stringField('Why this idea specifically fits this brand, if it does.'),
    whyItWouldStopTheScroll: stringField('The specific reason this would stop someone scrolling — not just an assertion that it is memorable.'),
    mode: {
      type: 'string',
      enum: [
        'EDITORIAL', 'PLAYFUL', 'SURREAL', 'INTERACTIVE', 'HUMOROUS', 'MINIMAL', 'CULTURAL', 'STORYTELLING', 'VISUAL_METAPHOR', 'EDUCATIONAL',
      ],
      description: 'The creative mode this concept naturally is.',
    },
    artDirectionFamily: {
      type: 'string',
      enum: [
        'EDITORIAL_PHOTOGRAPHY', 'SURREAL_EDITORIAL', 'INTERACTIVE_GRAPHIC', 'TYPOGRAPHY_LED', 'PRODUCT_STUDIO',
        'DOCUMENTARY', 'COLLAGE', 'HANDCRAFTED', 'CINEMATIC', 'MINIMAL_ART', 'PLAYFUL_GRAPHIC', 'CULTURAL_EDITORIAL',
        'INFORMATIONAL', 'ILLUSTRATIVE',
      ],
      description:
        'The medium/technique this concept should be executed in, chosen from its mechanism — a separate axis from mode. Spread these across the concept set; do not let every concept land on the same family.',
    },
    mechanismFamily: {
      type: 'string',
      enum: [...MECHANISM_FAMILIES],
      description:
        'The mechanism family this idea belongs to. Every concept in one response must declare a DIFFERENT family — this is the axis set-diversity is judged on, separate from mode and medium.',
    },
    scores: {
      type: 'object',
      properties: {
        conceptStrength: { type: 'integer', description: '0–100. Is there an actual idea here?' },
        brandSpecificity: { type: 'integer', description: '0–100. Could this only be this brand, or is it interchangeable?' },
        productRelevance: { type: 'integer', description: '0–100. Does the product actually participate in the idea?' },
        visualOriginality: { type: 'integer', description: '0–100.' },
        scrollStoppingPotential: { type: 'integer', description: '0–100.' },
        messageClarity: { type: 'integer', description: '0–100. Would someone understand the idea fast, without a long caption?' },
        socialInteractionPotential: { type: 'integer', description: '0–100. Would someone comment, share, or engage with this?' },
        templateRisk: { type: 'integer', description: '0–100. HIGH means it resembles a generic AI-ad default (blue-glow SaaS render, floating 3D object, centered-on-gradient), OR repeats the art-direction family/palette/composition of a "Recent creatives" entry below, OR sits too close to a "Reference style" section\'s doNotCopy list. Lower is better.' },
        mechanismNovelty: { type: 'integer', description: '0–100. How far this mechanism sits from the OBVIOUS first idea for this brief (the topic\'s surface image — a calendar for "next month", a stopwatch for "faster"). Higher is better.' },
        similarityToOtherConcepts: { type: 'integer', description: '0–100. How close this concept\'s central device/subject/idea sits to the OTHER concepts in this same response. 0 = nothing in common beyond the campaign itself. Above 60 means the set has a duplicate. Lower is better — score honestly.' },
      },
      required: [
        'conceptStrength', 'brandSpecificity', 'productRelevance', 'visualOriginality',
        'scrollStoppingPotential', 'messageClarity', 'socialInteractionPotential', 'templateRisk',
        'mechanismNovelty', 'similarityToOtherConcepts',
      ],
    },
  },
  required: ['conceptName', 'bigIdea', 'visualMechanism', 'mode', 'artDirectionFamily', 'mechanismFamily', 'scores'],
};

export const CREATIVE_CONCEPTS_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    concepts: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: CONCEPT_SCHEMA,
      description: '3–5 genuinely different concepts — different mechanisms, not cosmetic variants of one idea.',
    },
  },
  required: ['concepts'],
};

export interface BuiltCreativeConceptsPrompt {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  temperature: number;
  version: number;
}

function renderResearchSection(research?: CreativeResearch): string | null {
  if (!research || research.creativeMechanisms.length === 0) return null;
  const lines = [
    research.creativeMechanisms.length && `- Mechanisms seen in strong work: ${research.creativeMechanisms.join('; ')}`,
    research.ideasToAvoid.length && `- Avoid: ${research.ideasToAvoid.join('; ')}`,
    research.originalityDirection && `- Originality direction: ${research.originalityDirection}`,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);
  if (lines.length === 0) return null;
  return `## Creative research (technique inspiration only — never content to copy)\n${lines.join('\n')}`;
}

/** The lightweight visual-repetition memory (spec §6) — concrete recent outputs to diverge from, not an abstract "be different" instruction. */
function renderRecentCreativesSection(recent?: RecentCreativeSignature[]): string | null {
  if (!recent || recent.length === 0) return null;
  const lines = recent.map(
    (s) => `- ${s.artDirectionFamily}, mode ${s.mode}, ${s.lighting || 'unspecified lighting'}, background: ${s.background || 'unspecified'}, palette: ${s.palette.join(', ') || 'unspecified'}`,
  );
  return `## Recent creatives from this brand (avoid repeating their visual language)\n${lines.join('\n')}`;
}

/** "Show FlowPost what you like" — inspiration only, never content to copy. Ranks below brand identity, above research, per the priority order in the system instruction. */
function renderReferenceStyleSection(style?: ReferenceStyleProfile): string | null {
  if (!style || !style.analysed) return null;
  const lines = [
    style.visualLanguage && `- Visual language: ${style.visualLanguage}`,
    style.creativeMechanisms.length && `- What's interesting about these references: ${style.creativeMechanisms.join('; ')}`,
    style.compositionPatterns.length && `- Composition patterns: ${style.compositionPatterns.join('; ')}`,
    style.textureAndMaterial && `- Texture/material: ${style.textureAndMaterial}`,
    style.lightingAndMood && `- Lighting/mood: ${style.lightingAndMood}`,
    style.imperfectionLevel && `- Imperfection level: ${style.imperfectionLevel}`,
    style.dominantDirection && `- Dominant direction: ${style.dominantDirection}`,
    style.doNotCopy.length && `- DO NOT COPY (reproduce none of these): ${style.doNotCopy.join('; ')}`,
    `- Influence: ${style.influence}`,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);
  if (lines.length === 0) return null;
  return `## Reference style (inspiration only, from ${style.referenceCount} uploaded image(s) — describes visual language, never content to reproduce)\n${lines.join('\n')}`;
}

export function buildCreativeConceptsPrompt(context: {
  request: string;
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  platforms: string[];
  hasAssets: boolean;
  brand: BrandProfile;
  creativeDna: ResolvedCreativeDna;
  research?: CreativeResearch;
  recentSignatures?: RecentCreativeSignature[];
  referenceStyle?: ReferenceStyleProfile;
  /** The member's own requirements. Placed above everything else — see renderIntentSection. */
  intent?: CreativeIntentBrief;
}): BuiltCreativeConceptsPrompt {
  const brandSection = renderBrandSection(context.brand);
  const dnaSection = renderCreativeDnaSection(context.creativeDna);
  const referenceStyleSection = renderReferenceStyleSection(context.referenceStyle);
  const researchSection = renderResearchSection(context.research);
  const recentCreativesSection = renderRecentCreativesSection(context.recentSignatures);

  const prompt = [
    `What is the advertising idea for this request: "${context.request}"?`,

    renderIntentSection(context.intent),

    [
      '## Marketing context',
      `- Goal: ${context.goal}`,
      `- Funnel stage: ${context.funnelStage}`,
      context.platforms.length && `- Platforms: ${context.platforms.join(', ')}`,
      context.hasAssets
        ? '- A product/reference image was attached — the product must participate in the idea, and its identity must be preserved (no generic replacement).'
        : '- No asset was attached — the concept can invent a subject consistent with the brand.',
    ]
      .filter(Boolean)
      .join('\n'),

    brandSection,
    dnaSection,
    referenceStyleSection,
    researchSection,
    recentCreativesSection,

    context.intent?.requiredClaims.length
      ? `Propose 3–5 genuinely different concepts, EVERY one of which carries all of these requirements: ${context.intent.requiredClaims.join(', ')}. Score each honestly. Return a single JSON object matching the provided schema. Nothing else.`
      : 'Propose 3–5 genuinely different concepts and score each honestly. Return a single JSON object matching the provided schema. Nothing else.',
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n\n');

  return {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: CREATIVE_CONCEPTS_RESPONSE_SCHEMA,
    // High — this is the most genuinely generative step in the pipeline.
    temperature: 0.95,
    version: CREATIVE_CONCEPTS_PROMPT_VERSION,
  };
}
