import type {
  BrandProfile,
  CreativeConcept,
  CreativeIntentBrief,
  FunnelStage,
  MarketingGoal,
  ReferenceStyleProfile,
  ResolvedCreativeDna,
  CreativeStrategy,
  GraphicDesignConcept,
  CompositionFamily,
  SpatialAnchor,
  MovementAxis,
  DominantRegion,
  NegativeSpaceRegion,
  LogoPlacementStrategy,
  SemanticNodeRole,
} from '../types';
import type { ResolvedStyleDNA } from '../style-dna/style-dna';

export type {
  GraphicDesignConcept,
  CompositionFamily,
  SpatialAnchor,
  MovementAxis,
  DominantRegion,
  NegativeSpaceRegion,
  LogoPlacementStrategy,
  SemanticNodeRole,
};

export interface AssetBrief {
  url: string;
  kind: 'product' | 'reference' | 'logo';
  label?: string;
}

export interface BrandVoiceBrief {
  tone: string;
  personality: string[];
  vocabulary?: string[];
  constraints?: string[];
}

export interface CreativeStyleBrief {
  id: string;
  name: string;
  visualLanguage: string[];
  typographyLanguage: string[];
  compositionLanguage: string[];
  imageTreatment: string[];
  textureLanguage: string[];
  colorLanguage: string[];
  imperfectionLanguage: string[];
}

export interface CreativeBrief {
  userPrompt: string;
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  chosenConcept?: {
    conceptName: string;
    bigIdea: string;
    visualMechanism: string;
    message?: string;
    visualMetaphor?: string;
  };
  primaryMessage: string;
  secondaryMessages: string[];
  subject: string;
  event?: string;
  offer?: string;
  location?: string;
  audience?: string;
  visualStory: string;
  firstRead: string;
  attentionHierarchy: string[];
  emotionalTone: string;
  brandVoice: BrandVoiceBrief;
  creativeStyle: CreativeStyleBrief;
  assets: {
    productAssets: AssetBrief[];
    referenceImages: AssetBrief[];
    logo?: AssetBrief;
  };
  requiredClaims: string[];
  /** The idea layer this brief was built alongside, when one was resolved. */
  creativeStrategy?: CreativeStrategy;
}

export interface BuildCanonicalCreativeBriefOptions {
  userPrompt: string;
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  brand?: BrandProfile;
  creativeDna?: ResolvedCreativeDna;
  styleDna?: ResolvedStyleDNA;
  referenceStyle?: ReferenceStyleProfile;
  intent?: CreativeIntentBrief;
  concept?: CreativeConcept;
  productAssetUrls?: string[];
  referenceImageUrls?: string[];
  logoAssetUrl?: string;
  /** Resolved by the creative-strategy stage, which runs before this brief is built. */
  creativeStrategy?: CreativeStrategy;
}

/**
 * Renders only the style facets that were actually declared. An undeclared
 * facet is omitted, never defaulted — see the note on compositionLanguage.
 */
function declared(facets: Array<[string, string | undefined]>): string[] {
  return facets
    .filter((facet): facet is [string, string] => typeof facet[1] === 'string' && facet[1].length > 0)
    .map(([name, value]) => `${name}: ${value}`);
}

/**
 * BrandProfile stores personality as one human sentence ("precise,
 * unsentimental"); the brief wants the traits as a list. Split on the
 * separators people actually type, and keep it a list of one when they typed a
 * phrase rather than a list.
 */
function splitTraits(personality?: string): string[] {
  if (!personality) return [];
  return personality
    .split(/[,;/]|\band\b/i)
    .map((trait) => trait.trim())
    .filter((trait) => trait.length > 0)
    .slice(0, 6);
}

/**
 * Builds the single, immutable canonical CreativeBrief.
 *
 * CRITICAL PRIORITY ORDER:
 * 1. CAMPAIGN SUBJECT / EVENT / CHOSEN CONCEPT
 * 2. PRIMARY MESSAGE
 * 3. OFFER / IMPORTANT CLAIMS
 * 4. VISUAL STORY
 * 5. PRODUCT / SUPPORTING ASSETS
 *
 * When a concept is chosen (from /concepts or auto-discovery), it anchors the
 * creative decision canonically: downstream generators execute this exact idea.
 */
