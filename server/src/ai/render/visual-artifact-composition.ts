import type {
  VisualArtifactElement,
  VisualArtifactComposition,
  VisualArtifactSemanticRole,
  VisualArtifactRelationship,
  VisualArtifactRelationshipType,
  VisualArtifactEdgeCharacter,
  VisualArtifactInteractionMode,
  VisualArtifactMaterial,
  GraphicDesignConcept,
  ReferenceAwareConcept,
  CreativeRealizationPlan,
} from '../types';
import type { DesignNode } from './designer-composition';
import type { CampaignCopyLine } from '../prompts/campaign-creative.prompt';
import type { InlineImagePart } from '../providers/provider.interface';
import type { DesignField } from './design-representation';

/**
 * Human-Designed Visual Artifacts Composition Model (FlowPost Core).
 *
 * Implements a generalized visual-artifact composition model without hardcoding
 * static templates (no botanical, scrapbook, archival, museum, collage, or zine templates).
 *
 * Dynamically constructs physical substrates, subjects, cutouts, image fragments,
 * annotations, handmarks, graphic shapes, frames, typography, and logos, and discovers
 * their relational geometry and material hierarchy.
 */

export interface BuildVisualArtifactOptions {
  concept?: GraphicDesignConcept | ReferenceAwareConcept | any;
  realizationPlan?: CreativeRealizationPlan;
  contract?: any;
  canvas?: any;
  nodes: DesignNode[];
  copy?: CampaignCopyLine[];
  logo?: InlineImagePart;
  products?: InlineImagePart[];
  field?: DesignField;
  imageField?: any;
  styleDna?: any;
  canvasWidth?: number;
  canvasHeight?: number;
}

/**
 * Derives material properties from concept, realization plan, and semantic role.
 */
export function deriveMaterialProperties(
  role: VisualArtifactSemanticRole,
  concept: GraphicDesignConcept | ReferenceAwareConcept,
  realizationPlan?: CreativeRealizationPlan,
  node?: DesignNode
): VisualArtifactMaterial {
  const visualWorld = ((concept as ReferenceAwareConcept).visualWorld || '').toLowerCase();
  const materialBehavior = (concept.materialBehavior || '').toLowerCase();
  const physicalMech = (realizationPlan?.physicalMechanism || concept.creativeMechanism || '').toLowerCase();

  switch (role) {
    case 'SUBSTRATE':
      if (visualWorld.includes('linen') || materialBehavior.includes('linen') || physicalMech.includes('linen')) {
        return { type: 'linen', texture: 'heavy textured linen weave', finish: 'textured', color: node?.color || '#F4EFEA', opacity: 1.0 };
      }
      if (visualWorld.includes('washi') || materialBehavior.includes('washi') || visualWorld.includes('japan')) {
        return { type: 'handmade-washi', texture: 'mulberry fiber washi', finish: 'deckled', color: node?.color || '#F8F5EE', opacity: 0.95 };
      }
      if (visualWorld.includes('parchment') || visualWorld.includes('archival') || visualWorld.includes('herbarium')) {
        return { type: 'paper', texture: 'aged archival cotton rag paper', finish: 'raw', color: node?.color || '#F2ECE4', opacity: 1.0 };
      }
      if (visualWorld.includes('film') || visualWorld.includes('polaroid') || visualWorld.includes('darkroom')) {
        return { type: 'cardstock', texture: 'matte photo board substrate', finish: 'matte', color: node?.color || '#1A1A1C', opacity: 1.0 };
      }
      return { type: 'cardstock', texture: 'tactile heavy stock', finish: 'matte', color: node?.color || '#FAF7F2', opacity: 1.0 };

    case 'CUTOUT_OBJECT':
      return {
        type: 'pressed-specimen',
        texture: 'tangible dimensional specimen with physical edge relief',
        finish: 'raw',
        opacity: node?.opacity ?? 1.0,
      };

    case 'IMAGE_FRAGMENT':
      return {
        type: 'film',
        texture: 'photographic emulsion on cut paper backing',
        finish: 'matte',
        opacity: node?.opacity ?? 0.98,
      };

    case 'ANNOTATION':
      return {
        type: 'paper',
        texture: 'letterpress catalog label on bond strip',
        finish: 'deckled',
        color: node?.color || '#2A2A2E',
        opacity: 0.95,
      };

    case 'HANDMARK':
      return {
        type: 'tape',
        texture: 'translucent washi tape with adhesive fiber grain',
        finish: 'translucent',
        color: '#E8E2D4',
        opacity: 0.85,
      };

    case 'GRAPHIC_SHAPE':
      return {
        type: 'paper',
        texture: 'dyed cardstock geometric silhouette',
        finish: 'matte',
        color: node?.surface && node.surface !== 'none' ? node.surface : node?.color || '#E5DFD7',
        opacity: node?.opacity ?? 0.9,
      };

    case 'FRAME':
      return {
        type: 'cardstock',
        texture: 'beveled archival mat board',
        finish: 'raw',
        color: '#EFEAE2',
        opacity: 1.0,
      };

    case 'TYPOGRAPHY':
      return {
        type: 'ink',
        texture: 'letterpress pigment ink with microscopic edge absorption',
        finish: 'matte',
        color: node?.color || '#121214',
        opacity: 1.0,
      };

    case 'LOGO':
      return {
        type: 'ink',
        texture: 'precision foil or press mark',
        finish: 'matte',
        color: node?.color || '#000000',
        opacity: 1.0,
      };

    case 'SUBJECT':
    case 'DECORATIVE_ELEMENT':
    case 'TEXTURE':
    default:
      return {
        type: 'natural-fiber',
        texture: 'tactile physical texture',
        finish: 'textured',
        opacity: node?.opacity ?? 1.0,
      };
  }
}

