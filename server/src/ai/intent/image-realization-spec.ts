import type { GraphicDesignConcept } from '../types';
import type { CreativeBrief } from '../brand/creative-brief';
import type { CreativeDirection, ArtDirectionFamily } from '../types';
import type { ResolvedStyleDNA } from '../style-dna/style-dna';
import { renderStyleDnaInstructions } from '../style-dna/style-dna';
import {
  classifyMechanismOwner,
  isAbstractOccasionOrTheme,
  synthesizePhysicalDominantObject,
  type MechanismLayerOwner,
} from './concept-realizability-gate';

// ---------------------------------------------------------------------------
// 1. Types & Enums
// ---------------------------------------------------------------------------

export type CopyLoadProfile =
  | 'PRIMARY_ONLY'
  | 'PRIMARY_PLUS_SUPPORT'
  | 'PRIMARY_SUPPORT_CTA'
  | 'MULTI_TEXT';

export type ReadingSpaceRequirement =
  | 'MINIMAL'
  | 'MODERATE'
  | 'LARGE'
  | 'MULTI_REGION';

export type TextImageRelationship =
  | 'SEPARATED'
  | 'OVERLAY_INTENTIONAL'
  | 'MATERIAL_INTERACTION'
  | 'BOUNDARY_INTERACTION'
  | 'EMBEDDED'
  | 'CONTAINED'
  | 'JUXTAPOSED';

export type TextRelationshipMode =
  | 'IMAGE_DIEGETIC_TEXT'
  | 'FLOWPOST_MARKETING_TEXT'
  | 'NONE';

export type ReferenceAssetCategory =
  | 'PRODUCT_IDENTITY'
  | 'PERSON_IDENTITY'
  | 'OBJECT_IDENTITY'
  | 'ENVIRONMENT_REFERENCE'
  | 'STYLE_REFERENCE'
  | 'COMPOSITION_REFERENCE';

export interface ClassifiedReferenceAsset {
  type: ReferenceAssetCategory;
  url: string;
  label?: string;
}

export interface ImageRealizationSpec {
  conceptId?: string;
  conceptName: string;
  creativeMechanism: string;
  mechanismOwner: MechanismLayerOwner;
  dominantVisualObject: string;
  hero: 'typography' | 'image' | 'graphic-element' | 'whitespace' | 'texture';
  imageRole:
    | 'hero'
    | 'small-tactile-object'
    | 'full-bleed'
    | 'offset-crop'
    | 'floating-fragment'
    | 'subordinate-texture'
    | 'material-ground'
    | 'contained-image'
    | 'typography-integrated'
    | 'omitted'
    | string;
  imageBehavior: string;
  artDirectionFamily?: ArtDirectionFamily | string;
  styleId?: string;
  styleCharacteristics?: string;
  physicalMechanism: string;
  visualRelationship: string;
  referenceAssetRequirements: ClassifiedReferenceAsset[];
  requiredVisualElements: string[];
  prohibitedVisualInterpretations: string[];
  textRelationshipMode: TextRelationshipMode;
  diegeticTextGuidance?: string;
  copyLoadProfile: CopyLoadProfile;
  readingSpaceRequirement: ReadingSpaceRequirement;
  textImageRelationship: TextImageRelationship;
  compositionAffordanceRequirement: string;
  lightingAtmosphereIntent?: string;
  attemptId?: number;
  requestId?: string;
}

// ---------------------------------------------------------------------------
// 2. Derivation Helpers
// ---------------------------------------------------------------------------

export function deriveCopyLoadProfile(copyCount: number, hasSupport: boolean, hasCta: boolean, hasBadge: boolean): CopyLoadProfile {
  if (copyCount >= 4 || (hasSupport && hasCta && hasBadge)) {
    return 'MULTI_TEXT';
  }
  if (copyCount === 3 || (hasSupport && hasCta)) {
    return 'PRIMARY_SUPPORT_CTA';
  }
  if (copyCount === 2 || (hasSupport && !hasCta)) {
    return 'PRIMARY_PLUS_SUPPORT';
  }
  return 'PRIMARY_ONLY';
}

