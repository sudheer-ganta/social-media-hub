import type { CreativeBrief } from '../brand/creative-brief';
import type { CreativeDirection, GraphicDesignConcept } from '../types';
import type { ResolvedStyleDNA } from '../style-dna/style-dna';

export interface StyleBriefConsistencyInput {
  brief?: CreativeBrief;
  direction?: CreativeDirection;
  concept?: GraphicDesignConcept;
  styleDna?: ResolvedStyleDNA | any;
  selectedStyleId?: string;
}

export interface StyleBriefConsistencyResult {
  status: 'STYLE_COMPATIBLE' | 'STYLE_INCONSISTENT';
  violations: string[];
  repairedDirection?: CreativeDirection;
  repairedConcept?: GraphicDesignConcept;
  repairedStyleId?: string;
}

/**
 * Validates structural consistency between:
 * - canonical brief intent
 * - artDirectionFamily
 * - compositionFamily
 * - selectedStyleId
 * - imageRole
 * - creativeMechanism
 * - required visual mechanics
 *
 * Emits STYLE_COMPATIBLE or STYLE_INCONSISTENT.
 * When inconsistent, provides repaired direction and concept BEFORE image generation.
 */
export function validateStyleBriefConsistency(
  input: StyleBriefConsistencyInput,
): StyleBriefConsistencyResult {
  const { brief, direction, concept, styleDna } = input;
  const violations: string[] = [];

  const selectedStyleId =
    input.selectedStyleId ||
    styleDna?.style?.id ||
    styleDna?.id ||
    direction?.selectedStyle?.id ||
    (direction as any)?.selectedStyleId;

  const compositionFamily = String(concept?.compositionFamily || (direction as any)?.compositionFamily || '').toLowerCase();
  const artDirectionFamily = concept?.artDirectionFamily || direction?.artDirectionFamily;
  const imageRole = concept?.imageRole || 'full-bleed';
  const hero = concept?.hero || 'image';
  const mechanism = (concept?.creativeMechanism || (concept as any)?.mechanism || '').toLowerCase();

  let repairedDirection: CreativeDirection | undefined = direction ? { ...direction } : undefined;
  let repairedConcept: GraphicDesignConcept | undefined = concept ? { ...concept } : undefined;
  let repairedStyleId: string | undefined = selectedStyleId;

  // 1. Incompatible: Asymmetric Editorial or Typographic Poster + Creator UGC
  // Creator UGC (casual raw snapshot) contradicts high-editorial typography or structural poster families.
  if (
    selectedStyleId === 'creator-ugc' &&
    (compositionFamily.includes('editorial') ||
      compositionFamily.includes('poster') ||
      compositionFamily.includes('asymmetric') ||
      artDirectionFamily === 'EDITORIAL_PHOTOGRAPHY' ||
      mechanism.includes('editorial') ||
      mechanism.includes('typograph'))
  ) {
    violations.push(
      `Incompatible pairing: compositionFamily "${compositionFamily}" / artDirection "${artDirectionFamily}" is structurally inconsistent with selectedStyleId "${selectedStyleId}".`,
    );

    // If brief was luxury / editorial, repair style to editorial / minimalist; if brief was UGC / casual, repair concept to documentary-moment
    if (brief?.primaryIntent === 'BRAND_DISCOVERY' || brief?.brandPersonality?.includes('luxury') || brief?.brandPersonality?.includes('editorial')) {
      repairedStyleId = 'editorial';
      if (repairedDirection) {
        repairedDirection.selectedStyle = { id: 'editorial', name: 'Editorial', tags: ['editorial', 'fashion'] } as any;
        (repairedDirection as any).selectedStyleId = 'editorial';
        repairedDirection.artDirectionFamily = 'EDITORIAL_PHOTOGRAPHY';
      }
      if (repairedConcept) {
        repairedConcept.artDirectionFamily = 'EDITORIAL_PHOTOGRAPHY';
      }
    } else {
      if (repairedConcept) {
        repairedConcept.compositionFamily = 'minimal-field';
        repairedConcept.artDirectionFamily = 'DOCUMENTARY';
      }
      if (repairedDirection) {
        repairedDirection.artDirectionFamily = 'DOCUMENTARY';
      }
    }
  }

  // 2. Incompatible: Minimal Field Quiet Whitespace + Neo-Brutalism / Y2K (High-Clutter Chaos)
  if (
    compositionFamily.includes('minimal') &&
    (selectedStyleId === 'neo-brutalism' || selectedStyleId === 'y2k')
  ) {
    violations.push(
      `Incompatible pairing: compositionFamily "${compositionFamily}" (quiet whitespace) is inconsistent with chaotic/vibrant selectedStyleId "${selectedStyleId}".`,
    );
    if (repairedConcept) {
      repairedConcept.compositionFamily = selectedStyleId === 'y2k' ? 'collage-grid' : 'split-contrast';
    }
  }

  // 3. Incompatible: Typographic Poster / Image Absent + Heavy Cinematic Photography Style
  if (
    (hero === 'typography' || imageRole === 'omitted' || compositionFamily.includes('poster')) &&
    selectedStyleId === 'cinematic-drama'
  ) {
    violations.push(
      `Incompatible pairing: hero "${hero}" / imageRole "${imageRole}" is inconsistent with image-heavy selectedStyleId "cinematic-drama".`,
    );
    if (repairedDirection) {
      repairedDirection.selectedStyle = { id: 'bold-typography', name: 'Bold Typography', tags: ['typography'] } as any;
      (repairedDirection as any).selectedStyleId = 'bold-typography';
    }
    repairedStyleId = 'bold-typography';
  }

  const status = violations.length > 0 ? 'STYLE_INCONSISTENT' : 'STYLE_COMPATIBLE';

  return {
    status,
    violations,
    repairedDirection: status === 'STYLE_INCONSISTENT' ? repairedDirection : undefined,
    repairedConcept: status === 'STYLE_INCONSISTENT' ? repairedConcept : undefined,
    repairedStyleId: status === 'STYLE_INCONSISTENT' ? repairedStyleId : undefined,
  };
}
