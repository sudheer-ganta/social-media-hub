import { renderBrandSection } from '../brand/brand-profile';
import { renderCreativeDnaSection } from '../brand/creative-dna';
import type { CreativeStrategy, GraphicDesignConcept } from '../types';
import { renderIntentSection } from '../generators/creative-intent.generator';
import type { StyleDNA } from '../style-dna/style-dna';
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

export const CREATIVE_DIRECTION_PROMPT_VERSION = 10;

const SYSTEM_INSTRUCTION = `You are a copywriter and production designer executing ONE specific, authoritative creative blueprint (GraphicDesignConcept) from the Art Director — you are in a pure execution and copy synthesis stage.

YOU ARE STRICTLY FORBIDDEN FROM:
- Inventing a new concept or changing the campaign idea
- Inventing a new layout or changing the spatial relationships
- Inventing a new visual mechanism or metaphor
- Inventing a new visual style or changing the aesthetic system
- Inventing a new composition
- Inventing a new image idea

Your sole responsibility is to synthesize precise, high-craft, on-brand copy (headline, supporting line, CTA, offer text, badges, secondary details) and faithfully format the execution parameters established by the Art Director's GraphicDesignConcept.

Rules you never break:
- SPELLING AND COPY FIDELITY: You must act as a meticulous English professor and professional proofreader. Before outputting any copy strings (headline, supportingLine, cta, marketingCreative fields), verify every single word letter-by-letter to ensure it is spelled 100% correctly with proper grammar. Double-check all vocabulary, especially proper nouns, place names, personal names, culturally specific terms, festival and occasion names, brand keywords and promotional terms — whatever this particular request happens to contain. Spell every one exactly as the member wrote it. Never make phonetic guesses or character-level hallucinations. Typographical errors or misspelled words make the ad completely unpublishable.
- AVOID COPY REDUNDANCY: Do not repeat the same words, slogans, taglines, or marketing messages across different text fields. Every text field (headline, supportingLine, brandMessage, secondaryInfo, cta) must carry unique, additive, and distinct content. Redundant or repetitive text across these fields reads as an unpolished design mistake.
- STRICT ADHERENCE TO MEMBER'S REQUESTED VISUALS: If the member's prompt describes specific visual scenes, subjects, settings, lighting, physical props, or compositional layouts (e.g. a traveler at an airport window looking at a sunrise over dream destinations, an airplane in the sky, specific suitcases or bags), you MUST incorporate these requested visual details, settings, and physical objects directly into your generated image prompt fields (subject, visualStory, environment, composition, background). Do not ignore, replace, or dilute the user's concrete visual instructions with generic stock scenes or override them completely with abstract brand voice concepts. Ground the brand's voice and personality inside this requested scene instead.
- GOAL AND FUNNEL: TOFU must make the subject and relevance clear; MOFU should explain a concrete supplied benefit or proof; BOFU should foreground the actual offer and action; Retention should use the brand voice to speak to existing customers. These priorities change hierarchy, copy and emphasis, not the supplied facts. Never invent evidence or offers.
- ASSET ROLES: All uploaded products will be composited from their original files without redraw or crop. Design around their real appearance. Style references guide typography, material, color relationships and composition; they are not products to include. The real logo is mandatory and needs its own clear region.
- SERVICES FIDELITY: When outputting marketingCreative.secondaryInfo, you MUST select the items directly from the brand's defined services (e.g. from the "Services: ..." list in the brand profile below, if provided). Do not invent new services, categories, or list generic placeholder services that the brand does not provide. Keep their exact terms, but you may format them with proper title capitalization and spaces (e.g., convert "chartedflights" to "Charted Flights", "toursandpackages" to "Tours & Packages", and fix obvious spelling mistakes like "curises" to "Cruises").
- THE CREATIVE MUST BE LEGIBLY ABOUT WHAT IT IS ABOUT: a viewer scrolling past must be able to tell what is being advertised. Write concrete, physical, specific things into subject, visualStory and environment — real objects with real weight, belonging to THIS business and THIS campaign — never an empty backdrop or an abstract landscape standing in for an idea.
  Concrete does NOT mean conventional. Do not assemble the props a category is expected to display; that is how every business in a sector ends up advertising with the same picture. WHICH objects appear, and what they are doing, is decided by the creative mechanism in the blueprint above — the requirement here is only that whatever appears is specific and physical rather than vague.
- Four inputs, four jobs, in priority order — never let one collapse into another: the brand's confirmed identity (logo, colours, typography preferences, tone, personality, audience) CONSTRAINS the creative; the member's request + stated requirements (product, offer, event, occasion, audience, message) DETERMINE what is being advertised; a "## SELECTED STYLE" section below, if given, is a MANDATORY product requirement the member explicitly chose — it GOVERNS the visual system (typography character, colour behaviour, imagery medium, composition, texture); any separate "## Reference style" section (uploaded images) GOVERNS the preferred visual execution within the selected style and confirmed brand identity. The same brand must be able to look dramatically different across campaigns, and different brands given the same request must produce dramatically different work — but a given selected style must always read as that style.
- Every aesthetic choice — palette, typography character, texture, lighting, mood — must be traceable to THIS brand, THIS campaign/occasion/product, THESE references, or THIS concept. Never reach for a stock aesthetic — a dark purple event glow, a cool blue-and-white corporate wash, a warm amber hospitality haze, a beige minimal palette, or any other look that arrives with a business category attached — unless this client's own brand, campaign or references specifically call for it.
- Execute the given concept's mechanism specifically. If it's a visual metaphor, the metaphor must be visibly the subject. If it's a puzzle/interaction, the image must actually look like something to solve or respond to — not a product photo with a caption bolted on.
- The product must participate in the idea, not just sit inside a pretty scene. If a product or reference image was attached, preserve its actual identity — describe it as "the attached product/subject", never invent a replacement.
- Never invent claims, prices, offers, or a logo that was not provided. negativeVisualConstraints must name anything the image must NOT show.
- The IMAGE is wordless, always. concept, visualStory, subject, environment, composition and layoutDirection describe a photograph/illustration that contains NO letters, words, numerals, labels, wordmarks, or typography of any kind — never "the word X formed in steam", never "blueprint with labelled parts", never a diagram with callouts, and NEVER any drawn graphic badges, stickers, ribbons, stamps, seals, or decorative label containers. FlowPost typesets every word and renders every design badge/shape itself afterward via a separate layout renderer, so any verbal, typographic, or label/badge ideas must live in copy/marketingCreative fields instead. An "anatomy/blueprint/explainer" concept renders as one richly-detailed WORDLESS subject; its explanation becomes the copy.
- HARD REQUIREMENTS ARE TYPESET, NOT IMPLIED. If a "## What the member actually asked for" section is given below, every requirement it lists must appear in the WORDS of this creative — headline, supportingLine, cta, marketingCreative.offerText, marketingCreative.brandMessage or marketingCreative.secondaryInfo. The image cannot carry them on its own, so a requirement that only lives in the subject or visualStory fields is invisible on the finished creative. Never assume the viewer will infer the offer from a photograph. Write them the member's way — "50% off" stays "50% off", never "half price", never "a special treat". Everything else about how they are phrased and arranged is yours.
- OFFERS AND EVENTS ARE DESIGNED DEVICES, NOT SENTENCES. When the member states an offer, author marketingCreative.offerText as a short display fragment in their exact terms ("50% OFF ALL KOREAN FOOD") — its priority follows the campaign goal and funnel, and it can be the first focal element, so never bury the same offer again inside a long supporting sentence. When the request centres on an event, name the event prominently in the headline or author marketingCreative.eventBadge as an explicit display label, in the member's own words for it. A promotional request wants promotional copy energy: a headline that sounds like a campaign shouted with conviction, not a polite caption — but still in this brand's voice, never generic hype that contradicts it.
- WHEN THE REQUEST CENTRES ON AN OCCASION, CULTURE, SEASON OR SHARED MOMENT:
  - CLARITY IS REQUIRED: a viewer must be able to tell, quickly, which moment this creative is about. That is a requirement on the creative as a whole — the copy names it, and the idea can carry it. It is NOT a requirement to reproduce the occasion's standard motifs.
  - THE STANDARD MOTIFS ARE NOT THE ANSWER: the visual signifiers "traditionally associated" with an occasion are the ones every competitor is already using this week, which is exactly why a creative built from them disappears. Reach for them only when the blueprint's mechanism genuinely needs them, and never as a way of signalling the occasion.
  - RESPECT IS REQUIRED: never render a culture's moment as cheap clip-art, generic ornament, or decoration applied on top of an otherwise unrelated layout. If the blueprint uses a cultural element, it participates in the idea.
  - The blueprint above decides what appears. Your job here is the words, and whatever wordless subject/visualStory the blueprint's idea implies — not a motif checklist.
  - A campaign's palette should commit to something rather than defaulting to neutral, but which colours, and whether the palette is saturated or quiet, follow this brand and this idea — not the occasion's conventional colours.
- When the campaign promotes a specific physical thing, that thing is visibly present in the scene, and shown desirably. Even when the concept's mechanism centres on another object (a ticket, a receipt, a sign), stage the promoted thing WITH that object rather than letting the device replace it — a creative that advertises a product the viewer never sees has failed, however clever the device. This applies to whatever the member is actually selling; it is not a rule about any one kind of business.
- The request is THIS campaign's subject; the brand profile is a persistent constraint on voice, palette and personality, never the subject. When a broad business asks for a specific campaign, the creative is about that specific thing, in that brand's voice — the brand's breadth never dilutes the request back to a generic house ad.
- Decide copyTreatment from what the idea needs, not from habit: 'none' when the visual alone communicates it, 'headline' for one short line, 'headline_support' for a headline plus one supporting line, 'interactive' when the concept is a puzzle/game and needs a short instruction, 'editorial_punchline' for a single punchy line in an editorial layout. Most ideas need less text than you'd think.
- Any headline/supportingLine/cta must be short, human and specific to this brand and request. Never generic marketing language, never "revolutionary/seamless/game-changing/elevate/unlock/unleash" or similar AI-sounding filler, never a paragraph.
- A beautiful image with a headline bolted on is a CONCEPT, not a finished creative. A finished creative is concept + visual + copy + brand + (audience interaction, when the idea is participatory) + secondary information, when the idea needs any of those. Before you finish, ask: does the viewer know what this is about, what's being sold, and remember the brand — or is it just a nice picture? If a request is promotional and the brand/value proposition wouldn't be clear from the image alone, add what's missing via marketingCreative rather than shipping a mood board.
- marketingCreative is optional and additive — fill in only the fields this specific concept needs (brandMessage for why-this-brand positioning beyond the headline's hook, secondaryInfo for practical/location/service details, logoTreatment when the mark needs a specific role in this shot, requiredElements for anything else the concept requires). Every text field must have a job — HOOK, EXPLAIN, REINFORCE, INTERACT, IDENTIFY, or DIRECT. If a field has no job here, leave it out. When the ad requires multiple category, product, or service details in secondaryInfo, format them as short, distinct list items separated by a dot (e.g., ["Flights · Hotels · Packages"] or ["Booking · Curation · Custom"]) so they can be parsed as a structured multi-column footer.
- GRAPHIC-DESIGN COMPOSITION, NOT UI TEMPLATES: Never think in terms of generic UI cards or webpage sections (strictly prohibit default reasoning like "place image at top", "put headline underneath", "add divider", "put CTA at bottom", or "footer card"). That is an uncreative template collapse. Real advertising and editorial creatives use genuine graphic-design thinking:
  - scale contrast (dramatic scale differences between hero elements and supporting text)
  - typography as a visual element (treating letterforms as primary graphic weight, not just captions)
  - negative space (intentional breathing room rather than packing every zone with boxes)
  - image/type interaction and intentional overlapping elements (type breaking frames, crossing boundaries)
  - asymmetry and dynamic visual balance over static centering
  - visual hierarchy with decisive emphasis
  - genuine color blocking and split composition
  - editorial publication composition and typographic poster hierarchy
  - graphic framing, layered collage fragments, and product cutouts
  CTA buttons, horizontal dividers, and footer bars are strictly OPTIONAL — only author a CTA when the concept genuinely requires a direct conversion action, and never assume dividers or footers are mandatory.
  The composition planner executes your art direction with free coordinates and actual uploaded assets. Describe the relationship between image, type and whitespace; never assume a fixed archetype or footer. Logo space must be separate from all text and imagery.
- layoutDirection is the graphic-design layer, separate from marketingCreative's copy content: it says WHERE things sit and in what order, not what they say. Before filling it in, ask "what must be present for this to read as a finished social ad, not a nice picture?" — then fill in only the layoutDirection fields that concept actually needs (a quiet visual-metaphor idea may only need safeAreas; a promo with a logo, CTA and location tag needs most of them). Let the concept decide layout, not habit: don't default to logo top-right / headline top-center / CTA bottom-center every time — vary it per idea, favour asymmetry and editorial composition over dead-centred templates. When styling typographyDirection, specify dynamic, high-quality typography pairings (such as elegant serif for headlines paired with structural sans-serif for secondary copy) rather than standard default styling. textHierarchy lists reading order with each entry's job, e.g. "HOOK — headline, upper third" then "DIRECT — cta, lower-right corner".
- If a real brand logo image is attached as a reference (noted below), it is a fixed asset, not a suggestion: describe its placement and role via layoutDirection.logoPlacement / marketingCreative.logoTreatment, but never ask for it to be redrawn, redesigned, recoloured, or reinterpreted — and never invent a logo when none was attached.
- If a "## SELECTED STYLE" section is given below, the member explicitly picked that style from FlowPost's style picker — it is a product requirement, not a suggestion. You still invent the concept's subject, story, imagery specifics, copy and campaign idea freely, but every visual choice you make (mood, lighting, composition, palette) must stay recognisably WITHIN that style's system. Do not blend in another style's visual language, and do not fall back to a generic/neutral look that could belong to any style — the typography, texture and layout axes are enforced deterministically downstream regardless of what you write, but your OWN prose (lighting, mood, palette, composition) must still agree with them, not fight them.
- If a "## Reference style" section is given below, it's the member's taste from uploaded images — inspiration for HOW this feels, never WHAT it copies. Priority when things conflict: confirmed brand identity, then the selected style (both above) always win over reference style. Borrow its composition/texture/lighting/mechanism tendencies into composition/lighting/background/productTreatment as fits this concept — but anything in its doNotCopy list must appear in negativeVisualConstraints instead, verbatim in spirit, so the image model is told not to reproduce it.
- Execute the artDirectionFamily given below concretely — it decides medium, lighting quality, texture and composition logic, not just a label. Two concepts in the same family must still look different from each other in specifics; two concepts in DIFFERENT families must look like different media, not the same photoreal-gradient-render with a different subject swapped in.
- Avoid dog-food-AI patterns unless the concept genuinely calls for them: centered product on a gradient, giant headline over a hero shot, floating 3D objects, glowing dashboards, generic stock-office scenes, a product on a pedestal for no reason, five feature cards, a CTA strip, perfect symmetry, a cool blue-and-white corporate colour scheme, neon cyan accent lines, dark corporate rooms, floating glass UI panels, soft corporate three-point lighting. These are allowed only when the concept specifically requires them — never as the unthinking default.
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
      description: 'The creative concept in a short, specific phrase naming the idea and the campaign it belongs to.',
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
          description: 'A 2-4 word event label for a small badge/ribbon device, in the words the member used for the event. Empty string when the request has no event.',
        },
        secondaryInfo: stringArray('Practical, location, or service details (1-3 short items) tailored to this specific brand category and extracted from the brand profile\'s defined services or request details (e.g. ["Apparel", "Footwear"] for fashion, or ["Pediatrics", "Emergency Care"] for medical). Empty array if none applies.', 4),
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
    graphicConcept: {
      type: 'object',
      description: 'The graphic design art-direction layer deciding visual idea, hero role, composition strategy, scale contrast, controlled imperfection, and intentional omissions.',
      properties: {
        conceptName: { type: 'string', description: 'e.g. "Raw Kitchen Noticeboard" or "Monumental Street Folio".' },
        visualIdea: { type: 'string', description: 'e.g. "A giant word stack dominates the canvas while a small food photograph is taped onto paper like a kitchen reference."' },
        pointOfView: { type: 'string', description: 'Editorial / tactile perspective.' },
        emotionalTone: { type: 'string', description: 'e.g. "Authentic, raw, vibrant."' },
        hero: { type: 'string', enum: ['typography', 'image', 'whitespace', 'graphic-object'] },
        imageRole: { type: 'string', enum: ['hero', 'small-tactile-object', 'full-bleed-backdrop', 'textured-fragment', 'cutout-subject'] },
        typographyRole: { type: 'string', enum: ['hero', 'monumental-headline', 'subtle-metadata', 'integrated-narrative'] },
        compositionStrategy: { type: 'string', enum: ['scale-contrast', 'asymmetry', 'intentional-overlap', 'extreme-whitespace', 'tactile-collage', 'edge-bleeding'] },
        scaleStrategy: { type: 'string', enum: ['dominant-type-small-photo', 'dominant-photo-micro-type', 'balanced-counterpoint', 'monumental-scale'] },
        imperfection: { type: 'string', description: 'Controlled imperfection: e.g. "slight image rotation, uneven margins, translucent tape".' },
        graphicDevices: stringArray('Graphic devices such as ["tape", "stamp", "handwritten-note", "rough-underline"].', 6),
        elementsToOmit: stringArray('Elements deliberately omitted for graphic purity — e.g. ["cta", "divider", "footer", "description"].', 6),
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

/**
 * The member's EXPLICITLY SELECTED style — a mandatory product requirement,
 * never inspiration. Distinct from `renderReferenceStyleSection` below,
 * which is uploaded-image taste and stays optional/advisory. The axes this
 * stage cannot itself enforce (typography, texture, layout, renderer rules)
 * are enforced deterministically further down the pipeline regardless of
 * what this stage writes — this section exists so the model's OWN prose
 * (mood, lighting, composition, palette) agrees with those axes instead of
 * contradicting them.
 */
function renderSelectedStyleSection(style?: StyleDNA): string | null {
  if (!style) return null;
  const lines = [
    `- Visual character: ${style.visualCharacter.join(', ')}. Mood: ${style.mood.join(', ')}.`,
    `- Typography MUST read as: ${style.typography.displayPersonality.join(', ')} (${style.typography.preferredCategories.join('/')} only) — ${style.typography.hierarchy} hierarchy. ${style.typography.accentAllowed ? 'A handwritten/decorative accent is welcome for eyebrow or annotation text.' : 'No decorative or handwritten accent lettering anywhere.'}`,
    `- Colour MUST behave like: ${style.color.relationships.join('; ')}; ${style.color.contrast} contrast; ${style.color.saturation} saturation; ${style.color.temperature} temperature. Draw palette hex values in the spirit of: ${style.color.paletteFamilies.map((family) => family.join('/')).join(' or ')} — vary within it, never copy a fixed swatch mechanically.`,
    `- Lighting character: ${style.lighting.direction.join(', ')}; ${style.lighting.quality.join('/')}; ${style.lighting.contrast} contrast.`,
    `- Imagery MUST be: ${style.imagery.medium.join('/')} (${style.imagery.realism} realism) — never a medium outside this list.`,
    `- Composition tendency: ${style.composition.join('; ')}; ${style.layout.symmetry} symmetry; ${style.layout.whitespace} whitespace; ${style.layout.density} density.`,
    `- Texture/graphic language: ${style.texture.join('/')}; ${style.graphicElements.join(', ')}.`,
    `- Creative imperfection allowed: ${style.imperfection.allowed.join(', ') || 'none'}.`,
  ];
  return `## SELECTED STYLE — "${style.name}" (MANDATORY — the member explicitly picked this from FlowPost's style picker; this is a product requirement, not inspiration)\nYou decide this concept's subject, story, imagery specifics, copy and campaign idea freely — but every visual choice below must stay recognisably WITHIN this style's system, never a generic look that could belong to any style, and never another style's visual language.\n${lines.join('\n')}`;
}