export function deriveReadingSpaceRequirement(
  copyLoadProfile: CopyLoadProfile,
  textImageRelationship: TextImageRelationship
): ReadingSpaceRequirement {
  if (textImageRelationship === 'SEPARATED') {
    return 'MINIMAL';
  }
  switch (copyLoadProfile) {
    case 'PRIMARY_ONLY':
      return 'MINIMAL';
    case 'PRIMARY_PLUS_SUPPORT':
      return 'MODERATE';
    case 'PRIMARY_SUPPORT_CTA':
      return 'LARGE';
    case 'MULTI_TEXT':
      return 'MULTI_REGION';
    default:
      return 'MODERATE';
  }
}

export function deriveTextImageRelationship(
  mechanism: string,
  spatialRelationship: string,
  hero: string,
  imageRole: string
): TextImageRelationship {
  const m = `${mechanism} ${spatialRelationship}`.toLowerCase();
  if (m.includes('inside') || m.includes('contained') || m.includes('mask') || imageRole === 'contained-image') {
    return 'CONTAINED';
  }
  if (m.includes('overlap') || m.includes('cross') || m.includes('fabric') || m.includes('material')) {
    return 'MATERIAL_INTERACTION';
  }
  if (m.includes('split') || m.includes('straddle') || m.includes('boundary') || m.includes('threshold')) {
    return 'BOUNDARY_INTERACTION';
  }
  if (m.includes('embed') || m.includes('diegetic') || m.includes('engraved') || m.includes('printed on')) {
    return 'EMBEDDED';
  }
  if (m.includes('juxtaposition') || m.includes('contrast') || m.includes('dual')) {
    return 'JUXTAPOSED';
  }
  if (hero === 'typography' || imageRole === 'small-tactile-object' || imageRole === 'offset-crop') {
    return 'SEPARATED';
  }
  return 'OVERLAY_INTENTIONAL';
}

export function deriveCompositionAffordanceRequirement(
  profile: CopyLoadProfile,
  readingSpace: ReadingSpaceRequirement,
  relationship: TextImageRelationship
): string {
  if (relationship === 'SEPARATED') {
    return 'Compositional balance: maintain organic framing that allows distinct visual breathing room beside the focal subject.';
  }
  if (relationship === 'CONTAINED') {
    return 'Compositional framing: the visual subject or scene must be structured with crisp, identifiable boundaries or a clear focal aperture.';
  }
  if (relationship === 'MATERIAL_INTERACTION') {
    return 'Physical depth: incorporate tangible foreground and midground depth planes with natural cast shadows.';
  }

  switch (readingSpace) {
    case 'MINIMAL':
      return 'Compositional balance: provide at least one uncluttered, visually quiet zone with even texture for graphic breathing room.';
    case 'MODERATE':
      return 'Compositional balance: provide an open, low-frequency, calm region in the scene capable of carrying a prominent headline and short support text without colliding with high-contrast focal points.';
    case 'LARGE':
      return 'Compositional balance: structure the scene with generous negative space and a clean, restful area for primary graphic messaging, keeping dense subject details thoughtfully positioned.';
    case 'MULTI_REGION':
      return 'Compositional balance: maintain clean peripheral and background zones to accommodate structured secondary information while keeping the hero subject distinct.';
    default:
      return 'Compositional balance: provide natural breathing room and balanced visual weight across the frame.';
  }
}

export function derivePhysicalMechanism(
  mechanism: string,
  visualStory: string,
  subject: string,
  artDirectionFamily?: string
): string {
  const m = mechanism.toLowerCase();
  if (m.includes('shadow') && m.includes('light')) {
    return 'Natural directional light casting architectural and geometric shadows that carve out distinct tonal zones across physical textures.';
  }
  if (m.includes('fabric') || m.includes('drape') || m.includes('cloth')) {
    return 'Tactile textile folds with authentic weight and gravity, casting natural ambient occlusion and soft contact shadows on adjacent surfaces.';
  }
  if (m.includes('glass') || m.includes('prism') || m.includes('refraction')) {
    return 'Physical optical glass refracting ambient light with genuine caustics, dispersion, and authentic specular highlights.';
  }
  if (m.includes('liquid') || m.includes('pour') || m.includes('splash')) {
    return 'Dynamic fluid motion frozen in high-speed clarity with surface tension, glistening droplets, and realistic ambient translucency.';
  }
  if (m.includes('macro') || m.includes('craft') || m.includes('artisan') || artDirectionFamily === 'HANDCRAFTED') {
    return 'Extreme tactile macro detail revealing authentic material grain, natural micro-textures, and realistic shallow depth of field.';
  }
  if (m.includes('documentary') || artDirectionFamily === 'DOCUMENTARY') {
    return 'Candid, unposed environmental perspective with authentic optical framing and believable ambient atmosphere.';
  }
  return mechanism || visualStory || subject || 'Authentic physical scene with clear focal hierarchy and realistic material properties.';
}

