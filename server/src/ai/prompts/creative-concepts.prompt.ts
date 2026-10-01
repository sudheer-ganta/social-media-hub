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

export const CREATIVE_CONCEPTS_PROMPT_VERSION = 7;

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
Your job is to generate 3–5 high-impact, DISTINCT CREATIVE CONCEPTS built on GENUINELY DIFFERENT mechanisms that determine how the client's campaign visually and conceptually exists.

==================================================
CONCEPT = DISTINCT CREATIVE PREMISE
==================================================
A concept is NOT a style, lighting treatment, or typography technique. A concept is an ORIGINAL ADVERTISING PREMISE with a specific visual mechanism.

Every concept must answer:
1. What is the communication idea?
2. What is the creative thought?
3. What is the visual metaphor or creative mechanism?
4. What physical visual mechanism realizes that thought?
5. What is the dominant visual object? (Concrete, tangible scene or subject — NEVER an abstract holiday or mood word).
6. What is the visual world?
7. What physical materials / objects / artifacts exist?
8. How are those objects composed?
9. What role does photography/image-generation play?
10. What role does typography play later?
11. What is the copy angle?
12. What is the text-image relationship?
13. What reference/cultural/trend insight influenced the concept?
14. Why is this concept specific to this brand + brief + occasion?
15. Why would the concept stop making sense if the campaign occasion or brand were swapped?

--------------------------------------------------
HARD INVARIANTS:
--------------------------------------------------
1. CONCEPT ≠ STYLE:
   Never use "editorial", "cinematic", "luxury", "minimal", "dramatic lighting", "golden light", "typographic contrast", or "asymmetric layout" as the concept. Those are realization attributes.

2. CONCEPT ≠ DDE TECHNIQUE:
   Never make concepts whose main idea is typography scale, font pairing, alignment, spacing, color, scrim, or placement (e.g., "Luminous Typography" with "typographic scale contrast"). Typography is placed downstream by FlowPost's Dynamic Design Engine over a clean, wordless visual ground.

3. NEVER TREAT AN OCCASION AS A PHYSICAL OBJECT:
   Occasions, holidays, and seasons are temporal/cultural contexts, never physical visual objects.
   INVALID dominantVisualObject: "Anniversary Event"
   VALID dominantVisualObject: "steaming clay pots and bamboo steamers surrounded by glowing oil lamps on dark teak wood"

4. VISUAL ARTIFACTS:
   Concepts may incorporate genuine physical visual artifacts when organically appropriate (paper, cards, labels, receipts, menus, packaging, handwritten notes, stamps, frames, specimen pieces, cutouts, ingredients, fabric, printed ephemera, physical signage, objects, fragments, annotations).

5. REAL EXAMPLES:
   GOOD CONCEPTS (Contain idea + physical mechanism + visual world):
   - "The Festive Table Becomes a Geometric Radial Pattern"
   - "Seven Traditions, One Table"
   - "The Feast Through the Window"
   - "Passing the Light Around the Table"

   BAD CONCEPTS (Fail quality test — generic descriptors or style names):
   - "Architecture of Golden Light" (Just lighting)
   - "Luminous Typography" (Just DDE technique)
   - "Premium Festive Dining" (Generic phrasing)
   - "Warm Festive Food Photography" (Generic stock photo description)

--------------------------------------------------
CONCEPT QUALITY TEST (Applied to every candidate):
--------------------------------------------------
- "If I remove the headline and logo, can I still explain the concept from the visual itself?" (Must be YES).
- "If I replace the campaign occasion with another occasion, would this concept still work unchanged?" (Must be NO — must be campaign-specific).
- "If I remove the chosen visual style, does the underlying idea still exist?" (Must be YES).
- "Can the image generator physically depict the dominant visual object and visual proof?" (Must be YES).

