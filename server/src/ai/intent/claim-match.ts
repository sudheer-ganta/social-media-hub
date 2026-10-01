import type { CreativeDirection, CreativeIntentBrief, IntentFidelity, ScoredCreativeConcept } from '../types';
import { collectCampaignCopy } from '../prompts/campaign-creative.prompt';

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
 * Canonical shorthand & inflection dictionary for standard marketing and menu abbreviations.
 * Maps shorthand/variants to their canonical base form.
 */
const CANONICAL_TOKEN_MAP: Record<string, string> = {
  // Common menu / culinary shorthand
  'spcl': 'special',
  'spec': 'special',
  'spl': 'special',
  'chefs': 'chef',
  'cheff': 'chef',
  'noodles': 'noodle',
  'dishes': 'dish',
  'curries': 'curry',
  'recipes': 'recipe',
  'ingredients': 'ingredient',
  'flavors': 'flavor',
  'flavours': 'flavor',

  // Marketing & promo shorthand
  'bogo': 'bogo',
  'disc': 'discount',
  'discounts': 'discount',
  'promo': 'promotion',
  'promos': 'promotion',
  'pkg': 'package',
  'pkgs': 'package',
  'qty': 'quantity',
  'w': 'with',
  'wo': 'without',
  'incl': 'including',
  'reg': 'regular',
  'med': 'medium',
  'lrg': 'large',
  'lg': 'large',
  'sm': 'small',
  'ea': 'each',
  'min': 'minimum',
  'max': 'maximum',
  'hr': 'hour',
  'hrs': 'hour',
  'mo': 'month',
  'yr': 'year',
  'veg': 'vegetarian',
  'nonveg': 'nonvegetarian',
};

/**
 * Normalizes a single token to its canonical semantic root:
 * - strips apostrophes ('s, ’s)
 * - applies canonical shorthand dictionary (spcl -> special, chefs -> chef)
 * - applies standard English singularization for nouns ending in 's' or 'es'
 */
export function normalizeCanonicalToken(rawToken: string): string {
  const token = rawToken.toLowerCase().replace(/['’]s?$/g, '').replace(/['’]/g, '');
  if (CANONICAL_TOKEN_MAP[token]) {
    return CANONICAL_TOKEN_MAP[token];
  }
  if (token.length > 3 && token.endsWith('ies')) {
    return token.slice(0, -3) + 'y';
  }
  if (token.length > 4 && token.endsWith('est')) {
    return token.slice(0, -3);
  }
  if (
    token.length > 4 &&
    token.endsWith('es') &&
    !token.endsWith('ses') &&
    !token.endsWith('ches') &&
    !token.endsWith('shes') &&
    !token.endsWith('xes')
  ) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

/**
 * Lowercased significant tokens with canonical normalization. `%` survives (it is the difference between
 * "50% off" and "50 items"), and a number glued to a unit stays glued —
 * "50 %" and "50%" must tokenise the same way or an exact numeric match fails
 * on nothing but whitespace.
 */
export function claimTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/(\d+)\s*%/g, '$1%')
    .replace(/(\d+%)([a-zA-Z]+)/g, '$1 $2')
    .replace(/([a-zA-Z]+)(\d+%)/g, '$1 $2')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .split(/\s+/)
    .map(normalizeCanonicalToken)
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

/**
 * A claim is carried when every NUMBER in it appears verbatim (an offer of
 * "50% off" is not satisfied by "30% off", and near enough is not near enough
 * for a price) and at least 60% of its remaining words appear, allowing for
 * canonical abbreviations and ordinary inflection — "chefs spcl" is carried by "Chef's Special".
 */