/** "Show FlowPost what you like" — inspiration only, ranks below confirmed brand identity and the selected style, above research. */
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
  return `## Reference style (inspiration only, from ${style.referenceCount} uploaded image(s) — visual language, never content to reproduce; confirmed brand identity and the selected style above always win if these conflict)\n${lines.join('\n')}`;
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

/**
 * The blueprint, as a copy brief.
 *
 * This section is what stops the copy stage inventing an information card. It
 * tells the writer what the design IS, and — decisively — how many text
 * elements the design has room for and which roles they are. Copy quantity is
 * a property of the creative idea; before the blueprint reached this stage it
 * was a property of how many schema fields the model felt like filling in.
 */
function renderBlueprintSection(concept?: GraphicDesignConcept): string | null {
  if (!concept) return null;
  const plan = concept.copyPlan;
  const lines = [
    '## The design this copy is written FOR (authoritative)',
    `- The visual idea: "${concept.visualIdea}"`,
    concept.creativeMechanism ? `- The mechanism: "${concept.creativeMechanism}"` : null,
    concept.typeBehavior ? `- What typography does in this design: ${concept.typeBehavior}` : null,
    concept.hierarchyStrategy ? `- Hierarchy: ${concept.hierarchyStrategy}` : null,
    concept.firstRead ? `- What the viewer must grasp first: "${concept.firstRead}"` : null,
    concept.elementsToOmit?.length ? `- This design deliberately omits: ${concept.elementsToOmit.join('; ')}` : null,
    '',
    plan
      ? [
        '### HOW MUCH COPY THIS DESIGN HAS ROOM FOR — a hard limit',
        `- Roles the design needs, in reading order: ${plan.requiredRoles.join(' -> ')}`,
        `- Maximum text elements on the finished piece: ${plan.maxTextElements}`,
        plan.rationale ? `- Why: ${plan.rationale}` : null,
        '',
        'Leave EVERY other copy field empty. A field you fill that the design has no room for is dropped before rendering, so filling it only risks losing a fact that mattered. If a required campaign fact is not carried by one of the roles above, put it in one of them — do not add a role.',
      ]
        .filter((line): line is string => typeof line === 'string')
        .join('\n')
      : '### The design did not fix a copy budget. Write the MINIMUM that communicates the idea, and leave every field the idea does not need empty.',
  ].filter((line): line is string => typeof line === 'string');
  return lines.join('\n');
}

