import { describe, it, expect } from 'vitest';
import {
  resolveTextImageRelationshipMode,
  evaluateTextImageRelationship,
  TEXT_IMAGE_RELATIONSHIP_CALIBRATION,
} from './text-image-relationship';
import { createDesignField } from '../render/design-representation';
import type { ImageField } from '../render/image-field';

function createMockField(options?: {
  focalCentroid?: { x: number; y: number };
  subjectBox?: { x: number; y: number; width: number; height: number };
  meanLuminance?: number;
  localVariance?: number;
  occupancyValue?: number;
}) {
  const focalCentroid = options?.focalCentroid || { x: 0.5, y: 0.5 };
  const subjectBox = options?.subjectBox || { x: 0.3, y: 0.3, width: 0.4, height: 0.4 };
  const meanLuminance = options?.meanLuminance ?? 0.5;
  const occupancyValue = options?.occupancyValue ?? 0.05;

  const cols = 10;
  const rows = 10;
  const luminance = new Float32Array(cols * rows).fill(meanLuminance);
  const energy = new Float32Array(cols * rows).fill(0.1);
  const occupancy = new Float32Array(cols * rows).fill(occupancyValue);

  const imageField: ImageField = {
    sourceWidth: 1080,
    sourceHeight: 1080,
    aspectRatio: 1.0,
    grid: {
      cols,
      rows,
      cellWidth: 108,
      cellHeight: 108,
      luminance,
      energy,
      occupancy,
    },
    occupancyGrid: occupancy,
    meanLuminance,
    luminanceVariance: options?.localVariance ?? 0.05,
    meanEnergy: 0.1,
    maxEnergy: 0.3,
    subjectBox,
    focalCentroid,
    quietRects: [
      { x: 0.05, y: 0.05, width: 0.9, height: 0.25 },
      { x: 0.05, y: 0.70, width: 0.9, height: 0.25 },
    ],
    paletteHues: ['#222222', '#f0f0f0'],
    toneAt: (rect) => ({ meanLuminance, stdDev: 0.05, verdict: 'light' as const }),
    busynessAt: (rect) => 0.1,
    occlusionOf: (rect) => occupancyValue,
    occupancyAt: (rect) => occupancyValue,
    occupancyMass: (rect) => occupancyValue,
    spatialField: {
      focalCentroid,
      dominantSubjectBounds: subjectBox,
      readingSpaceContinuity: 0.9,
      occupancyConcentration: 0.3,
      occupancyAt: (rect) => occupancyValue,
      busynessAt: (rect) => 0.1,
      toneAt: (rect) => ({ meanLuminance, stdDev: 0.05, verdict: 'light' as const }),
      findCandidateReadingRegions: () => [
        {
          rect: { x: 0.05, y: 0.05, width: 0.9, height: 0.25 },
          area: 0.225,
          meanOccupancy: occupancyValue,
          meanBusyness: 0.1,
          meanLuminance,
          luminanceStdDev: 0.05,
          focalDistance: 0.4,
          aspectRatio: 3.6,
          calmScore: 0.9,
          copyCapacityScore: 0.9,
          anchor: 'top-left' as const,
        },
      ],
      scoreCandidateRegion: () => ({
        compositeScore: 0.9,
        calmScore: 0.9,
        capacityScore: 0.9,
        focalSeparationScore: 0.9,
        aspectSuitability: 0.9,
      }),
    },
  };

  return createDesignField(imageField);
}

