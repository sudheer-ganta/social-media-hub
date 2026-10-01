import { describe, it, expect } from 'vitest';
import { evaluateConceptRealizability, assertConceptRealizable, isEligibleFallback } from './concept-realizability-gate';
import { buildCreativeRealizationContract, assertCreativeRealizationContractConsistent } from './creative-realization-contract';
import { buildImageRealizationSpec, compileImagePromptFromSpec } from './image-realization-spec';

describe('Live Production E2E Verification Across Required Cases', () => {
  it('CASE 1: Diwali + restaurant + Asian food', () => {
    const brief = {
      userPrompt: 'Promote our Diwali special festive menu at Silk Road Asian Dining',
      subject: 'Asian / North-East Restaurant Diwali Festive Feast',
      goal: 'promote festive dining',
      requiredClaims: ['Diwali', 'Festive Feast', 'Book Table'],
    };

    // Valid concept
    const validConcept = {
      id: 'c1',
      conceptName: 'The Festive Lantern Table',
      communicationIdea: 'Celebrate Diwali with an illuminated feast of signature Asian delicacies',
      creativeMechanism: 'warm oil lamps and brass lanterns illuminate steaming clay pots and bamboo steamers on a dark wood table',
      visualMechanism: 'warm oil lamps and brass lanterns illuminate steaming clay pots and bamboo steamers on a dark wood table',
      dominantVisualObject: 'steaming Asian festive feast surrounded by glowing brass oil lamps',
      imageRole: 'full-bleed' as const,
      requiredVisualProof: ['warm oil lamps visibly illuminating the dining scene', 'steaming Asian dishes arranged festive style'],
      prohibitedInterpretations: ['generic food without festive lighting', 'floating text in photo'],
      textImageRelationship: 'OVERLAY_INTENTIONAL' as const,
      mechanismOwner: 'IMAGE' as const,
    };

    const assessment = evaluateConceptRealizability(validConcept, brief, { requiredClaims: ['Diwali'] });
    expect(assessment.overallDecision).toBe('PASS');
    expect(assessment.dominantVisualValidity).toBe(true);
    expect(assessment.occasionFit).toBe(true);

    const contract = buildCreativeRealizationContract({
      concept: validConcept,
      brief,
      direction: { subject: brief.subject, visualStory: validConcept.creativeMechanism },
      attemptId: 0,
    });
    assertCreativeRealizationContractConsistent(contract);
    expect(contract.occasion).toBe('Diwali');
    expect(contract.dominantVisualObject).not.toBe('Diwali');

    const spec = buildImageRealizationSpec({
      concept: validConcept,
      brief,
      direction: { subject: brief.subject },
      copySummary: { copyCount: 3, hasHeadline: true, hasSupport: true, hasCta: true, hasBadge: false },
      attemptId: 0,
    });
    const prompt = compileImagePromptFromSpec(spec);
    expect(prompt).toContain('steaming Asian festive feast surrounded by glowing brass oil lamps');
    expect(prompt).not.toContain('Diwali banner with typography');
  });

  it('CASE 2: Diwali + fashion', () => {
    const brief = {
      userPrompt: 'Diwali festive silk kurta collection launch',
      subject: 'Festive Silk Ethnic Wear',
      goal: 'launch new collection',
      requiredClaims: ['Diwali Collection', 'Pure Silk'],
    };

    const concept = {
      id: 'c2',
      conceptName: 'Loom & Luster',
      communicationIdea: 'Rich handloom textiles catch the warm glow of festival evenings',
      creativeMechanism: 'hand-woven raw silk fabric draped over wooden looms illuminated by warm festive rim lighting',
      dominantVisualObject: 'draped festive silk garments with intricate golden zari borders in warm evening light',
      imageRole: 'full-bleed' as const,
      requiredVisualProof: ['rich woven silk texture visible under warm amber lighting'],
      textImageRelationship: 'OVERLAY_INTENTIONAL' as const,
    };

    const assessment = evaluateConceptRealizability(concept, brief, { requiredClaims: ['Diwali Collection'] });
    expect(assessment.overallDecision).toBe('PASS');
    expect(assessment.mechanismLayerOwner).toBe('IMAGE');

    const contract = buildCreativeRealizationContract({
      concept,
      brief,
      direction: { subject: brief.subject },
    });
    assertCreativeRealizationContractConsistent(contract);
    expect(contract.dominantVisualObject).toContain('silk');
  });

  it('CASE 3: Ganesh Chaturthi + fashion', () => {
    const brief = {
      userPrompt: 'Ganesh Chaturthi ethnic couture collection',
      subject: 'Traditional Festive Kurta and Saree',
      requiredClaims: ['Ganesh Chaturthi Special'],
    };

    const concept = {
      id: 'c3',
      conceptName: 'Marigold & Silk',
      communicationIdea: 'Vibrant saffron and gold festive attire celebratory elegance',
      creativeMechanism: 'festive saffron silk fabric accented with fresh marigold floral garlands in morning sunlight',
      dominantVisualObject: 'traditional saffron and gold festive silk attire styled with fresh marigold accents',
      imageRole: 'full-bleed' as const,
      requiredVisualProof: ['saffron silk garment texture with marigold floral styling in soft natural light'],
    };

    const assessment = evaluateConceptRealizability(concept, brief);
    expect(assessment.overallDecision).toBe('PASS');
    expect(assessment.mechanismLayerOwner).toBe('IMAGE');
  });

  it('CASE 4: Generic food campaign', () => {
    const brief = {
      userPrompt: 'Artisanal sourdough bakery weekend special',
      subject: 'Artisanal Sourdough Bread',
      requiredClaims: ['Freshly Baked', 'Weekend Only'],
    };

    const concept = {
      id: 'c4',
      conceptName: 'Crust & Crumb',
      communicationIdea: 'Rustic artisanal sourdough fresh from stone hearth oven',
      creativeMechanism: 'cross-section of open-crumb sourdough loaf with dusted flour on rustic wooden board',
      dominantVisualObject: 'rustic golden-crusted sourdough loaf sliced open on flour-dusted wood block',
      imageRole: 'full-bleed' as const,
      requiredVisualProof: ['golden blistered crust and airy sourdough crumb texture on wood cutting board'],
    };

    const assessment = evaluateConceptRealizability(concept, brief);
    expect(assessment.overallDecision).toBe('PASS');
    expect(assessment.occasionFit).toBe(true);
  });

  it('CASE 5: Concept with atmospheric visual ground supporting downstream DDE composition', () => {
    const brief = {
      userPrompt: 'Late Night Coffee Roasters 50% Off',
      subject: 'Specialty Coffee Bar',
      requiredClaims: ['50% Off', 'Midnight Brew'],
    };

    const typoConcept = {
      id: 'c5',
      conceptName: 'Midnight Brew After Hours',
      communicationIdea: 'Atmospheric espresso bar after midnight with quiet steam and deep shadows',
      creativeMechanism: 'ambient espresso bar counter with steam catching warm low-angle point light in generous negative space',
      dominantVisualObject: 'moody atmospheric coffee bar counter with ambient espresso steam and deep shadow',
      imageRole: 'full-bleed' as const,
      requiredVisualProof: ['atmospheric espresso bar interior with ambient lighting and quiet negative space'],
      mechanismOwner: 'DDE' as const,
    };

    const assessment = evaluateConceptRealizability(typoConcept, brief);
    expect(assessment.overallDecision).toBe('PASS');
    expect(assessment.mechanismLayerOwner).toBe('DDE');

    const contract = buildCreativeRealizationContract({
      concept: typoConcept,
      brief,
      direction: { subject: brief.subject },
    });
    assertCreativeRealizationContractConsistent(contract);
    expect(contract.mechanismOwner).toBe('DDE');

    const spec = buildImageRealizationSpec({
      concept: typoConcept,
      brief,
      direction: { subject: brief.subject },
      copySummary: { copyCount: 2, hasHeadline: true, hasSupport: true, hasCta: false, hasBadge: false },
    });
    const prompt = compileImagePromptFromSpec(spec);
    // Base image prompt must NOT try to bake typography into the photo
    expect(prompt).toContain('Absolutely wordless and clean');
    expect(prompt).toContain('Full-bleed atmospheric ground');
    expect(prompt).not.toContain('render giant letters');
  });
});
