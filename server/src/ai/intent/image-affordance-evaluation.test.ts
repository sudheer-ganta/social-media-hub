import { describe, it, expect } from 'vitest';
import { evaluateImageAffordance, IMAGE_AFFORDANCE_CALIBRATION } from './image-affordance-evaluation';
import type { ImageField, FieldRect, ToneReading, QuietRect } from '../render/image-field';
import type { ImageRealizationSpec } from './image-realization-spec';

function createMockImageField(options: {
  quietOccupancy?: number;
  subjectOccupancy?: number;
  quietRects?: QuietRect[];
}): ImageField {
  const quietOcc = options.quietOccupancy ?? 0.05;
  const subjOcc = options.subjectOccupancy ?? 0.85;

  return {
    grid: {
      cols: 32,
      rows: 32,
      luminance: new Float32Array(1024).fill(0.5),
      energy: new Float32Array(1024).fill(0.1),
    },
    occupancyGrid: new Float32Array(1024),
    subjectBox: { x: 0.1, y: 0.5, width: 0.8, height: 0.45 },
    focalCentroid: { x: 0.5, y: 0.7 },
    quietRects: options.quietRects ?? [
      {
        x: 0.08,
        y: 0.06,
        width: 0.84,
        height: 0.35,
        quietness: 0.9,
        tone: { meanLuminance: 0.8, stdDev: 0.04, verdict: 'light' },
      },
      {
        x: 0.08,
        y: 0.65,
        width: 0.84,
        height: 0.25,
        quietness: 0.85,
        tone: { meanLuminance: 0.8, stdDev: 0.04, verdict: 'light' },
      },
    ],
    toneAt: (rect: FieldRect): ToneReading => {
      if (rect.y < 0.4 || rect.y > 0.6) {
        return { meanLuminance: 0.85, stdDev: 0.03, verdict: 'light' };
      }
      return { meanLuminance: 0.4, stdDev: 0.12, verdict: 'dark' };
    },
    occupancyAt: (rect: FieldRect): number => {
      if (rect.y < 0.4 || rect.y > 0.6) return quietOcc;
      return subjOcc;
    },
    occupancyMass: (rect: FieldRect): number => rect.width * rect.height * (rect.y < 0.4 || rect.y > 0.6 ? quietOcc : subjOcc),
    totalOccupancyMass: 0.45,
    occlusionOf: (rect: FieldRect): number => (rect.y >= 0.4 && rect.y <= 0.6 ? 0.6 : 0.05),
    busynessAt: (rect: FieldRect): number => (rect.y < 0.4 || rect.y > 0.6 ? 0.08 : 0.65),
  };
}

describe('ImageAffordanceEvaluation Suite', () => {
  it('correctly calculates reading regions, calm scores, and copy suitability from ImageField', () => {
    const mockImageField = createMockImageField({
      quietOccupancy: 0.05,
      subjectOccupancy: 0.8,
    });

    const spec: ImageRealizationSpec = {
      conceptName: 'Festive Diya Radiance',
      creativeMechanism: 'Shadow and warm light cast intricate shapes',
      dominantVisualObject: 'Handmade clay diya lamp',
      hero: 'image',
      imageRole: 'hero',
      imageBehavior: 'Full-bleed atmospheric ground',
      physicalMechanism: 'Directional light casting shadows',
      visualRelationship: 'Primary focal hero with negative space',
      referenceAssetRequirements: [],
      requiredVisualElements: ['Handmade clay diya lamp'],
      prohibitedVisualInterpretations: [],
      textRelationshipMode: 'FLOWPOST_MARKETING_TEXT',
      copyLoadProfile: 'PRIMARY_PLUS_SUPPORT',
      readingSpaceRequirement: 'MODERATE',
      textImageRelationship: 'OVERLAY_INTENTIONAL',
      compositionAffordanceRequirement: 'Provide an open, low-frequency calm region.',
    };

    const evaluation = evaluateImageAffordance(mockImageField, spec);

    expect(evaluation.passed).toBe(true);
    expect(evaluation.affordanceConfidence).toBeGreaterThan(0.7);
    expect(evaluation.copyLoadSuitability).toBe('EXCELLENT');
    expect(evaluation.readingRegionCount).toBeGreaterThan(0);
    expect(evaluation.strongestReadingRegions.length).toBeGreaterThan(0);
    expect(evaluation.strongestReadingRegions[0].calmScore).toBeGreaterThan(0.7);
    expect(evaluation.recommendation).toBe('PROCEED');
  });

  it('reports lower affordance and flags copyLoadSuitability when image is overwhelmingly crowded', () => {
    const crowdedImageField: ImageField = {
      grid: {
        cols: 32,
        rows: 32,
        luminance: new Float32Array(1024).fill(0.5),
        energy: new Float32Array(1024).fill(0.8),
      },
      occupancyGrid: new Float32Array(1024).fill(0.9),
      subjectBox: { x: 0, y: 0, width: 1, height: 1 },
      focalCentroid: { x: 0.5, y: 0.5 },
      quietRects: [],
      toneAt: (): ToneReading => ({ meanLuminance: 0.5, stdDev: 0.25, verdict: 'mixed' }),
      occupancyAt: (): number => 0.92,
      occupancyMass: (rect: FieldRect): number => rect.width * rect.height * 0.92,
      totalOccupancyMass: 0.92,
      occlusionOf: (): number => 0.9,
      busynessAt: (): number => 0.85,
    };

    const spec: ImageRealizationSpec = {
      conceptName: 'Crowded Bazaar Scene',
      creativeMechanism: 'Dense bustling market texture across full canvas',
      dominantVisualObject: 'Crowded bazaar',
      hero: 'image',
      imageRole: 'full-bleed',
      imageBehavior: 'Full-bleed atmospheric ground',
      physicalMechanism: 'Dense objects everywhere',
      visualRelationship: 'Full coverage',
      referenceAssetRequirements: [],
      requiredVisualElements: [],
      prohibitedVisualInterpretations: [],
      textRelationshipMode: 'FLOWPOST_MARKETING_TEXT',
      copyLoadProfile: 'MULTI_TEXT',
      readingSpaceRequirement: 'MULTI_REGION',
      textImageRelationship: 'OVERLAY_INTENTIONAL',
      compositionAffordanceRequirement: 'Multi-region negative space required.',
    };

    const evaluation = evaluateImageAffordance(crowdedImageField, spec);

    expect(evaluation.readingRegionCount).toBe(0);
    expect(evaluation.copyLoadSuitability).toBe('INSUFFICIENT');
    expect(evaluation.recommendation).toBe('REFINE_IMAGE_AFFORDANCE');
    expect(evaluation.passed).toBe(false);
  });

  it('exposes authoritative, testable IMAGE_AFFORDANCE_CALIBRATION configuration', () => {
    expect(IMAGE_AFFORDANCE_CALIBRATION.safetyInvariants.minCalmScoreFloor).toBe(0.20);
    expect(IMAGE_AFFORDANCE_CALIBRATION.safetyInvariants.maxClutteredOccupancyMass).toBe(0.85);
    expect(IMAGE_AFFORDANCE_CALIBRATION.signalWeights.occupancy).toBe(0.50);
    expect(IMAGE_AFFORDANCE_CALIBRATION.elementSuitabilityThresholds.headline).toBe(0.70);
  });
});
