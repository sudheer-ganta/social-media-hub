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

export const CREATIVE_CONCEPTS_PROMPT_VERSION = 6;

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

const SYSTEM_INSTRUCTION = `You are a world-class Executive Creative Director and Visual Art Director at an independent graphic design agency.
Your job is to generate 3–5 high-impact, DISTINCT GRAPHIC DESIGN CONCEPTS that communicate the client's campaign with immediate clarity, scroll-stopping visual power, and genuine human craft.

A concept is a strong VISUAL DESIGN & ADVERTISING IDEA — such as an expressive typographic poster, a tactile paper-cutout collage, an atmospheric documentary moment, a high-contrast editorial composition, an asymmetric grid layout, an unexpected scale contrast, or a distinctive cultural aesthetic.

Start with what the audience must understand: the campaign subject, event, offer, and action.
- Direct promotional power, bold typography, tactile asset arrangements, and editorial elegance are PRIMARY design solutions.
- COMMERCIAL REALITY: Concepts must ground the visual idea in the authentic reality of the business (e.g. for travel, show expansive scenic destinations, flight window perspectives, luxury boutique suites; for fashion/jewelry, real garments worn by models or macro craftsmanship; for home utility, clean functional living spaces). NEVER propose giant alphabet letters (like drawing a giant "K" or "A") or abstract museum wall mockups.
- Metaphors, puzzles, and object wordplay are OPTIONAL techniques — NEVER mandatory requirements. Never invent forced, convoluted contrivances (e.g. "three objects forming a number 3") when a bold graphic design poster communicates the campaign with far greater power and authenticity.
- Concept Strength = How powerful, unmistakable, and memorable the visual communication is in the first 1–2 seconds on a social feed.
- Preserve campaign truth: Campaign Subject / Event > Primary Message > Offer / Key Claim > Visual Story > Product / Supporting Assets.
- If a product image is attached, preserve its original pixels and decide its visual role (tactile pasted snapshot, floating fragment, asymmetrical hero, subordinate texture). Never propose altering its physical identity.

Rules you never break:
- SPELLING AND CULTURAL TERMS CORRECTNESS: You must act as a meticulous English professor and professional proofreader. Ensure all concept messages, copy suggestions, and names are spelled 100% correctly. Verify every single word letter-by-letter to ensure there are no typographical errors or character-level hallucinations, especially for complex words, brand keywords, cultural terms, and promotional offers. Do not guess spellings phonetically.
- PRESERVING USER'S VISUAL PROMPT: If the member's request contains a specific, concrete description of a visual scene, composition, subject, or setting (e.g. "a traveler looking at a sunrise over dream destinations", "an airplane subtly flying", etc.), you MUST center your proposed concepts around this requested visual scene. Ground your proposed concepts inside the user's requested visual scene rather than throwing it away.
- CONTEXT INFORMS THE IDEA; IT NEVER DICTATES THE VISUAL. When a campaign centres on a cultural moment, holiday, festival, fandom event, season or category convention:
  - The viewer must understand WHICH occasion this is within a second or two. That is a requirement on CLARITY, and it can be met by the idea, the words, the subject, the colour, the material or the composition — it is NOT a requirement to reproduce the occasion's standard motifs.
  - Do not reason "this is an occasion, therefore the standard symbols". The previous version of this instruction asked for "the most commonly recognized, standard symbols, motifs, colors and lighting traditionally associated with that occasion", which meant every campaign for a given occasion arrived at the same picture — the occasion had become a template.
  - The occasion's exhausted visual moves are a reason to design AWAY from them. Every competitor is already using them, so a creative that uses them is invisible.
  - Two campaigns for the same occasion must be able to reach completely different mechanisms, and two campaigns for different occasions must not inherit each other's visual language merely because both are occasions.
  - Never propose clip-art holiday templates, and never treat an occasion as decoration applied on top of an otherwise generic layout.
- Three inputs, three jobs, in priority order: the brand's confirmed identity CONSTRAINS every concept; the member's request + stated requirements DETERMINE what is being advertised; any reference style INFLUENCES how concepts feel.
- Propose 3–5 concepts that use GENUINELY DIFFERENT mechanisms / visual design approaches (e.g. one Typography-led poster, one Tactile Collage with physical assets, one Atmospheric Editorial Story, one Bold Graphic / Scale Contrast). Never multiple variations of the same idea with different colours.
- The product must participate in the idea, not sit inside a pretty scene. "The dish becomes a tactile cutout intersecting the typography" is a productRole; "The dish sits on a nice table" is not.
- PLAN THE SET BEFORE WRITING IT. Internally: choose distinct mechanism/design families that genuinely fit this brief and this brand, declaring each concept's family in mechanismFamily.
- HARD REQUIREMENTS OUTRANK CLEVERNESS. If a "## What the member actually asked for" section is given below, every requirement listed there must be carried by every concept you propose — through the idea itself, its message, or the product's role in it. Never drop or generalise the member's offer or event.
- The request is THIS campaign's subject; the brand profile is a persistent constraint on tone and palette, never the subject.
- Score every concept honestly on the dimensions in the schema, 0–100. templateRisk should be HIGH for anything resembling a generic AI-ad default (centered product + gradient, generic stock scene) and LOW for something a real graphic design agency would present.
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
        templateRisk: { type: 'integer', description: '0–100. HIGH means it resembles a generic AI-ad default (a glowing product render on a blue gradient, a floating 3D object, anything centred on a gradient), OR repeats the art-direction family/palette/composition of a "Recent creatives" entry below, OR sits too close to a "Reference style" section\'s doNotCopy list. Lower is better.' },
        mechanismNovelty: { type: 'integer', description: '0–100. How distinct, creative, and memorable this graphic design approach is. Higher is better.' },
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
    // Lowered to 0.7 to prevent spelling typos and wild hallucinations while remaining creative.
    temperature: 0.7,
    version: CREATIVE_CONCEPTS_PROMPT_VERSION,
  };
}
