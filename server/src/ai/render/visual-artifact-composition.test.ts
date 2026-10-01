import { describe, it, expect } from 'vitest';
import {
  buildVisualArtifactComposition,
  discoverVisualArtifactRelationships,
} from './visual-artifact-composition';
import type { DesignNode } from './designer-composition';
import type { GraphicDesignConcept } from '../brand/creative-brief';
import type { CreativeRealizationContract } from '../intent/creative-realization-contract';
import type { CanvasRepresentation } from './design-representation';

describe('Visual Artifact Composition Model', () => {
  const canvas: CanvasRepresentation = {
    width: 1080,
    height: 1080,
    safeZone: { x: 80, y: 80, width: 920, height: 920 },
    aspectRatio: '1:1',
    surfaceTreatment: 'linen-paper',
  };

  const sampleNodes: DesignNode[] = [
    {
      id: 'bg-visual-1',
      kind: 'visual',
      x: 0,
      y: 0,
      width: 1080,
      height: 1080,
      color: '#ffffff',
      surface: 'paper',
      fontScale: 1,
      align: 'left',
      shape: 'rectangle',
      lines: [],
      zIndex: 0,
    },
    {
      id: 'specimen-cutout',
      kind: 'product',
      x: 150,
      y: 200,
      width: 400,
      height: 500,
      color: '#334155',
      surface: 'cutout',
      fontScale: 1,
      align: 'left',
      shape: 'rectangle',
      lines: [],
      zIndex: 2,
    },
    {
      id: 'headline-1',
      kind: 'copy',
      x: 350,
      y: 250,
      width: 600,
      height: 180,
      color: '#0f172a',
      surface: 'typography',
      fontScale: 2.2,
      align: 'left',
      shape: 'rectangle',
      lines: ['Botanical Specimen No. 04'],
      zIndex: 3,
    },
    {
      id: 'annotation-label',
      kind: 'copy',
      x: 180,
      y: 680,
      width: 320,
      height: 60,
      color: '#475569',
      surface: 'label',
      fontScale: 0.9,
      align: 'left',
      shape: 'rectangle',
      lines: ['Fig. 1.1 — Hand-harvested Rosa Damascena'],
      zIndex: 4,
    },
    {
      id: 'frame-border',
      kind: 'shape',
      x: 80,
      y: 80,
      width: 920,
      height: 920,
      color: '#cbd5e1',
      surface: 'frame',
      fontScale: 1,
      align: 'left',
      shape: 'rectangle',
      lines: [],
      zIndex: 1,
    },
    {
      id: 'logo-mark',
      kind: 'logo',
      x: 880,
      y: 920,
      width: 120,
      height: 60,
      color: '#0f172a',
      surface: 'logo',
      fontScale: 1,
      align: 'right',
      shape: 'rectangle',
      lines: [],
      zIndex: 5,
    },
  ];

  const sampleConcept: GraphicDesignConcept = {
    id: 'concept-botanical-archive',
    name: 'Diwali as Botanical Archive',
    conceptName: 'Diwali as Botanical Archive',
    creativeMechanism: 'Archival specimen taxonomy with tactile material layering',
    dominantVisualObject: 'Pressed botanical flora and artisanal terracotta elements',
    hero: 'image',
    imageRole: 'floating-fragment',
    spatialRelationship: 'Subject specimen anchored left with typographic annotation crossing right',
    typeBehavior: 'Crisp editorial taxonomy labeling',
    imageBehavior: 'Tactile cutout with soft physical shadow',
    compositionFamily: 'archival-grid',
  };

  const sampleContract: CreativeRealizationContract = {
    conceptName: 'Diwali as Botanical Archive',
    creativeMechanism: 'Archival specimen taxonomy with tactile material layering',
    dominantVisualObject: 'Pressed botanical flora and artisanal terracotta elements',
    hero: 'image',
    imageRole: 'floating-fragment',
    spatialRelationship: 'Subject specimen anchored left with typographic annotation crossing right',
    typeBehavior: 'Crisp editorial taxonomy labeling',
    imageBehavior: 'Tactile cutout with soft physical shadow',
    compositionFamily: 'archival-grid',
    requiredClaims: ['100% Organic Extracts'],
    requiredVisualMechanics: ['DOMINANT_OBJECT:Pressed botanical flora'],
    prohibitedVisualInterpretations: ['Generic CGI render', 'Canva template card'],
    requiredVisualProof: [
      'physical paper substrate',
      'botanical specimen cutout',
      'archival taxonomic labels',
    ],
    strictness: 'STRICT',
    requirements: [],
    imageGenerationRequirements: [],
    downstreamRequirements: [],
    hardRequirements: [],
    softPreferences: [],
  };

  it('builds a generalized visual-artifact composition model with rich semantic roles', () => {
    const composition = buildVisualArtifactComposition({
      canvas,
      nodes: sampleNodes,
      concept: sampleConcept,
      contract: sampleContract,
    });

    expect(composition).toBeDefined();
    expect(composition.canvasBounds).toEqual({ width: 1080, height: 1080 });
    expect(composition.elements.length).toBe(sampleNodes.length + 1); // sampleNodes + base substrate

    // Verify semantic roles assigned dynamically
    const roles = composition.elements.map((e) => e.semanticRole);
    expect(roles).toContain('SUBSTRATE');
    expect(roles).toContain('CUTOUT_OBJECT');
    expect(roles).toContain('TYPOGRAPHY');
    expect(roles).toContain('ANNOTATION');
    expect(roles).toContain('FRAME');
    expect(roles).toContain('LOGO');
  });

  it('dynamically discovers spatial and semantic relationships without hardcoded templates', () => {
    const composition = buildVisualArtifactComposition({
      canvas,
      nodes: sampleNodes,
      concept: sampleConcept,
      contract: sampleContract,
    });

    expect(composition.relationships.length).toBeGreaterThan(0);

    const relTypes = composition.relationships.map((r) => r.relationshipType);

    // Frame contains elements
    expect(relTypes).toContain('contains');

    // Headline intersects or crosses the specimen cutout
    expect(relTypes.some((t) => t === 'intersects' || t === 'crosses' || t === 'inFront' || t === 'groupsWith')).toBe(true);

    // Substrate sits behind visual elements
    expect(relTypes).toContain('behind');

    // Grouping relationships exist for annotations and type
    expect(relTypes).toContain('groupsWith');
  });

  it('derives material hierarchy and depth planes credibly', () => {
    const composition = buildVisualArtifactComposition({
      canvas,
      nodes: sampleNodes,
      concept: sampleConcept,
      contract: sampleContract,
    });

    expect(composition.materialHierarchy).toBeDefined();
    expect(composition.materialHierarchy.length).toBeGreaterThan(0);

    expect(composition.depthPlanes).toBeDefined();
    expect(composition.depthPlanes.background.length).toBeGreaterThan(0);
    expect(composition.depthPlanes.foreground.length).toBeGreaterThan(0);

    // Check optical balance and editorial tension
    expect(composition.opticalBalance).toBeDefined();
    expect(composition.opticalBalance.centerOfMass.x).toBeGreaterThan(0);
    expect(composition.opticalBalance.centerOfMass.y).toBeGreaterThan(0);
    expect(typeof composition.opticalBalance.editorialTension).toBe('number');
  });

  it('supports stand-alone relationship discovery between arbitrary elements', () => {
    const elements = [
      {
        id: 'box-a',
        semanticRole: 'CUTOUT_OBJECT' as const,
        intrinsicBounds: { x: 100, y: 100, width: 300, height: 300 },
        visualMass: 0.3,
        material: 'deckle-edge-paper' as const,
        depth: 1,
        rotation: 0,
        scale: 1,
        opacity: 1,
        edgeCharacter: 'rough-cut' as const,
        texture: 'textured',
        visualWeight: 0.7,
        relationships: [],
        interactionMode: 'pass-through' as const,
      },
      {
        id: 'box-b',
        semanticRole: 'TYPOGRAPHY' as const,
        intrinsicBounds: { x: 250, y: 200, width: 400, height: 100 },
        visualMass: 0.2,
        material: 'printed-ink' as const,
        depth: 2,
        rotation: 0,
        scale: 1,
        opacity: 1,
        edgeCharacter: 'clean' as const,
        texture: 'smooth',
        visualWeight: 0.8,
        relationships: [],
        interactionMode: 'mask-intersect' as const,
      },
    ];

    const relationships = discoverVisualArtifactRelationships(elements);
    expect(relationships.length).toBeGreaterThan(0);
    expect(relationships.some((r) => r.relationshipType === 'crosses' || r.relationshipType === 'intersects')).toBe(true);
    expect(relationships.some((r) => r.relationshipType === 'inFront')).toBe(true);
  });
});