export function detectTextRelationshipMode(
  mechanism: string,
  subject: string,
  visualStory: string
): { mode: TextRelationshipMode; guidance?: string } {
  const text = `${mechanism} ${subject} ${visualStory}`.toLowerCase();
  const diegeticTriggers = [
    'storefront', 'signage', 'packaging label', 'coffee cup label', 'menu board',
    'newspaper', 'poster in scene', 'engraved text', 'stamp on paper', 'neon sign'
  ];

  const matchedTrigger = diegeticTriggers.find((trigger) => text.includes(trigger));
  if (matchedTrigger) {
    return {
      mode: 'IMAGE_DIEGETIC_TEXT',
      guidance: `Environmental in-scene text on ${matchedTrigger} is permitted if natural to the physical setting. Marketing overlay headlines will be rendered separately by FlowPost.`,
    };
  }

  return {
    mode: 'FLOWPOST_MARKETING_TEXT',
    guidance: 'All marketing copy, headlines, logos, and promotional typography will be typeset by FlowPost over the image. The image itself must be clean and wordless.',
  };
}

// ---------------------------------------------------------------------------
// 3. Spec Builder
// ---------------------------------------------------------------------------

export interface BuildImageRealizationSpecOptions {
  concept?: GraphicDesignConcept;
  brief?: CreativeBrief;
  direction?: CreativeDirection;
  styleDna?: ResolvedStyleDNA;
  copySummary?: {
    copyCount: number;
    hasHeadline: boolean;
    hasSupport: boolean;
    hasCta: boolean;
    hasBadge: boolean;
  };
  referenceUrls?: string[];
  styleReferenceUrls?: string[];
  attemptId?: number;
  requestId?: string;
}

