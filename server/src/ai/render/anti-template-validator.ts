import type { GraphicDesignConcept } from '../brand/creative-brief';
import type { DesignNode, DesignerPlan } from './designer-composition';

export interface AntiTemplateCheckResult {
  passed: boolean;
  violations: string[];
  strengths: string[];
}

const area = (n: DesignNode) => Math.max(0, n.width) * Math.max(0, n.height);

/**
 * Do two boxes share enough canvas area to read as a deliberate composition
 * move? A one-percent touch between two boxes that were simply pushed apart to
 * satisfy the collision rules is not an overlap a viewer can see, so it must
 * not be credited as one.
 */
const overlaps = (a: DesignNode, b: DesignNode): boolean => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return false;
  const shared = w * h;
  return shared >= 0.004 && shared >= 0.15 * Math.min(area(a), area(b));
};

/** Does the node run past a canvas edge (a deliberate crop), rather than floating inside it? */
const bleeds = (n: DesignNode): boolean =>
  n.x < -0.005 || n.y < -0.005 || n.x + n.width > 1.005 || n.y + n.height > 1.005;

/**
 * The widest horizontal band, between the topmost and bottommost content, that
 * no node occupies. A designer's negative space sits at an edge or beside the
 * content; a slot-filler's dead space is a hole punched through the middle.
 */
function largestInteriorGap(nodes: DesignNode[]): number {
  const bands = nodes
    .map((n) => [Math.max(0, n.y), Math.min(1, n.y + n.height)] as const)
    .filter(([top, bottom]) => bottom > top)
    .sort((a, b) => a[0] - b[0]);
  if (bands.length < 2) return 0;
  let gap = 0;
  let reach = bands[0][1];
  for (const [top, bottom] of bands.slice(1)) {
    if (top > reach) gap = Math.max(gap, top - reach);
    reach = Math.max(reach, bottom);
  }
  return gap;
}

/**
 * Programmatically rejects the layouts that read as "automated", not designed.
 *
 * The check that matters most is FIGURE/GROUND INTEGRATION. Every template
 * this renderer has ever produced shares one signature: a photograph sitting
 * inside its own untouched rectangle, on a flat field, with the type parked in
 * the leftover space and nothing ever crossing anything else. A real designer
 * bleeds the image off an edge, runs type across it, or locks it against a
 * colour block. Requiring at least one of those three is what separates a
 * composition from a slot-filled card — so it is a hard violation here rather
 * than a note, and the previous version's unconditional "strength" (which made
 * the catch-all check unreachable) is gone.
 */
