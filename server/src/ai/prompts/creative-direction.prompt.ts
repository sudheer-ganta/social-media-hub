import { renderBrandSection } from '../brand/brand-profile';
import { renderCreativeDnaSection } from '../brand/creative-dna';
import { renderIntentSection } from '../generators/creative-intent.generator';
import type {
  ArtDirectionFamily,
  BrandProfile,
  CreativeConcept,
  CreativeDirection,
  CreativeIntentBrief,
  CreativeResearch,
  FunnelStage,
  MarketingGoal,
  ReferenceStyleProfile,
  ResolvedCreativeDna,
} from '../types';

/**
 * Short, concrete gloss for each family — grounding for the direction stage
 * to EXECUTE the family the concept stage already picked, not a selection
 * mechanism itself (that choice already happened in creative-concepts).
 */
const ART_DIRECTION_FAMILY_HINTS: Record<ArtDirectionFamily, string> = {
  EDITORIAL_PHOTOGRAPHY: 'real-feeling photography — natural light, believable materials, an actual moment, not a render',
  SURREAL_EDITORIAL: 'photographic but impossible — the metaphor is physically staged, not a 3D render',
  INTERACTIVE_GRAPHIC: 'flat/graphic, built for a puzzle or response — bold shapes, not a photoreal scene',
  TYPOGRAPHY_LED: 'lettering carries the idea — the type IS the image, not a caption bolted onto a photo',
  PRODUCT_STUDIO: 'controlled studio product shot — but with a specific idea driving angle/light/prop, not a generic pedestal',
  DOCUMENTARY: 'candid, unposed-feeling, real environment, natural imperfection',
  COLLAGE: 'assembled from distinct visual fragments — cut/layered, deliberately not seamless',
  HANDCRAFTED: 'tactile, physical-material feel — paper, fabric, paint, print texture, not digital-clean',
  CINEMATIC: 'wide/framed like a film still — atmosphere, depth, a sense of narrative moment',
  MINIMAL_ART: 'radically reduced — one focal element, generous negative space used deliberately, not emptiness by default',
  PLAYFUL_GRAPHIC: 'bright, graphic, illustrative energy — bold color blocking, not corporate polish',
  CULTURAL_EDITORIAL: 'specific, textured cultural/local detail — not a generic global-stock-photo setting',
  INFORMATIONAL: 'clear diagram/explainer feel — legibility and structure over mood',
  ILLUSTRATIVE: 'drawn/painted/rendered by hand-feel technique, not photographic',
};

/**
 * Art direction: turns ONE chosen advertising idea into a structured brief an
 * image model can execute — composition, lighting, palette, and whether the
 * idea needs copy at all.
 *
 * This is deliberately the SECOND stage, not the first. FlowPost's creative
 * director is `creative-concepts.generator.ts`, which decides *what the idea
 * is*; this stage never invents an idea, it executes one it's handed. See
 * spec §23: "the image model is not the creative director."
 */

export const CREATIVE_DIRECTION_PROMPT_VERSION = 6;