export function buildImageRealizationSpec(options: BuildImageRealizationSpecOptions): ImageRealizationSpec {
  const { concept, brief, direction, styleDna, copySummary, referenceUrls = [], styleReferenceUrls = [], attemptId = 0, requestId } = options;

  const conceptName = concept?.conceptName || brief?.chosenConcept?.conceptName || direction?.concept || 'Creative Scene';
  const creativeMechanism = concept?.creativeMechanism || brief?.chosenConcept?.visualMechanism || direction?.visualStory || 'Tactile photographic proof';
  
  // Mechanism Layer Owner
  const mechanismOwner = classifyMechanismOwner(
    creativeMechanism,
    concept?.hero,
    concept?.typeBehavior,
  );

  // Dominant Visual Object (Invariant: Never treat an occasion as a physical object)
  let rawDominant = concept?.dominantVisualObject || brief?.subject || direction?.subject || 'Focal Subject';
  if (isAbstractOccasionOrTheme(rawDominant)) {
    rawDominant = synthesizePhysicalDominantObject(
      rawDominant,
      brief?.subject || direction?.subject,
      brief?.brandVoice?.tone
    );
  }
  const dominantVisualObject = rawDominant;

  const hero = concept?.hero || 'image';
  const imageRole = concept?.imageRole || 'full-bleed';
  const imageBehavior = concept?.imageBehavior || (imageRole === 'small-tactile-object' ? 'Isolated tactile asset' : 'Full-bleed atmospheric ground');
  const artDirectionFamily = concept?.artDirectionFamily || direction?.artDirectionFamily || 'EDITORIAL_PHOTOGRAPHY';
  const visualRelationship = concept?.spatialRelationship || direction?.composition || 'Focal subject positioned with natural visual balance';

  // Copy Profile & Affordance
  const copyCount = copySummary?.copyCount ?? (direction?.headline ? (direction.supportingLine ? 2 : 1) : 1);
  const hasSupport = copySummary?.hasSupport ?? Boolean(direction?.supportingLine || direction?.marketingCreative?.brandMessage);
  const hasCta = copySummary?.hasCta ?? Boolean(direction?.cta);
  const hasBadge = copySummary?.hasBadge ?? Boolean(direction?.marketingCreative?.eventBadge || direction?.marketingCreative?.offerText);

  const copyLoadProfile = deriveCopyLoadProfile(copyCount, hasSupport, hasCta, hasBadge);
  const textImageRelationship = deriveTextImageRelationship(creativeMechanism, visualRelationship, hero, imageRole);
  const readingSpaceRequirement = deriveReadingSpaceRequirement(copyLoadProfile, textImageRelationship);
  const compositionAffordanceRequirement = deriveCompositionAffordanceRequirement(copyLoadProfile, readingSpaceRequirement, textImageRelationship);

  const physicalMechanism = derivePhysicalMechanism(
    creativeMechanism,
    direction?.visualStory || brief?.visualStory || '',
    dominantVisualObject,
    artDirectionFamily
  );

  const { mode: textRelationshipMode, guidance: diegeticTextGuidance } = detectTextRelationshipMode(
    creativeMechanism,
    dominantVisualObject,
    direction?.visualStory || ''
  );

  // References classification
  const referenceAssetRequirements: ClassifiedReferenceAsset[] = [
    ...referenceUrls.map((url, i) => ({
      type: 'PRODUCT_IDENTITY' as const,
      url,
      label: `Product asset ${i + 1}`,
    })),
    ...styleReferenceUrls.map((url, i) => ({
      type: 'STYLE_REFERENCE' as const,
      url,
      label: `Style reference ${i + 1}`,
    })),
  ];

  // Required Visual Elements
  const requiredVisualElements: string[] = [
    dominantVisualObject,
    ...(brief?.requiredClaims || []).slice(0, 3),
  ].filter((el): el is string => Boolean(el && el.trim().length > 0));

  // Prohibitions
  const prohibitedVisualInterpretations: string[] = [
    'Generic AI 3D extruded lettering with texture on surface',
    'Low-quality CGI digital renders when photography is requested',
    'Miniature picture frames hanging on empty walls, posters on concrete, flyers on tables, or blank room mockups',
    'Dark gloomy voids, pitch-black backgrounds, murky underexposed shadows, or heavy dark vignetting unless dark scene is explicitly requested',
  ];

  if (textRelationshipMode === 'FLOWPOST_MARKETING_TEXT') {
    prohibitedVisualInterpretations.push('AI-generated overlay marketing headlines, text boxes, buttons, watermarks, or mock typography');
  }

  // Lighting & Atmosphere
  let lightingAtmosphereIntent: string | undefined;
  if (direction?.lighting) {
    lightingAtmosphereIntent = direction.lighting;
  } else if (styleDna?.style?.lighting) {
    lightingAtmosphereIntent = styleDna.style.lighting.atmosphere.join(', ');
  }

  return {
    conceptId: (concept as any)?.id || (concept as any)?.conceptId,
    conceptName,
    creativeMechanism,
    mechanismOwner,
    dominantVisualObject,
    hero,
    imageRole,
    imageBehavior,
    artDirectionFamily,
    styleId: styleDna?.style?.id,
    styleCharacteristics: styleDna?.style?.description,
    physicalMechanism,
    visualRelationship,
    referenceAssetRequirements,
    requiredVisualElements,
    prohibitedVisualInterpretations,
    textRelationshipMode,
    diegeticTextGuidance,
    copyLoadProfile,
    readingSpaceRequirement,
    textImageRelationship,
    compositionAffordanceRequirement,
    lightingAtmosphereIntent,
    attemptId,
    requestId,
  };
}

// ---------------------------------------------------------------------------
// 4. Prompt Compiler
// ---------------------------------------------------------------------------

