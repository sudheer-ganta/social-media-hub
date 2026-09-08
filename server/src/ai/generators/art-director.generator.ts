import { buildArtDirectorPrompt } from '../prompts/art-director.prompt';
import { redesignDivergenceInstruction } from '../strategy/concept-similarity';
import type { AiTextProvider } from '../providers';
import type { CreativeBrief, GraphicDesignConcept } from '../brand/creative-brief';
import type { CopyPlan, CopyRole, CreativeStrategy } from '../types';

/**
 * Turns a CreativeStrategy into a GraphicDesignConcept.
 *
 * The single most important property of this file is what it does NOT do.
 * The previous version filled every unanswered field with a house default:
 *
 *   heroPlacement      -> 'Left-edge anchored with oversized condensed letterforms'
 *   anchor             -> 'left-edge'
 *   dominantRegion     -> 'left-major'
 *   headlinePlacement  -> 'Upper-left anchored display letterforms'
 *   visualPlacement    -> 'Right-offset tactile placement'
 *   negativeSpaceRegion-> 'upper-right'
 *   typographyScale    -> 'Headline fontScale ~0.16 vs supporting copy ~0.024'
 *
 * Read together, those defaults ARE "big headline on the left, image on the
 * right, small copy, logo in the corner" — the exact structure every creative
 * collapsed into. Any field the model left unanswered was silently answered by
 * a template, and it was answered identically for every brand, every occasion
 * and every idea.
 *
 * So: an undecided field stays undefined. Downstream stages are written to
 * compose from the idea when a placement is absent, which is the only way a
 * blueprint can express something this file's authors never anticipated.
 */

export interface GenerateGraphicDesignConceptOptions {
  provider: AiTextProvider;
  brief: CreativeBrief;
  /** The idea layer this blueprint executes. */
  strategy?: CreativeStrategy;
  redesignFeedback?: string;
  previousConcept?: GraphicDesignConcept;
}

function asString(val: unknown, max = 300): string {
  return typeof val === 'string' ? val.trim().slice(0, max) : '';
}

/** Present-or-absent. Never a fallback — see the file comment. */
function optional(val: unknown, max = 300): string | undefined {
  const value = asString(val, max);
  return value.length > 0 && value.toLowerCase() !== 'none decided' ? value : undefined;
}

function asStringArray(val: unknown, maxItems = 6, max = 150): string[] {
  if (!Array.isArray(val)) return [];
  return [
    ...new Set(val.map((item) => asString(item, max)).filter((item): item is string => item.length > 0)),
  ].slice(0, maxItems);
}

const HERO_TYPES = ['typography', 'image', 'graphic-element', 'whitespace', 'texture'] as const;
const IMAGE_ROLES = [
  'hero',
  'small-tactile-object',
  'full-bleed',
  'offset-crop',
  'floating-fragment',
  'subordinate-texture',
  'omitted',
] as const;
const COPY_ROLES: CopyRole[] = ['HEADLINE', 'OFFER', 'EVENT_BADGE', 'SUPPORT', 'BRAND_MESSAGE', 'CTA', 'DETAIL'];

/**
 * Reads the art director's copy plan.
 *
 * Absent or empty means "this stage did not decide", NOT "include everything":
 * an undefined plan leaves the copy stage's own judgement in place, whereas a
 * default plan listing every role would reintroduce the designed-information-
 * card look this architecture removes.
 */
export function readCopyPlan(raw: unknown): CopyPlan | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as { requiredRoles?: unknown; maxTextElements?: unknown; rationale?: unknown };
  const requiredRoles = (Array.isArray(value.requiredRoles) ? value.requiredRoles : [])
    .map((role) => asString(role, 20).toUpperCase())
    .filter((role): role is CopyRole => (COPY_ROLES as string[]).includes(role));
  if (requiredRoles.length === 0) return undefined;

  const declared = typeof value.maxTextElements === 'number' ? Math.round(value.maxTextElements) : requiredRoles.length;
  return {
    requiredRoles: [...new Set(requiredRoles)],
    // A ceiling below the roles the plan itself names is incoherent; a ceiling
    // far above them is the "fill the space" instinct returning by the back
    // door, so the plan can never authorise more elements than roles.
    maxTextElements: Math.max(1, Math.min(requiredRoles.length, Number.isFinite(declared) ? declared : requiredRoles.length)),
    rationale: asString(value.rationale, 300),
  };
}