Return only a single JSON object matching the schema. No commentary, no markdown fences.`;

const stringField = (description: string) => ({ type: 'string', description });

const CONCEPT_SCHEMA = {
  type: 'object',
  properties: {
    conceptName: stringField('A short, memorable name for the creative premise — e.g. "The Feast Through the Window".'),
    communicationIdea: stringField('The core communication idea in one crisp sentence.'),
    creativePremise: stringField('The underlying advertising premise and creative thought.'),
    creativeMechanism: stringField('The concrete creative mechanism that makes the idea recognizable.'),
    visualMechanism: stringField('The specific physical visual mechanism depicting the premise.'),
    mechanismOwner: {
      type: 'string',
      enum: ['IMAGE', 'DDE', 'COPY', 'HYBRID'],
      description: 'Which pipeline layer owns the primary execution of this mechanism.',
    },
    dominantVisualObject: stringField('The single concrete physical visual object/scene depicted (NEVER a holiday or mood name).'),
    hero: {
      type: 'string',
      enum: ['image', 'typography', 'product'],
      description: 'The primary hero of the finished creative.',
    },
    imageRole: {
      type: 'string',
      enum: ['full-bleed', 'small-tactile-object', 'omitted', 'no-image'],
      description: 'How the generated base image participates in the composition.',
    },
    visualWorld: stringField('The concrete physical universe, material setting, and tactile environment.'),
    physicalArtifacts: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific physical materials/artifacts present in the scene (menus, labels, cutouts, stamps, fabric, etc.).',
    },
    compositionMechanism: stringField('How the visual elements are physically arranged in space.'),
    copyAngle: stringField('The conceptual angle for hook, headline, support copy, and CTA.'),
    textImageRelationship: stringField('How typography will interact with the visual ground (e.g. OVERLAY_INTENTIONAL, SEPARATED, MATERIAL_INTERACTION).'),
    referenceInsight: stringField('The cultural, cinematic, or design device influencing this concept.'),
    requiredVisualElements: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete physical visual elements that must exist in the visual.',
    },
    requiredVisualProof: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete observable visual evidence a vision evaluator can verify in the generated image.',
    },
    prohibitedVisualInterpretations: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific visual cliches, synthetic AI flaws, or generic templates this concept must never collapse into.',
    },
    styleDirection: stringField('Art direction and photographic execution family.'),
    conceptSpecificity: { type: 'integer', description: '0–100. How tailored the visual idea is to this exact brief.' },
    brandSpecificity: { type: 'integer', description: '0–100. Could this only be this brand?' },
    occasionSpecificity: { type: 'integer', description: '0–100. How deeply the visual embodies the specific occasion.' },
    realizability: { type: 'integer', description: '0–100. Physical realizability by the image generation layer.' },
    bigIdea: stringField('Legacy alias for communicationIdea.'),
    humanInsight: stringField('The human truth or observation this idea is built on.'),
    visualMetaphor: stringField('The visual metaphor if applicable.'),
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
      description: 'The art direction family for execution.',
    },
    mechanismFamily: {
      type: 'string',
      enum: [...MECHANISM_FAMILIES],
      description: 'The mechanism family for set-diversity comparison.',
    },
    scores: {
      type: 'object',
      properties: {
        conceptStrength: { type: 'integer', description: '0–100. Is there an actual idea here?' },
        brandSpecificity: { type: 'integer', description: '0–100. Could this only be this brand?' },
        productRelevance: { type: 'integer', description: '0–100. Does the product participate in the idea?' },
        visualOriginality: { type: 'integer', description: '0–100.' },
        scrollStoppingPotential: { type: 'integer', description: '0–100.' },
        messageClarity: { type: 'integer', description: '0–100.' },
        socialInteractionPotential: { type: 'integer', description: '0–100.' },
        templateRisk: { type: 'integer', description: '0–100. Higher = closer to generic template default. Lower is better.' },
        mechanismNovelty: { type: 'integer', description: '0–100.' },
        similarityToOtherConcepts: { type: 'integer', description: '0–100.' },
      },
      required: [
        'conceptStrength', 'brandSpecificity', 'productRelevance', 'visualOriginality',
        'scrollStoppingPotential', 'messageClarity', 'socialInteractionPotential', 'templateRisk',
        'mechanismNovelty', 'similarityToOtherConcepts',
      ],
    },
  },
  required: [
    'conceptName', 'communicationIdea', 'creativePremise', 'creativeMechanism', 'visualMechanism',
    'dominantVisualObject', 'visualWorld', 'mode', 'artDirectionFamily', 'mechanismFamily', 'scores',
  ],
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

    context.intent?.requiredClaims?.length
      ? `Propose 3–5 genuinely different concepts, EVERY one of which carries all of these requirements: ${(context.intent.requiredClaims ?? []).join(', ')}. Score each honestly. Return a single JSON object matching the provided schema. Nothing else.`
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