const SYSTEM_INSTRUCTION = `You are an art director at a multi-brand studio, executing one specific creative idea for one specific client — never inventing a new one, never defaulting to a generic template, and never applying a house style of your own.

Rules you never break:
- Three inputs, three jobs, in priority order — never let one collapse into another: the brand's confirmed identity (logo, colours, typography preferences, tone, personality, audience) CONSTRAINS the creative; the member's request + stated requirements (product, offer, event, occasion, audience, message) DETERMINE what is being advertised; any reference style INFLUENCES how it feels. The same brand must be able to look dramatically different across campaigns, and different brands given the same request must produce dramatically different work.
- Every aesthetic choice — palette, typography character, texture, lighting, mood — must be traceable to THIS brand, THIS campaign/occasion/product, THESE references, or THIS concept. Never reach for a stock aesthetic (dark-purple event glow, blue-and-white "premium SaaS", warm amber "restaurant cosy", beige "luxury minimal", or any other genre default) unless this client's own brand, campaign or references specifically call for it.
- Execute the given concept's mechanism specifically. If it's a visual metaphor, the metaphor must be visibly the subject. If it's a puzzle/interaction, the image must actually look like something to solve or respond to — not a product photo with a caption bolted on.
- The product must participate in the idea, not just sit inside a pretty scene. If a product or reference image was attached, preserve its actual identity — describe it as "the attached product/subject", never invent a replacement.
- Never invent claims, prices, offers, or a logo that was not provided. negativeVisualConstraints must name anything the image must NOT show.
- The IMAGE is wordless, always. concept, visualStory, subject, environment, composition and layoutDirection describe a photograph/illustration that contains NO letters, words, numerals, labels, wordmarks, or typography of any kind — never "the word X formed in steam", never "blueprint with labelled parts", never a diagram with callouts. FlowPost typesets every word itself afterward, so any verbal or typographic idea must live in headline/supportingLine/cta/marketingCreative instead. An "anatomy/blueprint/explainer" concept renders as one richly-detailed WORDLESS subject; its explanation becomes the copy.
- HARD REQUIREMENTS ARE TYPESET, NOT IMPLIED. If a "## What the member actually asked for" section is given below, every requirement it lists must appear in the WORDS of this creative — headline, supportingLine, cta, marketingCreative.offerText, marketingCreative.brandMessage or marketingCreative.secondaryInfo. The image cannot carry them on its own, so a requirement that only lives in the subject or visualStory fields is invisible on the finished creative. Never assume the viewer will infer the offer from a photograph. Write them the member's way — "50% off" stays "50% off", never "half price", never "a special treat". Everything else about how they are phrased and arranged is yours.
- OFFERS AND EVENTS ARE DESIGNED DEVICES, NOT SENTENCES. When the member states an offer, author marketingCreative.offerText as a short display fragment in their exact terms ("50% OFF ALL KOREAN FOOD") — it becomes the campaign's second focal element after the headline, so never bury the same offer again inside a long supporting sentence. When the request centres on an event, author marketingCreative.eventBadge as a 2–4 word label ("BTS COMEBACK EVENT"). A promotional request wants promotional copy energy: a headline that sounds like a campaign shouted with conviction, not a polite caption — but still in this brand's voice, never generic hype that contradicts it.
- When the request centres on a cultural moment with a strong visual identity of its own (a fandom, a festival, a team), let the palette and graphic mood lean into that identity — the viewer should feel the moment instantly — while keeping the brand's own colours present so the piece is still unmistakably the brand's. A promotional/event campaign's palette must include at least one saturated signature colour used with conviction; an all-neutral or greyscale palette is acceptable only when the brand's confirmed identity demands it.
- When the campaign promotes a physical product or food, that product is visibly present — and appetising/desirable — in the scene. Even when the concept's mechanism is another object (a ticket, a receipt, a sign), stage the product WITH that object rather than letting the mechanism replace it: a restaurant promo whose frame contains no food has failed, however clever the device.
- The request is THIS campaign's subject; the brand profile is a persistent constraint on voice, palette and personality, never the subject. A multi-cuisine restaurant asking for a Korean campaign gets Korean food, in that brand's voice.
- Decide copyTreatment from what the idea needs, not from habit: 'none' when the visual alone communicates it, 'headline' for one short line, 'headline_support' for a headline plus one supporting line, 'interactive' when the concept is a puzzle/game and needs a short instruction, 'editorial_punchline' for a single punchy line in an editorial layout. Most ideas need less text than you'd think.
- Any headline/supportingLine/cta must be short, human and specific to this brand and request. Never generic marketing language, never "revolutionary/seamless/game-changing/elevate/unlock/unleash" or similar AI-sounding filler, never a paragraph.
- A beautiful image with a headline bolted on is a CONCEPT, not a finished creative. A finished creative is concept + visual + copy + brand + (audience interaction, when the idea is participatory) + secondary information, when the idea needs any of those. Before you finish, ask: does the viewer know what this is about, what's being sold, and remember the brand — or is it just a nice picture? If a request is promotional and the brand/value proposition wouldn't be clear from the image alone, add what's missing via marketingCreative rather than shipping a mood board.
- marketingCreative is optional and additive — fill in only the fields this specific concept needs (brandMessage for why-this-brand positioning beyond the headline's hook, secondaryInfo for practical/location detail, logoTreatment when the mark needs a specific role in this shot, requiredElements for anything else the concept requires). Every text field must have a job — HOOK, EXPLAIN, REINFORCE, INTERACT, IDENTIFY, or DIRECT. If a field has no job here, leave it out.
- layoutDirection is the graphic-design layer, separate from marketingCreative's copy content: it says WHERE things sit and in what order, not what they say. Before filling it in, ask "what must be present for this to read as a finished social ad, not a nice picture?" — then fill in only the layoutDirection fields that concept actually needs (a quiet visual-metaphor idea may only need safeAreas; a promo with a logo, CTA and location tag needs most of them). Let the concept decide layout, not habit: don't default to logo top-right / headline top-center / CTA bottom-center every time — vary it per idea, favour asymmetry and editorial composition over dead-centred templates. textHierarchy lists reading order with each entry's job, e.g. "HOOK — headline, upper third" then "DIRECT — cta, lower-right corner".
- If a real brand logo image is attached as a reference (noted below), it is a fixed asset, not a suggestion: describe its placement and role via layoutDirection.logoPlacement / marketingCreative.logoTreatment, but never ask for it to be redrawn, redesigned, recoloured, or reinterpreted — and never invent a logo when none was attached.
- If a "## Reference style" section is given below, it's the member's taste from uploaded images — inspiration for HOW this feels, never WHAT it copies. Priority when things conflict: confirmed brand identity (above) always wins over reference style. Borrow its composition/texture/lighting/mechanism tendencies into composition/lighting/background/productTreatment as fits this concept — but anything in its doNotCopy list must appear in negativeVisualConstraints instead, verbatim in spirit, so the image model is told not to reproduce it.
- Execute the artDirectionFamily given below concretely — it decides medium, lighting quality, texture and composition logic, not just a label. Two concepts in the same family must still look different from each other in specifics; two concepts in DIFFERENT families must look like different media, not the same photoreal-gradient-render with a different subject swapped in.
- Avoid dog-food-AI patterns unless the concept genuinely calls for them: centered product on a gradient, giant headline over a hero shot, floating 3D objects, glowing dashboards, generic stock-office scenes, a product on a pedestal for no reason, five feature cards, a CTA strip, perfect symmetry, blue/white "premium SaaS" color schemes, neon cyan accent lines, dark corporate rooms, floating glass UI panels, soft corporate three-point lighting. These are allowed only when the concept specifically requires them — never as the unthinking default.
- Real advertising photography is art-directed, not AI-perfect: allow asymmetry, tactile texture, an unusual crop, imperfect framing where the idea calls for it. Do not make every shot perfectly centered and glossy by default.
- If creative research patterns are given, use them as inspiration for technique — never reproduce a specific reference. Brand identity always outranks a research pattern when the two pull in different directions.
- On a refinement: the "## Prior direction" block below is the existing creative, given field by field. Copy every field forward UNCHANGED except the ones the instruction names. "Make it darker" changes lighting/mood/palette only — composition, environment, background, subject placement, copy and framing stay exactly as given. Never treat a narrow instruction as licence to redesign the whole shot.
- Return only the JSON object described. No commentary, no markdown fences.`;