export async function generateGraphicDesignConcept(
  options: GenerateGraphicDesignConceptOptions,
): Promise<GraphicDesignConcept> {
  const { provider, brief, strategy, redesignFeedback, previousConcept } = options;
  const startedAt = Date.now();

  const built = buildArtDirectorPrompt({
    brief,
    strategy,
    redesignFeedback,
    previousConcept,
    ...(previousConcept && { divergenceInstruction: redesignDivergenceInstruction(previousConcept) }),
  });

  const raw = (await provider.generateJson({
    systemInstruction: built.systemInstruction,
    prompt: built.prompt,
    responseSchema: built.responseSchema,
    temperature: built.temperature,
  })) as Record<string, unknown>;

  if (!raw || typeof raw !== 'object') {
    throw new Error('The art director could not produce a valid graphic design concept.');
  }

  const heroRaw = asString(raw.hero);
  // 'typography' is the residual answer only because it is the one hero that
  // needs no material to exist — it is not a house style, and it decides
  // nothing about placement.
  const hero = (HERO_TYPES as readonly string[]).includes(heroRaw)
    ? (heroRaw as GraphicDesignConcept['hero'])
    : 'typography';

  const imageRoleRaw = asString(raw.imageRole);
  // With no answer and no supplied asset, the honest reading is that this idea
  // did not ask for a picture. The old code answered 'hero' here, which is why
  // an image appeared in creatives whose idea never wanted one.
  const imageRole = (IMAGE_ROLES as readonly string[]).includes(imageRoleRaw)
    ? (imageRoleRaw as GraphicDesignConcept['imageRole'])
    : brief.assets.productAssets.length > 0
      ? 'small-tactile-object'
      : 'omitted';

  const conceptName = (redesignFeedback || previousConcept)
    ? (asString(raw.conceptName, 100) || `${brief.subject} Artwork`)
    : (brief.chosenConcept?.conceptName || asString(raw.conceptName, 100) || `${brief.subject} Artwork`);

  const intentionalRotation = Array.isArray(raw.intentionalRotation)
    ? (raw.intentionalRotation as Array<{ target?: unknown; degrees?: unknown }>)
        .map((r) => ({
          target: asString(r?.target, 60),
          degrees: typeof r?.degrees === 'number' && Number.isFinite(r.degrees) ? r.degrees : 0,
        }))
        .filter((r) => Boolean(r.target))
    : undefined;

  // Everything the strategy forbade travels into the blueprint's own omission
  // list, so the composition stage reads one list rather than reaching back
  // through the strategy for it.
  const elementsToOmit = [
    ...new Set([
      ...asStringArray(raw.elementsToOmit, 8),
      ...(strategy?.prohibitedVisualCliches ?? []),
      ...(strategy?.domainContext?.visualClichesToAvoid ?? []),
    ]),
  ].slice(0, 12);

  const concept: GraphicDesignConcept = {
    conceptName,
    visualIdea: asString(raw.visualIdea, 500) || strategy?.communicationIdea || brief.visualStory,
    ...(optional(raw.pointOfView, 200) && { pointOfView: optional(raw.pointOfView, 200) }),
    ...(optional(raw.emotionalTone, 200) && { emotionalTone: optional(raw.emotionalTone, 200) }),

    // ─── The idea. These, not the grammar below, are the blueprint. ────────
    ...((optional(raw.creativeMechanism, 240) || strategy?.creativeMechanism) && {
      creativeMechanism: optional(raw.creativeMechanism, 240) || strategy!.creativeMechanism,
    }),
    ...(optional(raw.typeBehavior, 300) && { typeBehavior: optional(raw.typeBehavior, 300) }),
    ...(optional(raw.imageBehavior, 300) && { imageBehavior: optional(raw.imageBehavior, 300) }),
    ...(optional(raw.graphicBehavior, 300) && { graphicBehavior: optional(raw.graphicBehavior, 300) }),
    ...(optional(raw.spatialRelationship, 300) && { spatialRelationship: optional(raw.spatialRelationship, 300) }),
    ...(optional(raw.materialBehavior, 300) && { materialBehavior: optional(raw.materialBehavior, 300) }),
    ...(optional(raw.hierarchyStrategy, 300) && { hierarchyStrategy: optional(raw.hierarchyStrategy, 300) }),
    ...(optional(raw.dominantVisualObject, 200) && { dominantVisualObject: optional(raw.dominantVisualObject, 200) }),
    ...(readCopyPlan(raw.copyPlan) && { copyPlan: readCopyPlan(raw.copyPlan) }),
    ...(strategy && { strategy }),

    hero,
    ...(optional(raw.heroPlacement, 200) && { heroPlacement: optional(raw.heroPlacement, 200) }),
    imageRole,
    ...(optional(raw.imageTreatment, 250) && { imageTreatment: optional(raw.imageTreatment, 250) }),
    firstRead: asString(raw.firstRead, 160) || brief.firstRead,
    ...(optional(raw.secondRead, 160) && { secondRead: optional(raw.secondRead, 160) }),
    ...(asStringArray(raw.attentionHierarchy, 6).length && {
      attentionHierarchy: asStringArray(raw.attentionHierarchy, 6),
    }),
    ...(optional(raw.typographyStrategy, 300) && { typographyStrategy: optional(raw.typographyStrategy, 300) }),
    ...(optional(raw.typographyScaleContrast, 240) && {
      typographyScaleContrast: optional(raw.typographyScaleContrast, 240),
    }),
    ...(optional(raw.compositionStrategy, 300) && { compositionStrategy: optional(raw.compositionStrategy, 300) }),
    ...(optional(raw.logoSanctuary, 200) && { logoSanctuary: optional(raw.logoSanctuary, 200) }),
    ...(optional(raw.visualTension, 240) && { visualTension: optional(raw.visualTension, 240) }),
    intentionalImperfection: asStringArray(raw.intentionalImperfection, 6),
    graphicDevices: asStringArray(raw.graphicDevices, 6),
    elementsToOmit,
    ...(optional(raw.visualMetaphor, 240) && { visualMetaphor: optional(raw.visualMetaphor, 240) }),
    ...(!optional(raw.visualMetaphor, 240) && strategy?.visualMetaphor && { visualMetaphor: strategy.visualMetaphor }),

    // ─── Spatial grammar: recorded when decided, ABSENT when not. ──────────
    ...(optional(raw.compositionFamily, 60) && { compositionFamily: optional(raw.compositionFamily, 60) }),
    ...(optional(raw.anchor, 60) && { anchor: optional(raw.anchor, 60) }),
    ...(optional(raw.movementAxis, 60) && { movementAxis: optional(raw.movementAxis, 60) }),
    ...(optional(raw.dominantRegion, 60) && { dominantRegion: optional(raw.dominantRegion, 60) }),
    ...(optional(raw.headlinePlacement, 200) && { headlinePlacement: optional(raw.headlinePlacement, 200) }),
    ...(optional(raw.visualPlacement, 200) && { visualPlacement: optional(raw.visualPlacement, 200) }),
    ...(asStringArray(raw.overlapRelationships, 4).length && {
      overlapRelationships: asStringArray(raw.overlapRelationships, 4),
    }),
    ...(optional(raw.negativeSpaceRegion, 60) && { negativeSpaceRegion: optional(raw.negativeSpaceRegion, 60) }),
    ...(optional(raw.logoPlacementStrategy, 60) && { logoPlacementStrategy: optional(raw.logoPlacementStrategy, 60) }),
    ...(asStringArray(raw.allowedBleed, 4).length && { allowedBleed: asStringArray(raw.allowedBleed, 4) }),
    ...(intentionalRotation?.length ? { intentionalRotation } : {}),
  };

  console.info('[creative] art director generated blueprint', {
    conceptName: concept.conceptName,
    creativeMechanism: concept.creativeMechanism,
    typeBehavior: concept.typeBehavior,
    imageBehavior: concept.imageBehavior,
    spatialRelationship: concept.spatialRelationship,
    dominantVisualObject: concept.dominantVisualObject,
    hero: concept.hero,
    imageRole: concept.imageRole,
    copyRoles: concept.copyPlan?.requiredRoles,
    // Logged last, and deliberately, so a reader of these logs sees that the
    // grammar is a consequence of the idea rather than its source.
    compositionFamily: concept.compositionFamily ?? '(not decided)',
    durationMs: Date.now() - startedAt,
  });

  return concept;
}