/**
 * Derives the appropriate edge character for an element.
 */
export function deriveEdgeCharacter(
  role: VisualArtifactSemanticRole,
  concept: GraphicDesignConcept | ReferenceAwareConcept,
  node?: DesignNode
): VisualArtifactEdgeCharacter {
  const visualWorld = ((concept as ReferenceAwareConcept).visualWorld || '').toLowerCase();
  const materialBehavior = (concept.materialBehavior || '').toLowerCase();

  if (role === 'SUBSTRATE') {
    return visualWorld.includes('deckled') || materialBehavior.includes('deckled') ? 'deckled' : 'clean';
  }
  if (role === 'CUTOUT_OBJECT') {
    return visualWorld.includes('torn') ? 'torn' : 'rough';
  }
  if (role === 'IMAGE_FRAGMENT') {
    return visualWorld.includes('torn') || materialBehavior.includes('torn') ? 'torn' : 'clean';
  }
  if (role === 'HANDMARK') {
    return 'tape-bound';
  }
  if (role === 'ANNOTATION') {
    return 'clean';
  }
  if (role === 'GRAPHIC_SHAPE' || role === 'FRAME') {
    return 'geometric';
  }
  return 'clean';
}

/**
 * Calculates optical visual mass (0.0 to 1.0) based on bounds, opacity, and role prominence.
 */
export function calculateVisualMass(
  bounds: { width: number; height: number },
  role: VisualArtifactSemanticRole,
  opacity = 1.0
): number {
  const area = bounds.width * bounds.height;
  let roleMultiplier = 1.0;
  switch (role) {
    case 'SUBJECT':
    case 'CUTOUT_OBJECT':
      roleMultiplier = 1.5;
      break;
    case 'TYPOGRAPHY':
      roleMultiplier = 1.3;
      break;
    case 'LOGO':
      roleMultiplier = 1.1;
      break;
    case 'SUBSTRATE':
      roleMultiplier = 0.4;
      break;
    case 'ANNOTATION':
    case 'HANDMARK':
      roleMultiplier = 0.8;
      break;
    default:
      roleMultiplier = 1.0;
  }
  return Number(Math.min(1.0, Math.max(0.01, Math.sqrt(area) * roleMultiplier * opacity)).toFixed(3));
}

/**
 * Discovers spatial and semantic relationships between visual artifact elements dynamically.
 * Encodes no rigid templates.
 */