describe('Text–Image Composition Intelligence', () => {
  describe('1. Mode Derivation & Semantic Justification', () => {
    it('derives SEPARATED for typography-hero or small tactile object concepts', () => {
      const res = resolveTextImageRelationshipMode(
        { hero: 'typography', creativeMechanism: 'pure editorial hierarchy' } as any,
        { imageRole: 'small-tactile-object' } as any
      );
      expect(res.mode).toBe('SEPARATED');
      expect(res.justification).toContain('Typography is hero');
    });

    it('derives MATERIAL_INTERACTION for physical material crossing typography', () => {
      const res = resolveTextImageRelationshipMode({
        creativeMechanism: 'linen fabric casting soft shadow across the typography',
      } as any);
      expect(res.mode).toBe('MATERIAL_INTERACTION');
      expect(res.justification).toContain('physical material');
    });

    it('derives BOUNDARY_INTERACTION for split / threshold crossings', () => {
      const res = resolveTextImageRelationshipMode({
        creativeMechanism: 'split canvas threshold straddle between editorial and scene',
      } as any);
      expect(res.mode).toBe('BOUNDARY_INTERACTION');
    });

    it('derives CONTAINED for masked or aperture concepts', () => {
      const res = resolveTextImageRelationshipMode({
        creativeMechanism: 'imagery contained inside massive letterform apertures',
        imageRole: 'contained-image',
      } as any);
      expect(res.mode).toBe('CONTAINED');
    });

    it('derives EMBEDDED for diegetic / physical text in scene', () => {
      const res = resolveTextImageRelationshipMode({
        creativeMechanism: 'diegetic brand name engraved into tactile stone',
      } as any);
      expect(res.mode).toBe('EMBEDDED');
    });

    it('derives JUXTAPOSED for contrasting dual spatial dialogue', () => {
      const res = resolveTextImageRelationshipMode({
        creativeMechanism: 'bold contrast juxtaposition between raw texture and minimal type',
      } as any);
      expect(res.mode).toBe('JUXTAPOSED');
    });

    it('derives OVERLAY_INTENTIONAL as default editorial overlay', () => {
      const res = resolveTextImageRelationshipMode({
        creativeMechanism: 'direct storytelling with quiet negative space',
      } as any);
      expect(res.mode).toBe('OVERLAY_INTENTIONAL');
    });
  });

  describe('2. Secondary Copy Collision & Subject Protection', () => {
    it('flags secondary copy sitting on subject focal core as accidental collision', () => {
      const field = createMockField({ occupancyValue: 0.85 });

      const state = evaluateTextImageRelationship({
        elements: [
          { id: 'headline', role: 'headline', rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.15 }, fontScale: 0.08 },
          { id: 'support', role: 'subheadline', rect: { x: 0.2, y: 0.5, width: 0.6, height: 0.10 }, fontScale: 0.04 },
        ],
        field,
        concept: { creativeMechanism: 'editorial overlay' } as any,
      });

      expect(state.evidence.isAccidentalCollision).toBe(true);
      expect(state.legibilityRisk).toBe('CRITICAL');
      const supportInteraction = state.evidence.elements.find((e) => e.elementId === 'support');
      expect(supportInteraction?.isCollision).toBe(true);
    });

    it('rewards non-colliding secondary copy in quiet regions', () => {
      const field = createMockField({ occupancyValue: 0.05 });

      const state = evaluateTextImageRelationship({
        elements: [
          { id: 'headline', role: 'headline', rect: { x: 0.08, y: 0.08, width: 0.8, height: 0.15 }, fontScale: 0.08 },
          { id: 'support', role: 'subheadline', rect: { x: 0.08, y: 0.25, width: 0.6, height: 0.08 }, fontScale: 0.04 },
        ],
        field,
        concept: { creativeMechanism: 'editorial overlay' } as any,
      });

      expect(state.evidence.isAccidentalCollision).toBe(false);
      expect(state.legibilityRisk).toBe('LOW');
      expect(state.relationshipHarmonyScore).toBeGreaterThan(0.80);
    });
  });

  describe('3. Joint Multi-Element Relational Reasoning (Headline, Support, CTA, Logo)', () => {
    it('evaluates complete 4-element hierarchy with clear visual dominance', () => {
      const field = createMockField({ occupancyValue: 0.05 });

      const state = evaluateTextImageRelationship({
        elements: [
          { id: 'headline', role: 'headline', rect: { x: 0.08, y: 0.08, width: 0.8, height: 0.16 }, fontScale: 0.08 },
          { id: 'support', role: 'subheadline', rect: { x: 0.08, y: 0.26, width: 0.6, height: 0.08 }, fontScale: 0.04 },
          { id: 'cta', role: 'cta', rect: { x: 0.08, y: 0.36, width: 0.3, height: 0.06 }, fontScale: 0.03 },
          { id: 'brand-mark', role: 'logo', rect: { x: 0.80, y: 0.08, width: 0.12, height: 0.06 } },
        ],
        field,
        concept: { creativeMechanism: 'editorial overlay' } as any,
      });

      expect(state.visualHierarchyImpact.primaryFocalElement).toBe('headline');
      expect(state.visualHierarchyImpact.hierarchyClarityScore).toBeGreaterThanOrEqual(0.85);
      expect(state.visualHierarchyImpact.readingOrderCoherence).toBe(1.0);
    });

    it('penalizes inverted hierarchy when support or CTA overwhelms headline', () => {
      const field = createMockField({ occupancyValue: 0.05 });

      const state = evaluateTextImageRelationship({
        elements: [
          { id: 'headline', role: 'headline', rect: { x: 0.08, y: 0.08, width: 0.8, height: 0.05 }, fontScale: 0.03 },
          { id: 'support', role: 'subheadline', rect: { x: 0.08, y: 0.20, width: 0.8, height: 0.20 }, fontScale: 0.09 },
        ],
        field,
        concept: { creativeMechanism: 'editorial overlay' } as any,
      });

      expect(state.visualHierarchyImpact.hierarchyClarityScore).toBeLessThan(0.70);
    });
  });

  describe('4. Context Responsiveness', () => {
    it('adjusts tolerance when concept intentionally declares material interaction', () => {
      const field = createMockField({ occupancyValue: 0.40 });

      // Same image, editorial concept -> collision
      const stateEditorial = evaluateTextImageRelationship({
        elements: [
          { id: 'headline', role: 'headline', rect: { x: 0.1, y: 0.4, width: 0.8, height: 0.2 }, fontScale: 0.08 },
        ],
        field,
        concept: { creativeMechanism: 'clean negative space overlay' } as any,
      });

      // Same image, material interaction concept -> intentional overlap accepted
      const stateMaterial = evaluateTextImageRelationship({
        elements: [
          { id: 'headline', role: 'headline', rect: { x: 0.1, y: 0.4, width: 0.8, height: 0.2 }, fontScale: 0.08 },
        ],
        field,
        concept: { creativeMechanism: 'tangible fabric material crossing typography' } as any,
      });

      expect(stateEditorial.relationshipMode).toBe('OVERLAY_INTENTIONAL');
      expect(stateMaterial.relationshipMode).toBe('MATERIAL_INTERACTION');
      expect(stateMaterial.intentionalOverlap).toBe(true);
      expect(stateMaterial.relationshipHarmonyScore).toBeGreaterThan(stateEditorial.relationshipHarmonyScore);
    });

    it('maintains zero Category C template rules in calibration', () => {
      // Invariant: safety invariants must be bounded and positive
      expect(TEXT_IMAGE_RELATIONSHIP_CALIBRATION.safetyInvariants.maxAccidentalCoreOcclusion).toBeLessThanOrEqual(0.30);
      expect(TEXT_IMAGE_RELATIONSHIP_CALIBRATION.safetyInvariants.minHeadlineContrastFloor).toBeGreaterThan(0.20);
      
      // Mode tolerances must be ordered logically
      expect(TEXT_IMAGE_RELATIONSHIP_CALIBRATION.modeTolerances.SEPARATED).toBeLessThan(
        TEXT_IMAGE_RELATIONSHIP_CALIBRATION.modeTolerances.MATERIAL_INTERACTION
      );
    });
  });
});
