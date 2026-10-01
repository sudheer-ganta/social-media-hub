import type { GraphicDesignConcept } from '../types';
import type { CreativeBrief } from '../brand/creative-brief';
import type { CreativeDirection } from '../types';
import type { ResolvedStyleDNA } from '../style-dna/style-dna';
import {
  classifyMechanismOwner,
  isAbstractOccasionOrTheme,
  synthesizePhysicalDominantObject,
  normalizeVisualProofStatement,
  type MechanismLayerOwner,
} from './concept-realizability-gate';

// ---------------------------------------------------------------------------
// Requirement Ownership Model
// ---------------------------------------------------------------------------

/**
 * Every requirement in a CreativeRealizationContract has an explicit owner.
 *
 * IMAGE_GENERATION — Must be realised in the generated image before DDE runs.
 *   The Fidelity Gate evaluates ONLY these requirements.
 *
 * DYNAMIC_DESIGN_ENGINE — Constructed by the DDE (typography, headline, layout,
 *   negative-space placement, logo, etc.). Must NOT cause Fidelity Gate failure.
 *
 * RENDERER — Guaranteed by the rendering subsystem (SVG geometry, rasterization,
 *   canvas containment). Must NOT cause Fidelity Gate failure.
 *
 * FINAL_COMPOSITION — Evaluated by the final critic after the complete creative
 *   is assembled (harmony, contrast, hierarchy). Must NOT cause Fidelity Gate failure.
 */
export type RequirementOwner =
  | 'IMAGE_GENERATION'
  | 'DYNAMIC_DESIGN_ENGINE'
  | 'RENDERER'
  | 'FINAL_COMPOSITION';

export type RequirementHardness = 'HARD' | 'SOFT';

export interface ContractRequirement {
  description: string;
  owner: RequirementOwner;
  hardness: RequirementHardness;
}

// ---------------------------------------------------------------------------
// Contract interface
// ---------------------------------------------------------------------------

export interface CreativeRealizationContract {
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
  spatialRelationship: string;
  typeBehavior: string;
  imageBehavior: string;
  compositionFamily: string;
  artDirectionFamily?: string;
  selectedStyleId?: string;
  occasion?: string;
  campaignIntent?: string;
  communicationIdea?: string;
  visualMechanism?: string;
  visualWorld?: string;
  textImageRelationship?: string;
  copyLoadProfile?: string;
  readingSpaceRequirement?: string;
  styleDirection?: string;
  requiredClaims: string[];
  requiredVisualMechanics: string[];
  prohibitedVisualInterpretations: string[];
  requiredVisualProof?: string[];
  naturalnessRequirements?: string[];
  strictness: 'STRICT' | 'STANDARD';
  attemptId?: number;
  conceptId?: string;
  requestId?: string;
  conceptIntent?: import('../types').ConceptIntent;
  visualRealizationIntent?: import('../types').VisualRealizationIntent;

  /**
   * All structured requirements with explicit ownership.
   * This is the authoritative source used by every downstream subsystem.
   */
  requirements: ContractRequirement[];

  /**
   * Convenience view: IMAGE_GENERATION requirements only.
   * The Fidelity Gate evaluates ONLY these. Computed from requirements.
   */
  imageGenerationRequirements: ContractRequirement[];

  /**
   * Convenience view: DDE/RENDERER/FINAL_COMPOSITION requirements.
   * Passed downstream to their responsible subsystems.
   * The Fidelity Gate MUST NOT evaluate these.
   */
  downstreamRequirements: ContractRequirement[];

  /**
   * @deprecated Use requirements[].hardness === 'HARD' instead.
   * Kept for backward compatibility with existing callers.
   */
  hardRequirements: string[];

