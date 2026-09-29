import type { GraphicDesignConcept, ScoredCreativeConcept } from '../types';
import type { CreativeBrief } from '../brand/creative-brief';

export interface ConceptIdentity {
  conceptId?: string;
  conceptName: string;
  creativeMechanism: string;
  mechanismFamily?: string;
  dominantVisualObject: string;
  hero: string;
  imageRole: string;
  spatialRelationship: string;
  typeBehavior: string;
  imageBehavior: string;
  compositionFamily: string;
  selectedStyleId?: string;
  copyAngle?: string;
  requiredVisualMechanics: string[];
  requiredClaims: string[];
}

export interface ConceptDivergenceReport {
  divergenceScore: number; // 0.0 (identical) to 1.0 (completely distinct)
  isDifferentiated: boolean;
  sharedAttributes: string[];
  divergentAttributes: string[];
  convergenceWarnings: string[];
}

/**
 * Derives a concept-specific copy angle based on the concept identity and mechanism.
 */
export function deriveConceptCopyAngle(concept: GraphicDesignConcept | ScoredCreativeConcept): string {
  const mechanism = (concept.creativeMechanism || (concept as any).mechanism || '').toLowerCase();
  const hero = (concept.hero || '').toLowerCase();
  const compFam = (concept.compositionFamily || '').toLowerCase();

  if (mechanism.includes('collage') || mechanism.includes('paper') || mechanism.includes('archive') || compFam.includes('collage')) {
    return 'Tactile craft, heritage layers, archival detail, and authentic material memory';
  }
  if (mechanism.includes('juxtaposition') || mechanism.includes('dual') || mechanism.includes('parallel') || mechanism.includes('contrast')) {
    return 'Dual perspectives, moment-to-moment contrast, dynamic tension, and comparative dialogue';
  }
  if (mechanism.includes('numeral') || mechanism.includes('typograph') || hero === 'typography' || compFam.includes('poster')) {
    return 'Minimal punchy declaration, high typographic authority, bold concise conviction';
  }
  if (mechanism.includes('boundary') || mechanism.includes('threshold') || mechanism.includes('light') || mechanism.includes('shadow')) {
    return 'Atmospheric illumination, transition across light and shadow, architectural precision';
  }
  if (mechanism.includes('void') || mechanism.includes('whitespace') || hero === 'whitespace' || compFam.includes('minimal')) {
    return 'Quiet restraint, essential clarity, breathing room, and understated confidence';
  }
  if (mechanism.includes('texture') || mechanism.includes('tactile') || hero === 'texture') {
    return 'Sensory immersion, raw material proof, rich tactile intimacy';
  }
  return 'Direct conceptual hook reinforcing the primary creative mechanism';
}

/**
 * Builds a structured ConceptIdentity representation from a concept and brief.
 */
export function buildConceptIdentity(
  concept: GraphicDesignConcept | ScoredCreativeConcept,
  brief?: CreativeBrief,
  selectedStyleId?: string,
): ConceptIdentity {
  const conceptName = (concept as any).conceptName || (concept as any).name || 'Autonomous Concept';
  const creativeMechanism = concept.creativeMechanism || (concept as any).mechanism || 'Visual hero expression';
  const mechanismFamily = (concept as any).mechanismFamily || (concept as any).family;
  const dominantVisualObject = concept.dominantVisualObject || brief?.subject || 'Primary Subject';
  const hero = concept.hero || 'image';
  const imageRole = concept.imageRole || 'full-bleed';
  const spatialRelationship = concept.spatialRelationship || 'Primary visual ground with anchored typography';
  const typeBehavior = concept.typeBehavior || 'Authoritative editorial anchor';
  const imageBehavior = concept.imageBehavior || 'Tactile proof';
  const compositionFamily = String(concept.compositionFamily || 'asymmetric-editorial');
  const copyAngle = deriveConceptCopyAngle(concept);
  const requiredVisualMechanics = (concept as any).requiredVisualMechanics || [];
  const requiredClaims = brief?.requiredClaims || [];

  return {
    conceptId: (concept as any).id || (concept as any).conceptId,
    conceptName,
    creativeMechanism,
    mechanismFamily,
    dominantVisualObject,
    hero,
    imageRole,
    spatialRelationship,
    typeBehavior,
    imageBehavior,
    compositionFamily,
    selectedStyleId: selectedStyleId || (concept as any).selectedStyleId,
    copyAngle,
    requiredVisualMechanics,
    requiredClaims,
  };
}