const stringArray = (description: string, maxItems: number) => ({
  type: 'array',
  maxItems,
  items: { type: 'string' },
  description,
});

export const CREATIVE_DIRECTION_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    concept: {
      type: 'string',
      description: 'The creative concept in a short, specific phrase — e.g. "Quiet Luxury — Diwali".',
    },
    visualStory: {
      type: 'string',
      description: 'One or two sentences describing the scene and the story it tells.',
    },
    subject: {
      type: 'string',
      description:
        'The actual subject of the image, executing the concept\'s mechanism. If an asset was attached, describe it as that attached product/subject specifically — never a generic substitute.',
    },
    environment: { type: 'string', description: 'The setting/environment the subject sits in.' },
    composition: {
      type: 'string',
      description: 'Framing, angle, depth, negative space, focal point.',
    },
    lighting: { type: 'string', description: 'The quality and direction of light.' },
    mood: { type: 'string', description: 'The emotional register in a few words.' },
    palette: stringArray(
      '3–6 hex colours DERIVED for this specific creative from brand identity + campaign/occasion + product + concept (+ reference palette when given) — never a genre default or a palette reused from unrelated work.',
      6,
    ),
    brandConstraints: stringArray(
      'Concrete rules this generation must honour from the brand/visual identity given.',
      8,
    ),
    productTreatment: {
      type: 'string',
      description: 'How any attached product/subject participates in the idea — scale, placement, finish, role in the mechanism.',
    },
    background: { type: 'string', description: 'What the background should be.' },
    negativeVisualConstraints: stringArray(
      'Things the image must NOT contain — invented text, invented logos, invented pricing, extra products, etc.',
      8,
    ),
    aspectRatio: {
      type: 'string',
      description: 'Best aspect ratio for the primary platform, e.g. "1:1", "4:5", "9:16".',
    },
    platform: { type: 'string', description: 'The primary platform this creative is optimised for.' },
    copyTreatment: {
      type: 'string',
      enum: ['none', 'headline', 'headline_support', 'interactive', 'editorial_punchline'],
      description: 'How much text this idea actually needs — decided by the idea, not defaulted.',
    },
    headline: { type: 'string', description: 'Short, human, specific. Empty string if copyTreatment is none.' },
    supportingLine: { type: 'string', description: 'One supporting line, only for headline_support. Empty string otherwise.' },
    cta: { type: 'string', description: 'A short call to action, only if the idea genuinely wants one. Empty string otherwise.' },
    interactionInstructions: {
      type: 'string',
      description: 'For an interactive/puzzle concept — e.g. "Which one fits?". Empty string otherwise.',
    },
    marketingCreative: {
      type: 'object',
      description:
        'What a headline + visual still leave out of a FINISHED creative. Optional — omit entirely, or leave individual fields empty, when the concept does not need them.',
      properties: {
        brandMessage: {
          type: 'string',
          description: 'Why this brand specifically, distinct from the headline — e.g. "Cooked in silence, served with love." Empty string if the headline already carries this.',
        },
        offerText: {
          type: 'string',
          description: 'The offer as a SHORT display fragment for a large graphic device — e.g. "50% OFF ALL KOREAN FOOD", never a sentence. Keep the member\'s exact numbers/terms. Empty string when there is no offer.',
        },
        eventBadge: {
          type: 'string',
          description: 'A 2–4 word event label for a small badge/ribbon device — e.g. "BTS COMEBACK EVENT". Empty string when the request has no event.',
        },
        secondaryInfo: stringArray('Practical/location detail that finishes the creative, e.g. ["Prism Mall, Gachibowli"]. Empty array if none applies.', 4),
        logoTreatment: {
          type: 'string',
          description: 'How the logo/wordmark participates in THIS shot, only if it needs a specific role beyond the brand\'s default mark. Empty string otherwise.',
        },
        requiredElements: stringArray('Anything else this concept specifically requires that the other fields don\'t cover. Empty array if none.', 6),
      },
    },
    layoutDirection: {
      type: 'object',
      description:
        'The graphic-design layer — WHERE things sit, not what they say. Optional — omit entirely, or leave individual fields empty, when the concept is simple enough that composition already covers it. Never fill every field by default; only what this concept needs.',
      properties: {
        layoutType: { type: 'string', description: 'The overall layout approach, e.g. "editorial vertical split, product foreground-left, copy right column". Empty string if composition already covers it.' },
        textHierarchy: stringArray('Reading order, each entry naming its job — e.g. ["HOOK — headline, upper third", "DIRECT — cta, lower-right corner"]. Empty array if there is no text.', 6),
        headlinePlacement: { type: 'string', description: 'Where the headline sits, only if copyTreatment includes one. Empty string otherwise.' },
        supportingCopyPlacement: { type: 'string', description: 'Where the supporting line sits, only for headline_support. Empty string otherwise.' },
        logoPlacement: { type: 'string', description: 'Where the logo/wordmark sits and at what scale. Empty string if no logo participates.' },
        brandTreatment: { type: 'string', description: 'How brand colour/motif/material shows up across the piece beyond the logo mark itself. Empty string if not applicable.' },
        secondaryInformation: { type: 'string', description: 'Where practical/secondary detail sits (not the detail itself — that is marketingCreative.secondaryInfo). Empty string if none applies.' },
        ctaPlacement: { type: 'string', description: 'Where the CTA sits, only if one exists. Empty string otherwise.' },
        productPlacement: { type: 'string', description: 'Where the product sits in the frame and at what scale, if a product is attached or invented.' },
        foregroundElements: { type: 'string', description: 'What occupies the foreground, for depth. Empty string if flat/graphic.' },
        backgroundElements: { type: 'string', description: 'What occupies the background, for depth. Empty string if already covered by `background`.' },
        textureDirection: { type: 'string', description: 'What tactile/material texture is appropriate — grain, fabric, paper, light falloff. Empty string if none.' },
        typographyDirection: { type: 'string', description: 'The character of any lettering — weight, case, spacing — not a specific font name.' },
        visualDensity: { type: 'string', description: 'How busy the composition should feel, e.g. "minimal, one focal point" or "dense, editorial layering".' },
        safeAreas: { type: 'string', description: 'What must stay empty of text/graphics, e.g. "bottom 15% clear for platform UI". Empty string if not applicable.' },
      },
    },
  },
  required: [
    'concept',
    'visualStory',
    'subject',
    'composition',
    'lighting',
    'mood',
    'palette',
    'aspectRatio',
    'copyTreatment',
  ],
};

