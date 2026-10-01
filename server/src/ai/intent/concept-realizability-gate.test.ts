import { describe, it, expect } from 'vitest';
import {
  evaluateConceptRealizability,
  assertConceptRealizable,
  isEligibleFallback,
  isAbstractOccasionOrTheme,
  containsPhysicalVisualAnchor,
  classifyMechanismOwner,
  synthesizePhysicalDominantObject,
  normalizeVisualProofStatement,
  ConceptRealizationError,
} from './concept-realizability-gate.js';
import {
  assertCreativeRealizationContractConsistent,
  createCreativeRealizationContract,
} from './creative-realization-contract.js';
import type { CreativeConcept } from '../generators/creative-concepts.generator.js';

describe('Concept Realizability & Quality Gate', () => {
  const sampleDiwaliRestaurantBrief = {
    businessType: 'restaurant',
    businessName: 'Silk & Spice',
    industry: 'food',
    topic: 'Diwali Festive Dining',
    occasion: 'Diwali',
    brandTone: 'warm, welcoming, festive',
    requiredClaims: ['Diwali', 'Festive Special Feast'],
    visualThemes: ['festive', 'traditional', 'dining'],
  };

  // -------------------------------------------------------------
  // A. Occasion vs Physical Object
  // -------------------------------------------------------------
  describe('A. Occasion vs Physical Object Validation', () => {
    it('identifies abstract occasions/themes correctly', () => {
      expect(isAbstractOccasionOrTheme('Diwali')).toBe(true);
      expect(isAbstractOccasionOrTheme('Christmas')).toBe(true);
      expect(isAbstractOccasionOrTheme('Valentine\'s Day')).toBe(true);
      expect(isAbstractOccasionOrTheme('Ramadan')).toBe(true);
      expect(isAbstractOccasionOrTheme('Ganesh Chaturthi')).toBe(true);
      expect(isAbstractOccasionOrTheme('summer')).toBe(true);
      expect(isAbstractOccasionOrTheme('festive')).toBe(true);
      expect(isAbstractOccasionOrTheme('luxury')).toBe(true);
      expect(isAbstractOccasionOrTheme('celebration')).toBe(true);

      // Physical anchors should NOT be purely abstract
      expect(isAbstractOccasionOrTheme('lamp-lit shared feast')).toBe(false);
      expect(isAbstractOccasionOrTheme('warmly illuminated Asian dining table')).toBe(false);
      expect(isAbstractOccasionOrTheme('steaming bowl of spicy noodles')).toBe(false);
    });

    it('identifies physical visual anchors in descriptive strings', () => {
      expect(containsPhysicalVisualAnchor('lamp-lit shared feast')).toBe(true);
      expect(containsPhysicalVisualAnchor('traditional festive meal surrounded by oil lamps')).toBe(true);
      expect(containsPhysicalVisualAnchor('silk festive apparel on model in courtyard')).toBe(true);
      expect(containsPhysicalVisualAnchor('Diwali')).toBe(false);
      expect(containsPhysicalVisualAnchor('celebration')).toBe(false);
    });

    it('rejects an abstract occasion masquerading as a physical dominant visual object', () => {
      const badConcept: CreativeConcept = {
        conceptName: 'Pure Diwali',
        communicationIdea: 'Celebrate Diwali at Silk & Spice',
        creativeMechanism: 'festive dining table atmosphere',
        visualMechanism: 'warm lighting',
        hero: 'Diwali',
        dominantVisualObject: 'Diwali', // INVALID
        imageRole: 'HERO_SUBJECT',
        visualWorld: 'Festive dining room',
        copyAngle: 'Celebrate with family',
        personality: 'Warm & festive',
        requiredVisualProof: ['warm oil lamps visibly illuminating the dining scene'],
        prohibitedInterpretations: ['generic fast food'],
        styleDirection: 'WARM_EDITORIAL',
      };

      const assessment = evaluateConceptRealizability(badConcept, sampleDiwaliRestaurantBrief);
      expect(assessment.dominantVisualValidity).toBe(false);
      expect(assessment.overallDecision).toBe('REJECT');
      expect(assessment.failures.some(f => f.includes('abstract occasion/event'))).toBe(true);
    });

    it('synthesizes a concrete physical object when given an occasion and campaign context', () => {
      const synthesized = synthesizePhysicalDominantObject('Diwali', sampleDiwaliRestaurantBrief);
      expect(synthesized).toBeDefined();
      expect(isAbstractOccasionOrTheme(synthesized)).toBe(false);
      expect(containsPhysicalVisualAnchor(synthesized)).toBe(true);
      expect(synthesized).toMatch(/dining|table|feast|lamp/i);
    });
  });

  // -------------------------------------------------------------
  // B. Mechanism Owner Compatibility
  // -------------------------------------------------------------
  describe('B. Mechanism Owner Classification & Compatibility', () => {
    it('classifies mechanisms into their authoritative layer owners', () => {
      expect(classifyMechanismOwner('typographic scale contrast')).toBe('DDE');
      expect(classifyMechanismOwner('bold typography anchoring the layout')).toBe('DDE');
      expect(classifyMechanismOwner('pressed botanical specimens arranged as an archival study')).toBe('IMAGE');
      expect(classifyMechanismOwner('shallow depth of field highlighting the artisan glaze')).toBe('IMAGE');
      expect(classifyMechanismOwner('unexpected headline transformation and witty narrative')).toBe('COPY');
      expect(classifyMechanismOwner('light physically forms a visual boundary and typography responds to it')).toBe('HYBRID');
    });

    it('rejects a concept claiming IMAGE ownership for a purely typographic mechanism with wordless generation', () => {
      const invalidTypoConcept: CreativeConcept = {
        conceptName: 'Typo Dominance',
        communicationIdea: 'Big bold letters convey urgency',
        creativeMechanism: 'typographic scale contrast',
        mechanismOwner: 'IMAGE', // INVALID: image generator is wordless!
        dominantVisualObject: 'bold typography text elements',
        imageRole: 'HERO_SUBJECT',
        visualWorld: 'Clean graphic studio',
        copyAngle: 'Direct statement',
        personality: 'Bold',
        requiredVisualProof: ['bold typography text rendered directly in photo'],
        prohibitedInterpretations: ['quiet photo'],
        styleDirection: 'GRAPHIC_STUDIO',
      };

      const assessment = evaluateConceptRealizability(invalidTypoConcept, sampleDiwaliRestaurantBrief);
      expect(assessment.mechanismLayerCompatibility).toBe(false);
      expect(assessment.overallDecision).toBe('REJECT');
      expect(assessment.failures.some(f => f.includes('demands typographic mechanism from wordless base image generator'))).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // C. Image / DDE Mechanism Contradiction & D. Unverifiable Visual Proof
  // -------------------------------------------------------------
  describe('C & D. Observable Visual Proof & Realizability', () => {
    it('rejects unverifiable abstract emotional words as visual proof', () => {
      const unprovableConcept: CreativeConcept = {
        conceptName: 'Happy Moments',
        communicationIdea: 'Experience sheer joy and festival',
        creativeMechanism: 'atmospheric festive lighting around food',
        dominantVisualObject: 'richly prepared noodle bowl',
        imageRole: 'HERO_SUBJECT',
        visualWorld: 'Warm restaurant setting',
        copyAngle: 'Joy of dining',
        personality: 'Warm',
        requiredVisualProof: ['joy', 'happiness', 'celebration'], // UNVERIFIABLE
        prohibitedInterpretations: ['cold atmosphere'],
        styleDirection: 'WARM_EDITORIAL',
      };

      const assessment = evaluateConceptRealizability(unprovableConcept, sampleDiwaliRestaurantBrief);
      expect(assessment.visualProofValidity).toBe(false);
      expect(assessment.failures.some(f => f.includes('UNVERIFIABLE_VISUAL_PROOF'))).toBe(true);
    });

    it('normalizes visual proof into observable physical assertions', () => {
      const normalized1 = normalizeVisualProofStatement('Diwali', 'Diwali', 'restaurant');
      expect(normalized1.valid).toBe(true);
      expect(normalized1.normalized).toMatch(/lamp|light|festive/i);
      expect(isAbstractOccasionOrTheme(normalized1.normalized)).toBe(false);

      const normalized2 = normalizeVisualProofStatement('warm oil lamps visibly illuminating the dining scene', 'Diwali', 'restaurant');
      expect(normalized2.valid).toBe(true);
      expect(normalized2.normalized).toBe('warm oil lamps visibly illuminating the dining scene');
    });
  });

  // -------------------------------------------------------------
  // E. Text-Image Relationship Consistency
  // -------------------------------------------------------------
  describe('E. Text-Image Relationship Consistency', () => {
    it('verifies that concept with MATERIAL_INTERACTION is properly mapped and validated', () => {
      const materialConcept: CreativeConcept = {
        conceptName: 'Ingredient Canvas',
        communicationIdea: 'Typography integrated with culinary textures for festive dining',
        creativeMechanism: 'culinary festive ingredients framed with negative space',
        mechanismOwner: 'HYBRID',
        dominantVisualObject: 'artisan ramen bowl offset with clear surface for text placement',
        imageRole: 'CONTAINER_SURFACE',
        visualWorld: 'Rustic wooden tabletop with festive golden lighting',
        textImageRelationship: 'MATERIAL_INTERACTION',
        copyAngle: 'Artisan flavor for the festival',
        personality: 'Artisan',
        requiredVisualProof: ['distinct flat tabletop surface providing natural negative space'],
        prohibitedInterpretations: ['crowded busy frame with no resting place'],
        styleDirection: 'EDITORIAL_FOOD',
      };

      const assessment = evaluateConceptRealizability(materialConcept, sampleDiwaliRestaurantBrief);
      expect(assessment.textRelationshipCompatibility).toBe(true);
      expect(assessment.overallDecision).toBe('PASS');
    });
  });

  // -------------------------------------------------------------
  // F & G. Fallback Candidate Revalidation
  // -------------------------------------------------------------
  describe('F & G. Fallback Eligibility & Revalidation', () => {
    it('rejects a completely unrelated fallback concept (e.g. Botanical Specimen Archive for a Diwali Restaurant brief)', () => {
      const botanicalConcept: CreativeConcept = {
        conceptName: 'Botanical Specimen Archive',
        communicationIdea: 'Pressed botanical specimens arranged with archival precision',
        creativeMechanism: 'scientific botanical specimen framing',
        dominantVisualObject: 'pressed floral specimen mounted on aged archival parchment',
        imageRole: 'HERO_SUBJECT',
        visualWorld: 'Herbalist apothecary archive',
        copyAngle: 'Preserved botanicals',
        personality: 'Archival & scientific',
        requiredVisualProof: ['mounted dried botanical flowers on parchment paper'],
        prohibitedInterpretations: ['fresh garden flower'],
        styleDirection: 'MINIMAL_EDITORIAL',
      };

      // Revalidation for Diwali restaurant brief
      const fallbackResult = isEligibleFallback(botanicalConcept, sampleDiwaliRestaurantBrief);
      expect(fallbackResult.eligible).toBe(false);

      const assessment = evaluateConceptRealizability(botanicalConcept, sampleDiwaliRestaurantBrief);
      expect(assessment.semanticRelevance).toBeLessThan(50);
      expect(assessment.occasionFit).toBe(false);
      expect(assessment.overallDecision).toBe('REJECT');
    });

    it('accepts a genuine fallback candidate matching the restaurant and festive domain', () => {
      const validFestiveCandidate: CreativeConcept = {
        conceptName: 'Luminous Feast Spread',
        communicationIdea: 'Shared festive dining illuminated by traditional warm lamps',
        creativeMechanism: 'atmospheric festive lighting around an Asian banquet spread',
        mechanismOwner: 'IMAGE',
        dominantVisualObject: 'steaming Asian festive feast surrounded by small traditional brass oil lamps',
        imageRole: 'HERO_SUBJECT',
        visualWorld: 'Intimate dimly lit Asian dining hall with warm amber lanterns',
        copyAngle: 'Gather for the festive season',
        personality: 'Warm, festive, inviting',
        requiredVisualProof: ['steaming shared dishes', 'warm glowing oil lamps on dining table'],
        prohibitedInterpretations: ['cold solitary meal', 'generic western tableware'],
        styleDirection: 'WARM_EDITORIAL',
      };

      const fallbackResult = isEligibleFallback(validFestiveCandidate, sampleDiwaliRestaurantBrief);
      expect(fallbackResult.eligible).toBe(true);

      const assessment = evaluateConceptRealizability(validFestiveCandidate, sampleDiwaliRestaurantBrief);
      expect(assessment.overallDecision).toBe('PASS');
    });
  });

  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // L. "Luminous Typography" & DDE Technique Regression Test
  // -------------------------------------------------------------
  describe('L. Concept ≠ DDE Technique & Intended Concept System', () => {
    it('rejects "Luminous Typography" because DDE typography scale contrast is not an independent concept premise', () => {
      const luminousTypoConcept: CreativeConcept = {
        conceptName: 'Luminous Typography',
        communicationIdea: 'Warm festive glowing text floating over ambient restaurant backdrop',
        creativeMechanism: 'typographic scale contrast',
        mechanismOwner: 'DDE',
        dominantVisualObject: 'soft-focus dimly lit dining room with warm ambient lantern bokeh',
        imageRole: 'ENVIRONMENT_BACKDROP',
        visualWorld: 'Intimate restaurant with deep shadows and warm background highlights',
        copyAngle: 'Celebrate Diwali at Silk & Spice',
        personality: 'Sophisticated & festive',
        requiredVisualProof: ['warm ambient lighting with ample dark negative space'],
        prohibitedInterpretations: ['crowded busy foreground leaving no space for typography'],
        styleDirection: 'WARM_EDITORIAL',
      };

      const assessment = evaluateConceptRealizability(luminousTypoConcept, sampleDiwaliRestaurantBrief);
      expect(assessment.overallDecision).toBe('REJECT');
      expect(assessment.failures.some(f => f.includes('CONCEPT_IS_DDE_TECHNIQUE'))).toBe(true);
    });

    it('accepts a genuine creative premise with an independent visual idea whose ground supports DDE composition', () => {
      const windowFeastConcept: CreativeConcept = {
        conceptName: 'The Feast Through the Window',
        communicationIdea: 'An intimate warm festive feast viewed through a rainy illuminated window pane',
        creativeMechanism: 'rain-streaked glowing glass framing an intimate dining table spread inside',
        mechanismOwner: 'IMAGE',
        dominantVisualObject: 'steaming Asian festive feast seen through a warm illuminated window frame',
        imageRole: 'ENVIRONMENT_BACKDROP',
        visualWorld: 'Intimate glowing restaurant interior framed by dark exterior glass and warm lantern bokeh',
        copyAngle: 'Step inside for the festival feast',
        personality: 'Cinematic & evocative',
        requiredVisualProof: ['steaming food dishes visible through glowing window glass'],
        prohibitedInterpretations: ['generic food plate with no spatial framing'],
        styleDirection: 'WARM_EDITORIAL',
      };

      const assessment = evaluateConceptRealizability(windowFeastConcept, sampleDiwaliRestaurantBrief);
      expect(assessment.overallDecision).toBe('PASS');

      const contract = createCreativeRealizationContract({
        concept: windowFeastConcept,
        brief: sampleDiwaliRestaurantBrief,
      });
      expect(contract.dominantVisualObject).toContain('window');
      expect(() => assertCreativeRealizationContractConsistent(contract)).not.toThrow();
    });
  });

  // -------------------------------------------------------------
  // N. Diwali Restaurant End-to-End Regression Test
  // -------------------------------------------------------------
  describe('N. Diwali Restaurant End-to-End Regression Test', () => {
    it('enforces that invalid concepts fail closed and valid festive food concepts pass', () => {
      const invalidOccasionConcept: CreativeConcept = {
        conceptName: 'Diwali Celebration',
        communicationIdea: 'Diwali',
        creativeMechanism: 'Diwali',
        dominantVisualObject: 'Diwali',
        imageRole: 'HERO_SUBJECT',
        visualWorld: 'Diwali',
        copyAngle: 'Diwali',
        personality: 'Festive',
        requiredVisualProof: ['Diwali'],
        prohibitedInterpretations: [],
        styleDirection: 'WARM_EDITORIAL',
      };

      expect(() => {
        assertConceptRealizable(invalidOccasionConcept, sampleDiwaliRestaurantBrief);
      }).toThrow(ConceptRealizationError);

      const validDiningConcept: CreativeConcept = {
        conceptName: 'Illuminated Festive Table',
        communicationIdea: 'Celebrate Diwali with a glowing communal Asian dinner',
        creativeMechanism: 'warm point-source candlelight illuminating artisan food bowls',
        mechanismOwner: 'IMAGE',
        dominantVisualObject: 'warmly illuminated Asian dining table with signature dishes and brass lamps',
        imageRole: 'HERO_SUBJECT',
        visualWorld: 'Rich dark wood dining room with festive golden lantern bokeh',
        copyAngle: 'A festive feast crafted for the season',
        personality: 'Warm, refined, celebratory',
        requiredVisualProof: [
          'warm oil lamps visibly illuminating the dining scene',
          'artisan Asian dishes presented on dining surface',
        ],
        prohibitedInterpretations: ['generic corporate dinner', 'unlit cold fast food'],
        styleDirection: 'WARM_EDITORIAL',
      };

      expect(() => {
        assertConceptRealizable(validDiningConcept, sampleDiwaliRestaurantBrief);
      }).not.toThrow();

      const contract = createCreativeRealizationContract({
        concept: validDiningConcept,
        brief: sampleDiwaliRestaurantBrief,
      });

      expect(contract.dominantVisualObject).toBe('warmly illuminated Asian dining table with signature dishes and brass lamps');
      expect(contract.occasion).toBe('Diwali');
      expect(contract.mechanismOwner).toBe('IMAGE');
      expect(contract.requiredVisualProof.every(p => !isAbstractOccasionOrTheme(p))).toBe(true);
    });
  });
});