export function validateAntiTemplateQuality(
  plan: DesignerPlan,
  concept?: GraphicDesignConcept,
): AntiTemplateCheckResult {
  const violations: string[] = [];
  const strengths: string[] = [];

  const nodes = (plan.nodes || []).filter((n): n is DesignNode => Boolean(n));
  const copyNodes = nodes.filter((n) => n.kind === 'copy');
  const imageNodes = nodes.filter((n) => n.kind === 'product' || n.kind === 'visual');
  const shapeNodes = nodes.filter((n) => n.kind === 'shape');

  if (nodes.length === 0) {
    return { passed: false, violations: ['Plan contains no design nodes.'], strengths: [] };
  }

  // 1. FIGURE/GROUND INTEGRATION — the signature of every template render.
  if (imageNodes.length > 0) {
    const anyBleed = imageNodes.some(bleeds);
    const typeOverImage = copyNodes.some((c) => imageNodes.some((img) => overlaps(c, img)));
    const blockAgainstImage = shapeNodes.some((s) => area(s) >= 0.04 && imageNodes.some((img) => overlaps(s, img)));

    if (!anyBleed && !typeOverImage && !blockAgainstImage) {
      violations.push(
        'No figure/ground integration: the image floats in its own rectangle with type parked beside it and nothing crossing anything. Bleed the image off a canvas edge, run typography across it, or lock a colour block against it.',
      );
    } else {
      if (anyBleed) strengths.push('Image cropped by the canvas edge rather than floated inside it.');
      if (typeOverImage) strengths.push('Typography composed across the imagery.');
      if (blockAgainstImage) strengths.push('Graphic block locked against the imagery.');
    }
  }

  // 2. Scale contrast
  if (copyNodes.length >= 2) {
    const scales = copyNodes.map((n) => n.fontScale || 0.045);
    const ratio = Math.max(...scales) / Math.max(0.001, Math.min(...scales));
    if (ratio >= 1.8) {
      strengths.push(`Decisive type scale contrast (${ratio.toFixed(1)}x hero to supporting).`);
    } else if (ratio < 1.6) {
      violations.push(
        `Equal visual weights: the largest copy is only ${ratio.toFixed(1)}x the smallest. Real graphic design commits to a hierarchy — make the first read several times the size of the detail.`,
      );
    }
  }

  // 3. Dead-centre symmetry
  const onAxis = (n: DesignNode) => Math.abs(n.x + n.width / 2 - 0.5) < 0.08;
  if (
    copyNodes.length >= 2 &&
    copyNodes.every((n) => n.align === 'center') &&
    copyNodes.every(onAxis) &&
    imageNodes.every(onAxis)
  ) {
    violations.push(
      'Dead-center template layout: every element is stacked on the middle axis. Use asymmetry, an offset axis, or deliberate negative space on one side.',
    );
  }

  // 4. "Image on top, text underneath" card
  if (imageNodes.length === 1 && copyNodes.length >= 1) {
    const img = imageNodes[0];
    const topBand = img.y < 0.15 && img.height >= 0.3 && img.height <= 0.7 && img.width >= 0.7;
    if (topBand && copyNodes.every((c) => c.y >= img.y + img.height - 0.05)) {
      violations.push(
        'Predictable template stack: image on top, text underneath, like a feed card. Art-direct the relationship between image and typography instead.',
      );
    }
  }

  // 5. A hole punched through the middle of the canvas
  const gap = largestInteriorGap(nodes);
  const isAsymmetricOrNegativeSpace = Boolean(
    concept && (
      concept.compositionFamily === 'asymmetric-editorial' ||
      concept.compositionFamily === 'negative-space' ||
      concept.compositionFamily === 'typographic-poster' ||
      concept.compositionFamily === 'minimal-field' ||
      concept.compositionFamily === 'editorial-spread' ||
      concept.compositionFamily === 'collage-grid' ||
      concept.imageRole === 'offset-crop' ||
      concept.imageRole === 'hero' ||
      concept.imageRole === 'full-bleed'
    )
  );

  if (gap >= 0.35 && !isAsymmetricOrNegativeSpace) {
    violations.push(
      `Dead band across the canvas: ${(gap * 100).toFixed(0)}% of the height between elements carries nothing. Negative space must be deliberate and placed, not the leftover from spreading blocks apart to avoid collisions.`,
    );
  }

  // 6. The blueprint's own image intent has to be visible in the geometry
  if (concept && imageNodes.length > 0) {
    const biggest = Math.max(...imageNodes.map(area));
    if ((concept.imageRole === 'full-bleed' || concept.imageRole === 'hero') && biggest < 0.4 && !imageNodes.some(bleeds)) {
      violations.push(
        `The blueprint calls for a ${concept.imageRole} image, but the largest image occupies only ${(biggest * 100).toFixed(0)}% of the canvas and never reaches an edge.`,
      );
    }
    if (concept.imageRole === 'small-tactile-object' && biggest > 0.45) {
      violations.push(
        'The blueprint calls for a small tactile object, but the image dominates the canvas. Scale it down and let typography or negative space lead.',
      );
    }
  }

  // 7. Reject predictable 2-column template (left text column + right image column + footer logo)
  const logoNode = nodes.find(n => n.kind === 'logo');
  if (imageNodes.length === 1 && copyNodes.length >= 1) {
    const img = imageNodes[0];
    const leftCopy = copyNodes.every(c => c.x + c.width <= 0.58);
    const rightImage = img.x >= 0.42 && img.width >= 0.38;
    const footerLogo = logoNode && logoNode.y >= 0.82;
    if (leftCopy && rightImage && footerLogo) {
      violations.push(
        'Predictable 2-column social template (left text column + right image column + footer logo). Execute the Art Director blueprint with dynamic asymmetric integration, bleeding type, or layered layout instead.',
      );
    }
  }

  // 8. At least two decisive art-direction moves
  if (copyNodes.some((n) => (n.fontScale || 0) >= 0.08)) strengths.push('Dramatic hero typography scale.');
  if (nodes.some((n) => typeof n.rotation === 'number' && Math.abs(n.rotation) > 0.5)) strengths.push('Tactile element rotation.');
  if (shapeNodes.some((s) => area(s) >= 0.15)) strengths.push('Structural colour field.');
  if (nodes.some((n) => n.kind !== 'logo' && bleeds(n))) strengths.push('Controlled edge bleed.');
  if (copyNodes.some((c) => imageNodes.some((img) => overlaps(c, img)))) strengths.push('Intentional typography-over-imagery overlap.');

  if (strengths.length < 2) {
    violations.push(
      'Layout is overly safe: it makes no decisive art-direction move. Commit to at least two of — extreme type scale, edge bleed, overlap, rotation, or a structural colour field.',
    );
  }

  return { passed: violations.length === 0, violations, strengths };
}

export const validateAntiTemplateRules = validateAntiTemplateQuality;