export function buildCanonicalCreativeBrief(
  options: BuildCanonicalCreativeBriefOptions,
): CreativeBrief {
  const {
    userPrompt,
    goal,
    funnelStage,
    brand,
    creativeDna,
    styleDna,
    referenceStyle,
    intent,
    concept,
    productAssetUrls = [],
    referenceImageUrls = [],
    logoAssetUrl,
    creativeStrategy,
  } = options;

  // Extract explicit discount offers from the member's own words. The second
  // operand used to be `intent.rawPrompt`, a field CreativeIntentBrief has
  // never had — so it read as undefined at runtime and contributed nothing.
  const promptText = userPrompt || '';
  const discounts = promptText.match(/\d+(?:\.\d+)?\s*%\s*(?:off|discount)\b/gi) ?? [];
  const rawOffer = intent?.offer || discounts[0] || '';

  // The occasion, when the member named one. Read ONLY from the extracted
  // intent — the previous version pattern-matched a list of event words
  // ("festival", "sale", "anniversary"...) against the raw prompt, so the
  // pipeline recognised the occasions someone had thought to list and silently
  // mis-handled every other one. Extraction is generic; a keyword list is a
  // template with a regex in front of it.
  const event = intent?.event || undefined;
  const subject = event || concept?.conceptName || intent?.productCategory || brand?.name || 'Campaign promotion';

  // Primary and secondary messages — anchored to event or chosen concept
  const primaryMessage = event
    ? event.toUpperCase()
    : concept?.message
      ? concept.message
      : (intent?.productCategory || userPrompt.slice(0, 80));

  const secondaryMessages: string[] = [];
  if (rawOffer) secondaryMessages.push(rawOffer.toUpperCase());
  if (intent?.venueType) secondaryMessages.push(intent.venueType);
  if (intent?.culturalContext) secondaryMessages.push(intent.culturalContext);
  if (intent?.audience) secondaryMessages.push(intent.audience);

  // First read is what the viewer MUST see in the first 0.5 - 1.5 seconds
  const firstRead = event
    ? `${event.toUpperCase()}${rawOffer ? ` · ${rawOffer.toUpperCase()}` : ''}`
    : concept?.conceptName
      ? `${concept.conceptName.toUpperCase()}${rawOffer ? ` · ${rawOffer.toUpperCase()}` : ''}`
      : rawOffer
        ? `${primaryMessage} · ${rawOffer.toUpperCase()}`
        : primaryMessage;

  // What must be COMMUNICATED, in order of importance — a content priority,
  // never a visual one. It deliberately no longer ends with the two entries it
  // used to append unconditionally ("VISUAL STORY & HERO ASSET", "SUPPORTING
  // DETAILS & BRAND LOGO"): those told every art director, for every brief,
  // that a hero image sits third and small supporting copy plus a logo sit
  // fourth. That is a layout, and it was being handed over as if it were a
  // fact about the campaign. Visual hierarchy is derived from the idea instead.
  const attentionHierarchy = [
    event
      ? `CAMPAIGN EVENT: "${event.toUpperCase()}"`
      : concept
        ? `CHOSEN CONCEPT: "${concept.conceptName}"`
        : `PRIMARY MESSAGE: "${primaryMessage}"`,
    ...(rawOffer ? [`OFFER: "${rawOffer.toUpperCase()}"`] : []),
    ...(intent?.requiredClaims ?? [])
      .filter((claim) => claim && claim !== rawOffer && claim !== event)
      .slice(0, 3)
      .map((claim) => `REQUIRED FACT: "${claim}"`),
  ];

  // Brand voice, read from the fields that actually exist.
  //
  // This block previously reached for `creativeDna.tone`,
  // `creativeDna.personalityTraits`, `creativeDna.negativeKeywords` and a
  // `brand.voice.*` sub-object — none of which are on ResolvedCreativeDna or
  // BrandProfile. Every one of them read as undefined at runtime, so the brief
  // handed the art director a hardcoded 'confident and distinctive' voice and
  // an ['authentic', 'purposeful'] personality for EVERY brand, and dropped the
  // real constraints entirely. That is brand-as-template by accident: the one
  // stage whose job is to make a creative specific to its brand was supplying
  // the same voice to all of them.
  const personality = splitTraits(brand?.personality);
  const brandVoice: BrandVoiceBrief = {
    tone: brand?.tone || 'confident and distinctive',
    personality: personality.length ? personality : ['authentic', 'purposeful'],
    vocabulary: brand?.wordsToUse || [],
    constraints: [
      // Words the brand refuses to say, and visual elements its identity
      // refuses to show. Both render as "never use" to the art director.
      ...(brand?.wordsToAvoid || []),
      ...(creativeDna?.avoidedElements || []),
    ],
  };

  // Creative Style mapping
  const styleObj = styleDna?.style;
  const creativeStyle: CreativeStyleBrief = {
    id: styleObj?.id || 'editorial',
    name: styleObj?.name || 'Editorial',
    visualLanguage: styleObj?.visualCharacter ?? [],
    typographyLanguage: declared([
      ['display', styleObj?.typography?.displayPersonality?.join(', ')],
      ['hierarchy', styleObj?.typography?.hierarchy],
      ['tracking', styleObj?.typography?.tracking],
    ]),
    // A style that did not declare its alignment, symmetry or whitespace has
    // NOT declared them — the brief says nothing rather than filling in
    // "alignment: left, symmetry: asymmetric, whitespace: generous", which was
    // a composition supplied to every brand whose chosen style happened to be
    // silent on the matter.
    compositionLanguage: declared([
      ['alignment', styleObj?.layout?.alignment?.join(', ')],
      ['symmetry', styleObj?.layout?.symmetry],
      ['whitespace', styleObj?.layout?.whitespace],
    ]),
    imageTreatment: styleObj?.imagery?.cropping ?? [],
    textureLanguage: Array.isArray(styleObj?.texture)
      ? styleObj.texture
      : styleObj?.texture ? [styleObj.texture] : [],
    colorLanguage: styleObj?.color?.relationships ?? [],
    imperfectionLanguage: styleObj?.imperfection?.allowed ?? [],
  };

  // Asset briefs
  const productAssets: AssetBrief[] = productAssetUrls.map((url, i) => ({
    url,
    kind: 'product',
    label: `Product asset ${i + 1}`,
  }));

  const referenceImages: AssetBrief[] = referenceImageUrls.map((url, i) => ({
    url,
    kind: 'reference',
    label: `Style reference ${i + 1}`,
  }));

  const logo: AssetBrief | undefined = (logoAssetUrl || creativeDna?.logoAssetUrl)
    ? { url: logoAssetUrl || creativeDna!.logoAssetUrl, kind: 'logo', label: 'Brand logo' }
    : undefined;

  // Required claims that MUST be present in copy
  const requiredClaims = [
    ...new Set([
      ...(intent?.requiredClaims || []),
      ...(rawOffer ? [rawOffer] : []),
      ...(event ? [event] : []),
    ].filter(Boolean)),
  ];

  // Visual story summary: locked to chosen concept if provided
  const visualStory = concept?.bigIdea
    ? concept.bigIdea
    : intent?.culturalContext
      ? `${subject} set in the context of ${intent.culturalContext}`
      : `${subject} promotional campaign`;

  return {
    userPrompt,
    goal,
    funnelStage,
    ...(concept && {
      chosenConcept: {
        conceptName: concept.conceptName,
        bigIdea: concept.bigIdea,
        visualMechanism: concept.visualMechanism,
        ...(concept.message && { message: concept.message }),
        ...(concept.visualMetaphor && { visualMetaphor: concept.visualMetaphor }),
      },
    }),
    primaryMessage,
    secondaryMessages,
    subject,
    ...(event && { event }),
    ...(rawOffer && { offer: rawOffer }),
    ...(intent?.venueType && { location: intent.venueType }),
    ...(intent?.audience && { audience: intent.audience }),
    visualStory,
    firstRead,
    attentionHierarchy,
    emotionalTone: brandVoice.tone,
    brandVoice,
    creativeStyle,
    assets: {
      productAssets,
      referenceImages,
      ...(logo && { logo }),
    },
    requiredClaims,
    ...(creativeStrategy && { creativeStrategy }),
  };
}
