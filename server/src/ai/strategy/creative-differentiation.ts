import type { GraphicDesignConcept, ScoredCreativeConcept } from '../types';
import type { CreativeBrief } from '../brand/creative-brief';
import { isAbstractOccasionOrTheme } from '../intent/concept-realizability-gate';

export interface ConceptIdentity {
  conceptId?: string;
  conceptName: string;
  communicationIdea?: string;
  creativePremise?: string;
  creativeMechanism: string;
  visualMechanism?: string;
  mechanismFamily?: string;
  dominantVisualObject: string;
  hero: string;
  imageRole: string;
  visualWorld?: string;
  physicalArtifacts?: string[];
  compositionMechanism?: string;
  spatialRelationship?: string;
  typeBehavior?: string;
  imageBehavior?: string;
  compositionFamily?: string;
  selectedStyleId?: string;
  copyAngle?: string;
  referenceDevice?: string;
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
  const mechanism = (concept.creativeMechanism || (concept as any).mechanism || (concept as any).visualMechanism || '').toLowerCase();
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
  const communicationIdea = (concept as any).communicationIdea || (concept as any).bigIdea || (concept as any).conceptIntent?.communicationIdea;
  const creativePremise = (concept as any).creativePremise || (concept as any).humanInsight || (concept as any).conceptIntent?.creativePremise;
  const creativeMechanism = concept.creativeMechanism || (concept as any).mechanism || (concept as any).conceptIntent?.creativeMechanism || (concept as any).visualMechanism || 'Visual hero expression';
  const visualMechanism = (concept as any).visualMechanism || (concept as any).conceptIntent?.visualMechanism || creativeMechanism;
  const mechanismFamily = (concept as any).mechanismFamily || (concept as any).family;
  const dominantVisualObject =
    concept.dominantVisualObject ||
    (concept as any).visualRealizationIntent?.dominantVisualObject ||
    (brief?.subject && !isAbstractOccasionOrTheme(brief.subject) ? brief.subject : 'Primary Subject');
  const hero = concept.hero || (concept as any).visualRealizationIntent?.hero || 'image';
  const imageRole = concept.imageRole || (concept as any).visualRealizationIntent?.imageRole || 'full-bleed';
  const visualWorld = (concept as any).visualWorld || (concept as any).visualRealizationIntent?.visualWorld;
  const physicalArtifacts = (concept as any).physicalArtifacts || (concept as any).visualRealizationIntent?.physicalArtifacts;
  const compositionMechanism = (concept as any).compositionMechanism || (concept as any).visualRealizationIntent?.compositionMechanism;
  const copyAngle = (concept as any).copyAngle || (concept as any).conceptIntent?.copyAngle || deriveConceptCopyAngle(concept);
  const referenceDevice = (concept as any).referenceInsight || (concept as any).referenceDevice || (concept as any).conceptIntent?.referenceInsight;
  const spatialRelationship = concept.spatialRelationship;
  const typeBehavior = concept.typeBehavior;
  const imageBehavior = concept.imageBehavior;
  const compositionFamily = concept.compositionFamily ? String(concept.compositionFamily) : undefined;
  const requiredVisualMechanics = (concept as any).requiredVisualMechanics || [];
  const requiredClaims = brief?.requiredClaims || [];

  return {
    conceptId: (concept as any).id || (concept as any).conceptId,
    conceptName,
    communicationIdea,
    creativePremise,
    creativeMechanism,
    visualMechanism,
    mechanismFamily,
    dominantVisualObject,
    hero,
    imageRole,
    visualWorld,
    physicalArtifacts,
    compositionMechanism,
    spatialRelationship,
    typeBehavior,
    imageBehavior,
    compositionFamily,
    selectedStyleId: selectedStyleId || (concept as any).selectedStyleId,
    copyAngle,
    referenceDevice,
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

  compareAttr('creativePremise', a.creativePremise, b.creativePremise);
  compareAttr('communicationIdea', a.communicationIdea, b.communicationIdea);
  compareAttr('creativeMechanism', a.creativeMechanism, b.creativeMechanism);
  compareAttr('visualMechanism', a.visualMechanism, b.visualMechanism);
  compareAttr('dominantVisualObject', a.dominantVisualObject, b.dominantVisualObject);
  compareAttr('visualWorld', a.visualWorld, b.visualWorld);
  compareAttr('compositionMechanism', a.compositionMechanism, b.compositionMechanism);
  compareAttr('copyAngle', a.copyAngle, b.copyAngle);
  compareAttr('referenceDevice', a.referenceDevice, b.referenceDevice);
  if (a.spatialRelationship && b.spatialRelationship) {
    compareAttr('spatialRelationship', a.spatialRelationship, b.spatialRelationship);
  }
  if (a.typeBehavior && b.typeBehavior) {
    compareAttr('typeBehavior', a.typeBehavior, b.typeBehavior);
  }
  if (a.imageBehavior && b.imageBehavior) {
    compareAttr('imageBehavior', a.imageBehavior, b.imageBehavior);
  }
  if (a.compositionFamily && b.compositionFamily) {
    compareAttr('compositionFamily', a.compositionFamily, b.compositionFamily);
  }

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