/**
 * Renders research patterns as inspiration, never as reproducible content —
 * only mechanisms and directions, nothing tied to a specific source.
 */
function renderResearchSection(research?: CreativeResearch): string | null {
  if (!research || research.creativeMechanisms.length === 0) return null;

  const lines = [
    research.creativeMechanisms.length &&
      `- Creative mechanisms seen in strong work: ${research.creativeMechanisms.join('; ')}`,
    research.visualPatterns.length && `- Visual patterns: ${research.visualPatterns.join('; ')}`,
    research.compositionPatterns.length &&
      `- Composition patterns: ${research.compositionPatterns.join('; ')}`,
    research.typographyPatterns.length &&
      `- Typography patterns: ${research.typographyPatterns.join('; ')}`,
    research.productTreatmentPatterns.length &&
      `- Product treatment patterns: ${research.productTreatmentPatterns.join('; ')}`,
    research.ideasToAvoid.length && `- Avoid: ${research.ideasToAvoid.join('; ')}`,
    research.originalityDirection && `- Originality direction: ${research.originalityDirection}`,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);

  return `## Creative research (inspiration only — do not reproduce any of it, use it as technique)\n${lines.join('\n')}`;
}

/** "Show FlowPost what you like" — inspiration only, ranks below confirmed brand identity, above research. */
function renderReferenceStyleSection(style?: ReferenceStyleProfile): string | null {
  if (!style || !style.analysed) return null;
  const lines = [
    style.visualLanguage && `- Visual language: ${style.visualLanguage}`,
    style.creativeMechanisms.length && `- What's interesting about these references: ${style.creativeMechanisms.join('; ')}`,
    style.compositionPatterns.length && `- Composition patterns: ${style.compositionPatterns.join('; ')}`,
    style.colorRelationships && `- Colour relationships: ${style.colorRelationships}`,
    style.textureAndMaterial && `- Texture/material: ${style.textureAndMaterial}`,
    style.lightingAndMood && `- Lighting/mood: ${style.lightingAndMood}`,
    style.typographyCharacter && `- Typography character: ${style.typographyCharacter}`,
    style.imperfectionLevel && `- Imperfection level: ${style.imperfectionLevel}`,
    style.brandTreatment && `- Brand treatment seen in references: ${style.brandTreatment}`,
    // The recipe's photography/illustration fields only — the renderer owns
    // typography, layout, footer, logo and texture (§2: Gemini never defines
    // the final design system). compositionBehaviour is deliberately absent
    // too: it describes how the REFERENCES arrange type over imagery, and
    // feeding that here makes the model art-direct typography INTO the visual.
    style.designRecipe?.photographyStyle && `- Photography style to lean toward: ${style.designRecipe.photographyStyle}`,
    style.designRecipe?.illustrationStyle && `- Illustration style to lean toward: ${style.designRecipe.illustrationStyle}`,
    style.dominantDirection && `- Dominant direction: ${style.dominantDirection}`,
    style.doNotCopy.length && `- DO NOT COPY (put these in negativeVisualConstraints): ${style.doNotCopy.join('; ')}`,
    `- Influence: ${style.influence}`,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);
  if (lines.length === 0) return null;
  return `## Reference style (inspiration only, from ${style.referenceCount} uploaded image(s) — visual language, never content to reproduce; confirmed brand identity above always wins if these conflict)\n${lines.join('\n')}`;
}

