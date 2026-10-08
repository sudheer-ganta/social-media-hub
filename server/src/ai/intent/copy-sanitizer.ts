import type { CampaignCopyLine } from '../prompts/campaign-creative.prompt';
import { collapseSubsumed } from './copy-repair';
import type { CopySemanticRole } from '../render/design-representation';

/**
 * Strict copy classification and sanitation.
 *
 * Prevents internal generation metadata, prompt artifacts, debug labels,
 * format descriptions, and developer instructions from reaching final artwork.
 */

export type CopyClassification = 'ESSENTIAL' | 'SUPPORTING' | 'OPTIONAL' | 'INTERNAL';

/**
 * Authoritative RenderableCopy representation.
 * Every text element reaching DynamicCopyVisualObject and the Renderer
 * must conform to this validated structure.
 */
export interface RenderableCopy {
  id: string;
  role: CampaignCopyLine['role'];
  semanticRole: CopySemanticRole;
  text: string;
  priority: number;
  source: 'USER' | 'GENERATED' | 'BRAND';
  visible: boolean;
}

/**
 * Regex identifying strings that are pure format or internal generation metadata,
 * which must NEVER be typeset on final creative artwork.
 */
const INTERNAL_METADATA_PATTERNS = [
  // Format-only labels and single-word format descriptors (e.g. "diwali post", "instagram ad")
  /^(?:\w+\s+)?(?:post|posts|ad|ads|flyer|flyers|banner|banners|graphic|graphics|story|stories|reel|reels|creative|creatives|image|images|template|templates|social media post|instagram post|facebook ad)$/i,
  /^(?:create\s+a\s+|make\s+a\s+|generate\s+a\s+|design\s+a\s+)(?:post|ad|flyer|banner|creative|graphic)/i,
  // Pipeline / model instructions and FAQ inquiry headings
  /^(?:what\s+is\s+|how\s+does\s+it\s+work|why\s+choose\s+us|about\s+us|learn\s+more\s+about\s+our)/i,
  // Debug / draft / internal tags
  /^(?:draft|internal|preview|debug|placeholder|sample|test|concept\s+\d+|attempt\s+\d+|blueprint)/i,
  // Style and pipeline identifiers
  /^(?:creator-ugc|neo-brutalism|editorial|minimalist|cinematic|style-dna|recipe-source)/i,
];

const FORMAT_SUFFIX_REGEX = /\s+(?:post|posts|ad|ads|flyer|flyers|banner|banners|graphic|graphics|story|stories|reel|reels|creative|creatives|image|images|template|templates)$/i;

/**
 * Structural patterns indicating code/JSON/dict serialization contamination.
 * Detects structural code syntax without rejecting normal marketing copy with punctuation.
 */
