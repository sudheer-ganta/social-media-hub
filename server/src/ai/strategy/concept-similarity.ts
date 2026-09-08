import type { GraphicDesignConcept } from '../types';

/**
 * Conceptual-sameness detection for GRAPHIC DESIGN CONCEPTS (spec §12).
 *
 * The existing concept gate compares advertising ideas. This one compares the
 * DESIGN ideas that execute them, and it exists because the previous
 * "diversity" check compared `compositionFamily` alone — under which
 *
 *   asymmetric-editorial + photo bottom-right
 *   asymmetric-editorial + photo bottom-right + different colours
 *
 * counted as two different designs. They are one design. So colour, palette
 * and typeface are deliberately NOT inputs here: swapping them is exactly the
 * cosmetic variation this check has to see through. What is compared is the
 * set of decisions a viewer would actually experience as different — the
 * mechanism, the metaphor, what leads, how type behaves, how image behaves,
 * how the elements relate, and what the dominant object is.
 */

/** The axes conceptual sameness is judged on. compositionFamily is deliberately absent. */
export const CONCEPT_AXES = [
  'creativeMechanism',
  'visualMetaphor',
  'hierarchyStrategy',
  'imageBehavior',
  'typeBehavior',
  'spatialRelationship',
  'dominantVisualObject',
] as const;

export type ConceptAxis = (typeof CONCEPT_AXES)[number];

export interface ConceptSimilarityReport {
  /** Axes on which the two concepts make substantially the same decision. */
  sharedAxes: ConceptAxis[];
  /** Axes both concepts actually filled in — the denominator. */
  comparedAxes: ConceptAxis[];
  /** 0 (nothing in common) to 1 (the same design idea). */
  similarity: number;
  /** True when the two are one creative structure wearing two coats of paint. */
  tooSimilar: boolean;
  /** Human-readable reason, for critic feedback and redesign instructions. */
  reason?: string;
}

/**
 * Two concepts sharing this proportion of the axes they both filled in are the
 * same design. Set where "mechanism + one behaviour" still passes but
 * "mechanism + metaphor + hierarchy" does not, because a genuinely different
 * design keeps at most one decision from its predecessor.
 */
export const CONCEPT_SIMILARITY_LIMIT = 0.5;

const AXIS_STOPWORDS = new Set([
  'that', 'with', 'this', 'from', 'into', 'their', 'your', 'over', 'when', 'what', 'then', 'than',
  'they', 'them', 'will', 'each', 'every', 'more', 'most', 'some', 'very', 'just', 'like', 'been',
  'have', 'does', 'where', 'while', 'through', 'about', 'against', 'between', 'because', 'across',
  'design', 'designed', 'visual', 'visually', 'element', 'elements', 'composition', 'canvas',
  'creative', 'graphic', 'image', 'imagery', 'type', 'typography', 'brand', 'campaign', 'poster',
]);

function tokens(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set((value.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !AXIS_STOPWORDS.has(w)));
}

/** Jaccard overlap of two axis values' distinctive vocabulary. */
function axisOverlap(a: string | undefined, b: string | undefined): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / (ta.size + tb.size - shared);
}

/** Two axis values say the same thing when their distinctive vocabulary substantially coincides. */
const AXIS_SAME_LIMIT = 0.4;

function axisValue(concept: GraphicDesignConcept, axis: ConceptAxis): string | undefined {
  const value = concept[axis];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function compareGraphicConcepts(
  a: GraphicDesignConcept,
  b: GraphicDesignConcept,
): ConceptSimilarityReport {
  const sharedAxes: ConceptAxis[] = [];
  const comparedAxes: ConceptAxis[] = [];

  for (const axis of CONCEPT_AXES) {
    const va = axisValue(a, axis);
    const vb = axisValue(b, axis);
    // An axis only one concept decided is not evidence of sameness OR of
    // difference — comparing against a blank would let an under-specified
    // blueprint pass by omission.
    if (!va || !vb) continue;
    comparedAxes.push(axis);
    if (axisOverlap(va, vb) >= AXIS_SAME_LIMIT) sharedAxes.push(axis);
  }

  // Nothing comparable: fall back to the two things every blueprint has — what
  // it says the idea is, and how it says the image participates. An unfilled
  // blueprint must not be able to claim novelty just by being empty.
  if (comparedAxes.length === 0) {
    const ideaOverlap = axisOverlap(a.visualIdea, b.visualIdea);
    const sameImageRole = a.imageRole === b.imageRole;
    const sameHero = a.hero === b.hero;
    const similarity = ideaOverlap >= AXIS_SAME_LIMIT && sameImageRole && sameHero ? 1 : ideaOverlap;
    return {
      sharedAxes: [],
      comparedAxes: [],
      similarity,
      tooSimilar: similarity > CONCEPT_SIMILARITY_LIMIT,
      ...(similarity > CONCEPT_SIMILARITY_LIMIT && {
        reason:
          'Both blueprints describe the same visual idea with the same hero and the same image role, and neither declares a distinct mechanism or behaviour.',
      }),
    };
  }

  const similarity = sharedAxes.length / comparedAxes.length;
  const tooSimilar = similarity > CONCEPT_SIMILARITY_LIMIT;

  return {
    sharedAxes,
    comparedAxes,
    similarity,
    tooSimilar,
    ...(tooSimilar && {
      reason: `The two blueprints make the same decision on ${sharedAxes.join(', ')} — that is one creative structure, not two. Change the mechanism and the relationship between the elements, not the colours or the composition family.`,
    }),
  };
}

/**
 * The instruction handed to a redesign so it changes the IDEA rather than the
 * layout. Names the axes that must move, in the language the art director's
 * own schema uses.
 */
export function redesignDivergenceInstruction(previous: GraphicDesignConcept): string {
  const kept = [
    previous.creativeMechanism && `mechanism "${previous.creativeMechanism}"`,
    previous.visualMetaphor && `metaphor "${previous.visualMetaphor}"`,
    previous.spatialRelationship && `element relationship "${previous.spatialRelationship}"`,
    previous.typeBehavior && `type behaviour "${previous.typeBehavior}"`,
    previous.imageBehavior && `image behaviour "${previous.imageBehavior}"`,
    previous.dominantVisualObject && `dominant object "${previous.dominantVisualObject}"`,
  ].filter((part): part is string => typeof part === 'string' && part.length > 0);

  return [
    'This redesign must be a DIFFERENT CREATIVE IDEA, not the same idea re-laid-out.',
    kept.length ? `You may not reuse: ${kept.join('; ')}.` : null,
    'Changing compositionFamily, anchor, colours or typeface alone is not a redesign — the mechanism, the relationship between the elements and what the viewer notices first must all genuinely change.',
  ]
    .filter((line): line is string => typeof line === 'string')
    .join(' ');
}