export function compileImagePromptFromSpec(
  spec: ImageRealizationSpec,
  styleDna?: ResolvedStyleDNA,
  direction?: CreativeDirection
): string {
  // 1. WHAT & WHY (Core Visual Scene & Mechanism)
  const coreParts: string[] = [
    `DOMINANT SUBJECT: ${spec.dominantVisualObject}`,
    spec.mechanismOwner === 'DDE'
      ? `VISUAL GROUNDING: Create an evocative, high-craft physical visual scene that serves as the rich photographic world for the campaign idea ("${spec.conceptName}").`
      : `CREATIVE MECHANISM: ${spec.creativeMechanism}`,
    `PHYSICAL REALIZATION: ${spec.physicalMechanism}`,
    `IMAGE ROLE: ${spec.imageRole} (${spec.imageBehavior})`,
  ];

  if (direction?.visualStory && direction.visualStory !== spec.creativeMechanism) {
    coreParts.push(`SCENE STORY: ${direction.visualStory}`);
  }
  if (direction?.environment) {
    coreParts.push(`ENVIRONMENT: ${direction.environment}`);
  }

  // 2. COMPOSITION AFFORDANCE (Semantic reading space & calmness)
  const affordanceSection = `COMPOSITION AFFORDANCE & SPATIAL INTENT:
${spec.compositionAffordanceRequirement}
Spatial relationship intent: ${spec.visualRelationship}.
Ensure the main visual subject is decisively framed with natural visual rhythm.`;

  // 3. TEXT & TYPOGRAPHY OWNERSHIP
  const textOwnershipSection = spec.textRelationshipMode === 'IMAGE_DIEGETIC_TEXT'
    ? `TYPOGRAPHY & TEXT RULES: ${spec.diegeticTextGuidance || 'Environmental in-scene text only.'} Do NOT add marketing headlines, slogan overlays, or CTA buttons.`
    : `TYPOGRAPHY & TEXT RULES: Absolutely wordless and clean — NO overlay text, NO lettering, NO numerals, NO typography, NO logos, NO watermark in the image. Marketing typography will be typeset by FlowPost over the image.`;

  // 4. NATURALNESS & PHYSICAL QUALITY DIRECTIVES
  const naturalnessDirectives = [
    'NATURAL CRAFT & PHYSICAL PLAUSIBILITY: Ground the scene in authentic physical reality with tangible material surfaces, believable optical depth of field, and natural light-surface interaction.',
    'AUTHENTIC MATERIALS: Depict genuine physical textures with realistic shadows and believable material properties.',
    'NO SYNTHETIC AI CLICHES: Strictly avoid generic AI aesthetics, excessive synthetic glow, hyper-polished plastic surfaces, fake lens flare, and floating 3D vector objects.',
    'AUTHENTIC PERSPECTIVE: The visual MUST BE the direct, expansive, immersive subject or destination itself — never a miniature frame on a wall, mockup poster, or flyer on a table.',
  ];

  // Lighting logic: Respect atmospheric/dark/moody requests if explicitly present in style or direction
  const isExplicitlyDarkOrMoody =
    Boolean(spec.lightingAtmosphereIntent && /dark|night|moody|shadow|dusk|evening|noir/i.test(spec.lightingAtmosphereIntent)) ||
    Boolean(direction?.lighting && /dark|night|moody|shadow|dusk|evening|noir/i.test(direction.lighting)) ||
    Boolean(styleDna?.style?.lighting?.atmosphere?.some((a) => /dark|night|moody|noir/i.test(a)));

  if (isExplicitlyDarkOrMoody) {
    naturalnessDirectives.push(
      `LIGHTING DIRECTION: ${direction?.lighting || spec.lightingAtmosphereIntent || 'Atmospheric lighting with rich, controlled contrast and authentic shadows.'}`
    );
  } else if (direction?.lighting || spec.lightingAtmosphereIntent) {
    naturalnessDirectives.push(
      `LIGHTING DIRECTION: ${direction?.lighting || spec.lightingAtmosphereIntent}`
    );
  } else {
    naturalnessDirectives.push(
      'LIGHTING DIRECTION: Ensure clean, balanced lighting with natural highlights and open, readable tonal separation.'
    );
  }

  // 5. STYLE DNA DIRECTIVES
  const styleInstructions = styleDna ? renderStyleDnaInstructions(styleDna) : '';

  // Assemble full prompt
  const sections = [
    coreParts.join('. '),
    affordanceSection,
    naturalnessDirectives.join(' '),
    textOwnershipSection,
    styleInstructions,
  ].filter((s): s is string => Boolean(s && s.trim().length > 0));

  return sections.join('\n\n');
}
