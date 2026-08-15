/**
 * The requirement matcher — the contract every stage of the pipeline is
 * validated against.
 *
 * The cases here are the dogfood failure verbatim: a member asked for "BTS is
 * coming back to our restaurant, 50% off all Korean food" and got back
 * "Perfectly Synchronized Flavors." Nothing in that headline says BTS, Korean
 * food, or 50% — and it must not be possible for that to pass.
 *
 * Run: cd server && npx vitest run src/ai/intent/claim-match.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  claimSatisfied,
  claimTokens,
  evaluateIntentFidelity,
  missingFromCreative,
  renderedCopyText,
} from './claim-match';
import type { CreativeDirection, CreativeIntentBrief } from '../types';

const BTS_CLAIMS = ['BTS comeback', 'Korean food', '50% off'];

describe('claimTokens', () => {
  it('keeps the percent glued to its number, however the text spaced it', () => {
    expect(claimTokens('50% off')).toEqual(['50%', 'off']);
    expect(claimTokens('50 % off')).toEqual(['50%', 'off']);
  });

  it('drops filler words that carry no requirement', () => {
    expect(claimTokens('all of our Korean food')).toEqual(['korean', 'food']);
  });
});

describe('claimSatisfied', () => {
  it('accepts the claim stated plainly', () => {
    expect(claimSatisfied('50% off', 'Get 50% off every Korean dish tonight.')).toBe(true);
    expect(claimSatisfied('Korean food', 'Korean food, done properly.')).toBe(true);
  });

  it('accepts ordinary inflection', () => {
    expect(claimSatisfied('Korean food', 'Our Korean foods are half the story.')).toBe(true);
  });

  it('rejects the clever paraphrase — the actual dogfood failure', () => {
    expect(claimSatisfied('50% off', 'Perfectly Synchronized Flavors')).toBe(false);
    expect(claimSatisfied('BTS comeback', 'Perfectly Synchronized Flavors')).toBe(false);
    expect(claimSatisfied('Korean food', 'Perfectly Synchronized Flavors')).toBe(false);
  });

  it('refuses to accept a DIFFERENT number — an offer is not near enough', () => {
    expect(claimSatisfied('50% off', 'Get 30% off all Korean food')).toBe(false);
    expect(claimSatisfied('30% off', 'Get 30% off all Korean food')).toBe(true);
  });

  it('refuses a softened restatement of a discount', () => {
    expect(claimSatisfied('50% off', 'Half price on everything Korean')).toBe(false);
  });

  it('is not satisfied by empty copy', () => {
    expect(claimSatisfied('50% off', '')).toBe(false);
  });
});

describe('evaluateIntentFidelity', () => {
  it('scores full coverage at 100 and names nothing missing', () => {
    const result = evaluateIntentFidelity(BTS_CLAIMS, 'BTS comeback night — 50% off all Korean food.');
    expect(result.score).toBe(100);
    expect(result.missingRequirements).toEqual([]);
  });

  it('names exactly what was dropped', () => {
    const result = evaluateIntentFidelity(BTS_CLAIMS, 'BTS comeback night, Korean food all week.');
    expect(result.score).toBe(67);
    expect(result.missingRequirements).toEqual(['50% off']);
    expect(result.requiredElementsPresent).toEqual(['BTS comeback', 'Korean food']);
  });

  it('treats a request with no stated requirements as satisfied — nothing to drop', () => {
    expect(evaluateIntentFidelity([], 'anything at all').score).toBe(100);
  });
});

const direction = (overrides: Partial<CreativeDirection>): CreativeDirection =>
  ({
    concept: 'The Lightstick Plating',
    visualStory: 'A Korean dish arranged like a stadium of lightsticks.',
    subject: 'a bibimbap bowl',
    environment: 'restaurant table',
    composition: 'overhead',
    lighting: 'warm',
    mood: 'celebratory',
    palette: [],
    brandConstraints: [],
    productTreatment: '',
    background: '',
    negativeVisualConstraints: [],
    aspectRatio: '4:5',
    platform: 'instagram',
    mode: 'CULTURAL',
    artDirectionFamily: 'CULTURAL_EDITORIAL',
    copyTreatment: 'headline',
    headline: '',
    supportingLine: '',
    cta: '',
    interactionInstructions: '',
    ...overrides,
  }) as CreativeDirection;

const intent = (claims: string[]): CreativeIntentBrief =>
  ({ extracted: true, requiredClaims: claims }) as CreativeIntentBrief;

describe('renderedCopyText', () => {
  it('reads only the words that will be typeset, never the picture description', () => {
    const text = renderedCopyText(
      direction({ headline: 'BTS is back', cta: 'Book a table', subject: 'a Korean dish' }),
    );
    expect(text).toContain('BTS is back');
    expect(text).toContain('Book a table');
    // The visual can't carry a requirement — a wordless image says nothing.
    expect(text).not.toContain('Korean dish');
  });
});

describe('missingFromCreative', () => {
  it('fails a creative whose requirements only live in the visual', () => {
    const missing = missingFromCreative(
      direction({ headline: 'Perfectly Synchronized Flavors' }),
      intent(BTS_CLAIMS),
    );
    expect(missing).toEqual(BTS_CLAIMS);
  });

  it('passes a creative that spreads its requirements across headline, message and footer', () => {
    const missing = missingFromCreative(
      direction({
        headline: 'The BTS comeback, plated',
        marketingCreative: {
          brandMessage: 'Korean food, cooked the long way.',
          secondaryInfo: ['50% off all week'],
        },
      }),
      intent(BTS_CLAIMS),
    );
    expect(missing).toEqual([]);
  });

  it('catches a refinement that changed the offer to the wrong number', () => {
    const missing = missingFromCreative(
      direction({
        headline: 'The BTS comeback, plated',
        marketingCreative: { brandMessage: 'Korean food.', secondaryInfo: ['30% off all week'] },
      }),
      intent(BTS_CLAIMS),
    );
    expect(missing).toEqual(['50% off']);
  });

  it('has nothing to say when no intent was extracted', () => {
    expect(missingFromCreative(direction({ headline: 'Anything' }), undefined)).toEqual([]);
  });
});