/** The chosen advertising idea, rendered as the brief this stage must execute — not invent. */
function renderConceptSection(concept: CreativeConcept): string {
  const lines = [
    `- conceptName: ${concept.conceptName}`,
    `- bigIdea: ${concept.bigIdea}`,
    `- visualMechanism: ${concept.visualMechanism}`,
    concept.visualMetaphor && `- visualMetaphor: ${concept.visualMetaphor}`,
    concept.interaction && `- interaction: ${concept.interaction}`,
    concept.humanInsight && `- humanInsight: ${concept.humanInsight}`,
    concept.message && `- message: ${concept.message}`,
    concept.productRole && `- productRole: ${concept.productRole}`,
    concept.brandConnection && `- brandConnection: ${concept.brandConnection}`,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);

  return `## The idea you are executing (do not invent a different one)\n${lines.join('\n')}`;
}

/**
 * Every field of the prior creative, given as concrete anchors — not just its
 * concept name. Without this, "make it darker" has nothing to hold the
 * composition/environment/subject placement steady against, and the model
 * quietly redesigns the whole shot instead of adjusting the one thing asked.
 */
function renderPriorDirectionSection(prior: CreativeDirection): string {
  const lines = [
    `- concept: ${prior.concept}`,
    `- visualStory: ${prior.visualStory}`,
    `- subject: ${prior.subject}`,
    prior.environment && `- environment: ${prior.environment}`,
    `- composition: ${prior.composition}`,
    `- lighting: ${prior.lighting}`,
    `- mood: ${prior.mood}`,
    prior.palette.length && `- palette: ${prior.palette.join(', ')}`,
    prior.background && `- background: ${prior.background}`,
    prior.productTreatment && `- productTreatment: ${prior.productTreatment}`,
    `- copyTreatment: ${prior.copyTreatment}`,
    prior.headline && `- headline: ${prior.headline}`,
    prior.supportingLine && `- supportingLine: ${prior.supportingLine}`,
    prior.marketingCreative?.brandMessage && `- marketingCreative.brandMessage: ${prior.marketingCreative.brandMessage}`,
    prior.marketingCreative?.secondaryInfo?.length &&
      `- marketingCreative.secondaryInfo: ${prior.marketingCreative.secondaryInfo.join(', ')}`,
    prior.layoutDirection?.layoutType && `- layoutDirection.layoutType: ${prior.layoutDirection.layoutType}`,
    prior.layoutDirection?.logoPlacement && `- layoutDirection.logoPlacement: ${prior.layoutDirection.logoPlacement}`,
    prior.layoutDirection?.safeAreas && `- layoutDirection.safeAreas: ${prior.layoutDirection.safeAreas}`,
    `- aspectRatio: ${prior.aspectRatio}`,
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);

  return `## Prior direction (copy every field forward unchanged unless the instruction below names it)\n${lines.join('\n')}`;
}