  /**
   * @deprecated Use requirements[].hardness === 'SOFT' instead.
   * Kept for backward compatibility with existing callers.
   */
  softPreferences: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Determines whether a spatial relationship description is owned by IMAGE_GENERATION
 * or by the DYNAMIC_DESIGN_ENGINE.
 */
function classifySpatialRelationshipOwner(
  spatialRelationship: string,
  hero: string,
): { imageOwned: string | null; ddeOwned: string | null } {
  const s = spatialRelationship.toLowerCase();

  const ddePatterns = [
    'typography',
    'headline',
    'negative space',
    'quiet zone',
    'text anchor',
    'editorial text',
    'copy anchor',
    'type anchor',
    'type placement',
    'text placement',
    'text hierarchy',
    'brand mark',
    'logo placement',
    'minimal editorial',
  ];

  const imagePatterns = [
    'overlap',
    'cross',
    'shadow',
    'cast',
    'fabric',
    'material',
    'contain',
    'inside',
    'window',
    'mask',
    'subject',
    'model',
    'product',
    'anchors',
    'grounds',
    'ground',
    'hero occupies',
    'photographic hero',
    'floating',
    'letter bounds',
    'letterform',
  ];

  const hasDdeConcern = ddePatterns.some((p) => s.includes(p));
  const hasImageConcern = imagePatterns.some((p) => s.includes(p));

  if (!hasDdeConcern && hasImageConcern) {
    return { imageOwned: spatialRelationship, ddeOwned: null };
  }

  if (hasDdeConcern && !hasImageConcern) {
    return { imageOwned: null, ddeOwned: spatialRelationship };
  }

  if (hasDdeConcern && hasImageConcern) {
    const imageOwned = spatialRelationship
      .replace(/(?:with\s+)?(?:minimal\s+)?(?:editorial\s+)?typography[^,;.]*[,;.]?/gi, '')
      .replace(/(?:and\s+)?(?:quiet\s+)?(?:negative\s+space\s+)?(?:for\s+)?(?:headline|text|copy|brand\s+mark|logo)[^,;.]*[,;.]?/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/^[,;.\s]+|[,;.\s]+$/g, '')
      .trim();

    return {
      imageOwned: imageOwned.length > 8 ? imageOwned : null,
      ddeOwned: spatialRelationship,
    };
  }

  if (hero === 'typography') {
    return { imageOwned: null, ddeOwned: spatialRelationship };
  }

  return { imageOwned: spatialRelationship, ddeOwned: null };
}

/**
 * Normalizes prohibited interpretations based on specific creative mechanisms.
 */
function deriveProhibitedInterpretations(
  mechanism: string,
  hero: string,
  imageRole: string,
  artDirectionFamily?: string
): string[] {
  const prohibited: string[] = [
    'Generic AI 3D extruded lettering with texture on surface',
    'Low-quality CGI digital renders when photography is requested',
    'Generic promotional template cards with arbitrary borders',
  ];

  const mechLower = mechanism.toLowerCase();

  if (mechLower.includes('inside') || mechLower.includes('contained') || mechLower.includes('window')) {
    prohibited.push(
      'Applying texture or materials directly on top of 3D letter surfaces instead of masking/containing image inside letterforms',
      'Placing standard flat background behind standard typography'
    );
  }

  if (mechLower.includes('overlap') || mechLower.includes('cross') || mechLower.includes('shadow')) {
    prohibited.push(
      'Fabric or material isolated strictly in background without intersecting typography',
      'Flat unshadowed layer placement without physical depth cues'
    );
  }

  if (mechLower.includes('ui') || mechLower.includes('interface') || mechLower.includes('screen')) {
    prohibited.push(
      'Arbitrary decorative vector lines that do not represent interactive or HUD elements',
      'Unconnected random geometric borders'
    );
  }

  if (artDirectionFamily === 'EDITORIAL_PHOTOGRAPHY' || artDirectionFamily === 'DOCUMENTARY') {
    prohibited.push(
      'Glossy 3D digital illustration',
      'Artificial vector UI card graphics',
      'Overly polished cartoon or surreal CGI renders'
    );
  }

  return Array.from(new Set(prohibited));
}

/**
 * Derives hard visual mechanics that MUST be structurally evidenced in the image.
 */
function deriveRequiredVisualMechanics(
  concept?: GraphicDesignConcept,
  brief?: CreativeBrief
): string[] {
  const mechanics: string[] = [];

  if (concept?.dominantVisualObject) {
    mechanics.push(`DOMINANT_OBJECT:${concept.dominantVisualObject.trim()}`);
  } else if (brief?.subject) {
    mechanics.push(`DOMINANT_OBJECT:${brief.subject.trim()}`);
  }

  if (concept?.creativeMechanism) {
    mechanics.push(`MECHANISM:${concept.creativeMechanism.trim()}`);
  }

  if (concept?.spatialRelationship) {
    mechanics.push(`SPATIAL_RELATIONSHIP:${concept.spatialRelationship.trim()}`);
  }

  if (concept?.imageRole) {
    mechanics.push(`IMAGE_ROLE:${concept.imageRole}`);
  }

  return mechanics;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface BuildCreativeRealizationContractOptions {
  concept: GraphicDesignConcept;
  brief?: CreativeBrief;
  direction?: CreativeDirection;
  styleDna?: ResolvedStyleDNA;
  strictness?: 'STRICT' | 'STANDARD';
  attemptId?: number;
  conceptId?: string;
  requestId?: string;
}

/**
 * Builds the authoritative, machine-checkable CreativeRealizationContract
 * from Art Director blueprints and canonical creative briefs.
 *
 * Every requirement is tagged with an explicit RequirementOwner so the
 * Fidelity Gate can enforce the ownership boundary structurally.
 */
export function buildCreativeRealizationContract(
  optionsOrConcept: BuildCreativeRealizationContractOptions | GraphicDesignConcept,
  briefArg?: CreativeBrief,
  directionArg?: CreativeDirection,
  styleDnaArg?: any,
  strictnessArg?: 'STRICT' | 'STANDARD'
): CreativeRealizationContract {
  let concept: GraphicDesignConcept | undefined;
  let brief: CreativeBrief | undefined;
  let direction: CreativeDirection | undefined;
  let styleDna: any;
  let strictness: 'STRICT' | 'STANDARD' = 'STANDARD';
  let attemptId: number | undefined;
  let conceptId: string | undefined;
  let requestId: string | undefined;

  if (optionsOrConcept && 'concept' in optionsOrConcept && typeof (optionsOrConcept as any).concept === 'object') {
    concept = (optionsOrConcept as BuildCreativeRealizationContractOptions).concept;
    brief = (optionsOrConcept as BuildCreativeRealizationContractOptions).brief;
    direction = (optionsOrConcept as BuildCreativeRealizationContractOptions).direction;
    styleDna = (optionsOrConcept as BuildCreativeRealizationContractOptions).styleDna;
    strictness = (optionsOrConcept as BuildCreativeRealizationContractOptions).strictness || 'STANDARD';
    attemptId = (optionsOrConcept as BuildCreativeRealizationContractOptions).attemptId;
    conceptId = (optionsOrConcept as BuildCreativeRealizationContractOptions).conceptId || (concept as any)?.id;
    requestId = (optionsOrConcept as BuildCreativeRealizationContractOptions).requestId;
  } else {
    concept = optionsOrConcept as GraphicDesignConcept;
    brief = briefArg;
    direction = directionArg;
    styleDna = styleDnaArg;
    strictness = strictnessArg || 'STANDARD';
    conceptId = (concept as any)?.id;
  }

  const conceptName = concept?.conceptName || brief?.chosenConcept?.conceptName || 'Autonomous Concept';
  const creativeMechanism =
    concept?.creativeMechanism ||
    brief?.chosenConcept?.visualMechanism ||
    concept?.visualIdea ||
    'Full-bleed tactile visual hero';

  // Mechanism Layer Owner
  const mechanismOwner =
    (concept as any)?.mechanismOwner ||
    classifyMechanismOwner(
      creativeMechanism,
      concept?.hero,
      concept?.typeBehavior,
    );

  // Dominant Visual Object: Invariant — Never treat an occasion as a physical object
  let dominantVisualObject =
    concept?.dominantVisualObject ||
    (concept as any)?.visualRealizationIntent?.dominantVisualObject ||
    (brief?.chosenConcept as any)?.dominantVisualObject ||
    (brief?.chosenConcept as any)?.visualRealizationIntent?.dominantVisualObject ||
    (brief?.subject && !isAbstractOccasionOrTheme(brief.subject) ? brief.subject : undefined) ||
    (direction?.subject && !isAbstractOccasionOrTheme(direction.subject) ? direction.subject : undefined) ||
    'Hero Visual Subject';

  if (isAbstractOccasionOrTheme(dominantVisualObject)) {
    dominantVisualObject = synthesizePhysicalDominantObject(
      dominantVisualObject,
      brief?.subject || direction?.subject,
      brief?.brandVoice?.tone
    );
  }

  let occasion =
    (concept as any)?.occasion ||
    brief?.event ||
    (brief as any)?.occasion ||
    (brief as any)?.culturalContext;

  if (!occasion && (brief?.requiredClaims?.length || brief?.userPrompt)) {
    for (const claim of brief?.requiredClaims || []) {
      if (isAbstractOccasionOrTheme(claim)) {
        occasion = claim;
        break;
      }
    }
  }
  const campaignIntent =
    (concept as any)?.campaignIntent ||
    (brief as any)?.topic ||
    (brief as any)?.businessType ||
    brief?.subject ||
    brief?.goal;
  const communicationIdea =
    (concept as any)?.communicationIdea ||
    (concept as any)?.bigIdea ||
    concept?.conceptName;
  const visualMechanism =
    (concept as any)?.visualMechanism ||
    creativeMechanism;
  const visualWorld =
    (concept as any)?.visualWorld ||
    direction?.artDirectionFamily;
  const textImageRelationship =
    (concept as any)?.textImageRelationship ||
    'OVERLAY_INTENTIONAL';
  const copyLoadProfile =
    (concept as any)?.copyLoadProfile ||
    'HEADLINE_ONLY';
  const readingSpaceRequirement =
    (concept as any)?.readingSpaceRequirement ||
    'HIGH';
  const styleDirection =
    (concept as any)?.styleDirection ||
    direction?.artDirectionFamily;

  const hero = concept?.hero || 'image';
  const imageRole = concept?.imageRole || 'full-bleed';
  const spatialRelationship =
    concept?.spatialRelationship ||
    'Image acts as primary spatial ground with typography anchored in quiet negative space';
  const typeBehavior = concept?.typeBehavior || 'Quiet authoritative editorial anchor';
  const imageBehavior = concept?.imageBehavior || 'Full-bleed tactile proof';
  const compositionFamily = String(concept?.compositionFamily || 'asymmetric-editorial');

  const artDirectionFamily = concept?.artDirectionFamily || direction?.artDirectionFamily;
  const selectedStyleId = styleDna?.style?.id || styleDna?.id || direction?.selectedStyle?.id || (direction as any)?.selectedStyleId;

  const requiredClaims = brief?.requiredClaims || [];
  const requiredVisualMechanics = deriveRequiredVisualMechanics(concept, brief);
  const prohibitedVisualInterpretations = deriveProhibitedInterpretations(
    creativeMechanism,
    hero,
    imageRole,
    artDirectionFamily
  );

  // ---------------------------------------------------------------------------
  // Build ownership-tagged requirements
  // ---------------------------------------------------------------------------
  const requirements: ContractRequirement[] = [];

  // 1. Dominant visual object — always IMAGE_GENERATION owned (HARD)
  requirements.push({
    description: `Must prominently contain dominant subject: ${dominantVisualObject}`,
    owner: 'IMAGE_GENERATION',
    hardness: 'HARD',
  });

  // 2. Creative mechanism — layer owner determines requirement destination
  if (mechanismOwner === 'IMAGE' || mechanismOwner === 'HYBRID') {
    requirements.push({
      description: `Must visually realize mechanism: ${creativeMechanism}`,
      owner: 'IMAGE_GENERATION',
      hardness: 'HARD',
    });
  } else if (mechanismOwner === 'DDE') {
    requirements.push({
      description: `DDE discovers and places typographic mechanism: ${creativeMechanism}`,
      owner: 'DYNAMIC_DESIGN_ENGINE',
      hardness: 'HARD',
    });
  } else if (mechanismOwner === 'COPY') {
    requirements.push({
      description: `Copy layer expresses conceptual mechanism: ${creativeMechanism}`,
      owner: 'DYNAMIC_DESIGN_ENGINE',
      hardness: 'HARD',
    });
  }

  // 3. Image role — IMAGE_GENERATION owned (HARD)
  requirements.push({
    description: `Must respect image role: ${imageRole}`,
    owner: 'IMAGE_GENERATION',
    hardness: 'HARD',
  });

  // 4. Spatial relationship — classify ownership based on content
  const { imageOwned: spatialImageOwned, ddeOwned: spatialDdeOwned } =
    classifySpatialRelationshipOwner(spatialRelationship, hero);

  if (spatialImageOwned) {
    requirements.push({
      description: `Must realize image-side spatial relationship: ${spatialImageOwned}`,
      owner: 'IMAGE_GENERATION',
      hardness: 'HARD',
    });
  }

  if (spatialDdeOwned) {
    requirements.push({
      description: `DDE must construct typography/layout: ${spatialDdeOwned}`,
      owner: 'DYNAMIC_DESIGN_ENGINE',
      hardness: 'HARD',
    });
  }

  // 5. Art direction authenticity — IMAGE_GENERATION owned (HARD)
  if (artDirectionFamily === 'EDITORIAL_PHOTOGRAPHY' || artDirectionFamily === 'DOCUMENTARY') {
    requirements.push({
      description: `Must maintain authentic photographic realism matching ${artDirectionFamily}`,
      owner: 'IMAGE_GENERATION',
      hardness: 'HARD',
    });
  }

  // 6. Typography construction — DDE owned
  requirements.push({
    description: `DDE constructs headline, body copy, and typographic hierarchy`,
    owner: 'DYNAMIC_DESIGN_ENGINE',
    hardness: 'HARD',
  });

  // 7. Logo placement — DDE owned
  requirements.push({
    description: `DDE places brand mark in negative space with sufficient clearance`,
    owner: 'DYNAMIC_DESIGN_ENGINE',
    hardness: 'HARD',
  });

  // 8. Final visual harmony — FINAL_COMPOSITION owned
  requirements.push({
    description: `Final critic evaluates overall visual harmony and element hierarchy`,
    owner: 'FINAL_COMPOSITION',
    hardness: 'HARD',
  });

  // 9. Soft preferences — IMAGE_GENERATION soft
  const emotionalTone = concept?.emotionalTone || brief?.emotionalTone;
  const pointOfView = concept?.pointOfView;
  if (emotionalTone) {
    requirements.push({
      description: `Preferred emotional tone: ${emotionalTone}`,
      owner: 'IMAGE_GENERATION',
      hardness: 'SOFT',
    });
  }
  if (pointOfView) {
    requirements.push({
      description: `Preferred point of view: ${pointOfView}`,
      owner: 'IMAGE_GENERATION',
      hardness: 'SOFT',
    });
  }

  // 10. Required visual proof — Normalized observable physical requirements
  const rawVisualProof: string[] = Array.isArray((concept as any)?.requiredVisualProof)
    ? (concept as any).requiredVisualProof
    : [];
  const requiredVisualProof: string[] = [];

  for (const proofItem of rawVisualProof) {
    if (proofItem && typeof proofItem === 'string') {
      const normalized = normalizeVisualProofStatement(
        proofItem,
        brief?.event || direction?.marketingCreative?.eventBadge,
        brief?.subject || direction?.subject
      );
      if (normalized.valid && normalized.normalized) {
        requiredVisualProof.push(normalized.normalized);
        requirements.push({
          description: `Visual proof required: ${normalized.normalized}`,
          owner: 'IMAGE_GENERATION',
          hardness: 'HARD',
        });
      }
    }
  }

  // 11. Observable naturalness requirements — IMAGE_GENERATION hard requirements
  const naturalnessRequirements: string[] = Array.isArray((concept as any)?.naturalnessRequirements)
    ? (concept as any).naturalnessRequirements
    : [];
  for (const req of naturalnessRequirements) {
    if (req && typeof req === 'string') {
      requirements.push({
        description: `Naturalness requirement: ${req.trim()}`,
        owner: 'IMAGE_GENERATION',
        hardness: 'HARD',
      });
    }
  }

  // Derive convenience views
  const imageGenerationRequirements = requirements.filter((r) => r.owner === 'IMAGE_GENERATION');
  const downstreamRequirements = requirements.filter((r) => r.owner !== 'IMAGE_GENERATION');

  const hardRequirements = imageGenerationRequirements
    .filter((r) => r.hardness === 'HARD')
    .map((r) => r.description);

  const softPreferences = imageGenerationRequirements
    .filter((r) => r.hardness === 'SOFT')
    .map((r) => r.description);

  return {
    conceptName,
    occasion,
    campaignIntent,
    communicationIdea,
    creativeMechanism,
    visualMechanism,
    mechanismOwner,
    dominantVisualObject,
    hero,
    imageRole,
    visualWorld,
    spatialRelationship,
    textImageRelationship,
    typeBehavior,
    imageBehavior,
    compositionFamily,
    artDirectionFamily,
    selectedStyleId,
    requiredClaims,
    requiredVisualMechanics,
    prohibitedVisualInterpretations,
    requiredVisualProof: requiredVisualProof.length > 0 ? requiredVisualProof : undefined,
    naturalnessRequirements: naturalnessRequirements.length > 0 ? naturalnessRequirements : undefined,
    copyLoadProfile,
    readingSpaceRequirement,
    styleDirection,
    strictness,
    attemptId,
    conceptId,
    requestId,
    conceptIntent: (concept as any)?.conceptIntent || brief?.chosenConcept?.conceptIntent,
    visualRealizationIntent: (concept as any)?.visualRealizationIntent || brief?.chosenConcept?.visualRealizationIntent,
    requirements,
    imageGenerationRequirements,
    downstreamRequirements,
    hardRequirements,
    softPreferences,
  };
}

/**
 * Asserts that the contract is internally consistent and physically realizable.
 * Fails closed before image prompt creation.
 */
export function assertCreativeRealizationContractConsistent(
  contract: CreativeRealizationContract,
): void {
  if (isAbstractOccasionOrTheme(contract.dominantVisualObject)) {
    throw new Error(
      `CONTRACT_CONSISTENCY_ERROR: Dominant visual object "${contract.dominantVisualObject}" is an abstract occasion/event, not a physical object.`
    );
  }

  if (
    contract.mechanismOwner === 'IMAGE' &&
    (contract.creativeMechanism.toLowerCase().includes('typeset') ||
      contract.creativeMechanism.toLowerCase().includes('typographic scale'))
  ) {
    throw new Error(
      `CONTRACT_CONSISTENCY_ERROR: Typographic mechanism "${contract.creativeMechanism}" cannot be owned solely by IMAGE_GENERATION.`
    );
  }

  const imageGenHardReqs = contract.imageGenerationRequirements.filter((r) => r.hardness === 'HARD');
  if (imageGenHardReqs.length === 0 && contract.imageRole !== 'omitted') {
    throw new Error(
      `CONTRACT_CONSISTENCY_ERROR: Contract has no hard IMAGE_GENERATION requirements for active imageRole "${contract.imageRole}".`
    );
  }
}

export const createCreativeRealizationContract = buildCreativeRealizationContract;
