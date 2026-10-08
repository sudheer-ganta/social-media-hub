import { describe, expect, it } from 'vitest';
import { evaluateConceptRealizability } from './concept-realizability-gate';

const concept = (over: Record<string, unknown>) => ({
  id: 'c1',
  conceptName: 'Placeholder',
  communicationIdea: 'An idea',
  creativeMechanism: 'a physical object lit from the side',
  visualMechanism: 'a physical object lit from the side',
  dominantVisualObject: 'a single object',
  imageRole: 'full-bleed' as const,
  requiredVisualProof: ['the object is clearly visible'],
  prohibitedInterpretations: [],
  textImageRelationship: 'OVERLAY_INTENTIONAL' as const,
  mechanismOwner: 'IMAGE' as const,
  ...over,
});

const EVENT_BRIEF = {
  userPrompt: 'Launch party for our new rooftop cafe and dining room in Bengaluru this Friday 7 PM, live acoustic music',
  subject: 'Rooftop cafe launch party',
  requiredClaims: ['Launch party', 'new rooftop cafe', 'live acoustic music'],
};
const EVENT_INTENT = { event: 'Launch party', requiredClaims: EVENT_BRIEF.requiredClaims };

describe('concept relevance is judged against the member\'s own words', () => {
  it('accepts a concept about the music at a cafe launch, which a food vocabulary rejected', () => {
    const result = evaluateConceptRealizability(
      concept({
        conceptName: 'The Acoustic Horizon',
        creativeMechanism: 'A single acoustic guitar on a stand against the twilight skyline',
        dominantVisualObject: 'an acoustic guitar on a rooftop deck at dusk',
      }),
      EVENT_BRIEF,
      EVENT_INTENT,
    );
    expect(result.failures.filter((f) => f.startsWith('DOMAIN_RELEVANCE_MISMATCH'))).toEqual([]);
    expect(result.semanticRelevance).toBeGreaterThanOrEqual(40);
  });

  it('still rejects a concept that shares nothing with the request', () => {
    const result = evaluateConceptRealizability(
      concept({
        conceptName: 'Botanical Specimen Archive',
        communicationIdea: 'Pressed alpine flora preserving heritage memory',
        creativeMechanism: 'Dried mountain edelweiss pressed beneath glass with handwritten labels',
        dominantVisualObject: 'pressed mountain flower specimens pinned to parchment',
      }),
      EVENT_BRIEF,
      EVENT_INTENT,
    );
    expect(result.failures.some((f) => f.startsWith('DOMAIN_RELEVANCE_MISMATCH'))).toBe(true);
    expect(result.semanticRelevance).toBeLessThan(40);
  });

  it('recognises the same word with a different ending', () => {
    const result = evaluateConceptRealizability(
      concept({ conceptName: 'Parties', creativeMechanism: 'Launching parties lit by lanterns', dominantVisualObject: 'a lantern' }),
      { userPrompt: 'Launch party for the cafe', subject: 'Launch party', requiredClaims: ['Launch party'] },
      { requiredClaims: ['Launch party'] },
    );
    expect(result.failures.some((f) => f.startsWith('DOMAIN_RELEVANCE_MISMATCH'))).toBe(false);
  });

  it('leaves briefs that are not about food or dining alone', () => {
    const result = evaluateConceptRealizability(
      concept({ conceptName: 'Anything', creativeMechanism: 'An unrelated physical device', dominantVisualObject: 'a device' }),
      { userPrompt: 'Weekend sale on running shoes at Stride Lab', subject: 'Running shoe sale', requiredClaims: [] },
      { requiredClaims: [] },
    );
    expect(result.failures.some((f) => f.startsWith('DOMAIN_RELEVANCE_MISMATCH'))).toBe(false);
  });
});