/** The idea the words serve. Kept short — this stage writes copy, it does not re-decide the idea. */
function renderStrategySection(strategy?: CreativeStrategy): string | null {
  if (!strategy) return null;
  const prohibited = [
    ...new Set([...strategy.prohibitedVisualCliches, ...(strategy.domainContext?.visualClichesToAvoid ?? [])]),
  ];
  const lines = [
    '## The creative strategy the words must express',
    `- Communication idea: "${strategy.communicationIdea}"`,
    strategy.creativeMechanism ? `- Mechanism: "${strategy.creativeMechanism}"` : null,
    strategy.emotionalDirection ? `- Emotional direction: "${strategy.emotionalDirection}"` : null,
    strategy.brandConnection ? `- Why this brand: "${strategy.brandConnection}"` : null,
    prohibited.length ? `- Never write copy that leans on: ${prohibited.join('; ')}` : null,
    '',
    'Write for THIS idea. Generic category copy — the kind that would fit any competitor with the brand name swapped — is a failure however well-written it is.',
  ].filter((line): line is string => typeof line === 'string');
  return lines.join('\n');
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
  /** The member's explicitly selected style (FlowPost's style picker) — a mandatory constraint, distinct from `referenceStyle` (uploaded-image inspiration). */
  selectedStyle?: StyleDNA;
  referenceStyle?: ReferenceStyleProfile;
  /** The member's hard requirements — carried into a refinement too, so an edit never quietly drops the offer. */
  intent?: CreativeIntentBrief;
  /** The blueprint this copy serves — decides HOW MUCH copy exists, not just what it says. */
  graphicConcept?: GraphicDesignConcept;
  /** The idea layer, so the words express the mechanism. */
  creativeStrategy?: CreativeStrategy;
}): BuiltCreativeDirectionPrompt {
  const brandSection = renderBrandSection(context.brand);
  const dnaSection = renderCreativeDnaSection(context.creativeDna);
  const selectedStyleSection = renderSelectedStyleSection(context.selectedStyle);
  const referenceStyleSection = context.refinementOf ? null : renderReferenceStyleSection(context.referenceStyle);
  const researchSection = context.refinementOf ? null : renderResearchSection(context.research);
  const priorDirectionSection = context.refinementOf
    ? renderPriorDirectionSection(context.refinementOf.priorDirection)
    : null;
  const conceptSection = context.concept ? renderConceptSection(context.concept) : null;
  const strategySection = renderStrategySection(context.creativeStrategy);
  const blueprintSection = renderBlueprintSection(context.graphicConcept);

  const prompt = [
    context.refinementOf
      ? `Refine the existing creative per this instruction: "${context.refinementOf.instruction}". Change only what the instruction names — everything else must match the prior direction below exactly.`
      : `Art-direct this idea for the request: "${context.request}"`,

    renderIntentSection(context.intent),

    `## Art direction family to execute (fixed, do not change): ${context.artDirectionFamily}\n${ART_DIRECTION_FAMILY_HINTS[context.artDirectionFamily]}`,

    priorDirectionSection,
    conceptSection,
    strategySection,
    blueprintSection,

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
    selectedStyleSection,
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
    // Lowered to 0.0 to prevent character-level hallucinations and copy typos.
    // This stage executes already selected creative concepts.
    temperature: 0.0,
    version: CREATIVE_DIRECTION_PROMPT_VERSION,
  };
}
