import type { CreativeDirection, CreativeIntentBrief, IntentFidelity, ScoredCreativeConcept } from '../types';

/**
 * "Does this artifact actually say what the member asked for?" — answered in
 * code, never by asking a model to mark its own homework.
 *
 * A member who wrote "BTS is coming back to our restaurant, 50% off all
 * Korean food" stated three facts. A concept that drops the offer, or a
 * headline that reads "Perfectly Synchronized Flavors", has failed them — and
 * a model asked "did you include the offer?" answers yes far too readily.
 * So the check is a deterministic token match instead, and it is the same
 * check at every stage: concept, direction copy, final creative.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'on', 'in', 'at', 'for', 'and', 'or', 'to', 'with',
  'our', 'your', 'we', 'you', 'is', 'are', 'be', 'all', 'this', 'that', 'it',
  'from', 'by', 'as', 'has', 'have',
]);

/**
 * Lowercased significant tokens. `%` survives (it is the difference between
 * "50% off" and "50 items"), and a number glued to a unit stays glued —
 * "50 %" and "50%" must tokenise the same way or an exact numeric match fails
 * on nothing but whitespace.
 */
export function claimTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/(\d)\s*%/g, '$1%')
    .replace(/[^a-z0-9%]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

/**
 * A claim is carried when every NUMBER in it appears verbatim (an offer of
 * "50% off" is not satisfied by "30% off", and near enough is not near enough
 * for a price) and at least 60% of its remaining words appear, allowing for
 * ordinary inflection — "korean food" is carried by "Korean foods".
 */
export function claimSatisfied(claim: string, text: string): boolean {
  const wanted = claimTokens(claim);
  if (wanted.length === 0) return true;
  const present = claimTokens(text);
  if (present.length === 0) return false;

  const numeric = wanted.filter((token) => /\d/.test(token));
  if (numeric.some((token) => !present.includes(token))) return false;

  const matches = (token: string) =>
    present.some(
      (candidate) =>
        candidate === token ||
        (token.length >= 4 && candidate.startsWith(token)) ||
        (candidate.length >= 4 && token.startsWith(candidate)),
    );

  const hit = wanted.filter(matches).length;
  return hit / wanted.length >= 0.6;
}

/** Which of the member's hard requirements this text carries, and which it drops. */
export function evaluateIntentFidelity(requiredClaims: string[], text: string): IntentFidelity {
  const claims = requiredClaims.filter((claim) => claim.trim().length > 0);
  if (claims.length === 0) {
    return { score: 100, requiredElementsPresent: [], missingRequirements: [] };
  }
  const requiredElementsPresent = claims.filter((claim) => claimSatisfied(claim, text));
  const missingRequirements = claims.filter((claim) => !requiredElementsPresent.includes(claim));
  return {
    score: Math.round((requiredElementsPresent.length / claims.length) * 100),
    requiredElementsPresent,
    missingRequirements,
  };
}

/**
 * Everything a concept says, flattened. A concept communicates through its
 * idea as much as its copy line, so all of it counts toward fidelity — the
 * stricter copy-only check happens at the direction stage below, where the
 * words that will actually be typeset are known.
 */
export function conceptText(concept: ScoredCreativeConcept): string {
  return [
    concept.conceptName,
    concept.bigIdea,
    concept.visualMechanism,
    concept.message,
    concept.productRole,
    concept.brandConnection,
    concept.visualMetaphor,
    concept.interaction,
    concept.humanInsight,
    concept.whyItWouldStopTheScroll,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The words the renderer will actually typeset onto the finished creative.
 *
 * Deliberately NOT the whole direction: `subject` and `visualStory` describe
 * the picture, and "the viewer can infer Korean food from the photo" is
 * exactly the reasoning that ships a creative with no offer on it. If a
 * requirement matters, it has to be legible.
 */
export function renderedCopyText(direction: CreativeDirection): string {
  return [
    direction.headline,
    direction.supportingLine,
    direction.cta,
    direction.interactionInstructions,
    direction.marketingCreative?.brandMessage,
    direction.marketingCreative?.offerText,
    direction.marketingCreative?.eventBadge,
    ...(direction.marketingCreative?.secondaryInfo ?? []),
    ...(direction.marketingCreative?.requiredElements ?? []),
  ]
    .filter(Boolean)
    .join(' ');
}

/** The hard requirements this creative's copy still drops. Empty means publishable, per spec §1.4. */
export function missingFromCreative(
  direction: CreativeDirection,
  intent: CreativeIntentBrief | undefined,
): string[] {
  if (!intent?.requiredClaims.length) return [];
  return evaluateIntentFidelity(intent.requiredClaims, renderedCopyText(direction)).missingRequirements;
}