/**
 * Evaluates divergence between two structured concept identities.
 */
export function evaluateConceptDivergence(
  a: ConceptIdentity,
  b: ConceptIdentity,
): ConceptDivergenceReport {
  const sharedAttributes: string[] = [];
  const divergentAttributes: string[] = [];
  const convergenceWarnings: string[] = [];

  const compareAttr = (name: string, valA: string | undefined, valB: string | undefined) => {
    if (!valA || !valB) return;
    const cleanA = valA.trim().toLowerCase();
    const cleanB = valB.trim().toLowerCase();
    if (cleanA === cleanB || (cleanA.length > 6 && cleanB.length > 6 && (cleanA.includes(cleanB) || cleanB.includes(cleanA)))) {
      sharedAttributes.push(name);
    } else {
      divergentAttributes.push(name);
    }
  };

  compareAttr('creativeMechanism', a.creativeMechanism, b.creativeMechanism);
  compareAttr('hero', a.hero, b.hero);
  compareAttr('imageRole', a.imageRole, b.imageRole);
  compareAttr('spatialRelationship', a.spatialRelationship, b.spatialRelationship);
  compareAttr('typeBehavior', a.typeBehavior, b.typeBehavior);
  compareAttr('imageBehavior', a.imageBehavior, b.imageBehavior);
  compareAttr('compositionFamily', a.compositionFamily, b.compositionFamily);
  compareAttr('dominantVisualObject', a.dominantVisualObject, b.dominantVisualObject);

  const totalCompared = sharedAttributes.length + divergentAttributes.length;
  const similarity = totalCompared > 0 ? sharedAttributes.length / totalCompared : 0;
  const divergenceScore = Number((1.0 - similarity).toFixed(3));

  if (divergenceScore < 0.35) {
    convergenceWarnings.push(
      `Concepts "${a.conceptName}" and "${b.conceptName}" have converged on ${sharedAttributes.join(', ')}.`,
    );
  }

  if (a.selectedStyleId && b.selectedStyleId && a.selectedStyleId === b.selectedStyleId && divergenceScore < 0.40) {
    convergenceWarnings.push(
      `Concepts share the same style (${a.selectedStyleId}) and have low structural divergence (${divergenceScore}).`,
    );
  }

  return {
    divergenceScore,
    isDifferentiated: divergenceScore >= 0.35,
    sharedAttributes,
    divergentAttributes,
    convergenceWarnings,
  };
}

/**
 * Analyzes a full pool of concepts to ensure diverse creative expressions.
 */
export function analyzeConceptPoolDivergence(
  concepts: Array<GraphicDesignConcept | ScoredCreativeConcept>,
  brief?: CreativeBrief,
): {
  identities: ConceptIdentity[];
  pairReports: Array<{ conceptA: string; conceptB: string; report: ConceptDivergenceReport }>;
  overallDiversityScore: number;
  hasConvergence: boolean;
} {
  const identities = concepts.map((c) => buildConceptIdentity(c, brief));
  const pairReports: Array<{ conceptA: string; conceptB: string; report: ConceptDivergenceReport }> = [];

  let totalDivergence = 0;
  let comparisons = 0;

  for (let i = 0; i < identities.length; i++) {
    for (let j = i + 1; j < identities.length; j++) {
      const report = evaluateConceptDivergence(identities[i], identities[j]);
      pairReports.push({
        conceptA: identities[i].conceptName,
        conceptB: identities[j].conceptName,
        report,
      });
      totalDivergence += report.divergenceScore;
      comparisons++;
    }
  }

  const overallDiversityScore = comparisons > 0 ? Number((totalDivergence / comparisons).toFixed(3)) : 1.0;
  const hasConvergence = pairReports.some((p) => !p.report.isDifferentiated);

  return {
    identities,
    pairReports,
    overallDiversityScore,
    hasConvergence,
  };
}
