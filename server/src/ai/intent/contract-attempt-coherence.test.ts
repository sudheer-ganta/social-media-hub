import { describe, it, expect, vi } from 'vitest';
import { buildCreativeRealizationContract } from './creative-realization-contract';
import {
  evaluateCreativeIntentFidelity,
  assertCreativeIntentFidelityPassed,
  CreativeRealizationAssertionError,
} from './creative-intent-fidelity-gate';
import type { GraphicDesignConcept } from '../types';
import type { CreativeBrief } from '../brand/creative-brief';
import type { CreativeDirection, AiTextProvider, InlineImagePart } from '../types';

function createMockConcept(overrides: Partial<GraphicDesignConcept> = {}): GraphicDesignConcept {
  return {
    id: 'concept-1',
    conceptName: 'Plates & Prayers',
    name: 'Plates & Prayers',
    creativeMechanism: 'Bold asymmetric typography layered over soft-lit dining moments.',
    dominantVisualObject: 'Steaming brass platters shared between multi-generational hands',
    hero: 'image',
    imageRole: 'full-bleed',
    spatialRelationship: 'Typography rests in natural lower linen sanctuary',
    typeBehavior: 'Refined editorial typography',
    imageBehavior: 'Full-bleed immersive documentary',
    compositionFamily: 'asymmetric-editorial',
    artDirectionFamily: 'DOCUMENTARY',
    ...overrides,
  };
}

function createMockBrief(overrides: Partial<CreativeBrief> = {}): CreativeBrief {
  return {
    userPrompt: 'Diwali reunion campaign',
    goal: 'AWARENESS',
    funnelStage: 'TOFU',
    primaryMessage: 'Celebrate Diwali with family',
    secondaryMessages: [],
    subject: 'Diwali family dinner',
    emotionalTone: 'warm',
    brandVoice: { tone: 'warm', personality: ['authentic'] },
    creativeStyle: {
      id: 'creator-ugc',
      name: 'Creator / UGC',
      visualLanguage: [],
      typographyLanguage: [],
      compositionLanguage: [],
      imageTreatment: [],
      textureLanguage: [],
      colorLanguage: [],
      imperfectionLanguage: [],
    },
    assets: { productAssets: [], referenceImages: [] },
    requiredClaims: ['Diwali', 'hindu family reunites'],
    ...overrides,
  };
}

function createMockDirection(overrides: Partial<CreativeDirection> = {}): CreativeDirection {
  return {
    concept: 'Plates & Prayers',
    subject: 'Diwali family dinner',
    headline: 'Sacred Homecoming',
    copyTreatment: 'headline_support',
    aspectRatio: '1:1',
    requiredClaims: ['Diwali', 'hindu family reunites'],
    selectedStyleId: 'creator-ugc',
    ...overrides,
  };
}

function createMockImage(): InlineImagePart {
  return {
    mimeType: 'image/png',
    data: Buffer.from('mock-png-data').toString('base64'),
  };
}

