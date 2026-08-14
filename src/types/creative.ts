/**
 * The browser's view of FlowPost's creative engine — deliberately separate
 * from `server/src/ai/types.ts`, the same way every other AI response shape
 * in this app is. The two meet only at the HTTP boundary in
 * `services/creative.service.ts`.
 */

export type CreativeMode =
  | "EDITORIAL" | "PLAYFUL" | "SURREAL" | "INTERACTIVE" | "HUMOROUS"
  | "MINIMAL" | "CULTURAL" | "STORYTELLING" | "VISUAL_METAPHOR" | "EDUCATIONAL";

/** The medium/technique a creative is executed in — a separate axis from CreativeMode (tone/register). Chosen per concept from its mechanism. */
export type ArtDirectionFamily =
  | "EDITORIAL_PHOTOGRAPHY" | "SURREAL_EDITORIAL" | "INTERACTIVE_GRAPHIC" | "TYPOGRAPHY_LED"
  | "PRODUCT_STUDIO" | "DOCUMENTARY" | "COLLAGE" | "HANDCRAFTED" | "CINEMATIC" | "MINIMAL_ART"
  | "PLAYFUL_GRAPHIC" | "CULTURAL_EDITORIAL" | "INFORMATIONAL" | "ILLUSTRATIVE";

export type CopyTreatment = "none" | "headline" | "headline_support" | "interactive" | "editorial_punchline";

/** Whatever a headline + visual still leaves out of a FINISHED social creative — brand positioning, location/practical detail, logo handling. Optional and additive; absent when the idea doesn't need it. */
export interface MarketingCreative {
  brandMessage?: string;
  secondaryInfo?: string[];
  logoTreatment?: string;
  requiredElements?: string[];
}

/** Where things sit and in what order — the graphic-design layer over an art-directed image. Every field optional, derived per concept. */
export interface LayoutDirection {
  layoutType?: string;
  textHierarchy?: string[];
  headlinePlacement?: string;
  supportingCopyPlacement?: string;
  logoPlacement?: string;
  brandTreatment?: string;
  secondaryInformation?: string;
  ctaPlacement?: string;
  productPlacement?: string;
  foregroundElements?: string;
  backgroundElements?: string;
  textureDirection?: string;
  typographyDirection?: string;
  visualDensity?: string;
  safeAreas?: string;
}

export interface CreativeDirection {
  concept: string;
  visualStory: string;
  subject: string;
  environment: string;
  composition: string;
  lighting: string;
  mood: string;
  palette: string[];
  brandConstraints: string[];
  productTreatment: string;
  background: string;
  negativeVisualConstraints: string[];
  aspectRatio: string;
  platform: string;
  mode: CreativeMode;
  artDirectionFamily: ArtDirectionFamily;
  copyTreatment: CopyTreatment;
  headline: string;
  supportingLine: string;
  cta: string;
  interactionInstructions: string;
  marketingCreative?: MarketingCreative;
  layoutDirection?: LayoutDirection;
}

/**
 * One advertising idea — the Creative Director's output, before any art
 * direction or image generation. Not every field applies to every concept.
 */
export interface CreativeConcept {
  conceptName: string;
  bigIdea: string;
  visualMechanism: string;
  humanInsight?: string;
  visualMetaphor?: string;
  interaction?: string;
  message?: string;
  productRole?: string;
  brandConnection?: string;
  whyItWouldStopTheScroll?: string;
}

export interface CreativeConceptScores {
  conceptStrength: number;
  brandSpecificity: number;
  productRelevance: number;
  visualOriginality: number;
  scrollStoppingPotential: number;
  messageClarity: number;
  socialInteractionPotential: number;
  templateRisk: number;
}

export interface ScoredCreativeConcept extends CreativeConcept {
  mode: CreativeMode;
  artDirectionFamily: ArtDirectionFamily;
  scores: CreativeConceptScores;
}

/** How much weight the extracted style should carry — a single reference always caps at 'medium'. */
export type ReferenceStyleInfluence = "low" | "medium" | "high";

/**
 * The structured design system the server's renderer executes — the browser
 * only stores and echoes this back with a saved profile, never interprets it.
 * Mirrors server/src/ai/types.ts; the axis unions live server-side.
 */
