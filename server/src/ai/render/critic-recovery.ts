import type { RenderCriticEvaluation } from '../generators/design-critic.generator';

export type CriticFailureClass =
  | 'COPY_INTEGRITY_FAILURE'
  | 'COPY_VALIDITY_FAILURE'
  | 'COPY_VOLUME_FAILURE'
  | 'COPY_FAILURE' // backwards-compatibility alias for general copy failures
  | 'LEGIBILITY_FAILURE'
  | 'OCCLUSION_FAILURE'
  | 'LOGO_LEGIBILITY_FAILURE'
  | 'BRAND_FAILURE'
  | 'COMPOSITION_FAILURE'
  | 'CONCEPT_FAILURE'
  | 'IMAGE_FAILURE';

export interface CriticFailureAnalysis {
  failures: CriticFailureClass[];
  /** Primary failure driving the immediate recovery action */
  failureClass: CriticFailureClass;
  responsibleLayer: 'COPY' | 'TYPOGRAPHY' | 'PLACEMENT' | 'COMPOSITION' | 'IMAGE' | 'ART_DIRECTION' | 'BRAND';
  shouldReuseImage: boolean;
  action: 'REBUILD_COPY' | 'REDUCE_COPY' | 'RECALIBRATE_CONTRAST' | 'CLEAR_SUBJECT' | 'REDESIGN_CONCEPT' | 'REGENERATE_IMAGE' | 'REDISCOVER_COMPOSITION';
  reasons: string[];
}

export interface CompositionRecoveryContext {
  failures: CriticFailureClass[];
  reasons: string[];
  priorRejections?: Array<{
    id: string;
    rect: { x: number; y: number; width: number; height: number };
    reasons: string[];
  }>;
}

/**
 * Classifies design critic rejection into structured failure classes.
 * Extracts ALL applicable failure signals to avoid short-circuiting upstream defects,
 * then selects the primary recovery driver based on dependency ordering:
 * Data Integrity > Validity > Volume > Occlusion (Placement) > Legibility (Contrast) > Logo Legibility > Brand > Composition > Concept > Image.
 */