export function discoverVisualArtifactRelationships(
  elements: VisualArtifactElement[]
): VisualArtifactRelationship[] {
  const allRelationships: VisualArtifactRelationship[] = [];

  // Determine coordinate space (pixel vs normalized 0..1)
  const isPixelSpace = elements.some(
    (e) => e.intrinsicBounds.width > 1.5 || e.intrinsicBounds.height > 1.5
  );
  const scaleNorm = isPixelSpace ? 1080 : 1.0;

  for (let i = 0; i < elements.length; i++) {
    const a = elements[i];
    if (!Array.isArray(a.relationships)) a.relationships = [];

    const aLeft = a.intrinsicBounds.x / (isPixelSpace ? scaleNorm : 1);
    const aRight = (a.intrinsicBounds.x + a.intrinsicBounds.width) / (isPixelSpace ? scaleNorm : 1);
    const aTop = a.intrinsicBounds.y / (isPixelSpace ? scaleNorm : 1);
    const aBottom = (a.intrinsicBounds.y + a.intrinsicBounds.height) / (isPixelSpace ? scaleNorm : 1);

    for (let j = 0; j < elements.length; j++) {
      if (i === j) continue;
      const b = elements[j];

      const bLeft = b.intrinsicBounds.x / (isPixelSpace ? scaleNorm : 1);
      const bRight = (b.intrinsicBounds.x + b.intrinsicBounds.width) / (isPixelSpace ? scaleNorm : 1);
      const bTop = b.intrinsicBounds.y / (isPixelSpace ? scaleNorm : 1);
      const bBottom = (b.intrinsicBounds.y + b.intrinsicBounds.height) / (isPixelSpace ? scaleNorm : 1);

      const isIntersecting =
        aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;

      const aContainsB =
        aLeft <= bLeft + 0.02 && aRight >= bRight - 0.02 && aTop <= bTop + 0.02 && aBottom >= bBottom - 0.02;

      const bContainsA =
        bLeft <= aLeft + 0.02 && bRight >= aRight - 0.02 && bTop <= aTop + 0.02 && bBottom >= aBottom - 0.02;

      // 1. Layering relationships (behind / inFront)
      if (a.depth < b.depth && (isIntersecting || a.semanticRole === 'SUBSTRATE')) {
        const rel: VisualArtifactRelationship = { targetId: b.id, relationshipType: 'behind', type: 'behind', rationale: `${a.semanticRole} sits beneath ${b.semanticRole}` };
        a.relationships.push(rel);
        allRelationships.push(rel);
      } else if (a.depth > b.depth && isIntersecting) {
        const rel: VisualArtifactRelationship = { targetId: b.id, relationshipType: 'inFront', type: 'inFront', rationale: `${a.semanticRole} layers above ${b.semanticRole}` };
        a.relationships.push(rel);
        allRelationships.push(rel);
      }

      // 2. Containment & Framing
      if (aContainsB && a.id !== b.id) {
        if (a.semanticRole === 'FRAME' || a.semanticRole === 'GRAPHIC_SHAPE') {
          const rel: VisualArtifactRelationship = { targetId: b.id, relationshipType: 'frames', type: 'frames', rationale: `${a.semanticRole} physically frames ${b.semanticRole}` };
          a.relationships.push(rel);
          allRelationships.push(rel);
        } else {
          const rel: VisualArtifactRelationship = { targetId: b.id, relationshipType: 'contains', type: 'contains', rationale: `${a.semanticRole} encloses ${b.semanticRole}` };
          a.relationships.push(rel);
          allRelationships.push(rel);
        }
      }

      // 3. Crossing & Intersection
      if (isIntersecting && !aContainsB && !bContainsA) {
        if (a.semanticRole === 'TYPOGRAPHY' && (b.semanticRole === 'SUBJECT' || b.semanticRole === 'CUTOUT_OBJECT' || b.semanticRole === 'IMAGE_FRAGMENT')) {
          const rel: VisualArtifactRelationship = { targetId: b.id, relationshipType: 'crosses', type: 'crosses', rationale: `Typography intentionally traverses ${b.semanticRole}` };
          a.relationships.push(rel);
          allRelationships.push(rel);
        } else {
          const rel: VisualArtifactRelationship = { targetId: b.id, relationshipType: 'intersects', type: 'intersects', rationale: `${a.semanticRole} intersects ${b.semanticRole}` };
          a.relationships.push(rel);
          allRelationships.push(rel);
        }
      }

      // 4. Anchoring
      if (
        (a.semanticRole === 'LOGO' || a.semanticRole === 'ANNOTATION' || a.semanticRole === 'HANDMARK') &&
        !isIntersecting
      ) {
        const dx = Math.abs(aLeft - bLeft);
        const dy = Math.abs(aBottom - bTop);
        if (dx < 0.25 || dy < 0.25) {
          const rel: VisualArtifactRelationship = { targetId: b.id, relationshipType: 'anchors', type: 'anchors', rationale: `${a.semanticRole} anchors ${b.semanticRole}` };
          a.relationships.push(rel);
          allRelationships.push(rel);
        }
      }

      // 5. Optical Balancing
      const aCenterX = aLeft + (aRight - aLeft) / 2;
      const bCenterX = bLeft + (bRight - bLeft) / 2;
      const aCenterY = aTop + (aBottom - aTop) / 2;
      const bCenterY = bTop + (bBottom - bTop) / 2;
      const isOpposingQuarter =
        (aCenterX < 0.5 && bCenterX > 0.5) ||
        (aCenterY < 0.5 && bCenterY > 0.5);

      if (isOpposingQuarter && Math.abs(a.visualMass - b.visualMass) < 0.4 && a.visualMass > 0.1) {
        const rel: VisualArtifactRelationship = { targetId: b.id, relationshipType: 'balances', type: 'balances', rationale: `${a.semanticRole} balances optical mass of ${b.semanticRole}` };
        a.relationships.push(rel);
        allRelationships.push(rel);
      }

      // 6. Semantic Grouping
      if (
        (a.semanticRole === 'TYPOGRAPHY' && b.semanticRole === 'TYPOGRAPHY') ||
        (a.semanticRole === 'CUTOUT_OBJECT' && b.semanticRole === 'CUTOUT_OBJECT') ||
        (a.semanticRole === 'IMAGE_FRAGMENT' && b.semanticRole === 'IMAGE_FRAGMENT') ||
        (a.semanticRole === 'ANNOTATION' && b.semanticRole === 'TYPOGRAPHY')
      ) {
        const dist = Math.sqrt(Math.pow(aCenterX - bCenterX, 2) + Math.pow(aCenterY - bCenterY, 2));
        if (dist < 0.45) {
          const rel: VisualArtifactRelationship = { targetId: b.id, relationshipType: 'groupsWith', type: 'groupsWith', rationale: `${a.semanticRole} clusters with sibling ${b.semanticRole}` };
          a.relationships.push(rel);
          allRelationships.push(rel);
        }
      }

      // 7. Material & Scale Contrast
      if (
        (a.semanticRole === 'TYPOGRAPHY' && b.semanticRole === 'TYPOGRAPHY' && Math.abs(a.scale - b.scale) > 1.5) ||
        (a.material?.type !== b.material?.type && isIntersecting)
      ) {
        const rel: VisualArtifactRelationship = { targetId: b.id, relationshipType: 'contrastsWith', type: 'contrastsWith', rationale: `${a.semanticRole} establishes tactile contrast with ${b.semanticRole}` };
        a.relationships.push(rel);
        allRelationships.push(rel);
      }
    }
  }

  return allRelationships;
}

