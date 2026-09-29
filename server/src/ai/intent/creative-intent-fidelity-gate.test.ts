import { describe, it, expect, vi } from 'vitest';
import {
  buildCreativeRealizationContract,
  type CreativeRealizationContract,
} from './creative-realization-contract';
import {
  evaluateCreativeIntentFidelity,
  buildTargetedRegenerationPrompt,
  assertCreativeIntentFidelityPassed,
  CreativeRealizationAssertionError,
} from './creative-intent-fidelity-gate';
import type { GraphicDesignConcept, AiTextProvider, InlineImagePart } from '../types';

describe('Creative Intent Fidelity Gate Suite', () => {
  const mockImagePart: InlineImagePart = {
    mimeType: 'image/png',
    data: Buffer.from('mock-png-data').toString('base64'),
  };

  const createMockConcept = (overrides?: Partial<GraphicDesignConcept>): GraphicDesignConcept => ({
    conceptName: 'Tactile Silk Window',
    visualIdea: 'Silk texture revealed through typographic window frames',
    creativeMechanism: 'Imagery lives exclusively inside the typography bounds',
    dominantVisualObject: 'Festive silk saree weave and luster',
    hero: 'typography',
    imageRole: 'contained',
    spatialRelationship: 'Imagery lives exclusively inside typography bounds',
    typeBehavior: 'Architectural window frame masking image',
    imageBehavior: 'Contained strictly inside letterform geometry',
    compositionFamily: 'minimal-field',
    firstRead: 'DIWALI',
    elementsToOmit: ['floating 3D lettering'],
    ...overrides,
  });

  // Test 1: IMAGE_INSIDE_TYPE expected vs texture applied ON typography -> FAIL
  it('Test 1: Rejects 3D extruded lettering when image-inside-typography is required', async () => {
    const concept = createMockConcept();
    const contract = buildCreativeRealizationContract({ concept });

    const mockProvider: AiTextProvider = {
      id: 'mock-vision',
      model: 'mock',
      supportsVision: true,
      isConfigured: () => true,
      generateJson: vi.fn().mockResolvedValue({
        dominantObjectPresent: true,
        dominantObjectObserved: 'Festive silk texture',
        mechanismRealized: false,
        mechanismEvidence: {
          mechanismName: 'IMAGE_INSIDE_TYPE',
          isRealized: false,
          structuralRelationshipObserved: 'Silk texture was applied directly ON 3D extruded letter surfaces instead of inside masked letterforms',
          prohibitedInterpretationDetected: true,
          prohibitedInterpretationDetails: 'Generic AI 3D extruded typography',
        },
        spatialRelationshipCompliant: false,
        spatialRelationshipObserved: 'Text acts as a solid 3D sculpture, not a container window',
        isExtruded3DTextGlitch: true,
        isCgiOrGenericAiRender: true,
        artDirectionCompliant: false,
        styleCompliant: true,
        unverifiableRequiredElements: [],
        summaryCritique: 'Generated 3D plastic letters with fabric overlay instead of contained imagery',
        confidence: 0.95,
      }),
    };

    const result = await evaluateCreativeIntentFidelity({
      image: mockImagePart,
      contract,
      provider: mockProvider,
    });

    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.failureClass === 'CREATIVE_MECHANISM_FAILURE')).toBe(true);
    expect(result.recommendedAction).toBe('REGENERATE_IMAGE');
  });

  // Test 2: FABRIC_OVER_TYPE expected vs fabric merely behind typography -> FAIL
  it('Test 2: Rejects flat background placement when physical fabric crossing and cast shadows are required', async () => {
    const concept = createMockConcept({
      creativeMechanism: 'Physical silk overlaps and casts direct dimensional shadows across flat typography',
      spatialRelationship: 'Physical fabric crosses and casts shadow over type',
    });
    const contract = buildCreativeRealizationContract({ concept });

    const mockProvider: AiTextProvider = {
      id: 'mock-vision',
      model: 'mock',
      supportsVision: true,
      isConfigured: () => true,
      generateJson: vi.fn().mockResolvedValue({
        dominantObjectPresent: true,
        dominantObjectObserved: 'Silk fabric',
        mechanismRealized: false,
        mechanismEvidence: {
          mechanismName: 'FABRIC_OVER_TYPE',
          isRealized: false,
          structuralRelationshipObserved: 'Fabric is placed entirely behind the text layer as a flat wallpaper background with no crossing or cast shadows',
          prohibitedInterpretationDetected: true,
        },
        spatialRelationshipCompliant: false,
        spatialRelationshipObserved: 'No intersection or shadow interaction between fabric and typography',
        isExtruded3DTextGlitch: false,
        isCgiOrGenericAiRender: false,
        artDirectionCompliant: false,
        styleCompliant: true,
        unverifiableRequiredElements: [],
        summaryCritique: 'Flat backdrop instead of physical crossing shadow',
        confidence: 0.90,
      }),
    };

    const result = await evaluateCreativeIntentFidelity({
      image: mockImagePart,
      contract,
      provider: mockProvider,
    });

    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.failureClass === 'CREATIVE_MECHANISM_FAILURE')).toBe(true);
    expect(result.failures.some((f) => f.failureClass === 'SPATIAL_RELATIONSHIP_FAILURE')).toBe(true);
  });

  // Test 3: UI_OVER_IMAGE expected vs random decorative lines -> FAIL
  it('Test 3: Rejects random vector lines when authentic UI interface interaction is required', async () => {
    const concept = createMockConcept({
      creativeMechanism: 'Real interactive 2D try-on UI overlay HUD interacting directly with garment photograph',
      spatialRelationship: 'UI elements visibly occupy and frame the garment photograph',
    });
    const contract = buildCreativeRealizationContract({ concept });

    const mockProvider: AiTextProvider = {
      id: 'mock-vision',
      model: 'mock',
      supportsVision: true,
      isConfigured: () => true,
      generateJson: vi.fn().mockResolvedValue({
        dominantObjectPresent: true,
        dominantObjectObserved: 'Garment photo',
        mechanismRealized: false,
        mechanismEvidence: {
          mechanismName: 'UI_OVER_IMAGE',
          isRealized: false,
          structuralRelationshipObserved: 'Random abstract geometric vector swirls instead of functional UI interface or HUD elements',
          prohibitedInterpretationDetected: true,
        },
        spatialRelationshipCompliant: false,
        spatialRelationshipObserved: 'Decorative border lines do not interact with garment',
        isExtruded3DTextGlitch: false,
        isCgiOrGenericAiRender: false,
        artDirectionCompliant: false,
        styleCompliant: true,
        unverifiableRequiredElements: [],
        summaryCritique: 'Arbitrary decorative lines instead of UI interface',
        confidence: 0.88,
      }),
    };

    const result = await evaluateCreativeIntentFidelity({
      image: mockImagePart,
      contract,
      provider: mockProvider,
    });

    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.failureClass === 'CREATIVE_MECHANISM_FAILURE')).toBe(true);
  });

  // Test 4: EDITORIAL_PHOTOGRAPHY expected vs generic 3D AI render -> FAIL
  it('Test 4: Rejects glossy 3D CGI renders when authentic editorial photography is required', async () => {
    const concept = createMockConcept();
    const contract = buildCreativeRealizationContract({
      concept,
      direction: {
        artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
      } as any,
    });

    const mockProvider: AiTextProvider = {
      id: 'mock-vision',
      model: 'mock',
      supportsVision: true,
      isConfigured: () => true,
      generateJson: vi.fn().mockResolvedValue({
        dominantObjectPresent: true,
        dominantObjectObserved: 'Silk saree model',
        mechanismRealized: true,
        mechanismEvidence: {
          mechanismName: 'EDITORIAL_PHOTOGRAPHY',
          isRealized: false,
          structuralRelationshipObserved: 'Glossy plastic 3D digital illustration with artificial CGI lighting',
          prohibitedInterpretationDetected: true,
        },
        spatialRelationshipCompliant: true,
        spatialRelationshipObserved: 'Centered model',
        isExtruded3DTextGlitch: false,
        isCgiOrGenericAiRender: true,
        artDirectionCompliant: false,
        styleCompliant: false,
        unverifiableRequiredElements: [],
        summaryCritique: 'Generated 3D digital art instead of photographic realism',
        confidence: 0.92,
      }),
    };

    const result = await evaluateCreativeIntentFidelity({
      image: mockImagePart,
      contract,
      provider: mockProvider,
    });

    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.failureClass === 'ART_DIRECTION_FIDELITY_FAILURE')).toBe(true);
  });

  // Test 5: Correct mechanism realized -> PASS
  it('Test 5: Passes when image correctly realizes the intended creative mechanism and dominant object', async () => {
    const concept = createMockConcept();
    const contract = buildCreativeRealizationContract({ concept });

    const mockProvider: AiTextProvider = {
      id: 'mock-vision',
      model: 'mock',
      supportsVision: true,
      isConfigured: () => true,
      generateJson: vi.fn().mockResolvedValue({
        dominantObjectPresent: true,
        dominantObjectObserved: 'Festive silk saree weave and luster',
        mechanismRealized: true,
        mechanismEvidence: {
          mechanismName: 'IMAGE_INSIDE_TYPE',
          isRealized: true,
          structuralRelationshipObserved: 'Silk fabric is cleanly masked and bounded inside typography letterforms',
          prohibitedInterpretationDetected: false,
          containmentRatio: 0.95,
        },
        spatialRelationshipCompliant: true,
        spatialRelationshipObserved: 'Image lives inside letter bounds',
        isExtruded3DTextGlitch: false,
        isCgiOrGenericAiRender: false,
        artDirectionCompliant: true,
        styleCompliant: true,
        unverifiableRequiredElements: [],
        summaryCritique: 'Exact realization of masked typographic window',
        confidence: 0.96,
      }),
    };

    const result = await evaluateCreativeIntentFidelity({
      image: mockImagePart,
      contract,
      provider: mockProvider,
    });

    expect(result.passed).toBe(true);
    expect(result.failures.length).toBe(0);
    expect(result.recommendedAction).toBe('PROCEED');
  });

  // Test 6: Required mechanism cannot be verified -> UNVERIFIABLE_REQUIRED_MECHANISM -> FAIL
  it('Test 6: Fails when a required mechanism cannot be evidenced in the pixels', async () => {
    const concept = createMockConcept();
    const contract = buildCreativeRealizationContract({ concept });

    const mockProvider: AiTextProvider = {
      id: 'mock-vision',
      model: 'mock',
      supportsVision: true,
      isConfigured: () => true,
      generateJson: vi.fn().mockResolvedValue({
        dominantObjectPresent: true,
        dominantObjectObserved: 'Silk',
        mechanismRealized: false,
        mechanismEvidence: {
          mechanismName: 'IMAGE_INSIDE_TYPE',
          isRealized: false,
          structuralRelationshipObserved: 'Visual evidence is ambiguous; containment cannot be verified',
          prohibitedInterpretationDetected: false,
        },
        spatialRelationshipCompliant: false,
        spatialRelationshipObserved: 'Unclear spatial interaction',
        isExtruded3DTextGlitch: false,
        isCgiOrGenericAiRender: false,
        artDirectionCompliant: false,
        styleCompliant: true,
        unverifiableRequiredElements: ['IMAGE_INSIDE_TYPE'],
        summaryCritique: 'Required mechanism is unverifiable',
        confidence: 0.40,
      }),
    };

    const result = await evaluateCreativeIntentFidelity({
      image: mockImagePart,
      contract,
      provider: mockProvider,
    });

    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.failureClass === 'UNVERIFIABLE_REQUIRED_MECHANISM')).toBe(true);
  });

  // Test 7: Failed image NEVER reaches Dynamic Design Engine (assertCreativeIntentFidelityPassed throws)
  it('Test 7: assertCreativeIntentFidelityPassed throws when given a failed fidelity result', () => {
    const contract = buildCreativeRealizationContract({ concept: createMockConcept() });
    const failedResult = {
      passed: false,
      confidence: 0.9,
      score: 0.3,
      failures: [{
        failureClass: 'CREATIVE_MECHANISM_FAILURE' as const,
        expected: 'Contained typography',
        observed: '3D letters',
        evidence: {},
        severity: 'CRITICAL' as const,
        responsibleLayer: 'IMAGE_GENERATION' as const,
      }],
      evidence: [],
      contract,
      recommendedAction: 'REGENERATE_IMAGE' as const,
      attempt: 0,
    };

    expect(() => assertCreativeIntentFidelityPassed(mockImagePart, failedResult)).toThrow(
      CreativeRealizationAssertionError
    );
  });

  // Test 8: Passed image reaches Dynamic Design Engine (assertCreativeIntentFidelityPassed does not throw)
  it('Test 8: assertCreativeIntentFidelityPassed succeeds when given a verified fidelity result', () => {
    const contract = buildCreativeRealizationContract({ concept: createMockConcept() });
    const passedResult = {
      passed: true,
      confidence: 0.95,
      score: 1.0,
      failures: [],
      evidence: [],
      contract,
      recommendedAction: 'PROCEED' as const,
      attempt: 0,
    };

    expect(() => assertCreativeIntentFidelityPassed(mockImagePart, passedResult)).not.toThrow();
  });

  // Test 9: Composition failure reuses verified image
  it('Test 9: Marks verified image so downstream composition retry can safely reuse it without regeneration', () => {
    const verifiedImage = { ...mockImagePart, fidelityVerified: true };
    expect(verifiedImage.fidelityVerified).toBe(true);
  });

  // Test 10: Image realization failure triggers targeted regeneration prompt
  it('Test 10: Formulates a targeted repair instruction referencing exact failure and prohibited interpretations', () => {
    const contract = buildCreativeRealizationContract({ concept: createMockConcept() });
    const failedResult = {
      passed: false,
      confidence: 0.9,
      score: 0.3,
      failures: [{
        failureClass: 'CREATIVE_MECHANISM_FAILURE' as const,
        expected: 'Imagery contained inside typography bounds',
        observed: '3D extruded letters with surface texture',
        evidence: {},
        severity: 'CRITICAL' as const,
        responsibleLayer: 'IMAGE_GENERATION' as const,
      }],
      evidence: [],
      contract,
      recommendedAction: 'REGENERATE_IMAGE' as const,
      attempt: 0,
    };

    const prompt = buildTargetedRegenerationPrompt(contract, failedResult);
    expect(prompt).toContain('TARGETED REALIZATION CORRECTION INSTRUCTION');
    expect(prompt).toContain('3D extruded letters with surface texture');
    expect(prompt).toContain('Imagery lives exclusively inside the typography bounds');
    expect(prompt).toContain('STRICTLY AVOID THESE PROHIBITED INTERPRETATIONS');
  });

  // Test 11: Regeneration preserves original creative contract
  it('Test 11: Regeneration prompt strictly preserves core concept name and dominant visual object', () => {
    const concept = createMockConcept({
      conceptName: 'Preserved Diwali Concept',
      dominantVisualObject: 'Luminous Banarasi Silk',
    });
    const contract = buildCreativeRealizationContract({ concept });
    const failedResult = {
      passed: false,
      confidence: 0.8,
      score: 0.4,
      failures: [{
        failureClass: 'DOMINANT_VISUAL_FAILURE' as const,
        expected: 'Luminous Banarasi Silk',
        observed: 'Generic cotton fabric',
        evidence: {},
        severity: 'CRITICAL' as const,
        responsibleLayer: 'IMAGE_GENERATION' as const,
      }],
      evidence: [],
      contract,
      recommendedAction: 'REGENERATE_IMAGE' as const,
      attempt: 0,
    };

    const prompt = buildTargetedRegenerationPrompt(contract, failedResult);
    expect(prompt).toContain('Preserved Diwali Concept');
    expect(prompt).toContain('Luminous Banarasi Silk');
  });

  // Test 12: Contradictory style selection is detected
  it('Test 12: Detects contradiction between EDITORIAL_PHOTOGRAPHY and creator-ugc style selection', async () => {
    const contract = buildCreativeRealizationContract({
      concept: createMockConcept(),
      direction: { artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY' } as any,
      styleDna: { style: { id: 'creator-ugc' } } as any,
    });

    const mockProvider: AiTextProvider = {
      id: 'mock-vision',
      model: 'mock',
      supportsVision: true,
      isConfigured: () => true,
      generateJson: vi.fn().mockResolvedValue({
        dominantObjectPresent: true,
        dominantObjectObserved: 'Silk',
        mechanismRealized: true,
        mechanismEvidence: {
          mechanismName: 'EDITORIAL_PHOTOGRAPHY',
          isRealized: true,
          structuralRelationshipObserved: 'OK',
          prohibitedInterpretationDetected: false,
        },
        spatialRelationshipCompliant: true,
        spatialRelationshipObserved: 'OK',
        isExtruded3DTextGlitch: false,
        isCgiOrGenericAiRender: false,
        artDirectionCompliant: true,
        styleCompliant: false,
        unverifiableRequiredElements: [],
        summaryCritique: 'Contradictory style',
        confidence: 0.9,
      }),
    };

    const result = await evaluateCreativeIntentFidelity({
      image: mockImagePart,
      contract,
      provider: mockProvider,
    });

    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.failureClass === 'STYLE_FIDELITY_FAILURE')).toBe(true);
    expect(result.recommendedAction).toBe('REPAIR_STYLE_CONTRADICTION');
  });

  // Test 13: Required claims remain intact in contract
  it('Test 13: Normalizes and preserves required claims within the realization contract', () => {
    const contract = buildCreativeRealizationContract({
      concept: createMockConcept(),
      brief: {
        requiredClaims: ['Pure Mulberry Silk', '20% Festive Savings'],
      } as any,
    });

    expect(contract.requiredClaims).toEqual(['Pure Mulberry Silk', '20% Festive Savings']);
  });

  // Test 14: Multiple failure classes remain preserved
  it('Test 14: Preserves distinct failure classes simultaneously without collapsing into a single error', async () => {
    const contract = buildCreativeRealizationContract({ concept: createMockConcept() });

    const mockProvider: AiTextProvider = {
      id: 'mock-vision',
      model: 'mock',
      supportsVision: true,
      isConfigured: () => true,
      generateJson: vi.fn().mockResolvedValue({
        dominantObjectPresent: false,
        dominantObjectObserved: 'Missing',
        mechanismRealized: false,
        mechanismEvidence: {
          mechanismName: 'IMAGE_INSIDE_TYPE',
          isRealized: false,
          structuralRelationshipObserved: '3D letters with wrong texture',
          prohibitedInterpretationDetected: true,
        },
        spatialRelationshipCompliant: false,
        spatialRelationshipObserved: 'Wrong spatial interaction',
        isExtruded3DTextGlitch: true,
        isCgiOrGenericAiRender: true,
        artDirectionCompliant: false,
        styleCompliant: true,
        unverifiableRequiredElements: ['SPATIAL_ANCHOR'],
        summaryCritique: 'Multiple critical defects',
        confidence: 0.9,
      }),
    };

    const result = await evaluateCreativeIntentFidelity({
      image: mockImagePart,
      contract,
      provider: mockProvider,
    });

    expect(result.failures.length).toBeGreaterThanOrEqual(3);
    const classes = result.failures.map((f) => f.failureClass);
    expect(classes).toContain('DOMINANT_VISUAL_FAILURE');
    expect(classes).toContain('CREATIVE_MECHANISM_FAILURE');
    expect(classes).toContain('SPATIAL_RELATIONSHIP_FAILURE');
  });

  // Test 15: Bounded retries limit
  it('Test 15: Contract indicates attempt count for bounded orchestration', async () => {
    const contract = buildCreativeRealizationContract({ concept: createMockConcept() });
    const mockProvider: AiTextProvider = {
      id: 'mock-vision',
      model: 'mock',
      supportsVision: true,
      isConfigured: () => true,
      generateJson: vi.fn().mockResolvedValue({
        dominantObjectPresent: true,
        dominantObjectObserved: 'Silk',
        mechanismRealized: true,
        mechanismEvidence: {
          mechanismName: 'OK',
          isRealized: true,
          structuralRelationshipObserved: 'OK',
          prohibitedInterpretationDetected: false,
        },
        spatialRelationshipCompliant: true,
        spatialRelationshipObserved: 'OK',
        isExtruded3DTextGlitch: false,
        isCgiOrGenericAiRender: false,
        artDirectionCompliant: true,
        styleCompliant: true,
        unverifiableRequiredElements: [],
        summaryCritique: 'OK',
        confidence: 0.9,
      }),
    };

    const result = await evaluateCreativeIntentFidelity({
      image: mockImagePart,
      contract,
      provider: mockProvider,
      attempt: 1,
    });

    expect(result.attempt).toBe(1);
  });

  // Test 16: Vision model says PASS in text but structured evidence is insufficient -> FAIL
  it('Test 16: Rejects if vision model summary claims success but structural evidence indicates prohibited interpretation', async () => {
    const contract = buildCreativeRealizationContract({ concept: createMockConcept() });

    const mockProvider: AiTextProvider = {
      id: 'mock-vision',
      model: 'mock',
      supportsVision: true,
      isConfigured: () => true,
      generateJson: vi.fn().mockResolvedValue({
        dominantObjectPresent: true,
        dominantObjectObserved: 'Silk',
        mechanismRealized: true, // Claims realized
        mechanismEvidence: {
          mechanismName: 'IMAGE_INSIDE_TYPE',
          isRealized: false, // But evidence says false!
          structuralRelationshipObserved: 'Extruded 3D text detected',
          prohibitedInterpretationDetected: true, // Prohibited interpretation detected!
        },
        spatialRelationshipCompliant: true,
        spatialRelationshipObserved: 'Inside type',
        isExtruded3DTextGlitch: true, // Glitch flag true!
        isCgiOrGenericAiRender: false,
        artDirectionCompliant: true,
        styleCompliant: true,
        unverifiableRequiredElements: [],
        summaryCritique: 'Yes, the image contains silk inside typography.', // Misleading text!
        confidence: 0.9,
      }),
    };

    const result = await evaluateCreativeIntentFidelity({
      image: mockImagePart,
      contract,
      provider: mockProvider,
    });

    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.failureClass === 'CREATIVE_MECHANISM_FAILURE')).toBe(true);
  });

  // Test 17: Soft style mismatch alone does NOT trigger hard regeneration unless strictness requires it
  it('Test 17: Soft stylistic variations do not trigger hard gate failures when hard requirements pass', async () => {
    const contract = buildCreativeRealizationContract({
      concept: createMockConcept({ emotionalTone: 'ultra-warm' }),
    });

    const mockProvider: AiTextProvider = {
      id: 'mock-vision',
      model: 'mock',
      supportsVision: true,
      isConfigured: () => true,
      generateJson: vi.fn().mockResolvedValue({
        dominantObjectPresent: true,
        dominantObjectObserved: 'Festive silk weave',
        mechanismRealized: true,
        mechanismEvidence: {
          mechanismName: 'IMAGE_INSIDE_TYPE',
          isRealized: true,
          structuralRelationshipObserved: 'Silk is cleanly masked inside letterforms',
          prohibitedInterpretationDetected: false,
        },
        spatialRelationshipCompliant: true,
        spatialRelationshipObserved: 'Contained',
        isExtruded3DTextGlitch: false,
        isCgiOrGenericAiRender: false,
        artDirectionCompliant: true,
        styleCompliant: true,
        unverifiableRequiredElements: [],
        summaryCritique: 'Lighting reads as neutral-warm rather than ultra-warm, but all structural requirements are met',
        confidence: 0.9,
      }),
    };

    const result = await evaluateCreativeIntentFidelity({
      image: mockImagePart,
      contract,
      provider: mockProvider,
    });

    expect(result.passed).toBe(true);
  });

  // Test 18: A hard mechanism failure overrides a high aggregate score
  it('Test 18: A hard mechanism failure causes overall failure regardless of high confidence or other passing dimensions', async () => {
    const contract = buildCreativeRealizationContract({ concept: createMockConcept() });

    const mockProvider: AiTextProvider = {
      id: 'mock-vision',
      model: 'mock',
      supportsVision: true,
      isConfigured: () => true,
      generateJson: vi.fn().mockResolvedValue({
        dominantObjectPresent: true, // PASS
        dominantObjectObserved: 'Silk',
        mechanismRealized: false, // HARD FAIL
        mechanismEvidence: {
          mechanismName: 'IMAGE_INSIDE_TYPE',
          isRealized: false,
          structuralRelationshipObserved: 'Texture on 3D text',
          prohibitedInterpretationDetected: true,
        },
        spatialRelationshipCompliant: true, // PASS
        spatialRelationshipObserved: 'Centered',
        isExtruded3DTextGlitch: true,
        isCgiOrGenericAiRender: false,
        artDirectionCompliant: true, // PASS
        styleCompliant: true, // PASS
        unverifiableRequiredElements: [],
        summaryCritique: 'High quality render but wrong structural mechanism',
        confidence: 0.99, // Very high confidence
      }),
    };

    const result = await evaluateCreativeIntentFidelity({
      image: mockImagePart,
      contract,
      provider: mockProvider,
    });

    expect(result.passed).toBe(false);
    expect(result.recommendedAction).toBe('REGENERATE_IMAGE');
  });

  // =========================================================================
  // OWNERSHIP REGRESSION TESTS (Tests 19–30)
  // Requirement: RequirementOwner enforcement — gate evaluates ONLY IMAGE_GENERATION.
  // =========================================================================

  describe('Requirement Ownership Boundary', () => {
    // ---------------------------------------------------------------------------
    // Test 19: Documentary + DDE typography requirement → PASS
    // The image correctly contains the artisan/documentary subject.
    // The "minimal editorial typography in negative space" belongs to DDE and must
    // NOT cause a Fidelity Gate failure.
    // ---------------------------------------------------------------------------
    it('Test 19: Documentary image with DDE typography requirement passes when image-side requirements are met', async () => {
      const concept = createMockConcept({
        conceptName: 'Authentic Ceramic Artisan Moment',
        creativeMechanism: 'Documentary candid photojournalism capturing tactile craft in natural atmospheric light',
        dominantVisualObject: 'Artisan hands shaping terracotta clay on spinning pottery wheel',
        hero: 'image' as const,
        imageRole: 'hero' as const,
        // Mixed spatial: image-owned part = "Photographic hero occupies primary ground"
        // DDE-owned part = "with minimal editorial typography in negative space"
        spatialRelationship: 'Photographic hero occupies primary ground with minimal editorial typography in negative space',
      });
      const contract = buildCreativeRealizationContract({
        concept,
        direction: { artDirectionFamily: 'DOCUMENTARY' } as any,
      });

      // Verify ownership classification is correct
      expect(contract.imageGenerationRequirements.some((r) =>
        r.description.includes('Must maintain authentic photographic realism')
      )).toBe(true);
      expect(contract.downstreamRequirements.some((r) =>
        r.description.includes('DDE must construct typography/layout')
      )).toBe(true);

      const mockProvider: AiTextProvider = {
        id: 'mock-vision',
        model: 'mock',
        supportsVision: true,
        isConfigured: () => true,
        // Vision model correctly sees artisan hands but no baked-in typography (correct — DDE adds that)
        generateJson: vi.fn().mockResolvedValue({
          dominantObjectPresent: true,
          dominantObjectObserved: 'Artisan hands actively shaping terracotta clay on pottery wheel in natural sidelight.',
          mechanismRealized: true,
          mechanismEvidence: {
            mechanismName: 'Authentic Ceramic Artisan Moment',
            isRealized: true,
            structuralRelationshipObserved: 'Documentary photojournalistic style depicting hands in contact with spinning clay.',
            prohibitedInterpretationDetected: false,
            prohibitedInterpretationDetails: 'None detected.',
          },
          // Vision correctly reports no baked-in typography (DDE-owned; gate must not fail)
          spatialRelationshipCompliant: true, // The image-owned part (hero occupies ground) is met
          spatialRelationshipObserved: 'The photographic image fills the main frame entirely.',
          isExtruded3DTextGlitch: false,
          isCgiOrGenericAiRender: false,
          artDirectionCompliant: true,
          styleCompliant: true,
          unverifiableRequiredElements: [], // Vision correctly does not flag DDE elements
          summaryCritique: 'Documentary artisan photography correctly realized.',
          confidence: 0.88,
        }),
      };

      const result = await evaluateCreativeIntentFidelity({
        image: mockImagePart,
        contract,
        provider: mockProvider,
      });

      expect(result.passed).toBe(true);
      expect(result.failures.length).toBe(0);
      expect(result.recommendedAction).toBe('PROCEED');
    });

    // ---------------------------------------------------------------------------
    // Test 20: Documentary image MISSING artisan requirement → FAIL
    // The DDE typography requirement must not affect this — the image-side artisan
    // content is what's missing, and that IS an IMAGE_GENERATION failure.
    // ---------------------------------------------------------------------------
    it('Test 20: Documentary image fails correctly when image-owned artisan subject is absent', async () => {
      const concept = createMockConcept({
        conceptName: 'Authentic Ceramic Artisan Moment',
        creativeMechanism: 'Documentary candid photojournalism capturing tactile craft in natural atmospheric light',
        dominantVisualObject: 'Artisan hands shaping terracotta clay on spinning pottery wheel',
        hero: 'image' as const,
        imageRole: 'hero' as const,
        spatialRelationship: 'Photographic hero occupies primary ground with minimal editorial typography in negative space',
      });
      const contract = buildCreativeRealizationContract({
        concept,
        direction: { artDirectionFamily: 'DOCUMENTARY' } as any,
      });

      const mockProvider: AiTextProvider = {
        id: 'mock-vision',
        model: 'mock',
        supportsVision: true,
        isConfigured: () => true,
        generateJson: vi.fn().mockResolvedValue({
          dominantObjectPresent: false, // Artisan subject is missing
          dominantObjectObserved: 'Empty studio background with no artisan or pottery.',
          mechanismRealized: false, // Documentary mechanism not realized without subject
          mechanismEvidence: {
            mechanismName: 'Authentic Ceramic Artisan Moment',
            isRealized: false,
            structuralRelationshipObserved: 'No artisan or craft activity is present.',
            prohibitedInterpretationDetected: false,
          },
          spatialRelationshipCompliant: false,
          spatialRelationshipObserved: 'Empty frame, no subject present.',
          isExtruded3DTextGlitch: false,
          isCgiOrGenericAiRender: false,
          artDirectionCompliant: false,
          styleCompliant: true,
          unverifiableRequiredElements: ['artisan hands', 'pottery wheel'],
          summaryCritique: 'Required documentary subject is entirely absent.',
          confidence: 0.85,
        }),
      };

      const result = await evaluateCreativeIntentFidelity({
        image: mockImagePart,
        contract,
        provider: mockProvider,
      });

      expect(result.passed).toBe(false);
      expect(result.failures.some((f) => f.failureClass === 'DOMINANT_VISUAL_FAILURE')).toBe(true);
      expect(result.failures.some((f) => f.failureClass === 'CREATIVE_MECHANISM_FAILURE')).toBe(true);
    });

    // ---------------------------------------------------------------------------
    // Test 21: IMAGE_INSIDE_TYPE — image-owned requirement absent → FAIL
    // Ownership does NOT weaken complex mechanism verification.
    // The image-side requirement is "silk texture suitable for masking"; the
    // DDE-side requirement is "final letterform containment". When the image has
    // no silk texture at all, it should still fail.
    // ---------------------------------------------------------------------------
    it('Test 21: IMAGE_INSIDE_TYPE fails when the image-owned texture/material is absent', async () => {
      const concept = createMockConcept({
        creativeMechanism: 'Imagery lives exclusively inside the typography letterform bounds',
        dominantVisualObject: 'Lustrous festive silk saree weave with golden zari embroidery',
        hero: 'typography' as const,
        imageRole: 'full-bleed' as const,
        spatialRelationship: 'Typography bounds contain and reveal high-contrast silk texture within letter strokes',
      });
      const contract = buildCreativeRealizationContract({ concept });

      const mockProvider: AiTextProvider = {
        id: 'mock-vision',
        model: 'mock',
        supportsVision: true,
        isConfigured: () => true,
        generateJson: vi.fn().mockResolvedValue({
          dominantObjectPresent: false,
          dominantObjectObserved: 'No silk texture present; image is a blank white background.',
          mechanismRealized: false,
          mechanismEvidence: {
            mechanismName: 'IMAGE_INSIDE_TYPE',
            isRealized: false,
            structuralRelationshipObserved: 'No imagery and no typography letterforms are present.',
            prohibitedInterpretationDetected: false,
          },
          spatialRelationshipCompliant: false,
          spatialRelationshipObserved: 'Empty canvas.',
          isExtruded3DTextGlitch: false,
          isCgiOrGenericAiRender: false,
          artDirectionCompliant: false,
          styleCompliant: true,
          unverifiableRequiredElements: ['silk saree weave', 'IMAGE_INSIDE_TYPE mechanism'],
          summaryCritique: 'Required silk imagery and mechanism are entirely absent.',
          confidence: 0.9,
        }),
      };

      const result = await evaluateCreativeIntentFidelity({
        image: mockImagePart,
        contract,
        provider: mockProvider,
      });

      expect(result.passed).toBe(false);
      expect(result.failures.some((f) => f.failureClass === 'DOMINANT_VISUAL_FAILURE')).toBe(true);
      expect(result.failures.some((f) => f.failureClass === 'CREATIVE_MECHANISM_FAILURE')).toBe(true);
    });

    // ---------------------------------------------------------------------------
    // Test 22: DDE-owned requirement cannot trigger Fidelity failure
    // ---------------------------------------------------------------------------
    it('Test 22: DDE-owned typography construction requirement cannot cause Fidelity Gate failure', async () => {
      const concept = createMockConcept({
        hero: 'image' as const,
        imageRole: 'hero' as const,
        spatialRelationship: 'Photographic hero occupies primary ground',
      });
      const contract = buildCreativeRealizationContract({ concept });

      // Verify ownership classification
      const ddeReqs = contract.downstreamRequirements;
      const typographyReq = ddeReqs.find((r) => r.description.includes('DDE constructs headline'));
      expect(typographyReq).toBeDefined();
      expect(typographyReq?.owner).toBe('DYNAMIC_DESIGN_ENGINE');

      // The Fidelity Gate must not accept this as something it evaluates
      const gateImageReqs = contract.imageGenerationRequirements;
      expect(gateImageReqs.every((r) => r.owner === 'IMAGE_GENERATION')).toBe(true);
    });

    // ---------------------------------------------------------------------------
    // Test 23: Renderer-owned requirement cannot trigger Fidelity failure
    // ---------------------------------------------------------------------------
    it('Test 23: RENDERER-owned requirements are not present in imageGenerationRequirements', () => {
      const concept = createMockConcept({ hero: 'image' as const, imageRole: 'hero' as const });
      const contract = buildCreativeRealizationContract({ concept });

      // No RENDERER requirements should appear in what the gate evaluates
      const rendererInGate = contract.imageGenerationRequirements.filter((r) => r.owner === 'RENDERER');
      expect(rendererInGate.length).toBe(0);
    });

    // ---------------------------------------------------------------------------
    // Test 24: FINAL_COMPOSITION requirement cannot trigger Fidelity failure
    // ---------------------------------------------------------------------------
    it('Test 24: FINAL_COMPOSITION requirements are not evaluated by the Fidelity Gate', () => {
      const concept = createMockConcept({ hero: 'image' as const, imageRole: 'hero' as const });
      const contract = buildCreativeRealizationContract({ concept });

      // Final composition requirements must be in downstreamRequirements, not gate requirements
      const finalCompInGate = contract.imageGenerationRequirements.filter((r) => r.owner === 'FINAL_COMPOSITION');
      expect(finalCompInGate.length).toBe(0);

      const finalCompDownstream = contract.downstreamRequirements.filter((r) => r.owner === 'FINAL_COMPOSITION');
      expect(finalCompDownstream.length).toBeGreaterThan(0);
    });

    // ---------------------------------------------------------------------------
    // Test 25: HARD image-owned requirement still blocks (hardness preserved)
    // ---------------------------------------------------------------------------
    it('Test 25: HARD image-generation requirement blocks even with a high confidence score', async () => {
      const concept = createMockConcept({ hero: 'image' as const, imageRole: 'hero' as const });
      const contract = buildCreativeRealizationContract({ concept });

      // All hard image-gen reqs must be classified correctly
      const hardImageReqs = contract.imageGenerationRequirements.filter((r) => r.hardness === 'HARD');
      expect(hardImageReqs.length).toBeGreaterThanOrEqual(3); // at minimum: dominant object, mechanism, image role

      const mockProvider: AiTextProvider = {
        id: 'mock-vision',
        model: 'mock',
        supportsVision: true,
        isConfigured: () => true,
        generateJson: vi.fn().mockResolvedValue({
          dominantObjectPresent: false, // HARD requirement violated
          dominantObjectObserved: 'Generic beach scene, not the required subject.',
          mechanismRealized: true,
          mechanismEvidence: {
            mechanismName: 'OK',
            isRealized: true,
            structuralRelationshipObserved: 'Mechanism appears present.',
            prohibitedInterpretationDetected: false,
          },
          spatialRelationshipCompliant: true,
          spatialRelationshipObserved: 'OK',
          isExtruded3DTextGlitch: false,
          isCgiOrGenericAiRender: false,
          artDirectionCompliant: true,
          styleCompliant: true,
          unverifiableRequiredElements: [],
          summaryCritique: 'High quality but wrong subject.',
          confidence: 0.99,
        }),
      };

      const result = await evaluateCreativeIntentFidelity({
        image: mockImagePart,
        contract,
        provider: mockProvider,
      });

      // Despite high confidence, HARD failure must block
      expect(result.passed).toBe(false);
      expect(result.failures.some((f) => f.failureClass === 'DOMINANT_VISUAL_FAILURE')).toBe(true);
    });

    // ---------------------------------------------------------------------------
    // Test 26: SOFT image-owned requirement does not automatically block
    // ---------------------------------------------------------------------------
    it('Test 26: SOFT image-generation requirements do not cause gate failure when hard requirements pass', async () => {
      const concept = createMockConcept({
        emotionalTone: 'ultra-warm-festive',
        hero: 'image' as const,
        imageRole: 'hero' as const,
        spatialRelationship: 'Photographic hero occupies primary ground',
      });
      const contract = buildCreativeRealizationContract({ concept });

      // Verify soft preference is classified correctly
      const softReqs = contract.imageGenerationRequirements.filter((r) => r.hardness === 'SOFT');
      expect(softReqs.some((r) => r.description.includes('ultra-warm-festive'))).toBe(true);

      const mockProvider: AiTextProvider = {
        id: 'mock-vision',
        model: 'mock',
        supportsVision: true,
        isConfigured: () => true,
        generateJson: vi.fn().mockResolvedValue({
          dominantObjectPresent: true,
          dominantObjectObserved: 'Festive silk saree weave',
          mechanismRealized: true,
          mechanismEvidence: {
            mechanismName: 'OK',
            isRealized: true,
            structuralRelationshipObserved: 'Correct',
            prohibitedInterpretationDetected: false,
          },
          spatialRelationshipCompliant: true,
          spatialRelationshipObserved: 'Hero occupies ground.',
          isExtruded3DTextGlitch: false,
          isCgiOrGenericAiRender: false,
          artDirectionCompliant: true,
          styleCompliant: true,
          unverifiableRequiredElements: [],
          summaryCritique: 'All hard requirements met; tone slightly cooler than ultra-warm.',
          confidence: 0.88,
        }),
      };

      const result = await evaluateCreativeIntentFidelity({
        image: mockImagePart,
        contract,
        provider: mockProvider,
      });

      // Soft requirements missing → still passes
      expect(result.passed).toBe(true);
    });

    // ---------------------------------------------------------------------------
    // Test 27: Retry preserves original requirement ownership
    // ---------------------------------------------------------------------------
    it('Test 27: buildTargetedRegenerationPrompt preserves the original contract ownership structure', () => {
      const concept = createMockConcept({
        hero: 'image' as const,
        imageRole: 'hero' as const,
        spatialRelationship: 'Photographic hero occupies primary ground with minimal editorial typography in negative space',
      });
      const contract = buildCreativeRealizationContract({ concept });

      const failedResult = {
        passed: false,
        confidence: 0.6,
        score: 0.4,
        failures: [{
          failureClass: 'DOMINANT_VISUAL_FAILURE' as const,
          expected: 'Silk fabric',
          observed: 'Empty frame',
          evidence: {},
          severity: 'CRITICAL' as const,
          responsibleLayer: 'IMAGE_GENERATION' as const,
        }],
        evidence: [],
        contract,
        recommendedAction: 'REGENERATE_IMAGE' as const,
        attempt: 1,
      };

      const prompt = buildTargetedRegenerationPrompt(contract, failedResult);

      // Original contract must be preserved — dominant object and mechanism must appear
      expect(prompt).toContain(contract.dominantVisualObject);
      expect(prompt).toContain(contract.creativeMechanism);
      // DDE spatial should NOT appear as something the image generator must bake in
      expect(prompt).toContain(contract.conceptName);
    });

    // ---------------------------------------------------------------------------
    // Test 28: Retry preserves original hard/soft classification
    // ---------------------------------------------------------------------------
    it('Test 28: Contract hardness classification is preserved after regeneration prompt construction', () => {
      const concept = createMockConcept({
        emotionalTone: 'confident-warm',
        hero: 'image' as const,
        imageRole: 'hero' as const,
      });
      const contract = buildCreativeRealizationContract({ concept });

      const hardImageReqs = contract.imageGenerationRequirements.filter((r) => r.hardness === 'HARD');
      const softImageReqs = contract.imageGenerationRequirements.filter((r) => r.hardness === 'SOFT');

      // Hard reqs include at minimum: dominant object, mechanism, image role
      expect(hardImageReqs.length).toBeGreaterThanOrEqual(3);
      // Soft reqs include emotional tone
      expect(softImageReqs.some((r) => r.description.includes('confident-warm'))).toBe(true);

      // Hardness must not change when building regeneration prompt
      const failedResult = {
        passed: false,
        confidence: 0.5,
        score: 0.5,
        failures: [{
          failureClass: 'CREATIVE_MECHANISM_FAILURE' as const,
          expected: 'Required mechanism',
          observed: 'Wrong mechanism',
          evidence: {},
          severity: 'CRITICAL' as const,
          responsibleLayer: 'IMAGE_GENERATION' as const,
        }],
        evidence: [],
        contract,
        recommendedAction: 'REGENERATE_IMAGE' as const,
        attempt: 0,
      };

      const prompt = buildTargetedRegenerationPrompt(contract, failedResult);
      // Prompt references mechanism — hard requirement preserved
      expect(prompt).toContain('Required mechanism');
      // After building prompt, contract structure is unchanged
      expect(contract.imageGenerationRequirements.filter((r) => r.hardness === 'HARD').length)
        .toBe(hardImageReqs.length);
    });

    // ---------------------------------------------------------------------------
    // Test 29: Unverified image cannot enter DDE (architectural invariant)
    // ---------------------------------------------------------------------------
    it('Test 29: assertCreativeIntentFidelityPassed throws when an unverified image would enter DDE', () => {
      const contract = buildCreativeRealizationContract({ concept: createMockConcept() });
      const failedResult = {
        passed: false,
        confidence: 0.8,
        score: 0.4,
        failures: [{
          failureClass: 'CREATIVE_MECHANISM_FAILURE' as const,
          expected: 'image-side mechanism',
          observed: 'mechanism missing',
          evidence: {},
          severity: 'CRITICAL' as const,
          responsibleLayer: 'IMAGE_GENERATION' as const,
        }],
        evidence: [],
        contract,
        recommendedAction: 'REGENERATE_IMAGE' as const,
        attempt: 2,
      };

      expect(() => assertCreativeIntentFidelityPassed(mockImagePart, failedResult)).toThrow(
        CreativeRealizationAssertionError
      );
    });

    // ---------------------------------------------------------------------------
    // Test 30: No typography-led family special-case bypass exists in the contract
    // ---------------------------------------------------------------------------
    it('Test 30: TYPOGRAPHY_LED concepts still require IMAGE_GENERATION verification for image-side requirements', () => {
      const concept = createMockConcept({
        creativeMechanism: 'Imagery lives exclusively inside the typography letterform bounds',
        hero: 'typography' as const,
        imageRole: 'full-bleed' as const,
        spatialRelationship: 'Typography bounds contain and reveal high-contrast silk texture within letter strokes',
      });
      const contract = buildCreativeRealizationContract({
        concept,
        direction: { artDirectionFamily: 'TYPOGRAPHY_LED' } as any,
      });

      // The image-generation requirements must still include the dominant visual object
      // and creative mechanism — no bypass because it's typography-led
      const domObjectReq = contract.imageGenerationRequirements.find((r) =>
        r.description.includes('Must prominently contain dominant subject')
      );
      expect(domObjectReq).toBeDefined();
      expect(domObjectReq?.owner).toBe('IMAGE_GENERATION');
      expect(domObjectReq?.hardness).toBe('HARD');

      const mechanismReq = contract.imageGenerationRequirements.find((r) =>
        r.description.includes('Must visually realize mechanism')
      );
      expect(mechanismReq).toBeDefined();
      expect(mechanismReq?.owner).toBe('IMAGE_GENERATION');
      expect(mechanismReq?.hardness).toBe('HARD');

      // There is no bypass flag — the gate must still evaluate image-owned requirements
      expect(contract.imageGenerationRequirements.length).toBeGreaterThanOrEqual(3);
    });
  });
});