export function classifyCriticFailure(critic: RenderCriticEvaluation): CriticFailureAnalysis {
  const problems = critic.problems.map((p) => p.toLowerCase());
  const allFeedback = [critic.redesignFeedback, ...critic.problems].join(' ').toLowerCase();
  const reasons: string[] = critic.problems.length > 0 ? critic.problems : [critic.redesignFeedback || 'Critic rejected design'];

  const failures: CriticFailureClass[] = [];

  // 1. Check for Copy Integrity Failure (raw code/JSON, dict fragments, internal draft labels)
  const isCopyIntegrity =
    problems.some(
      (p) =>
        p.includes('raw code') ||
        p.includes('json') ||
        p.includes('string artifact') ||
        p.includes('code artifact') ||
        p.includes('malformed') ||
        p.includes('internal draft label') ||
        p.includes('draft label') ||
        p.includes('template tag'),
    ) ||
    allFeedback.includes('raw code') ||
    allFeedback.includes('json') ||
    allFeedback.includes('internal draft label');

  if (isCopyIntegrity) {
    failures.push('COPY_INTEGRITY_FAILURE');
    failures.push('COPY_FAILURE'); // Keep alias for compatibility
  }

  // 2. Check for Copy Validity Failure (missing required facts or member-mandated claims)
  const isCopyValidity =
    problems.some((p) => p.includes('missing required facts') || p.includes('missing claim') || p.includes('missing required claim')) ||
    allFeedback.includes('missing required facts');

  if (isCopyValidity) {
    failures.push('COPY_VALIDITY_FAILURE');
    if (!failures.includes('COPY_FAILURE')) failures.push('COPY_FAILURE');
  }

  // 3. Check for Copy Volume Failure (excessive text blocks carrying no creative value)
  const isCopyVolume =
    problems.some(
      (p) =>
        p.includes('cut the copy') ||
        p.includes('text blocks carrying nothing') ||
        p.includes('too much copy') ||
        p.includes('excessive copy'),
    ) ||
    allFeedback.includes('cut the copy to the minimum') ||
    allFeedback.includes('text blocks carrying nothing');

  if (isCopyVolume) {
    failures.push('COPY_VOLUME_FAILURE');
    if (!failures.includes('COPY_FAILURE')) failures.push('COPY_FAILURE');
  }

  // 4. Check for Occlusion / Subject Collision (Placement defect)
  const isOcclusion =
    critic.textOccludesSubject ||
    problems.some(
      (p) =>
        p.includes('occlude') ||
        p.includes('sits directly over') ||
        p.includes('sitting on the subject') ||
        p.includes('covers the product') ||
        p.includes('obscuring the subject') ||
        p.includes('sits directly on') ||
        p.includes('type is sitting on'),
    ) ||
    allFeedback.includes('type is sitting on the subject') ||
    allFeedback.includes('occludes primary product') ||
    allFeedback.includes('sitting directly on');

  if (isOcclusion) {
    failures.push('OCCLUSION_FAILURE');
  }

  // 5. Check for Legibility / Contrast Failure (Color/Surface defect)
  const isLegibility =
    problems.some(
      (p) =>
        p.includes('contrast') ||
        p.includes('unreadable') ||
        p.includes('illegible') ||
        p.includes('dark headline text') ||
        p.includes('dark text') ||
        p.includes('hard to read') ||
        p.includes('low contrast') ||
        p.includes('zero contrast'),
    ) ||
    allFeedback.includes('contrast') ||
    allFeedback.includes('illegible') ||
    allFeedback.includes('unreadable');

  if (isLegibility) {
    failures.push('LEGIBILITY_FAILURE');
  }

  // 6. Check for Logo Legibility / Prominence Failure (Brand Asset defect)
  const isLogoLegibility =
    critic.logoClear === false ||
    problems.some(
      (p) =>
        p.includes('logo') &&
        (p.includes('undersized') ||
          p.includes('too small') ||
          p.includes('illegible') ||
          p.includes('unreadable') ||
          p.includes('hard to read') ||
          p.includes('not clear') ||
          p.includes('low contrast') ||
          p.includes('busy') ||
          p.includes('invisible') ||
          p.includes('faint')),
    ) ||
    allFeedback.includes('logo is undersized') ||
    allFeedback.includes('logo is illegible') ||
    allFeedback.includes('brand logo at top center is undersized') ||
    allFeedback.includes('logo at top center is undersized');

  if (isLogoLegibility) {
    failures.push('LOGO_LEGIBILITY_FAILURE');
  }

  // 7. Check for General Brand Failure
  const isBrand =
    problems.some(
      (p) =>
        p.includes('brand voice') ||
        p.includes('brand personality') ||
        p.includes('wrong colors'),
    ) ||
    allFeedback.includes('brand mismatch');

  if (isBrand) {
    failures.push('BRAND_FAILURE');
  }

  // 8. Check for Concept Failure
  if (!critic.singleClearIdea || critic.templateLook) {
    failures.push('CONCEPT_FAILURE');
  }

  // 9. Check for Image Failure
  const isImage =
    critic.interchangeableWithAnotherEvent ||
    problems.some(
      (p) =>
        p.includes('swapped picture') ||
        p.includes('wrong event') ||
        p.includes('wrong occasion') ||
        p.includes('image quality') ||
        p.includes('distorted product') ||
        p.includes('blurry image'),
    ) ||
    allFeedback.includes('swapped picture') ||
    allFeedback.includes('different occasion and a swapped picture');

  if (isImage) {
    failures.push('IMAGE_FAILURE');
  }

  // Default to COMPOSITION_FAILURE if no specific defects matched
  if (failures.length === 0) {
    failures.push('COMPOSITION_FAILURE');
  }

  // ── Dependency-Ordered Primary Action Selection ───────────────────────────
  let primaryFailure: CriticFailureClass = 'COMPOSITION_FAILURE';
  let responsibleLayer: CriticFailureAnalysis['responsibleLayer'] = 'COMPOSITION';
  let action: CriticFailureAnalysis['action'] = 'REDISCOVER_COMPOSITION';

  const hasImageOrConceptFailure = failures.includes('CONCEPT_FAILURE') || failures.includes('IMAGE_FAILURE');

  if (failures.includes('COPY_INTEGRITY_FAILURE')) {
    primaryFailure = 'COPY_INTEGRITY_FAILURE';
    responsibleLayer = 'COPY';
    action = 'REBUILD_COPY';
  } else if (failures.includes('COPY_VALIDITY_FAILURE')) {
    primaryFailure = 'COPY_VALIDITY_FAILURE';
    responsibleLayer = 'COPY';
    action = 'REBUILD_COPY';
  } else if (failures.includes('COPY_VOLUME_FAILURE')) {
    primaryFailure = 'COPY_VOLUME_FAILURE';
    responsibleLayer = 'COPY';
    action = 'REDUCE_COPY';
  } else if (
    failures.filter((f) =>
      ['OCCLUSION_FAILURE', 'LEGIBILITY_FAILURE', 'LOGO_LEGIBILITY_FAILURE', 'COMPOSITION_FAILURE'].includes(f)
    ).length >= 2
  ) {
    // Multiple composition defects (e.g. Occlusion + Legibility + Logo):
    // Rerun holistic multi-element DDE discovery with all defects preserved as active constraints
    primaryFailure = failures.includes('OCCLUSION_FAILURE') ? 'OCCLUSION_FAILURE' : 'COMPOSITION_FAILURE';
    responsibleLayer = 'COMPOSITION';
    action = 'REDISCOVER_COMPOSITION';
  } else if (failures.includes('OCCLUSION_FAILURE')) {
    // Placement defect precedes contrast: move text to quiet negative space first
    primaryFailure = 'OCCLUSION_FAILURE';
    responsibleLayer = 'PLACEMENT';
    action = 'CLEAR_SUBJECT';
  } else if (failures.includes('LEGIBILITY_FAILURE')) {
    primaryFailure = 'LEGIBILITY_FAILURE';
    responsibleLayer = 'TYPOGRAPHY';
    action = 'RECALIBRATE_CONTRAST';
  } else if (failures.includes('LOGO_LEGIBILITY_FAILURE')) {
    primaryFailure = 'LOGO_LEGIBILITY_FAILURE';
    responsibleLayer = 'BRAND';
    action = 'REDISCOVER_COMPOSITION';
  } else if (failures.includes('BRAND_FAILURE')) {
    primaryFailure = 'BRAND_FAILURE';
    responsibleLayer = 'BRAND';
    action = 'REDISCOVER_COMPOSITION';
  } else if (failures.includes('CONCEPT_FAILURE')) {
    primaryFailure = 'CONCEPT_FAILURE';
    responsibleLayer = 'ART_DIRECTION';
    action = 'REDESIGN_CONCEPT';
  } else if (failures.includes('IMAGE_FAILURE')) {
    primaryFailure = 'IMAGE_FAILURE';
    responsibleLayer = 'IMAGE';
    action = 'REGENERATE_IMAGE';
  } else {
    primaryFailure = 'COMPOSITION_FAILURE';
    responsibleLayer = 'COMPOSITION';
    action = 'REDISCOVER_COMPOSITION';
  }

  // Never reuse image if the visual concept or image asset itself failed verification
  const shouldReuseImage = !hasImageOrConceptFailure;

  return {
    failures,
    failureClass: primaryFailure,
    responsibleLayer,
    shouldReuseImage,
    action,
    reasons,
  };
}