export function claimSatisfied(claim: string, text: string): boolean {
  const wanted = claimTokens(claim);
  if (wanted.length === 0) return true;
  const present = claimTokens(text);
  if (present.length === 0) return false;

  const numeric = wanted.filter((token) => /\d/.test(token));
  if (
    numeric.some((token) => {
      return !present.some((p) => p === token || p.includes(token) || token.includes(p));
    })
  ) {
    return false;
  }

  const matches = (token: string) =>
    present.some(
      (candidate) =>
        candidate === token ||
        (token.length >= 3 && candidate.startsWith(token)) ||
        (candidate.length >= 3 && token.startsWith(candidate)),
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
 * Evaluates whether a creative concept credibly affords the campaign requirements.
 *
 * A concept owns:
 * - communicationIdea / bigIdea
 * - creativeMechanism
 * - visualWorld
 * - productRole / brandConnection
 *
 * A concept does NOT need to literally contain every campaign factual claim
 * (e.g. "50% off", "chefs spcl", "new dish"). It must possess domain compatibility
 * and creative capacity to communicate the campaign's subject matter.
 */
export function evaluateConceptIntentAffordance(
  concept: ScoredCreativeConcept,
  intent?: CreativeIntentBrief,
): { affords: boolean; score: number; missingDomainEntities: string[] } {
  if (!intent?.requiredClaims?.length && !intent?.productCategory && !intent?.event) {
    return { affords: true, score: 100, missingDomainEntities: [] };
  }

  const text = conceptText(concept);
  const textTokens = new Set(claimTokens(text));

  // Extract core domain entities from requiredClaims (excluding purely promotional/offer words)
  const PROMO_REGEX = /^\d+%\s*off$|^bogo$|^free\b|^sale$|^discount$|^chefs?\s*(?:spcl|special)$|^new\s*dish$/i;
  const domainEntities: string[] = [];

  for (const claim of intent?.requiredClaims ?? []) {
    if (!PROMO_REGEX.test(claim.trim())) {
      domainEntities.push(claim);
    }
  }

  // If all claims were promotional (e.g. "50% off", "chefs spcl"), fall back to productCategory or event
  if (domainEntities.length === 0) {
    if (intent?.productCategory) domainEntities.push(intent.productCategory);
    else if (intent?.event) domainEntities.push(intent.event);
  }

  if (domainEntities.length === 0) {
    return { affords: true, score: 100, missingDomainEntities: [] };
  }

  let supportedCount = 0;
  const missing: string[] = [];

  for (const entity of domainEntities) {
    const wanted = claimTokens(entity);
    if (wanted.length === 0) {
      supportedCount++;
      continue;
    }
    const matches = wanted.filter((t) =>
      Array.from(textTokens).some(
        (candidate) =>
          candidate === t ||
          (t.length >= 3 && candidate.startsWith(t)) ||
          (candidate.length >= 3 && t.startsWith(candidate)),
      ),
    );
    if (matches.length / wanted.length >= 0.5) {
      supportedCount++;
    } else {
      missing.push(entity);
    }
  }

  const score = Math.round((supportedCount / domainEntities.length) * 100);
  const affords = missing.length === 0;

  return {
    affords,
    score: affords ? 100 : score,
    missingDomainEntities: missing,
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
    concept.communicationIdea,
    concept.creativePremise,
    concept.creativeMechanism,
    concept.visualMechanism,
    concept.dominantVisualObject,
    concept.visualWorld,
    concept.copyAngle,
    concept.message,
    concept.productRole,
    concept.brandConnection,
    concept.visualMetaphor,
    concept.interaction,
    concept.humanInsight,
    concept.whyItWouldStopTheScroll,
    ...(concept.physicalArtifacts ?? []),
    ...(concept.requiredVisualElements ?? []),
    ...(concept.requiredVisualProof ?? []),
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
  return collectCampaignCopy(direction).map(line => line.text).join(' ');
}

/** The hard requirements this creative's copy still drops. Empty means publishable, per spec §1.4. */
export function missingFromCreative(
  direction: CreativeDirection,
  intent: CreativeIntentBrief | undefined,
): string[] {
  if (!intent?.requiredClaims?.length) return [];
  return evaluateIntentFidelity(intent.requiredClaims ?? [], renderedCopyText(direction)).missingRequirements;
}