describe('Contract / Image Attempt Coherence & Production Invariants', () => {
  // ─── Test 1: Same-contract image regeneration ─────────────────────────────
  it('Test 1 — Same-contract image regeneration: regenerates image while preserving the same contract', async () => {
    const concept = createMockConcept({ conceptName: 'Plates & Prayers' });
    const brief = createMockBrief();
    const direction = createMockDirection();

    const contract = buildCreativeRealizationContract({
      concept,
      brief,
      direction,
      attemptId: 0,
    });

    const mockTextProvider: AiTextProvider = {
      supportsVision: true,
      generateText: vi.fn(),
      generateJson: vi.fn()
        // First try: fails
        .mockResolvedValueOnce({
          dominantObjectPresent: false,
          dominantObjectObserved: 'Empty table',
          mechanismRealized: false,
          mechanismEvidence: {
            mechanismName: contract.creativeMechanism,
            isRealized: false,
            structuralRelationshipObserved: 'none',
            prohibitedInterpretationDetected: false,
          },
          spatialRelationshipCompliant: true,
          spatialRelationshipObserved: 'compliant',
          isExtruded3DTextGlitch: false,
          isCgiOrGenericAiRender: false,
          artDirectionCompliant: true,
          styleCompliant: true,
          unverifiableRequiredElements: [],
          summaryCritique: 'Subject missing',
          confidenceScore: 0.3,
        })
        // Second try: passes
        .mockResolvedValueOnce({
          dominantObjectPresent: true,
          dominantObjectObserved: 'Steaming brass platters shared between hands',
          mechanismRealized: true,
          mechanismEvidence: {
            mechanismName: contract.creativeMechanism,
            isRealized: true,
            structuralRelationshipObserved: 'compliant',
            prohibitedInterpretationDetected: false,
          },
          spatialRelationshipCompliant: true,
          spatialRelationshipObserved: 'compliant',
          isExtruded3DTextGlitch: false,
          isCgiOrGenericAiRender: false,
          artDirectionCompliant: true,
          styleCompliant: true,
          unverifiableRequiredElements: [],
          summaryCritique: 'Perfect realization',
          confidenceScore: 0.95,
        }),
    };

    const imageA1 = createMockImage();
    const result1 = await evaluateCreativeIntentFidelity({
      image: imageA1,
      contract,
      provider: mockTextProvider,
      attempt: 1,
    });

    expect(result1.passed).toBe(false);
    expect(result1.contract.conceptName).toBe('Plates & Prayers');

    const imageA2 = createMockImage();
    const result2 = await evaluateCreativeIntentFidelity({
      image: imageA2,
      contract, // Same contract preserved
      provider: mockTextProvider,
      attempt: 2,
    });

    expect(result2.passed).toBe(true);
    expect(result2.contract.conceptName).toBe('Plates & Prayers');
    expect(result2.contractConceptName).toBe('Plates & Prayers');
  });

  // ─── Test 2: Concept redesign ─────────────────────────────────────────────
  it('Test 2 — Concept redesign: constructs a fresh CreativeRealizationContract for the new concept', () => {
    const brief = createMockBrief({ requiredClaims: ['Diwali', 'hindu family reunites'] });
    const direction = createMockDirection();

    const conceptA = createMockConcept({ conceptName: 'Plates & Prayers', id: 'concept-A' });
    const contractA = buildCreativeRealizationContract({
      concept: conceptA,
      brief,
      direction,
      attemptId: 0,
    });

    expect(contractA.conceptName).toBe('Plates & Prayers');
    expect(contractA.attemptId).toBe(0);

    // Concept redesign occurs
    const conceptB = createMockConcept({
      id: 'concept-B',
      conceptName: 'The Heirloom Spine',
      name: 'The Heirloom Spine',
      creativeMechanism: 'Architectural vertical editorial spine carving through Himalayan rituals',
      dominantVisualObject: 'Two hands breaking soft Himalayan tingmo bread',
      hero: 'typography',
      imageRole: 'offset-crop',
    });

    const contractB = buildCreativeRealizationContract({
      concept: conceptB,
      brief,
      direction,
      attemptId: 1,
    });

    expect(contractB.conceptName).toBe('The Heirloom Spine');
    expect(contractB.attemptId).toBe(1);
    expect(contractB.creativeMechanism).toBe('Architectural vertical editorial spine carving through Himalayan rituals');
    expect(contractB.dominantVisualObject).toBe('Two hands breaking soft Himalayan tingmo bread');
    expect(contractB).not.toBe(contractA);
  });

  // ─── Test 3: New image / new contract pairing ─────────────────────────────
  it('Test 3 — New image / new contract pairing: Fidelity evaluates Image B against Contract B', async () => {
    const brief = createMockBrief();
    const direction = createMockDirection();
    const conceptB = createMockConcept({
      conceptName: 'The Heirloom Spine',
      creativeMechanism: 'Architectural vertical spine',
      dominantVisualObject: 'Hands breaking tingmo bread',
    });

    const contractB = buildCreativeRealizationContract({
      concept: conceptB,
      brief,
      direction,
      attemptId: 1,
    });

    const mockTextProvider: AiTextProvider = {
      supportsVision: true,
      generateText: vi.fn(),
      generateJson: vi.fn().mockResolvedValue({
        dominantObjectPresent: true,
        dominantObjectObserved: 'Hands breaking tingmo bread',
        mechanismRealized: true,
        mechanismEvidence: {
          mechanismName: 'Architectural vertical spine',
          isRealized: true,
          structuralRelationshipObserved: 'compliant',
          prohibitedInterpretationDetected: false,
        },
        spatialRelationshipCompliant: true,
        spatialRelationshipObserved: 'compliant',
        isExtruded3DTextGlitch: false,
        isCgiOrGenericAiRender: false,
        artDirectionCompliant: true,
        styleCompliant: true,
        unverifiableRequiredElements: [],
        summaryCritique: 'High fidelity realization of Heirloom Spine',
        confidenceScore: 0.92,
      }),
    };

    const imageB = createMockImage();
    const resultB = await evaluateCreativeIntentFidelity({
      image: imageB,
      contract: contractB,
      provider: mockTextProvider,
      attempt: 1,
    });

    expect(resultB.passed).toBe(true);
    expect(resultB.contract.conceptName).toBe('The Heirloom Spine');
    expect(resultB.contractConceptName).toBe('The Heirloom Spine');
    expect(resultB.attemptId).toBe(1);
  });

  // ─── Test 4: Stale contract rejection (assert pairing invariant) ──────────
  it('Test 4 — Stale contract rejection: throws CONTRACT_IMAGE_PAIRING_FAILURE if evaluated contract differs from active concept', () => {
    const imageB = createMockImage();
    const staleContractA = buildCreativeRealizationContract({
      concept: createMockConcept({ conceptName: 'Plates & Prayers' }),
      attemptId: 0,
    });

    const mockResultFromStaleContract = {
      passed: true,
      confidence: 0.9,
      score: 1.0,
      failures: [],
      evidence: [],
      contract: staleContractA,
      recommendedAction: 'PROCEED' as const,
      attempt: 1,
      attemptId: 0,
      contractConceptName: 'Plates & Prayers',
    };

    // Active concept is "The Heirloom Spine"
    expect(() => {
      assertCreativeIntentFidelityPassed(imageB, mockResultFromStaleContract, {
        requiresImage: true,
        attemptId: 1,
        expectedConceptName: 'The Heirloom Spine',
      });
    }).toThrow(CreativeRealizationAssertionError);

    expect(() => {
      assertCreativeIntentFidelityPassed(imageB, mockResultFromStaleContract, {
        requiresImage: true,
        attemptId: 1,
        expectedConceptName: 'The Heirloom Spine',
      });
    }).toThrow(/CONTRACT_IMAGE_PAIRING_FAILURE/);
  });

  // ─── Test 5: Required claim preservation ──────────────────────────────────
  it('Test 5 — Required claim preservation: Contract B preserves all required claims from canonical brief', () => {
    const canonicalClaims = ['Diwali', 'hindu family reunites'];
    const brief = createMockBrief({ requiredClaims: canonicalClaims });
    const direction = createMockDirection({ requiredClaims: canonicalClaims });

    const conceptA = createMockConcept({ conceptName: 'Plates & Prayers' });
    const contractA = buildCreativeRealizationContract({ concept: conceptA, brief, direction, attemptId: 0 });
    expect(contractA.requiredClaims).toEqual(canonicalClaims);

    // Redesign
    const conceptB = createMockConcept({ conceptName: 'The Heirloom Spine' });
    const contractB = buildCreativeRealizationContract({ concept: conceptB, brief, direction, attemptId: 1 });

    expect(contractB.requiredClaims).toEqual(canonicalClaims);
    expect(contractB.requiredClaims).toContain('Diwali');
    expect(contractB.requiredClaims).toContain('hindu family reunites');
  });

  // ─── Test 6: Attempt identity protection ──────────────────────────────────
  it('Test 6 — Attempt identity: Attempt 0 Fidelity result must never authorize Attempt 1 DDE', () => {
    const image = createMockImage();
    const contract0 = buildCreativeRealizationContract({
      concept: createMockConcept({ conceptName: 'Plates & Prayers' }),
      attemptId: 0,
    });

    const attempt0Result = {
      passed: true,
      confidence: 0.9,
      score: 1.0,
      failures: [],
      evidence: [],
      contract: contract0,
      recommendedAction: 'PROCEED' as const,
      attempt: 1,
      attemptId: 0,
      contractConceptName: 'Plates & Prayers',
    };

    // Attempting to use attempt 0 result in attempt 1 must fail
    expect(() => {
      assertCreativeIntentFidelityPassed(image, attempt0Result, {
        requiresImage: true,
        attemptId: 1,
        expectedConceptName: 'Plates & Prayers',
      });
    }).toThrow(CreativeRealizationAssertionError);

    expect(() => {
      assertCreativeIntentFidelityPassed(image, attempt0Result, {
        requiresImage: true,
        attemptId: 1,
        expectedConceptName: 'Plates & Prayers',
      });
    }).toThrow(/Fidelity result belongs to attempt 0 but current attempt is 1/);
  });

  // ─── Test 7: Recovery with image reuse (shouldReuseImage === true) ─────────
  it('Test 7 — Recovery with image reuse: preserves same concept, contract, and image', () => {
    const conceptA = createMockConcept({ conceptName: 'The Long Table Reunion' });
    const brief = createMockBrief();
    const contractA = buildCreativeRealizationContract({ concept: conceptA, brief, attemptId: 0 });

    const recoveryAction = {
      shouldReuseImage: true,
      action: 'REDUCE_COPY' as const,
      failureClass: 'COPY_VOLUME_FAILURE' as const,
    };

    // When shouldReuseImage is true, contract is NOT rebuilt
    let activeConcept = conceptA;
    let activeContract = contractA;

    if (!recoveryAction.shouldReuseImage) {
      activeConcept = createMockConcept({ conceptName: 'New Concept' });
      activeContract = buildCreativeRealizationContract({ concept: activeConcept, brief, attemptId: 1 });
    }

    expect(activeConcept.conceptName).toBe('The Long Table Reunion');
    expect(activeContract).toBe(contractA);
    expect(activeContract.conceptName).toBe('The Long Table Reunion');
    expect(activeContract.attemptId).toBe(0);
  });

  // ─── Test 8: Recovery with new image (shouldReuseImage === false) ──────────
  it('Test 8 — Recovery with new image: initiates fresh attempt with new concept, new contract, and new identity', () => {
    const brief = createMockBrief({ requiredClaims: ['Diwali', 'hindu family reunites'] });
    const direction = createMockDirection();

    const conceptA = createMockConcept({ conceptName: 'Plates & Prayers' });
    const contractA = buildCreativeRealizationContract({ concept: conceptA, brief, direction, attemptId: 0 });

    const recoveryAction = {
      shouldReuseImage: false,
      action: 'REDESIGN_BLUEPRINT' as const,
      failureClass: 'CONCEPT_FAILURE' as const,
    };

    let activeConcept = conceptA;
    let activeContract = contractA;
    let activeVisual: InlineImagePart | undefined = createMockImage();

    if (!recoveryAction.shouldReuseImage) {
      // Must produce fresh blueprint, fresh contract, clear visual
      activeConcept = createMockConcept({
        conceptName: 'The Heirloom Spine',
        creativeMechanism: 'Architectural vertical spine',
      });
      activeContract = buildCreativeRealizationContract({
        concept: activeConcept,
        brief,
        direction,
        attemptId: 1,
      });
      activeVisual = undefined; // Force image regeneration
    }

    expect(activeConcept.conceptName).toBe('The Heirloom Spine');
    expect(activeContract.conceptName).toBe('The Heirloom Spine');
    expect(activeContract.attemptId).toBe(1);
    expect(activeContract).not.toBe(contractA);
    expect(activeVisual).toBeUndefined();
    expect(activeContract.requiredClaims).toEqual(['Diwali', 'hindu family reunites']);
  });
});
