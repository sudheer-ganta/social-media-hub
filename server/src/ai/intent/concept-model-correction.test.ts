import { describe, it, expect } from 'vitest';
import {
  evaluateConceptRealizability,
  isEligibleFallback,
  isAbstractOccasionOrTheme,
} from './concept-realizability-gate';
import {
  buildCreativeRealizationContract,
  assertCreativeRealizationContractConsistent,
} from './creative-realization-contract';
import {
  normalizeConceptCandidate,
} from '../generators/creative-concepts.generator';
import {
  buildConceptIdentity,
  evaluateConceptDivergence,
  analyzeConceptPoolDivergence,
} from '../strategy/creative-differentiation';
import { buildCanonicalCreativeBrief } from '../brand/creative-brief';

describe('FlowPost — Concept Model + Realization Contract Forensic Verification', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // CASE A: Diwali Restaurant
  // Expected: at least 3 valid, genuinely different concepts with physical
  // dominantVisualObject and occasion preserved separately in ConceptIntent.
  // ─────────────────────────────────────────────────────────────────────────
  it('CASE A: Diwali restaurant produces 3 valid, physically grounded, highly differentiated concepts', () => {
    const rawConcepts = [
      {
        conceptName: 'The Clay Diya Meets Bamboo Steamers',
        communicationIdea: 'Festive Diwali light physically illuminates the authentic North-East bamboo steam craft',
        creativePremise: 'Diwali light transforms how traditional culinary craft is visually revealed',
        creativeMechanism: 'Macro juxtaposition of glowing terracotta oil lamp and steaming woven bamboo baskets',
        visualMechanism: 'Warm low-angle candlelight raking across textured bamboo weave and escaping steam',
        dominantVisualObject: 'steaming bamboo steamer illuminated by a clay diya',
        hero: 'image',
        imageRole: 'full-bleed',
        visualWorld: 'Rustic mountain dining table bathed in warm terracotta festive candlelight',
        physicalArtifacts: ['terracotta clay diya', 'bamboo steamer baskets', 'fresh herbs', 'steaming broth'],
        compositionMechanism: 'Asymmetric diagonal alignment placing diya in foreground left and steamers upper right',
        copyAngle: 'Atmospheric illumination, transition across light and shadow, culinary warmth',
        occasion: 'Diwali',
        scores: { conceptStrength: 90, brandSpecificity: 88, productRelevance: 92, visualOriginality: 90, templateRisk: 10, mechanismNovelty: 88, similarityToOtherConcepts: 15 },
      },
      {
        conceptName: 'Spice Grain Rangoli Platter',
        communicationIdea: 'The cuisine itself becomes a sacred festive ritual rangoli',
        creativePremise: 'Traditional festive geometric ritual motifs formed organically from raw culinary spices',
        creativeMechanism: 'Overhead flatlay mandala formed from star anise, whole chilies, and Himalayan salt grains framing the signature dish',
        visualMechanism: 'Top-down geometric mandala composition radiating outward from a steaming brass bowl',
        dominantVisualObject: 'overhead geometric spice rangoli encircling a signature dining bowl',
        hero: 'image',
        imageRole: 'full-bleed',
        visualWorld: 'Dark slate stone surface intricately patterned with vibrant aromatic spices',
        physicalArtifacts: ['star anise', 'sichuan pepper', 'black cardamom', 'polished slate', 'brass bowl'],
        compositionMechanism: 'Concentric radial mandala framing central visual anchor',
        copyAngle: 'Sacred culinary geometry, aromatic art, festive craftsmanship',
        occasion: 'Diwali',
        scores: { conceptStrength: 88, brandSpecificity: 85, productRelevance: 90, visualOriginality: 89, templateRisk: 12, mechanismNovelty: 85, similarityToOtherConcepts: 18 },
      },
      {
        conceptName: 'Himalayan Brass Hot Pot Reflection',
        communicationIdea: 'The restaurant dining ritual is celebrated as an intimate communal festive gathering',
        creativePremise: 'Community and shared warmth as the true emotional core of festive dining',
        creativeMechanism: 'Deep golden reflections of diya flames in the polished surface of a hand-hammered brass hot pot',
        visualMechanism: 'Shallow depth-of-field close-up capturing candle flame bokeh dancing on hammered metal',
        dominantVisualObject: 'hand-hammered brass hot pot emitting steam with festive candle reflections',
        hero: 'image',
        imageRole: 'full-bleed',
        visualWorld: 'Atmospheric communal dining room with warm golden reflections and family presence',
        physicalArtifacts: ['hand-hammered brass hot pot', 'communal chopsticks', 'small brass oil lamps'],
        compositionMechanism: 'Central hero mass with golden bokeh framing the negative space',
        copyAngle: 'Communal warmth, shared celebration, intimate dining memory',
        occasion: 'Diwali',
        scores: { conceptStrength: 92, brandSpecificity: 90, productRelevance: 94, visualOriginality: 92, templateRisk: 8, mechanismNovelty: 90, similarityToOtherConcepts: 12 },
      },
    ];

    const normalized = rawConcepts.map((r) => normalizeConceptCandidate(r, { occasion: 'Diwali', prompt: 'Diwali restaurant festive special' })!);
    expect(normalized).toHaveLength(3);

    // Verify all survive the quality and realizability gate
    for (const c of normalized) {
      const assessment = evaluateConceptRealizability({
        concept: c,
        brief: { subject: 'Asian dining', event: 'Diwali' },
        intent: { event: 'Diwali', productCategory: 'Restaurant dining' },
        userPrompt: 'Diwali special feast at Himalayan restaurant',
      });
      expect(assessment.overallDecision).toBe('PASS');
      expect(assessment.dominantVisualValidity).toBe(true);
      expect(assessment.failures).toHaveLength(0);

      // Verify physical dominantVisualObject is preserved and distinct from occasion
      expect(c.dominantVisualObject).not.toBe('Diwali');
      expect(isAbstractOccasionOrTheme(c.dominantVisualObject!)).toBe(false);
      expect(c.conceptIntent?.occasion).toBe('Diwali');
    }

    // Verify high semantic diversity across creative premises
    const divergence = analyzeConceptPoolDivergence(normalized);
    expect(divergence.overallDiversityScore).toBeGreaterThanOrEqual(0.60);
    expect(divergence.hasConvergence).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CASE B: Ganesh Chaturthi Fashion
  // Expected: physical visual concepts, not generic festival themes.
  // ─────────────────────────────────────────────────────────────────────────
  it('CASE B: Ganesh Chaturthi fashion enforces physical garment styling rather than generic festival themes', () => {
    const rawConcept = {
      conceptName: 'Marigold Silk Draping',
      communicationIdea: 'Festive silk weaves structured with ritual marigold garlands',
      creativePremise: 'The sacred texture of festive handloom silk paired with fresh ceremonial botanicals',
      creativeMechanism: 'Close crop of raw handwoven silk garment draped with fresh orange marigolds',
      visualMechanism: 'Tactile macro photography of silk warp and weft illuminated by morning sunlight',
      dominantVisualObject: 'draped raw silk festive kurta paired with fresh marigold floral garland',
      hero: 'image',
      imageRole: 'full-bleed',
      visualWorld: 'Sunlit stone courtyard with ceremonial floral adornments',
      physicalArtifacts: ['handloom silk fabric', 'marigold garland', 'carved stone pillar'],
      occasion: 'Ganesh Chaturthi',
      scores: { conceptStrength: 88, brandSpecificity: 85, productRelevance: 90, visualOriginality: 88, templateRisk: 10, mechanismNovelty: 85, similarityToOtherConcepts: 10 },
    };

    const normalized = normalizeConceptCandidate(rawConcept, { occasion: 'Ganesh Chaturthi', prompt: 'Festive ethnic fashion collection' })!;
    expect(normalized).not.toBeNull();

    const assessment = evaluateConceptRealizability({
      concept: normalized,
      brief: { subject: 'Ethnic menswear', event: 'Ganesh Chaturthi' },
      intent: { event: 'Ganesh Chaturthi', productCategory: 'Fashion' },
      userPrompt: 'Festive ethnic wear for Ganesh Chaturthi',
    });

    expect(assessment.overallDecision).toBe('PASS');
    expect(assessment.dominantVisualValidity).toBe(true);
    expect(assessment.occasionFit).toBe(true);
    expect(normalized.dominantVisualObject).toBe('draped raw silk festive kurta paired with fresh marigold floral garland');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CASE C: Food Campaign Different Communication Premises
  // Expected: different communication premises, not three lighting variants.
  // ─────────────────────────────────────────────────────────────────────────
  it('CASE C: Food campaign concepts must differ in communication premise, not merely lighting/style', () => {
    const concept1 = normalizeConceptCandidate({
      conceptName: 'The Craft of Noodle Pulling',
      communicationIdea: 'Mastery of physical technique and artisan discipline',
      creativePremise: 'Culinary excellence evidenced through the physical motion of dough stretching',
      creativeMechanism: 'High-speed stop motion of flour particles and airborne hand-pulled noodles',
      visualMechanism: 'Kinetic macro shot of stretched dough strands caught mid-motion with airborne flour dust',
      dominantVisualObject: 'artisan chef pulling fresh ramen noodles with airborne flour dust',
      hero: 'image',
      imageRole: 'full-bleed',
      visualWorld: 'Dark kitchen studio with dramatic rim lighting catching dust motes',
      physicalArtifacts: ['flour dust', 'stretched dough', 'wooden worktop'],
      scores: { conceptStrength: 90, brandSpecificity: 85, productRelevance: 95, visualOriginality: 92, templateRisk: 10, mechanismNovelty: 90, similarityToOtherConcepts: 10 },
    })!;

    const concept2 = normalizeConceptCandidate({
      conceptName: 'The Late Night Slurp',
      communicationIdea: 'Intimate human comfort and post-work decompression',
      creativePremise: 'Food as a personal emotional sanctuary after midnight',
      creativeMechanism: 'Candid documentary portrait of a solitary diner lost in steam and flavor',
      visualMechanism: 'Atmospheric neon-lit window view into a rainy night diner booth',
      dominantVisualObject: 'solitary diner eating steaming noodles beside rain-streaked neon window',
      hero: 'image',
      imageRole: 'full-bleed',
      visualWorld: 'Rainy city night diner illuminated by soft exterior neon glow',
      physicalArtifacts: ['steaming ceramic bowl', 'chopsticks', 'rain-slicked glass'],
      scores: { conceptStrength: 88, brandSpecificity: 88, productRelevance: 90, visualOriginality: 89, templateRisk: 12, mechanismNovelty: 88, similarityToOtherConcepts: 15 },
    })!;

    const divergence = evaluateConceptDivergence(
      buildConceptIdentity(concept1),
      buildConceptIdentity(concept2),
    );

    expect(divergence.divergenceScore).toBeGreaterThanOrEqual(0.70);
    expect(divergence.isDifferentiated).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CASE D: Concept Using Typography
  // Expected: typography mechanism assigned to DDE, not image generation.
  // ─────────────────────────────────────────────────────────────────────────
  it('CASE D: Concept using typography assigns mechanism to DDE and passes realization validation', () => {
    const typoConcept = {
      conceptName: 'Bold Typographic Declaration',
      communicationIdea: 'High authority textual conviction celebrating the festive season',
      creativePremise: 'Oversized typographic letterforms acting as structural architecture',
      creativeMechanism: 'Typographic scale contrast with condensed display letterforms anchoring the layout',
      visualMechanism: 'Oversized display typography commanding 40% canvas occupancy',
      dominantVisualObject: 'subtle textured background paper with clean spatial void',
      hero: 'typography',
      imageRole: 'omitted',
      mechanismOwner: 'DDE',
      visualWorld: 'Clean editorial print canvas with high paper tactile grain',
      physicalArtifacts: ['textured archival paper'],
      scores: { conceptStrength: 85, brandSpecificity: 80, productRelevance: 85, visualOriginality: 82, templateRisk: 15, mechanismNovelty: 80, similarityToOtherConcepts: 10 },
    };

    const normalized = normalizeConceptCandidate(typoConcept)!;
    expect(normalized.mechanismOwner).toBe('DDE');

    const assessment = evaluateConceptRealizability({
      concept: normalized,
      brief: { subject: 'Editorial branding', event: 'Diwali' },
      userPrompt: 'Typographic festival greeting',
    });

    expect(assessment.overallDecision).toBe('PASS');
    expect(assessment.mechanismLayerCompatibility).toBe(true);
    expect(assessment.mechanismLayerOwner).toBe('DDE');

    const contract = buildCreativeRealizationContract({
      concept: {
        conceptName: normalized.conceptName,
        visualIdea: normalized.bigIdea,
        creativeMechanism: normalized.creativeMechanism,
        dominantVisualObject: normalized.dominantVisualObject,
        hero: 'typography',
        imageRole: 'omitted',
        typeBehavior: 'Oversized condensed display headline',
      } as any,
      brief: { subject: 'Festive Type', requiredClaims: [] } as any,
    });

    assertCreativeRealizationContractConsistent(contract);
    expect(contract.downstreamRequirements.some((r) => r.owner === 'DYNAMIC_DESIGN_ENGINE')).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CASE E: Unrelated Fallback Concept
  // Expected: rejected before image generation.
  // ─────────────────────────────────────────────────────────────────────────
  it('CASE E: Unrelated historical fallback concept (e.g. botanical archive for a restaurant) is rejected', () => {
    const botanicalConcept = normalizeConceptCandidate({
      conceptName: 'Botanical Specimen Archive',
      communicationIdea: 'Pressed Alpine flora preserving heritage memory',
      creativePremise: 'Mountain herbarium specimens mounted on aged cotton rag paper',
      creativeMechanism: 'Dried mountain Edelweiss pressed beneath glass with handwritten archival labels',
      visualMechanism: 'Scientific botanical mounting with pinned dried specimens',
      dominantVisualObject: 'pressed mountain flower specimens pinned to parchment',
      hero: 'image',
      imageRole: 'full-bleed',
      visualWorld: '19th century alpine naturalist laboratory',
      physicalArtifacts: ['dried edelweiss', 'brass botanical pins', 'cotton rag paper'],
      scores: { conceptStrength: 85, brandSpecificity: 80, productRelevance: 30, visualOriginality: 85, templateRisk: 10, mechanismNovelty: 85, similarityToOtherConcepts: 10 },
    })!;

    const fallbackCheck = isEligibleFallback(
      botanicalConcept,
      { subject: 'Dim Sum Restaurant', event: 'Diwali' },
      { event: 'Diwali', productCategory: 'Restaurant dining' },
      'Festive Diwali dining at dim sum restaurant',
    );

    expect(fallbackCheck.eligible).toBe(false);
    expect(fallbackCheck.rejectionReason).toContain('DOMAIN_RELEVANCE_MISMATCH');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CASE F: Occasion Assigned as Dominant Visual Object
  // Expected: rejected with DOMINANT_OBJECT_OCCASION_VIOLATION.
  // ─────────────────────────────────────────────────────────────────────────
  it('CASE F: Occasion assigned directly as dominantVisualObject triggers DOMINANT_OBJECT_OCCASION_VIOLATION', () => {
    const rawBadConcept = {
      conceptName: 'Diwali Joy',
      communicationIdea: 'Celebrate Diwali with warm happiness',
      creativePremise: 'Festive feelings during Diwali',
      creativeMechanism: 'Diwali festive mood',
      visualMechanism: 'Diwali celebration',
      dominantVisualObject: 'Diwali', // ILLEGAL: occasion as physical object
      hero: 'image',
      imageRole: 'full-bleed',
      scores: { conceptStrength: 80, brandSpecificity: 70, productRelevance: 70, visualOriginality: 50, templateRisk: 40, mechanismNovelty: 50, similarityToOtherConcepts: 20 },
    };

    const assessment = evaluateConceptRealizability({
      concept: rawBadConcept,
      brief: { subject: 'Diwali' },
      userPrompt: 'Diwali sale',
    });

    expect(assessment.failures.some((f) => f.includes('DOMINANT_OBJECT_OCCASION_VIOLATION'))).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CASE G: Concept Explicitly Provides Physical Dominant Visual Object
  // Expected: occasion metadata does not overwrite it.
  // ─────────────────────────────────────────────────────────────────────────
  it('CASE G: Concept explicitly providing physical dominantVisualObject retains it regardless of occasion metadata', () => {
    const physicalConcept = {
      conceptName: 'The Clay Diya Meets Bamboo Steamers',
      communicationIdea: 'Festive light illuminates steaming dumplings',
      creativePremise: 'Light transforms food texture',
      creativeMechanism: 'Glowing clay diya beside bamboo steamer',
      visualMechanism: 'Warm raking light across bamboo weave',
      dominantVisualObject: 'steaming bamboo steamer illuminated by a clay diya',
      hero: 'image',
      imageRole: 'full-bleed',
      visualWorld: 'Warm festive restaurant tabletop',
      physicalArtifacts: ['clay diya', 'bamboo steamer'],
      occasion: 'Diwali',
      scores: { conceptStrength: 90, brandSpecificity: 88, productRelevance: 92, visualOriginality: 90, templateRisk: 10, mechanismNovelty: 88, similarityToOtherConcepts: 15 },
    };

    const normalized = normalizeConceptCandidate(physicalConcept, { occasion: 'Diwali', prompt: 'Diwali restaurant special' })!;

    // 1. Check normalized candidate
    expect(normalized.dominantVisualObject).toBe('steaming bamboo steamer illuminated by a clay diya');
    expect(normalized.conceptIntent?.occasion).toBe('Diwali');
    expect(normalized.visualRealizationIntent?.dominantVisualObject).toBe('steaming bamboo steamer illuminated by a clay diya');

    // 2. Check canonical brief creation
    const brief = buildCanonicalCreativeBrief({
      userPrompt: 'Diwali restaurant special feast',
      goal: 'sales',
      funnelStage: 'BOFU',
      intent: { event: 'Diwali', productCategory: 'Restaurant dining' } as any,
      concept: normalized,
    });

    expect(brief.event).toBe('Diwali');
    expect(brief.chosenConcept?.dominantVisualObject).toBe('steaming bamboo steamer illuminated by a clay diya');

    // 3. Check realization contract creation
    const contract = buildCreativeRealizationContract({
      concept: {
        conceptName: normalized.conceptName,
        visualIdea: normalized.bigIdea,
        creativeMechanism: normalized.creativeMechanism,
        dominantVisualObject: normalized.dominantVisualObject,
        hero: 'image',
        imageRole: 'full-bleed',
        conceptIntent: normalized.conceptIntent,
        visualRealizationIntent: normalized.visualRealizationIntent,
      } as any,
      brief,
    });

    expect(contract.dominantVisualObject).toBe('steaming bamboo steamer illuminated by a clay diya');
    expect(contract.occasion).toBe('Diwali');
    expect(contract.imageGenerationRequirements[0].description).toContain('steaming bamboo steamer illuminated by a clay diya');
  });
});
