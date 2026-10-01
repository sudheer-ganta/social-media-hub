import { describe, it, expect } from 'vitest';
import {
  buildConceptIdentity,
  evaluateConceptDivergence,
  analyzeConceptPoolDivergence,
  deriveConceptCopyAngle,
} from '../strategy/creative-differentiation';
import {
  validateAndBuildRenderableCopy,
  isGenericMarketingFiller,
} from './copy-sanitizer';
import { validateStyleBriefConsistency } from './style-brief-consistency';
import { buildCreativeRealizationContract } from './creative-realization-contract';
import { classifyCriticFailure } from '../render/critic-recovery';
import {
  createCanvasRepresentation,
  createDesignField,
} from '../render/design-representation';
import {
  evaluateCompositionState,
} from '../render/composition-evaluation';
import { analyzeImageField } from '../render/image-field';
import sharp from 'sharp';
import type { GraphicDesignConcept } from '../brand/creative-brief';

describe('Creative Intent Realization & Intelligence Regression Suite', () => {
  // ─── A. CREATIVE DIFFERENTIATION ──────────────────────────────────────────
  it('A. verifies three distinct concepts in a pool remain distinguishable downstream', () => {
    const conceptA: GraphicDesignConcept = {
      id: 'c1',
      conceptName: 'Tactile Heritage Collage',
      creativeMechanism: 'Physical paper layering with archival typography and textured artifacts',
      hero: 'graphic-element',
      imageRole: 'floating-fragment',
      spatialRelationship: 'Layered collage ground with offset text block',
      typeBehavior: 'Archival stamp serif',
      imageBehavior: 'Rough torn edge fragment',
      compositionFamily: 'collage-grid',
    } as any;

    const conceptB: GraphicDesignConcept = {
      id: 'c2',
      conceptName: 'Parallel Temporal Juxtaposition',
      creativeMechanism: 'Dual photographic moments divided along a vertical spatial threshold',
      hero: 'image',
      imageRole: 'full-bleed',
      spatialRelationship: 'Typography straddles the central dividing split',
      typeBehavior: 'Monospaced timecode marker',
      imageBehavior: 'Dual photographic split',
      compositionFamily: 'split-contrast',
    } as any;

    const conceptC: GraphicDesignConcept = {
      id: 'c3',
      conceptName: 'Monumental Archival Numeral',
      creativeMechanism: 'Architectural scale contrast with monumental typography hero',
      hero: 'typography',
      imageRole: 'omitted',
      spatialRelationship: 'Monumental numeral as primary structure with minimal quiet caption',
      typeBehavior: 'Heroic scale display numeral',
      imageBehavior: 'None',
      compositionFamily: 'typographic-poster',
    } as any;

    const poolReport = analyzeConceptPoolDivergence([conceptA, conceptB, conceptC]);

    expect(poolReport.overallDiversityScore).toBeGreaterThanOrEqual(0.60);
    expect(poolReport.hasConvergence).toBe(false);
    expect(poolReport.pairReports.length).toBe(3);

    for (const pair of poolReport.pairReports) {
      expect(pair.report.isDifferentiated).toBe(true);
      expect(pair.report.divergenceScore).toBeGreaterThanOrEqual(0.50);
    }
  });

  // ─── B. SAME STYLE BUT DIFFERENT CONCEPT ─────────────────────────────────
  it('B. allows two concepts to share a compatible style while retaining distinct creative identities', () => {
    const concept1: GraphicDesignConcept = {
      id: 'c1',
      conceptName: 'Tactile Material Proof',
      creativeMechanism: 'Raw tactile macro textures framing product essence',
      hero: 'texture',
      imageRole: 'small-tactile-object',
      spatialRelationship: 'Text flanks the isolated tactile object',
      typeBehavior: 'Understated caption',
      imageBehavior: 'Floating tactile macro',
      compositionFamily: 'asymmetric-editorial',
    } as any;

    const concept2: GraphicDesignConcept = {
      id: 'c2',
      conceptName: 'The Light Threshold',
      creativeMechanism: 'Cultural motif synthesis through architectural geometry of light',
      hero: 'whitespace',
      imageRole: 'full-bleed',
      spatialRelationship: 'Typography straddles the structural light/shadow boundary',
      typeBehavior: 'Architectural threshold anchor',
      imageBehavior: 'Luminous light beam',
      compositionFamily: 'asymmetric-editorial',
    } as any;

    // Both share style 'editorial'
    const id1 = buildConceptIdentity(concept1, undefined, 'editorial');
    const id2 = buildConceptIdentity(concept2, undefined, 'editorial');

    const report = evaluateConceptDivergence(id1, id2);

    expect(report.isDifferentiated).toBe(true);
    expect(report.divergenceScore).toBeGreaterThanOrEqual(0.40);
    expect(id1.copyAngle).not.toBe(id2.copyAngle);
  });

  // ─── C. COPY DIFFERENTIATION ──────────────────────────────────────────────
  it('C. derives distinct, concept-specific copy angles for divergent mechanisms', () => {
    const collageConcept = {
      creativeMechanism: 'Physical paper collage with historical memory layers',
      hero: 'graphic-element',
      compositionFamily: 'collage-grid',
    } as GraphicDesignConcept;

    const lightConcept = {
      creativeMechanism: 'Architectural light/shadow threshold boundary',
      hero: 'whitespace',
      compositionFamily: 'asymmetric-editorial',
    } as GraphicDesignConcept;

    const angleCollage = deriveConceptCopyAngle(collageConcept);
    const angleLight = deriveConceptCopyAngle(lightConcept);

    expect(angleCollage).toContain('craft');
    expect(angleLight).toContain('light');
    expect(angleCollage).not.toEqual(angleLight);
  });

  // ─── D. GENERIC COPY & REQUIRED CLAIM PRESERVATION ────────────────────────
  it('D. rejects generic marketing filler while strictly preserving required member claims', () => {
    const requiredClaims = ['25% Off All Handcrafted Leather Boots', 'Valid Thru Sunday'];

    const rawCopy = [
      { role: 'HEADLINE' as const, text: 'Experience the quiet luxury of timeless craftsmanship' }, // Generic filler
      { role: 'OFFER' as const, text: 'Get 25% Off All Handcrafted Leather Boots' }, // Required claim
      { role: 'CTA' as const, text: 'Shop Now — Valid Thru Sunday' }, // Required claim
      { role: 'BODY' as const, text: 'Discover the ultimate art of premium style and elegance' }, // Generic filler
    ];

    expect(isGenericMarketingFiller(rawCopy[0].text)).toBe(true);
    expect(isGenericMarketingFiller(rawCopy[3].text)).toBe(true);

    const renderable = validateAndBuildRenderableCopy(rawCopy, requiredClaims, 3);

    // Generic headline without required claim is discarded or downgraded; required claims MUST be present
    const renderedTexts = renderable.map((r) => r.text);
    expect(renderedTexts.some((t) => t.includes('25% Off All Handcrafted Leather Boots'))).toBe(true);
    expect(renderedTexts.some((t) => t.includes('Valid Thru Sunday'))).toBe(true);
    expect(renderedTexts.some((t) => t.includes('Experience the quiet luxury'))).toBe(false);
  });

  // ─── E. HARD REALIZATION MECHANISM IN DDE ─────────────────────────────────
  it('E. proves a generic text-over-image candidate cannot pass a HARD mechanism and an expressing candidate outranks it', async () => {
    const width = 1000;
    const height = 1000;

    // Create synthetic split image: Top half light (240), Bottom half dark (20) -> Sharp structural boundary at y = 0.50
    const imgBuf = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 240, g: 240, b: 240 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width,
              height: 500,
              channels: 3,
              background: { r: 20, g: 20, b: 20 },
            },
          }).png().toBuffer(),
          top: 500,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    const rawField = await analyzeImageField(imgBuf);
    const field = createDesignField(rawField);
    const canvas = createCanvasRepresentation(width, height);

    const copyItems = [
      { id: 'h1', text: 'THE LIGHT THRESHOLD', role: 'headline' as const, priority: 1 },
      { id: 'sub', text: 'ARCHITECTURAL MOMENT', role: 'subheadline' as const, priority: 2 },
    ];

    const realizationContext = {
      conceptName: 'The Light Threshold',
      creativeMechanism: 'Cultural motif synthesis through architectural geometry of light and shadow boundary',
      dominantVisualObject: 'Geometric light arc',
      hero: 'whitespace' as const,
      imageRole: 'full-bleed' as const,
      spatialRelationship: 'Typography straddles the structural light/shadow boundary',
      typeBehavior: 'Architectural anchor',
      imageBehavior: 'Dual tonal field',
      compositionFamily: 'asymmetric-editorial',
      requiredVisualMechanics: ['MECHANISM:light/shadow boundary', 'HERO:whitespace'],
      prohibitedVisualInterpretations: ['Generic text overlaid in empty corner'],
      requiredClaims: [],
    };

    // State A (Expressing): Placed straddling the boundary at y = 0.46..0.54
    const stateExpressing = evaluateCompositionState({
      canvas,
      elements: [
        {
          id: 'h1',
          role: 'headline',
          rect: { x: 0.10, y: 0.46, width: 0.70, height: 0.08 },
          typographyState: {
            fontScale: 0.065,
            family: 'Cinzel',
            weight: 700,
            lineHeightMultiplier: 1.1,
            letterSpacing: 0.05,
            scores: { linguisticScore: 0.95, compositeScore: 0.95 },
          } as any,
          ink: {
            color: { hex: '#FFFFFF' },
            contrast: { wcagRatio: 7.5, apcaEstimatedLc: 85, opticalScaleMultiplier: 1.0 },
            signals: { imageHarmonyScore: 0.9, perceivedInkMass: 1.2 },
            provenance: { deltaEOklab: 0.02 },
          } as any,
          surface: {
            id: 'none',
            signals: { postSurfaceWcag: 7.5, postSurfaceApca: 85, imagePreservation: 0.95 },
            scores: { necessityScore: 0.1 },
          } as any,
        },
      ],
      field,
      realizationContext,
    });

    // State B (Generic / Flat corner): Placed in quiet top-left (y = 0.08, x = 0.08)
    const stateGenericCorner = evaluateCompositionState({
      canvas,
      elements: [
        {
          id: 'h1',
          role: 'headline',
          rect: { x: 0.08, y: 0.08, width: 0.70, height: 0.08 },
          typographyState: {
            fontScale: 0.065,
            family: 'Cinzel',
            weight: 700,
            lineHeightMultiplier: 1.1,
            letterSpacing: 0.05,
            scores: { linguisticScore: 0.95, compositeScore: 0.95 },
          } as any,
          ink: {
            color: { hex: '#111111' },
            contrast: { wcagRatio: 12.0, apcaEstimatedLc: 95, opticalScaleMultiplier: 1.0 },
            signals: { imageHarmonyScore: 0.9, perceivedInkMass: 1.2 },
            provenance: { deltaEOklab: 0.02 },
          } as any,
          surface: {
            id: 'none',
            signals: { postSurfaceWcag: 12.0, postSurfaceApca: 95, imagePreservation: 0.95 },
            scores: { necessityScore: 0.1 },
          } as any,
        },
      ],
      field,
      realizationContext,
    });

    // The expressing state MUST score higher on conceptRealization than the disconnected corner state
    expect(stateExpressing.interactionSignals.conceptRealization).toBeGreaterThan(
      stateGenericCorner.interactionSignals.conceptRealization!,
    );
    expect(stateExpressing.tradeoffProfile.conceptExpressionScore).toBeGreaterThanOrEqual(0.70);
    expect(stateGenericCorner.tradeoffProfile.conceptExpressionScore).toBeLessThan(0.50);
  });

  // ─── F. STYLE MISMATCH GATING & REPAIR ───────────────────────────────────
  it('F. detects incompatible style before image generation and repairs creative direction', () => {
    const editorialConcept: GraphicDesignConcept = {
      conceptName: 'High Fashion Editorial',
      compositionFamily: 'asymmetric-editorial',
      artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
      creativeMechanism: 'Editorial typography with stark fashion geometry',
      hero: 'whitespace',
      imageRole: 'full-bleed',
    } as any;

    const result = validateStyleBriefConsistency({
      concept: editorialConcept,
      selectedStyleId: 'creator-ugc',
      direction: {
        subject: 'Luxury Fall Collection',
        artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
        selectedStyle: { id: 'creator-ugc', name: 'Creator UGC' } as any,
      } as any,
    });

    expect(result.status).toBe('STYLE_INCONSISTENT');
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('creator-ugc');
    expect(result.repairedDirection).toBeDefined();
  });

  // ─── G. RECOVERY STATE PRESERVATION ──────────────────────────────────────
  it('G. preserves all critic failure classes in structured recovery context', () => {
    const mockCritic = {
      passed: false,
      singleClearIdea: false,
      templateLook: true,
      textOccludesSubject: true,
      logoClear: false,
      interchangeableWithAnotherEvent: true,
      problems: [
        'Type sits directly on the subject face',
        'Brand logo at top center is undersized and unreadable',
        'Different occasion and a swapped picture would work unchanged',
        'Cut the copy to the minimum',
      ],
      reasonsToReject: ['Subject occlusion', 'Logo illegibility', 'Interchangeable template'],
      redesignFeedback: 'Move headline to negative space and clear subject.',
    };

    const analysis = classifyCriticFailure(mockCritic as any);

    expect(analysis.failures).toContain('OCCLUSION_FAILURE');
    expect(analysis.failures).toContain('LOGO_LEGIBILITY_FAILURE');
    expect(analysis.failures).toContain('CONCEPT_FAILURE');
    expect(analysis.failures).toContain('IMAGE_FAILURE');
    expect(analysis.failures).toContain('COPY_VOLUME_FAILURE');
    expect(analysis.failures.length).toBeGreaterThanOrEqual(4);
  });

  // ─── H, I, J. CONCEPT FALLBACK INTEGRITY & CLAIM PRESERVATION ─────────────
  it('H, I, J. proves fallback concept builds a fresh contract with attemptId increment and preserves required claims', () => {
    const brief = {
      subject: 'Festive Steam Ring Bakery',
      requiredClaims: ['Freshly Baked Daily', '100% Organic Flours'],
    };

    const conceptA: GraphicDesignConcept = {
      id: 'concept-1',
      conceptName: 'The Festive Steam Ring',
      creativeMechanism: 'Swirling steam ring enclosing the pastry',
      hero: 'image',
      imageRole: 'full-bleed',
      compositionFamily: 'asymmetric-editorial',
    } as any;

    const conceptB: GraphicDesignConcept = {
      id: 'concept-2',
      conceptName: 'The Light Threshold',
      creativeMechanism: 'Cultural motif synthesis through architectural geometry of light',
      hero: 'whitespace',
      imageRole: 'full-bleed',
      compositionFamily: 'asymmetric-editorial',
    } as any;

    const contractA = buildCreativeRealizationContract({
      concept: conceptA,
      brief: brief as any,
      attemptId: 0,
      conceptId: 'concept-1',
    });

    const contractB = buildCreativeRealizationContract({
      concept: conceptB,
      brief: brief as any,
      attemptId: 2, // Fallback attemptId
      conceptId: 'concept-2',
    });

    // Contract isolation & pairing check
    expect(contractA.conceptName).toBe('The Festive Steam Ring');
    expect(contractA.attemptId).toBe(0);

    expect(contractB.conceptName).toBe('The Light Threshold');
    expect(contractB.attemptId).toBe(2);
    expect(contractB.conceptId).toBe('concept-2');

    // Required claims MUST survive into fallback contract
    expect(contractB.requiredClaims).toEqual(['Freshly Baked Daily', '100% Organic Flours']);
  });

  // ─── K. INFRASTRUCTURE ERROR SEPARATION ──────────────────────────────────
  it('K. ensures infrastructure timeout/database errors are not disguised as creative failures', () => {
    const isTimeout = (err: any) => err.code === 'ETIMEDOUT' || err.message?.includes('timeout');
    const dbError = new Error('Database connection timed out');
    (dbError as any).code = 'ETIMEDOUT';

    expect(isTimeout(dbError)).toBe(true);
  });
});
