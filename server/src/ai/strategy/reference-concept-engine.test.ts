import { describe, it, expect } from 'vitest';
import {
  abstractReferenceDevice,
  evaluateConceptDifferentiation,
  evaluateConceptPairDifferentiation,
  deriveConceptAwareCopy,
  buildCreativeRealizationPlan,
} from './reference-concept-engine';
import type { ReferenceAwareConcept } from '../types';
import type { CreativeBrief } from '../brand/creative-brief';

describe('Reference-Aware Concept Engine', () => {
  const sampleBrief: CreativeBrief = {
    userPrompt: 'Diwali festive offer on artisanal organic sweets',
    goal: 'AWARENESS',
    funnelStage: 'TOP',
    primaryMessage: 'Pure Heritage Flavors for Festive Celebrations',
    secondaryMessages: ['Made with 100% Gir Cow A2 Ghee', 'No refined sugar'],
    subject: 'Artisanal Organic Sweets',
    event: 'Diwali',
    offer: 'Flat 20% Off Festive Gift Boxes',
    visualStory: 'The tactile beauty of festive culinary traditions',
    firstRead: 'Artisanal Diwali Sweets Box',
    attentionHierarchy: ['headline', 'image', 'offer', 'logo'],
    emotionalTone: 'warm-celebratory',
    brandVoice: { tone: 'warm, authentic, artisanal', personality: ['heritage', 'thoughtful'] },
    creativeStyle: { id: 'editorial-tactile', name: 'Editorial Tactile' },
    requiredClaims: ['Flat 20% Off Festive Gift Boxes', '100% Gir Cow A2 Ghee'],
  };

  it('abstracts cultural/cinematic references into original creative devices without copying source works', () => {
    const abstraction = abstractReferenceDevice({
      referenceName: 'Wes Anderson Symmetrical Archival Composition',
      sourceType: 'film-cinematic',
      rawText: 'Curated collection of objects in a shadowbox with vintage labels',
      targetBrand: 'Heritage Confectionery',
      productCategory: 'Organic Food & Sweets',
    });

    expect(abstraction).toBeDefined();
    expect(abstraction.sourceType).toBe('film-cinematic');
    expect(abstraction.creativeDevice).toBeDefined();
    expect(abstraction.visualMechanism).toBeDefined();
    expect(abstraction.compositionMechanism).toBeDefined();
    expect(abstraction.copyMechanism).toBeDefined();

    // Must not contain living artist names or direct copycat directives
    expect(abstraction.creativeDevice.toLowerCase()).not.toContain('wes anderson');
    expect(abstraction.freshness).toBeGreaterThan(0.7);
  });

  it('passes concept differentiation test when sibling concepts are genuinely distinct across 7 axes', () => {
    const conceptA: ReferenceAwareConcept = {
      conceptId: 'concept-archival-specimen',
      conceptName: 'Diwali as Botanical Archive',
      communicationIdea: 'Every festive sweet is an archival botanical specimen of pure earth ingredients',
      creativeMechanism: 'Archival taxonomic labeling with pressed floral substrates',
      visualMechanism: 'Physical paper substrate with specimen cutouts and specimen labels',
      hero: 'image',
      imageRole: 'floating-fragment',
      visualWorld: 'A sunlit botanical herbarium workshop with antique linen paper and dried saffron threads',
      copyAngle: 'Scientific reverence for ancient harvest ingredients',
      personality: 'editorial',
      referenceInsights: {
        sourceType: 'documentary-format',
        creativeDevice: 'Specimen taxonomy',
        narrativeDevice: 'Archival discovery',
        visualMechanism: 'Layered botanical cutouts',
        compositionMechanism: 'Taxonomic grid',
        copyMechanism: 'Precise ingredient documentation',
        emotionalEffect: 'Purity and heritage',
        culturalSignal: 'Traditional harvesting',
        freshness: 0.9,
        brandApplicability: 0.95,
      },
      textImageRelationship: 'Typographic labels cross specimen cards with tactile shadows',
      requiredVisualProof: ['sunlit linen paper', 'pressed floral saffron', 'specimen tags'],
      prohibitedInterpretations: ['Generic Diwali fireworks graphic', 'Floating 3D box render'],
      styleDirection: { artDirectionFamily: 'HANDCRAFTED', compositionFamily: 'archival-grid' },
    };

    const conceptB: ReferenceAwareConcept = {
      conceptId: 'concept-family-memory',
      conceptName: 'Diwali as Recovered Family Memory',
      communicationIdea: 'Festive treats are time capsules unlocking childhood courtyard memories',
      creativeMechanism: 'Candid documentary instant-film collage with nostalgic handwritten ephemera',
      visualMechanism: 'Sun-bleached polaroid fragments overlapping warm golden lighting',
      hero: 'image',
      imageRole: 'full-bleed',
      visualWorld: 'A warm 1980s family courtyard filled with golden morning haze and brass vessels',
      copyAngle: 'Nostalgic emotional homecoming',
      personality: 'nostalgic',
      referenceInsights: {
        sourceType: 'cultural-moment',
        creativeDevice: 'Memory artifact collage',
        narrativeDevice: 'Childhood remembrance',
        visualMechanism: 'Golden hour courtyard snapshot',
        compositionMechanism: 'Offset editorial framing',
        copyMechanism: 'Warm intimate reflections',
        emotionalEffect: 'Deep emotional resonance',
        culturalSignal: 'Generational bonding',
        freshness: 0.88,
        brandApplicability: 0.92,
      },
      textImageRelationship: 'Large emotive headline anchored in quiet courtyard sky',
      requiredVisualProof: ['brass antique tableware', 'golden morning courtyard light', 'candid human presence'],
      prohibitedInterpretations: ['Stock photography models smiling at camera', 'Glossy retail catalog mockup'],
      styleDirection: { artDirectionFamily: 'DOCUMENTARY', compositionFamily: 'asymmetric-editorial' },
    };

    const conceptC: ReferenceAwareConcept = {
      conceptId: 'concept-culinary-ritual',
      conceptName: 'Diwali as Ceremonial Culinary Ritual',
      communicationIdea: 'Slow-churned artisanal ghee sweets prepared as sacred sacred geometry',
      creativeMechanism: 'Top-down macro culinary geometry on raw soapstone surface',
      visualMechanism: 'High-contrast directional sunlight casting sculpted shadows over raw ingredients',
      hero: 'typography',
      imageRole: 'offset-crop',
      visualWorld: 'A minimalist stone kitchen atelier with dark soapstone and molten golden ghee drips',
      copyAngle: 'Culinary mastery and zero compromise',
      personality: 'deadpan',
      referenceInsights: {
        sourceType: 'tv-editorial',
        creativeDevice: 'Macro texture geometry',
        narrativeDevice: 'Process celebration',
        visualMechanism: 'Architectural food close-ups',
        compositionMechanism: 'High-contrast negative space',
        copyMechanism: 'Direct authoritative declarations',
        emotionalEffect: 'Craving and sophistication',
        culturalSignal: 'Artisanal purity',
        freshness: 0.92,
        brandApplicability: 0.9,
      },
      textImageRelationship: 'Architectural Swiss typography balanced over minimal dark negative space',
      requiredVisualProof: ['macro soapstone texture', 'molten ghee droplets', 'sharp directional sun shadows'],
      prohibitedInterpretations: ['Cartoon sweets illustrations', 'Generic festive border clipart'],
      styleDirection: { artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY', compositionFamily: 'minimal-swiss' },
    };

    const report = evaluateConceptDifferentiation([conceptA, conceptB, conceptC]);
    expect(report.isPoolDifferentiated).toBe(true);
    expect(report.mustRegenerate).toBe(false);
    expect(report.overallDivergenceScore).toBeGreaterThan(0.7);
    expect(report.convergenceWarnings.length).toBe(0);
  });

  it('detects concept convergence when concepts are superficial variants of the same idea', () => {
    const badConceptA: ReferenceAwareConcept = {
      conceptId: 'bad-1',
      conceptName: 'Elegant Diwali',
      communicationIdea: 'Celebrate Diwali with premium sweets',
      creativeMechanism: 'Show sweets on golden background',
      visualMechanism: 'Sweets on golden plate',
      hero: 'image',
      imageRole: 'hero',
      visualWorld: 'Golden Diwali background',
      copyAngle: 'Celebrate festive joy',
      personality: 'editorial',
      referenceInsights: {
        sourceType: 'advertising-convention',
        creativeDevice: 'Golden lighting',
        narrativeDevice: 'Festive greeting',
        visualMechanism: 'Gold plate',
        compositionMechanism: 'Center',
        copyMechanism: 'Festive headline',
        emotionalEffect: 'Happiness',
        culturalSignal: 'Festival',
        freshness: 0.4,
        brandApplicability: 0.8,
      },
      textImageRelationship: 'Text above image',
      requiredVisualProof: ['sweets', 'gold plate'],
      prohibitedInterpretations: ['CGI'],
      styleDirection: { artDirectionFamily: 'PRODUCT_STUDIO', compositionFamily: 'centered' },
    };

    const badConceptB: ReferenceAwareConcept = {
      conceptId: 'bad-2',
      conceptName: 'Premium Diwali',
      communicationIdea: 'Celebrate Diwali with luxury sweets',
      creativeMechanism: 'Show sweets on shiny golden background',
      visualMechanism: 'Sweets on golden luxury plate',
      hero: 'image',
      imageRole: 'hero',
      visualWorld: 'Golden luxury Diwali background',
      copyAngle: 'Celebrate luxury festive joy',
      personality: 'editorial',
      referenceInsights: {
        sourceType: 'advertising-convention',
        creativeDevice: 'Golden luxury lighting',
        narrativeDevice: 'Festive greeting',
        visualMechanism: 'Gold plate',
        compositionMechanism: 'Center',
        copyMechanism: 'Festive headline',
        emotionalEffect: 'Luxury',
        culturalSignal: 'Festival',
        freshness: 0.4,
        brandApplicability: 0.8,
      },
      textImageRelationship: 'Text above image',
      requiredVisualProof: ['sweets', 'gold plate'],
      prohibitedInterpretations: ['CGI'],
      styleDirection: { artDirectionFamily: 'PRODUCT_STUDIO', compositionFamily: 'centered' },
    };

    const pairReport = evaluateConceptPairDifferentiation(badConceptA, badConceptB);
    expect(pairReport.isDifferentiated).toBe(false);
    expect(pairReport.similarityScore).toBeGreaterThan(0.45);
    expect(pairReport.convergedDimensions.length).toBeGreaterThan(3);

    const report = evaluateConceptDifferentiation([badConceptA, badConceptB]);
    expect(report.isPoolDifferentiated).toBe(false);
    expect(report.mustRegenerate).toBe(true);
  });

  it('derives concept-aware copy following Concept -> angle -> hook -> headline -> support -> CTA', () => {
    const concept: ReferenceAwareConcept = {
      conceptId: 'concept-test',
      conceptName: 'Diwali as Botanical Archive',
      communicationIdea: 'Every sweet is an archival specimen of unadulterated earth ingredients',
      creativeMechanism: 'Archival taxonomic labeling with pressed floral substrates',
      visualMechanism: 'Physical paper substrate with specimen cutouts',
      hero: 'image',
      imageRole: 'floating-fragment',
      visualWorld: 'Sunlit herbarium atelier',
      copyAngle: 'Documentary reverence for pure harvest',
      personality: 'witty',
      referenceInsights: {
        sourceType: 'documentary-format',
        creativeDevice: 'Specimen taxonomy',
        narrativeDevice: 'Archival study',
        visualMechanism: 'Botanical cutouts',
        compositionMechanism: 'Taxonomic grid',
        copyMechanism: 'Archival cataloging',
        emotionalEffect: 'Purity',
        culturalSignal: 'Heritage harvest',
        freshness: 0.9,
        brandApplicability: 0.9,
      },
      textImageRelationship: 'Labels anchoring specimen',
      requiredVisualProof: ['linen paper', 'saffron flora'],
      prohibitedInterpretations: ['Generic template'],
      styleDirection: { artDirectionFamily: 'HANDCRAFTED', compositionFamily: 'archival-grid' },
    };

    const copyPkg = deriveConceptAwareCopy({
      concept,
      brief: sampleBrief,
      requiredClaims: sampleBrief.requiredClaims,
    });

    expect(copyPkg).toBeDefined();
    expect(copyPkg.headline).toBeDefined();
    expect(copyPkg.support).toBeDefined();
    expect(copyPkg.cta).toBeDefined();

    // Verify required claim is preserved in the support or headline
    const fullText = `${copyPkg.headline} ${copyPkg.support} ${copyPkg.cta}`;
    expect(fullText).toContain('20% Off');
  });

  it('builds a CreativeRealizationPlan and compiles image prompt with zero typography/DDE leakage', () => {
    const concept: ReferenceAwareConcept = {
      conceptId: 'concept-test',
      conceptName: 'Diwali as Botanical Archive',
      communicationIdea: 'Every sweet is an archival specimen of unadulterated earth ingredients',
      creativeMechanism: 'Archival taxonomic labeling with pressed floral substrates',
      visualMechanism: 'Physical paper substrate with specimen cutouts',
      hero: 'image',
      imageRole: 'floating-fragment',
      visualWorld: 'Sunlit herbarium atelier with antique linen paper',
      copyAngle: 'Documentary reverence for pure harvest',
      personality: 'editorial',
      referenceInsights: {
        sourceType: 'documentary-format',
        creativeDevice: 'Specimen taxonomy',
        narrativeDevice: 'Archival study',
        visualMechanism: 'Botanical cutouts',
        compositionMechanism: 'Taxonomic grid',
        copyMechanism: 'Archival cataloging',
        emotionalEffect: 'Purity',
        culturalSignal: 'Heritage harvest',
        freshness: 0.9,
        brandApplicability: 0.9,
      },
      textImageRelationship: 'Labels anchoring specimen',
      requiredVisualProof: ['linen paper', 'saffron flora'],
      prohibitedInterpretations: ['Generic AI render with floating glow'],
      styleDirection: { artDirectionFamily: 'HANDCRAFTED', compositionFamily: 'archival-grid' },
    };

    const plan = buildCreativeRealizationPlan({
      concept,
      brief: sampleBrief,
    });

    expect(plan).toBeDefined();
    expect(plan.compiledImagePrompt).toBeDefined();
    expect(plan.materials.length).toBeGreaterThan(0);
    expect(plan.naturalnessRequirements.length).toBeGreaterThan(0);

    const prompt = plan.compiledImagePrompt;

    // Must describe scene, physical lighting, camera, textures
    expect(prompt).toContain('PHYSICAL SCENE & ENVIRONMENT:');
    expect(prompt).toContain('MATERIALS & TEXTURES:');
    expect(prompt).toContain('REQUIRED VISUAL PROOF (MUST BE VISIBLE):');

    // Strict non-leakage invariant: No font names, font weights, font sizes, tracking, or DDE coordinates in image prompt
    expect(prompt).not.toMatch(/fontSize|fontFamily|fontWeight|tracking|zIndex|letterSpacing/i);
    expect(prompt).not.toMatch(/\{"x":\s*\d+/);
  });
});
