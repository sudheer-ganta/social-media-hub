import { describe, it, expect } from 'vitest';
import {
  evaluateConceptRealizability,
  assertConceptRealizable,
  isPureStyleConcept,
  isPureDdeTechniqueConcept,
} from '../intent/concept-realizability-gate';
import {
  generateCreativeConcepts,
} from './creative-concepts.generator';
import type { AiTextProvider } from '../providers';
import type { ScoredCreativeConcept } from '../types';

describe('Intended Concept System (§24)', () => {
  const diwaliBrief = {
    businessType: 'restaurant',
    businessName: 'Silk Road Dining',
    industry: 'food',
    topic: 'Diwali Festive Dining',
    event: 'Diwali',
    occasion: 'Diwali',
    brandTone: 'warm, refined, celebratory',
    requiredClaims: ['Diwali Feast', 'Book Table'],
  };

  // -------------------------------------------------------------
  // 1. CONCEPT ≠ STYLE
  // -------------------------------------------------------------
  describe('Concept ≠ Style (Style descriptors must be rejected as concepts)', () => {
    it('identifies pure style/lighting descriptors', () => {
      expect(isPureStyleConcept('Architecture of Golden Light')).toBe(true);
      expect(isPureStyleConcept('Warm Festive Food Photography')).toBe(true);
      expect(isPureStyleConcept('Premium Diwali Dining')).toBe(true);
      expect(isPureStyleConcept('Dramatic Lighting')).toBe(true);
      expect(isPureStyleConcept('Minimal Editorial')).toBe(true);
      expect(isPureStyleConcept('Cinematic Luxury')).toBe(true);

      // Real concepts are NOT pure styles
      expect(isPureStyleConcept('The Diwali Table Becomes a Rangoli')).toBe(false);
      expect(isPureStyleConcept('Seven Sisters, One Table')).toBe(false);
      expect(isPureStyleConcept('The Feast Through the Window')).toBe(false);
      expect(isPureStyleConcept('Passing the Light Around the Table')).toBe(false);
    });

    it('rejects "Architecture of Golden Light" as an invalid concept', () => {
      const badConcept: Partial<ScoredCreativeConcept> = {
        conceptName: 'Architecture of Golden Light',
        communicationIdea: 'Golden light illuminates the dishes',
        creativeMechanism: 'golden lighting across the table',
        visualMechanism: 'golden light',
        dominantVisualObject: 'dining table in golden light',
        imageRole: 'full-bleed',
        requiredVisualProof: ['warm golden light on food'],
      };

      const assessment = evaluateConceptRealizability(badConcept, diwaliBrief);
      expect(assessment.overallDecision).toBe('REJECT');
      expect(assessment.failures.some(f => f.includes('CONCEPT_IS_MERE_STYLE'))).toBe(true);
    });

    it('rejects "Warm Festive Food Photography" as an invalid concept', () => {
      const badConcept: Partial<ScoredCreativeConcept> = {
        conceptName: 'Warm Festive Food Photography',
        communicationIdea: 'Delicious festive food photographed with warm lighting',
        creativeMechanism: 'warm festive food photography',
        visualMechanism: 'warm food photo',
        dominantVisualObject: 'spread of Asian food',
        imageRole: 'full-bleed',
        requiredVisualProof: ['food dishes under warm studio lights'],
      };

      const assessment = evaluateConceptRealizability(badConcept, diwaliBrief);
      expect(assessment.overallDecision).toBe('REJECT');
      expect(assessment.failures.some(f => f.includes('CONCEPT_IS_MERE_STYLE'))).toBe(true);
    });

    it('rejects "Premium Diwali Dining" as an invalid generic concept', () => {
      const badConcept: Partial<ScoredCreativeConcept> = {
        conceptName: 'Premium Diwali Dining',
        communicationIdea: 'High-end dining experience for Diwali',
        creativeMechanism: 'premium diwali dining scene',
        visualMechanism: 'luxury dining',
        dominantVisualObject: 'restaurant dining hall',
        imageRole: 'full-bleed',
        requiredVisualProof: ['luxury dining setup'],
      };

      const assessment = evaluateConceptRealizability(badConcept, diwaliBrief);
      expect(assessment.overallDecision).toBe('REJECT');
      expect(assessment.failures.some(f => f.includes('CONCEPT_IS_MERE_STYLE'))).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 2. CONCEPT ≠ DDE TECHNIQUE
  // -------------------------------------------------------------
  describe('Concept ≠ DDE Technique (Downstream layout/typo techniques must not be concepts)', () => {
    it('identifies pure DDE layout/typography techniques', () => {
      expect(isPureDdeTechniqueConcept('Luminous Typography')).toBe(true);
      expect(isPureDdeTechniqueConcept('Any Concept', 'typographic scale contrast')).toBe(true);
      expect(isPureDdeTechniqueConcept('Font Pairing')).toBe(true);
      expect(isPureDdeTechniqueConcept('Asymmetric Layout')).toBe(true);
      expect(isPureDdeTechniqueConcept('Typographic Contrast')).toBe(true);

      // Real concepts are NOT DDE techniques
      expect(isPureDdeTechniqueConcept('The Diwali Table Becomes a Rangoli')).toBe(false);
      expect(isPureDdeTechniqueConcept('The Feast Through the Window')).toBe(false);
    });

    it('rejects "Luminous Typography" with "typographic scale contrast" mechanism', () => {
      const typoConcept: Partial<ScoredCreativeConcept> = {
        conceptName: 'Luminous Typography',
        communicationIdea: 'Big bold letters convey the Diwali feast',
        creativeMechanism: 'typographic scale contrast',
        visualMechanism: 'oversized glowing typography over background',
        mechanismOwner: 'DDE',
        dominantVisualObject: 'dark restaurant background for typography',
        imageRole: 'full-bleed',
        requiredVisualProof: ['dark textured backdrop'],
      };

      const assessment = evaluateConceptRealizability(typoConcept, diwaliBrief);
      expect(assessment.overallDecision).toBe('REJECT');
      expect(assessment.failures.some(f => f.includes('CONCEPT_IS_DDE_TECHNIQUE'))).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 3. CONCEPT = DISTINCT CREATIVE PREMISE (Real Examples from §24)
  // -------------------------------------------------------------
  describe('Concept = Creative Premise (Good examples from spec §24 pass with full structure)', () => {
    it('accepts "The Diwali Table Becomes a Rangoli"', () => {
      const concept: Partial<ScoredCreativeConcept> = {
        conceptName: 'The Diwali Table Becomes a Rangoli',
        communicationIdea: 'Small colorful Asian dishes, dipping sauces, and condiments are arranged radially like a traditional festive floral rangoli',
        creativePremise: 'The geometry of celebration — turning a feast into an auspicious welcoming floor art pattern',
        creativeMechanism: 'overhead geometric radial arrangement of colorful dim sum, clay pots, and spice garnishes forming a symmetrical rangoli motif on dark teak',
        visualMechanism: 'overhead geometric radial arrangement of colorful dim sum, clay pots, and spice garnishes forming a symmetrical rangoli motif on dark teak',
        mechanismOwner: 'IMAGE',
        dominantVisualObject: 'geometric radial arrangement of colorful Asian small plates forming a festive rangoli pattern',
        hero: 'image',
        imageRole: 'full-bleed',
        visualWorld: 'Dark hand-carved teak dining table surrounded by glowing brass oil lamps and marigold petals',
        physicalArtifacts: ['brass oil lamps', 'marigold petals', 'bamboo steamer lids', 'dipping sauce bowls'],
        compositionMechanism: 'Overhead flat-lay radial symmetry with quiet periphery for typography',
        copyAngle: 'Celebrate Diwali with an artful feast',
        textImageRelationship: 'OVERLAY_INTENTIONAL',
        requiredVisualElements: ['radial dish arrangement', 'brass oil lamps', 'marigold petals'],
        requiredVisualProof: [
          'overhead radial arrangement of colorful Asian dishes forming a mandala pattern',
          'glowing brass oil lamps illuminating the table surface',
        ],
        prohibitedVisualInterpretations: ['random scattered food plates', 'synthetic neon glow'],
        styleDirection: 'EDITORIAL_PHOTOGRAPHY',
        scores: {
          conceptStrength: 95,
          brandSpecificity: 90,
          productRelevance: 95,
          visualOriginality: 92,
          scrollStoppingPotential: 90,
          messageClarity: 88,
          socialInteractionPotential: 85,
          templateRisk: 10,
          mechanismNovelty: 90,
          similarityToOtherConcepts: 10,
        },
      };

      const assessment = evaluateConceptRealizability(concept, diwaliBrief);
      expect(assessment.overallDecision).toBe('PASS');
      expect(assessment.failures).toHaveLength(0);
      expect(() => assertConceptRealizable(concept, diwaliBrief)).not.toThrow();
    });

    it('accepts "Seven Sisters, One Table"', () => {
      const concept: Partial<ScoredCreativeConcept> = {
        conceptName: 'Seven Sisters, One Table',
        communicationIdea: 'Seven signature dishes from the seven North-Eastern states assembled as a celebratory culinary gathering',
        creativePremise: 'Diverse regional heritage brought together in harmonious festive communion',
        creativeMechanism: 'line of seven distinct artisanal clay pots and bamboo platters stretching across the table, each with distinctive state spices',
        visualMechanism: 'line of seven distinct artisanal clay pots and bamboo platters stretching across the table, each with distinctive state spices',
        mechanismOwner: 'IMAGE',
        dominantVisualObject: 'seven distinct North-Eastern regional dishes presented in traditional terracotta and woven bamboo vessels',
        hero: 'image',
        imageRole: 'full-bleed',
        visualWorld: 'Rustic warm timber feast table in ambient lantern light',
        physicalArtifacts: ['terracotta pots', 'woven bamboo platters', 'brass oil lamps'],
        compositionMechanism: 'Leading horizontal line of seven dishes with deep optical depth of field',
        copyAngle: 'Seven culinary traditions, one Diwali table',
        textImageRelationship: 'OVERLAY_INTENTIONAL',
        requiredVisualElements: ['seven distinct regional dishes', 'terracotta vessels', 'warm festive lighting'],
        requiredVisualProof: [
          'seven distinct clay and bamboo vessels arranged along dining table',
          'warm oil lamps visibly illuminating the culinary presentation',
        ],
        prohibitedVisualInterpretations: ['generic single noodle bowl', 'western tableware'],
        styleDirection: 'DOCUMENTARY',
        scores: {
          conceptStrength: 92,
          brandSpecificity: 95,
          productRelevance: 90,
          visualOriginality: 88,
          scrollStoppingPotential: 88,
          messageClarity: 90,
          socialInteractionPotential: 86,
          templateRisk: 12,
          mechanismNovelty: 88,
          similarityToOtherConcepts: 15,
        },
      };

      const assessment = evaluateConceptRealizability(concept, diwaliBrief);
      expect(assessment.overallDecision).toBe('PASS');
      expect(assessment.failures).toHaveLength(0);
    });

    it('accepts "The Feast Through the Window"', () => {
      const concept: Partial<ScoredCreativeConcept> = {
        conceptName: 'The Feast Through the Window',
        communicationIdea: 'A glowing intimate festive dinner viewed from outside through an illuminated rain-streaked restaurant window',
        creativePremise: 'The warmth of festival belonging contrasted against the cool evening outside',
        creativeMechanism: 'framing the steaming feast inside warm glass with gentle reflections and ambient street bokeh',
        visualMechanism: 'framing the steaming feast inside warm glass with gentle reflections and ambient street bokeh',
        mechanismOwner: 'IMAGE',
        dominantVisualObject: 'steaming Asian festive feast seen through a warm illuminated window frame',
        hero: 'image',
        imageRole: 'full-bleed',
        visualWorld: 'Atmospheric evening street perspective looking in at an intimate glowing dining sanctuary',
        physicalArtifacts: ['timber window frame', 'glass reflections', 'steaming clay pots', 'brass lanterns'],
        compositionMechanism: 'Window frame creates natural architectural vignetting for centered feast',
        copyAngle: 'Step inside the warmth of Diwali',
        textImageRelationship: 'OVERLAY_INTENTIONAL',
        requiredVisualElements: ['window frame architectural border', 'steaming Asian feast inside', 'warm lantern glow'],
        requiredVisualProof: [
          'architectural window framing looking in at steaming food spread',
          'warm interior illumination contrasting with dark evening exterior',
        ],
        prohibitedVisualInterpretations: ['flat photo without window frame', 'harsh studio flash'],
        styleDirection: 'CINEMATIC',
        scores: {
          conceptStrength: 90,
          brandSpecificity: 88,
          productRelevance: 92,
          visualOriginality: 94,
          scrollStoppingPotential: 92,
          messageClarity: 85,
          socialInteractionPotential: 89,
          templateRisk: 8,
          mechanismNovelty: 92,
          similarityToOtherConcepts: 12,
        },
      };

      const assessment = evaluateConceptRealizability(concept, diwaliBrief);
      expect(assessment.overallDecision).toBe('PASS');
      expect(assessment.failures).toHaveLength(0);
    });

    it('accepts "Passing the Light Around the Table"', () => {
      const concept: Partial<ScoredCreativeConcept> = {
        conceptName: 'Passing the Light Around the Table',
        communicationIdea: 'Communal hands passing a glowing traditional brass lamp over sharing platters of festive food',
        creativeMechanism: 'candid motion of hands transferring an illuminated diya across sharing bowls of steaming curry and rice',
        visualMechanism: 'candid motion of hands transferring an illuminated diya across sharing bowls of steaming curry and rice',
        mechanismOwner: 'IMAGE',
        dominantVisualObject: 'hands passing a glowing brass diya over a festive banquet of Asian delicacies',
        hero: 'image',
        imageRole: 'full-bleed',
        visualWorld: 'Lively festive dining table with natural human interaction and warm golden candlelight',
        physicalArtifacts: ['brass diya', 'sharing bowls', 'festive attire cuffs', 'banana leaf liners'],
        compositionMechanism: 'Dynamic diagonal interaction across the center of the frame',
        copyAngle: 'Share the feast, share the light',
        textImageRelationship: 'OVERLAY_INTENTIONAL',
        requiredVisualElements: ['hands passing brass lamp', 'steaming sharing platters', 'warm ambient glow'],
        requiredVisualProof: [
          'human hands visibly passing illuminated brass lamp across dining spread',
          'steaming Asian food dishes on table surface',
        ],
        prohibitedVisualInterpretations: ['static unpeopled studio bowl', 'posed stock model smile'],
        styleDirection: 'DOCUMENTARY',
        scores: {
          conceptStrength: 94,
          brandSpecificity: 90,
          productRelevance: 93,
          visualOriginality: 91,
          scrollStoppingPotential: 91,
          messageClarity: 92,
          socialInteractionPotential: 90,
          templateRisk: 10,
          mechanismNovelty: 90,
          similarityToOtherConcepts: 14,
        },
      };

      const assessment = evaluateConceptRealizability(concept, diwaliBrief);
      expect(assessment.overallDecision).toBe('PASS');
      expect(assessment.failures).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------
  // 4. GENERATOR END-TO-END VERIFICATION
  // -------------------------------------------------------------
  describe('Creative Concepts Generator End-to-End Structure', () => {
    it('normalizes and preserves the complete structured concept model from mock LLM response', async () => {
      const mockProvider: AiTextProvider = {
        id: 'mock-llm',
        model: 'mock-model',
        supportsVision: true,
        isConfigured: () => true,
        generateJson: async () => ({
          concepts: [
            {
              conceptName: 'The Diwali Table Becomes a Rangoli',
              communicationIdea: 'Dishes arranged radially like a festive rangoli',
              creativePremise: 'Festive dining table arranged as auspicious floor art',
              creativeMechanism: 'overhead radial arrangement of small plates and oil lamps',
              visualMechanism: 'overhead radial flat-lay pattern',
              dominantVisualObject: 'radial feast of dim sum and clay pots surrounded by oil lamps',
              hero: 'image',
              imageRole: 'full-bleed',
              visualWorld: 'Dark teak wood table with brass oil lamps and marigolds',
              physicalArtifacts: ['brass lamps', 'marigolds', 'bamboo steamers'],
              compositionMechanism: 'Radial flat-lay symmetry',
              copyAngle: 'An artful feast for Diwali',
              textImageRelationship: 'OVERLAY_INTENTIONAL',
              referenceInsight: 'Traditional floor rangoli geometry transformed into culinary spread',
              requiredVisualElements: ['radial dish pattern', 'brass lamps', 'marigolds'],
              requiredVisualProof: ['radial arrangement of dishes', 'warm oil lamps'],
              prohibitedVisualInterpretations: ['generic food plate'],
              styleDirection: 'EDITORIAL_PHOTOGRAPHY',
              mode: 'CULTURAL',
              artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
              mechanismFamily: 'CULTURAL_OBSERVATION',
              scores: {
                conceptStrength: 92,
                brandSpecificity: 88,
                productRelevance: 90,
                visualOriginality: 92,
                scrollStoppingPotential: 90,
                messageClarity: 85,
                socialInteractionPotential: 85,
                templateRisk: 10,
                mechanismNovelty: 90,
                similarityToOtherConcepts: 10,
              },
            },
            {
              conceptName: 'Seven Sisters, One Table',
              communicationIdea: 'Seven regional dishes united on one Diwali festive table',
              creativePremise: 'Regional culinary harmony in Diwali celebration',
              creativeMechanism: 'seven terracotta and bamboo vessels forming a horizontal feast',
              visualMechanism: 'horizontal procession of seven distinct regional vessels',
              dominantVisualObject: 'seven distinct North-Eastern regional vessels in a row',
              hero: 'image',
              imageRole: 'full-bleed',
              visualWorld: 'Rustic wooden long table in Diwali festive lantern light',
              physicalArtifacts: ['terracotta pots', 'woven bamboo platters', 'lanterns'],
              compositionMechanism: 'Leading horizontal line of seven dishes',
              copyAngle: 'Seven traditions on one Diwali table',
              textImageRelationship: 'OVERLAY_INTENTIONAL',
              referenceInsight: 'Pan-regional solidarity in festival dining',
              requiredVisualElements: ['seven distinct dishes', 'terracotta vessels', 'warm lights'],
              requiredVisualProof: ['seven vessels in a row', 'warm lantern illumination'],
              prohibitedVisualInterpretations: ['western plates'],
              styleDirection: 'DOCUMENTARY',
              mode: 'STORYTELLING',
              artDirectionFamily: 'DOCUMENTARY',
              mechanismFamily: 'STORYTELLING',
              scores: {
                conceptStrength: 90,
                brandSpecificity: 92,
                productRelevance: 88,
                visualOriginality: 89,
                scrollStoppingPotential: 88,
                messageClarity: 88,
                socialInteractionPotential: 86,
                templateRisk: 12,
                mechanismNovelty: 88,
                similarityToOtherConcepts: 15,
              },
            },
            {
              conceptName: 'The Feast Through the Window',
              communicationIdea: 'Intimate Diwali dinner seen through a rain-streaked glowing window',
              creativePremise: 'The warmth of sanctuary and festival seen from the outside world',
              creativeMechanism: 'architectural window framing an intimate glowing dinner spread',
              visualMechanism: 'exterior window view looking into warm festive interior',
              dominantVisualObject: 'steaming Asian Diwali festive feast seen through a warm illuminated window frame',
              hero: 'image',
              imageRole: 'full-bleed',
              visualWorld: 'Evening street exterior looking into a cozy glowing Diwali dining room',
              physicalArtifacts: ['timber window frame', 'glass reflections', 'brass lanterns'],
              compositionMechanism: 'Architectural window frame vignetting the central table',
              copyAngle: 'Step inside for the Diwali festival',
              textImageRelationship: 'OVERLAY_INTENTIONAL',
              referenceInsight: 'Cinematic visual framing from street photography',
              requiredVisualElements: ['window frame border', 'steaming feast inside', 'warm lights'],
              requiredVisualProof: ['window framing around interior dining scene'],
              prohibitedVisualInterpretations: ['unframed food shot'],
              styleDirection: 'CINEMATIC',
              mode: 'EDITORIAL',
              artDirectionFamily: 'CINEMATIC',
              mechanismFamily: 'VISUAL_METAPHOR',
              scores: {
                conceptStrength: 89,
                brandSpecificity: 85,
                productRelevance: 90,
                visualOriginality: 93,
                scrollStoppingPotential: 92,
                messageClarity: 84,
                socialInteractionPotential: 88,
                templateRisk: 9,
                mechanismNovelty: 91,
                similarityToOtherConcepts: 12,
              },
            },
          ],
        }),
      };

      const outcome = await generateCreativeConcepts({
        provider: mockProvider,
        request: 'Diwali special festive menu at Silk Road Asian Dining',
        goal: 'CONVERSIONS',
        funnelStage: 'CONSIDERATION',
        platforms: ['instagram'],
        hasAssets: false,
        brand: {
          name: 'Silk Road Dining',
          industry: 'food',
          description: 'North-East & Asian restaurant',
          mission: '',
          audience: '',
          tone: 'warm, refined',
          writingStyle: '',
          personality: 'festive',
          products: [],
          usp: '',
          competitors: [],
          ctaStyle: '',
          emojiStyle: '',
          wordsToUse: [],
          wordsToAvoid: [],
          brandColors: [],
          services: [],
          completeness: 100,
          provenance: {},
        },
        creativeDna: {
          brandVoice: { tone: 'warm, refined', personality: ['authentic'] },
          visualStyle: { mood: 'festive', lighting: 'warm ambient', colorPalette: [] },
          brandColors: ['#b45309'],
        },
        intent: {
          rawPrompt: 'Diwali special festive menu at Silk Road Asian Dining',
          cleanedPrompt: 'Diwali special festive menu at Silk Road Asian Dining',
          topic: 'Diwali Dining',
          event: 'Diwali',
          requiredClaims: ['Diwali', 'Festive Special'],
          confidence: 1,
        },
      });

      expect(outcome.concepts).toHaveLength(3);

      // Verify complete concept structure is preserved on every candidate
      for (const concept of outcome.concepts) {
        expect(concept.conceptName).toBeTruthy();
        expect(concept.communicationIdea).toBeTruthy();
        expect(concept.creativePremise).toBeTruthy();
        expect(concept.creativeMechanism).toBeTruthy();
        expect(concept.visualMechanism).toBeTruthy();
        expect(concept.dominantVisualObject).toBeTruthy();
        expect(concept.visualWorld).toBeTruthy();
        expect(concept.compositionMechanism).toBeTruthy();
        expect(concept.copyAngle).toBeTruthy();
        expect(concept.requiredVisualProof?.length).toBeGreaterThan(0);
        expect(concept.prohibitedVisualInterpretations?.length).toBeGreaterThan(0);
      }

      // Verify genuine mechanism family spread
      const families = outcome.concepts.map(c => c.mechanismFamily);
      expect(new Set(families).size).toBe(3);
    });
  });
});