const STRUCTURED_KEY_VALUE_REGEX = /(?:^|[,\s{[])['"][a-zA-Z0-9_\-\s]+['"]\s*:\s*['"][^'"]*['"]/;
const STRUCTURED_KEY_NONSTRING_REGEX = /(?:^|[,\s{[])['"][a-zA-Z0-9_\-\s]+['"]\s*:\s*(?:\{|\[|\d+|true|false|null)/i;
const UNQUOTED_KNOWN_KEY_REGEX = /(?:^|[,\s{[])(?:cta|headline|body|marketing|title|subtitle|offer|event|copy|text|image|prompt|detail|message|role|priority)\s*:\s*['"]/i;
const JSON_OBJECT_ENCLOSURE_REGEX = /^\s*\{.*['"][a-zA-Z0-9_\-\s]+['"]\s*:.*\}\s*$/s;
const JSON_ARRAY_ENCLOSURE_REGEX = /^\s*\[\s*['"].*['"]\s*\]\s*$/s;
const SERIALIZED_FRAGMENT_COMMA_REGEX = /['"]\s*,\s*['"][a-zA-Z0-9_\-\s]+['"]\s*:/;
const MULTIPLE_KEY_VAL_FRAGMENT_REGEX = /['"][a-zA-Z0-9_\-\s]+['"]\s*:[^,]+,\s*['"][a-zA-Z0-9_\-\s]+['"]/;
const OBJECT_INSPECTION_REGEX = /^<.*(?:object|function|module|class|dict)\s+.*>$/i;
const PROMPT_META_REGEX = /(?:json output|prompt instructions?|response schema|system instruction|ai text provider|generation parameters?)/i;
const DANGLING_QUOTE_KEY_REGEX = /(?:^|[,\s{[])[a-zA-Z0-9_-]+['"]\s*:\s*['"][^'"]*['"]/;

/**
 * Detects structural patterns of code/JSON/dict syntax.
 * Fails closed on structured contamination by rejecting the item entirely,
 * while preserving legitimate marketing copy containing colons, apostrophes, hyphens, and quotes.
 */
export function isStructuredArtifact(text: string): boolean {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;

  if (OBJECT_INSPECTION_REGEX.test(trimmed)) return true;
  if (PROMPT_META_REGEX.test(trimmed)) return true;
  if (JSON_OBJECT_ENCLOSURE_REGEX.test(trimmed)) return true;
  if (JSON_ARRAY_ENCLOSURE_REGEX.test(trimmed)) return true;
  if (STRUCTURED_KEY_VALUE_REGEX.test(trimmed)) return true;
  if (STRUCTURED_KEY_NONSTRING_REGEX.test(trimmed)) return true;
  if (DANGLING_QUOTE_KEY_REGEX.test(trimmed)) return true;
  if (UNQUOTED_KNOWN_KEY_REGEX.test(trimmed)) return true;
  if (SERIALIZED_FRAGMENT_COMMA_REGEX.test(trimmed)) return true;
  if (MULTIPLE_KEY_VAL_FRAGMENT_REGEX.test(trimmed)) return true;

  return false;
}

/**
 * Tests whether a piece of text is purely internal generation metadata.
 */
export function isInternalMetadata(text: string): boolean {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  if (isStructuredArtifact(trimmed)) return true;
  if (INTERNAL_METADATA_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  const stripped = trimmed.replace(FORMAT_SUFFIX_REGEX, '').trim();
  return stripped.length === 0;
}

/**
 * Cleans user-facing copy, stripping unwanted format suffixes and internal wrappers.
 */
export function sanitizeCopyText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text.trim();

  // Reject structured artifacts immediately
  if (isStructuredArtifact(cleaned)) return '';

  // Strip accidental prompt quotes
  cleaned = cleaned.replace(/^["'`]|["'`]$/g, '').trim();

  // Clean trailing format descriptors while preserving legitimate copy
  cleaned = cleaned.replace(FORMAT_SUFFIX_REGEX, '').trim();

  if (!cleaned || isInternalMetadata(cleaned) || isStructuredArtifact(cleaned)) return '';

  return cleaned;
}

const GENERIC_MARKETING_FILLER_PATTERNS = [
  /^experience the (?:quiet )?luxury\b/i,
  /^experience the (?:ultimate|finest|magic|difference|power|essence|taste|art of)\b/i,
  /^discover the (?:ultimate|essence|power|magic|finest|art of|secret|beauty)\b/i,
  /^indulge in (?:the finest|pure|luxury|flavor|elegance|your senses|perfection)\b/i,
  /^elevate your (?:everyday|experience|lifestyle|game|routine|style)\b/i,
  /^embrace the (?:essence|beauty|spirit|magic|warmth|vibe)\b/i,
  /^welcome to a new era of\b/i,
  /^unlock (?:the power of|your potential|exclusive|the magic of)\b/i,
  /^step into (?:a world of|the future of|pure luxury)\b/i,
  /^crafted for (?:those who|perfection|excellence)\b/i,
  /^where (?:luxury|quality|style) meets\b/i,
  /^redefine (?:your|the way you)\b/i,
];

/**
 * Tests whether a line is interchangeable generic marketing filler.
 */
export function isGenericMarketingFiller(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  return GENERIC_MARKETING_FILLER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Classifies a copy line into ESSENTIAL, SUPPORTING, OPTIONAL, or INTERNAL.
 */
export function classifyCopyLine(
  line: CampaignCopyLine,
  requiredClaims: string[] = [],
): CopyClassification {
  const text = line.text?.trim() ?? '';
  if (isStructuredArtifact(text) || isInternalMetadata(text)) {
    return 'INTERNAL';
  }

  const role = line.role;
  const isHeadline = role === 'HEADLINE';
  const isOffer = role === 'OFFER';
  const isCta = role === 'CTA';

  // Check if text directly fulfills a clean required claim
  const fulfillsClaim = requiredClaims.some((claim) => {
    if (!claim || isStructuredArtifact(claim) || isInternalMetadata(claim)) return false;
    const cleanClaim = sanitizeCopyText(claim).toLowerCase();
    return cleanClaim.length > 0 && text.toLowerCase().includes(cleanClaim);
  });

  // Reject generic marketing filler if it is not an explicit user-required claim
  if (isGenericMarketingFiller(text) && !fulfillsClaim) {
    return 'INTERNAL';
  }

  if (isHeadline || fulfillsClaim) {
    return 'ESSENTIAL';
  }

  if (isOffer || isCta || role === 'BRAND_MESSAGE') {
    return 'SUPPORTING';
  }

  return 'OPTIONAL';
}

/**
 * Single Authoritative Copy Gate.
 *
 * Validates raw candidate copy against structured artifact contamination and internal metadata,
 * enforces required claims (without reintroducing contaminated claims),
 * prioritizes lines, and returns strictly typed RenderableCopy[].
 */
export function validateAndBuildRenderableCopy(
  lines: CampaignCopyLine[],
  requiredClaims: string[] = [],
  maxElements: number = 3,
): RenderableCopy[] {
  const sanitizedLines: Array<{ line: CampaignCopyLine; classification: CopyClassification }> = [];

  for (const item of lines) {
    if (isStructuredArtifact(item.text)) {
      console.warn('[copy-sanitizer] rejected structured artifact contamination', {
        role: item.role,
        textPreview: item.text.slice(0, 80),
      });
      continue;
    }

    const cleanText = sanitizeCopyText(item.text);
    if (!cleanText || isStructuredArtifact(cleanText)) {
      continue;
    }

    const sanitizedLine: CampaignCopyLine = {
      ...item,
      text: cleanText,
    };

    const classification = classifyCopyLine(sanitizedLine, requiredClaims);
    if (classification === 'INTERNAL') {
      continue;
    }

    sanitizedLines.push({ line: sanitizedLine, classification });
  }

  // Deduplicate identical or near-identical texts
  const deduped: Array<{ line: CampaignCopyLine; classification: CopyClassification }> = [];
  const seenTexts = new Set<string>();

  for (const entry of sanitizedLines) {
    const key = entry.line.text.toLowerCase().replace(/[^\w]/g, '');
    if (!key || seenTexts.has(key)) continue;
    seenTexts.add(key);
    deduped.push(entry);
  }

  // A line whose every word another line already says is the same message twice
  // ("30% off" beside "30% off all running shoes"). The headline and the call to
  // action are never the ones removed.
  const distinct = collapseSubsumed(
    deduped.map((entry) => ({ role: entry.line.role as string, text: entry.line.text, entry })),
    (item) => item.role === 'HEADLINE' || item.role === 'CTA',
  ).map((item) => item.entry);
  deduped.length = 0;
  deduped.push(...distinct);

  // Rank by priority: ESSENTIAL (0) -> SUPPORTING (1) -> OPTIONAL (2)
  const priorityOrder: Record<CopyClassification, number> = {
    ESSENTIAL: 0,
    SUPPORTING: 1,
    OPTIONAL: 2,
    INTERNAL: 99,
  };

  const sorted = [...deduped].sort(
    (a, b) => priorityOrder[a.classification] - priorityOrder[b.classification],
  );

  const essential = sorted.filter((e) => e.classification === 'ESSENTIAL');
  const supporting = sorted.filter((e) => e.classification === 'SUPPORTING');
  const optional = sorted.filter((e) => e.classification === 'OPTIONAL');

  const selected: Array<{ line: CampaignCopyLine; classification: CopyClassification }> = [];

  // Always include all essential lines
  for (const e of essential) {
    if (selected.length < maxElements || selected.length === 0) {
      selected.push(e);
    }
  }

  // Fill remaining slots with supporting lines
  for (const s of supporting) {
    if (selected.length < maxElements) {
      selected.push(s);
    }
  }

  // Fill remaining slots with optional lines only if space permits
  for (const o of optional) {
    if (selected.length < maxElements) {
      selected.push(o);
    }
  }

  // Build authoritative RenderableCopy array with consistent semantic IDs and roles
  let hasHeadline = false;
  let hasOffer = false;
  let supportingCount = 0;

  return selected.map((entry, index) => {
    const c = entry.line;
    let id: string;
    let semanticRole: CopySemanticRole;
    let priority: number;

    if ((c.role === 'HEADLINE' || index === 0) && !hasHeadline) {
      hasHeadline = true;
      id = 'primary-hook';
      semanticRole = 'primary-hook';
      priority = 1;
    } else if (c.role === 'OFFER' && !hasOffer) {
      hasOffer = true;
      id = 'secondary-hook';
      semanticRole = 'secondary-hook';
      priority = 2;
    } else if (c.role === 'CTA') {
      id = 'cta';
      semanticRole = 'cta';
      priority = 3;
    } else {
      id = supportingCount === 0 && selected.length <= 3 ? 'supporting-note' : `supporting-note-${supportingCount}`;
      supportingCount++;
      semanticRole = 'supporting-note';
      priority = 3;
    }

    const isUserClaim = requiredClaims.some((claim) => {
      if (!claim || isStructuredArtifact(claim)) return false;
      const clean = sanitizeCopyText(claim).toLowerCase();
      return clean.length > 0 && c.text.toLowerCase().includes(clean);
    });

    return {
      id,
      role: c.role,
      semanticRole,
      text: c.text,
      priority,
      source: isUserClaim ? 'USER' : 'GENERATED',
      visible: true,
    };
  });
}

/**
 * Legacy compatibility wrapper for callers expecting CampaignCopyLine[].
 * Directly delegates to the authoritative validateAndBuildRenderableCopy boundary.
 */
export function sanitizeAndFilterCopy(
  copy: CampaignCopyLine[],
  requiredClaims: string[] = [],
  maxElements = 3,
): CampaignCopyLine[] {
  const renderable = validateAndBuildRenderableCopy(copy, requiredClaims, maxElements);
  return renderable.map((r) => ({
    role: r.role,
    text: r.text,
  }));
}