export interface ReferenceDesignRecipe {
  photographyStyle: string;
  illustrationStyle: string;
  headlineCharacter: string;
  supportingTypography: string;
  compositionBehaviour: string;
  textHierarchy: string;
  typographyFamily: string;
  colorPalette: string[];
  layoutBehaviour: string;
  logoTreatment: string;
  spacingBehaviour: string;
  texture: string;
  graphicElements: string[];
  footerStyle: string;
  borderStyle: string;
  shapeLanguage: string;
  visualDensity: string;
  imperfectionLevel: string;
  imageTreatment: string;
}

/**
 * "Show FlowPost what you like" — the analysed visual LANGUAGE of a member's
 * uploaded reference images, never their content. Mirrors the server's exact
 * shape (server/src/ai/types.ts).
 */
export interface ReferenceStyleProfile {
  analysed: boolean;
  referenceCount: number;
  visualLanguage: string;
  compositionPatterns: string[];
  typographyCharacter: string;
  colorRelationships: string;
  textureAndMaterial: string;
  lightingAndMood: string;
  photographicOrIllustrative: string;
  visualDensity: string;
  brandTreatment: string;
  creativeMechanisms: string[];
  imperfectionLevel: string;
  interactionPatterns: string;
  doNotCopy: string[];
  dominantDirection: string;
  influence: ReferenceStyleInfluence;
  /** Absent on profiles saved before recipes existed — the server derives a fallback then. */
  designRecipe?: ReferenceDesignRecipe;
}

/** Back-fills a saved row that predates a field added to ReferenceStyleProfile — mirrors DEFAULT_CREATIVE_DNA's job. */
export const DEFAULT_REFERENCE_STYLE_PROFILE: ReferenceStyleProfile = {
  analysed: false,
  referenceCount: 0,
  visualLanguage: "",
  compositionPatterns: [],
  typographyCharacter: "",
  colorRelationships: "",
  textureAndMaterial: "",
  lightingAndMood: "",
  photographicOrIllustrative: "",
  visualDensity: "",
  brandTreatment: "",
  creativeMechanisms: [],
  imperfectionLevel: "",
  interactionPatterns: "",
  doNotCopy: [],
  dominantDirection: "",
  influence: "low",
};

/** A saved, reusable "Creative Style Profile" — the row wrapper around one ReferenceStyleProfile, same shape as CreativeDnaProfile wraps CreativeDna. */
export interface SavedReferenceStyleProfile {
  id: string;
  name: string;
  is_default: boolean;
  profile: ReferenceStyleProfile;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SavedReferenceStyleProfileInsert {
  name: string;
  profile: ReferenceStyleProfile;
  is_default?: boolean;
}

export interface SavedReferenceStyleProfileUpdate {
  name?: string;
  profile?: ReferenceStyleProfile;
  is_default?: boolean;
}

export interface DiscoveredConcepts {
  concepts: ScoredCreativeConcept[];
  proposedCount: number;
  meta: { provider: string; model: string; durationMs: number };
  /** Present whenever references were analysed (fresh upload or a reused saved profile). */
  referenceStyle?: ReferenceStyleProfile;
}

export interface UnderstoodCreative {
  direction: CreativeDirection;
  concepts: ScoredCreativeConcept[];
  /** The plain-language "FlowPost understood" summary — never raw JSON. */
  summary: string;
  meta: { provider: string; model: string; durationMs: number };
}

export type GeneratedAssetStatus = "PENDING" | "COMPLETED" | "FAILED";
export type GeneratedAssetSource = "AI_GENERATED" | "AI_REFINED";

export interface GeneratedAsset {
  id: string;
  userId: string;
  contextType: string;
  brandId: string | null;
  prompt: string;
  creativeBrief: CreativeDirection;
  sourceAssetUrls: string[];
  /** A Cloudinary URL in the same account/pipeline as every uploaded image — nothing FlowPost-specific to it. */
  imageUrl: string | null;
  cloudinaryPublicId: string | null;
  width: number | null;
  height: number | null;
  format: string | null;
  provider: string;
  model: string;
  source: GeneratedAssetSource;
  status: GeneratedAssetStatus;
  campaignId: string | null;
  parentAssetId: string | null;
  createdAt: string;
}