export interface BuiltCreativeDirectionPrompt {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  temperature: number;
  version: number;
}

export function buildCreativeDirectionPrompt(context: {
  request: string;
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  platforms: string[];
  hasAssets: boolean;
  brand: BrandProfile;
  creativeDna: ResolvedCreativeDna;
  /** The idea this direction executes. Absent only for a refinement, which re-executes the prior direction's own concept instead. */
  concept?: CreativeConcept;
  /** Fixed from the concept (or the prior direction, on a refinement) — this stage executes it, never re-picks it. */
  artDirectionFamily: ArtDirectionFamily;
  /** Set for a refinement — the prior direction in full, plus the member's follow-up. */
  refinementOf?: { priorDirection: CreativeDirection; instruction: string };
  research?: CreativeResearch;
  referenceStyle?: ReferenceStyleProfile;
  /** The member's hard requirements — carried into a refinement too, so an edit never quietly drops the offer. */
  intent?: CreativeIntentBrief;
}): BuiltCreativeDirectionPrompt {
  const brandSection = renderBrandSection(context.brand);
  const dnaSection = renderCreativeDnaSection(context.creativeDna);
  const referenceStyleSection = context.refinementOf ? null : renderReferenceStyleSection(context.referenceStyle);
  const researchSection = context.refinementOf ? null : renderResearchSection(context.research);
  const priorDirectionSection = context.refinementOf
    ? renderPriorDirectionSection(context.refinementOf.priorDirection)
    : null;
  const conceptSection = context.concept ? renderConceptSection(context.concept) : null;

  const prompt = [
    context.refinementOf
      ? `Refine the existing creative per this instruction: "${context.refinementOf.instruction}". Change only what the instruction names — everything else must match the prior direction below exactly.`
      : `Art-direct this idea for the request: "${context.request}"`,

    renderIntentSection(context.intent),

    `## Art direction family to execute (fixed, do not change): ${context.artDirectionFamily}\n${ART_DIRECTION_FAMILY_HINTS[context.artDirectionFamily]}`,

    priorDirectionSection,
    conceptSection,

    [
      '## Marketing context',
      `- Goal: ${context.goal}`,
      `- Funnel stage: ${context.funnelStage}`,
      context.platforms.length && `- Platforms: ${context.platforms.join(', ')}`,
      context.hasAssets
        ? '- The member attached a product/reference image. Your subject and productTreatment MUST describe preserving it, not replacing it.'
        : '- No asset was attached — this is a text-to-image request. Invent a subject consistent with the brand.',
      context.creativeDna.logoAssetUrl
        ? '- The brand has a real logo file, composited onto the finished creative separately (never redrawn by an image model) — still describe where it should sit via layoutDirection.logoPlacement and marketingCreative.logoTreatment, since that placement drives the layout.'
        : null,
    ]
      .filter(Boolean)
      .join('\n'),

    brandSection,
    dnaSection,
    referenceStyleSection,
    researchSection,

    'Return a single JSON object matching the provided schema. Nothing else.',
  ]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n\n');

  return {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: CREATIVE_DIRECTION_RESPONSE_SCHEMA,
    // Higher than vision's 0.25: this stage still makes real creative
    // choices (composition, copy). A refinement benefits from some latitude
    // in how it executes the instruction.
    temperature: 0.75,
    version: CREATIVE_DIRECTION_PROMPT_VERSION,
  };
}