/**
 * Builds a complete VisualArtifactComposition model from the design state.
 */
export function buildVisualArtifactComposition(options: BuildVisualArtifactOptions): VisualArtifactComposition {
  const { concept = {}, realizationPlan, nodes = [], copy = [], logo, products = [], canvas } = options;
  const elements: VisualArtifactElement[] = [];

  const cWidth = canvas?.width || options.canvasWidth || 1080;
  const cHeight = canvas?.height || options.canvasHeight || 1080;
  const canvasBounds = { width: cWidth, height: cHeight };

  // 1. Substrate Element (Base Depth Plane: 0)
  elements.push({
    id: 'base-substrate',
    semanticRole: 'SUBSTRATE',
    intrinsicBounds: { x: 0, y: 0, width: cWidth, height: cHeight },
    visualMass: 0.15,
    material: deriveMaterialProperties('SUBSTRATE', concept, realizationPlan),
    depth: 0,
    rotation: 0,
    scale: 1.0,
    opacity: 1.0,
    edgeCharacter: deriveEdgeCharacter('SUBSTRATE', concept),
    visualWeight: 10,
    relationships: [],
    interactionMode: 'underlay',
  });

  // 2. Map nodes to semantic visual artifact elements
  for (const node of nodes) {
    if (!node) continue;

    let semanticRole: VisualArtifactSemanticRole = 'GRAPHIC_SHAPE';
    let depth = 10;
    let interactionMode: VisualArtifactInteractionMode = 'overlay';

    if (node.kind === 'visual') {
      semanticRole = 'SUBJECT';
      depth = 5;
      interactionMode = 'underlay';
    } else if (node.kind === 'product') {
      semanticRole = products.length > 1 || node.surface === 'cutout' ? 'CUTOUT_OBJECT' : 'SUBJECT';
      depth = 15;
      interactionMode = 'physical-mount';
    } else if (node.kind === 'copy') {
      const isAnnotation = node.id.includes('secondary') || node.id.includes('supporting') || node.id.includes('annotation') || node.id.includes('label') || node.surface === 'label' || (node.fontScale && node.fontScale < 1.2);
      semanticRole = isAnnotation ? 'ANNOTATION' : 'TYPOGRAPHY';
      depth = isAnnotation ? 30 : 40;
      interactionMode = isAnnotation ? 'diegetic-label' : 'overlay';
    } else if (node.kind === 'logo') {
      semanticRole = 'LOGO';
      depth = 45;
      interactionMode = 'anchored';
    } else if (node.kind === 'shape') {
      if (node.id.includes('frame') || node.surface === 'frame' || (node.width > 0.8 * cWidth)) {
        semanticRole = 'FRAME';
        depth = 8;
        interactionMode = 'overlay';
      } else if (node.id.includes('tape') || node.id.includes('stamp') || node.id.includes('handmark')) {
        semanticRole = 'HANDMARK';
        depth = 35;
        interactionMode = 'physical-mount';
      } else {
        semanticRole = 'GRAPHIC_SHAPE';
        depth = 12;
        interactionMode = 'overlay';
      }
    }

    const bounds = {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    };

    const visualMass = calculateVisualMass(
      { x: bounds.x / cWidth, y: bounds.y / cHeight, width: bounds.width / cWidth, height: bounds.height / cHeight },
      semanticRole,
      node.opacity ?? 1.0
    );
    const material = deriveMaterialProperties(semanticRole, concept, realizationPlan, node);
    const edgeCharacter = deriveEdgeCharacter(semanticRole, concept, node);

    elements.push({
      id: node.id,
      semanticRole,
      intrinsicBounds: bounds,
      visualMass,
      material,
      depth: node.zIndex !== undefined ? node.zIndex : depth,
      rotation: node.rotation ?? 0,
      scale: node.fontScale ? Number((node.fontScale).toFixed(2)) : 1.0,
      opacity: node.opacity ?? 1.0,
      edgeCharacter,
      texture: material.texture,
      visualWeight: Math.round(visualMass * 100),
      relationships: [],
      interactionMode,
    });
  }

  // 3. Discover dynamic relationships
  const relationships = discoverVisualArtifactRelationships(elements);

  // 4. Calculate material & layer hierarchy
  const depthPlaneCount = new Set(elements.map((e) => e.depth)).size;
  const materialHierarchy = [...new Set(elements.map((e) => e.material?.type).filter((t): t is string => Boolean(t)))];
  const layerHierarchy = [...elements].sort((a, b) => a.depth - b.depth).map((e) => `${e.depth}:${e.id}(${e.semanticRole})`);

  // Depth plane categorization
  const depthPlanes: any = {
    background: elements.filter((e) => e.depth <= 1),
    midground: elements.filter((e) => e.depth > 1 && e.depth <= 3),
    foreground: elements.filter((e) => e.depth > 3),
    count: depthPlaneCount,
  };

  // 5. Calculate optical balance score across quadrants
  let leftMass = 0;
  let rightMass = 0;
  let totalMass = 0;
  let sumWeightedX = 0;
  let sumWeightedY = 0;

  for (const el of elements) {
    const normX = el.intrinsicBounds.x / cWidth;
    const normY = el.intrinsicBounds.y / cHeight;
    const normW = el.intrinsicBounds.width / cWidth;
    const normH = el.intrinsicBounds.height / cHeight;
    const centerX = normX + normW / 2;
    const centerY = normY + normH / 2;

    if (centerX < 0.5) leftMass += el.visualMass;
    else rightMass += el.visualMass;

    totalMass += el.visualMass;
    sumWeightedX += centerX * el.visualMass;
    sumWeightedY += centerY * el.visualMass;
  }

  const balanceDelta = totalMass > 0 ? Math.abs(leftMass - rightMass) / totalMass : 0;
  const opticalBalanceScore = Number((1.0 - balanceDelta).toFixed(3));
  const centerOfMass = totalMass > 0
    ? { x: Number((sumWeightedX / totalMass).toFixed(3)), y: Number((sumWeightedY / totalMass).toFixed(3)) }
    : { x: 0.5, y: 0.5 };
  const editorialTension = Number(Math.abs(centerOfMass.x - 0.5) + Math.abs(centerOfMass.y - 0.5)).toFixed(3);

  const opticalBalance = {
    centerOfMass,
    editorialTension: Number(editorialTension),
  };

  const discoveredRelationshipsCount = elements.reduce((acc, e) => acc + e.relationships.length, 0);

  return {
    elements,
    materialHierarchy,
    layerHierarchy,
    depthPlanes,
    opticalBalanceScore,
    discoveredRelationshipsCount,
    canvasBounds,
    relationships,
    depthPlaneMap: depthPlanes,
    opticalBalance,
  };
}
