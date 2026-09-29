/**
 * FLOWPOST DYNAMIC COPY MODEL — PHASE 2
 *
 * Treats copy as a first-class visual object with intrinsic physical,
 * linguistic, and geometric properties.
 *
 * It systematically derives:
 *   - Linguistic tokenization & syntactic break affordances
 *   - Multi-hypothesis line structures (1-line, 2-line, 3-line, stacked blocks)
 *   - Line length balance, rag variance, and widow/orphan detection
 *   - Aspect ratio projections and spatial footprint estimates
 *
 * CONSTRAINTS:
 *   - NO hardcoded copy strings.
 *   - NO hardcoded line structures or fixed line counts.
 *   - Every line structure is generated from the actual tokens and evaluated
 *     as a compositional SIGNAL.
 */

import type { CopySemanticRole } from './design-representation';

export interface LinguisticToken {
  text: string;
  charCount: number;
  isShortParticle: boolean; // e.g. "a", "an", "the", "in", "on", "at", "to", "for", "of", "and", "or", "is"
  hasTrailingPunctuation: boolean;
  canBreakAfter: boolean;
  breakPenalty: number; // 0 = natural break point (e.g. after punctuation or prepositional clause), higher = awkward split
}

export interface LineBreakHypothesis {
  lines: string[];
  lineCount: number;
  lineCharCounts: number[];
  maxLineChars: number;
  /** Variance in line character lengths (0 = perfectly even block, higher = more ragged) */
  ragVariance: number;
  /** True if the final line contains a single short word or fewer than 4 characters */
  hasWidowOrOrphan: boolean;
  /** Sum of break penalties across all split points */
  syntacticPenalty: number;
  /** Geometric compactness metric: maxLineChars * lineCount / totalChars */
  compactness: number;
  /** Structural aesthetic score (0..1, higher is cleaner rag and natural breaks) */
  structuralScore: number;
}

export interface DynamicCopyVisualObject {
  id: string;
  text: string;
  semanticRole: CopySemanticRole;
  priority: number;
  visualImportance: number;
  tokens: LinguisticToken[];
  totalChars: number;
  totalWords: number;
  longestWordChars: number;
  hasAscenders: boolean;
  hasDescenders: boolean;
  isAllUppercase: boolean;
  isTitleCase: boolean;
  
  /** All systematically derived line structures for this copy */
  hypotheses: LineBreakHypothesis[];
  
  /** Retrieve hypotheses matching a specific line count */
  getHypothesesForLineCount(lineCount: number): LineBreakHypothesis[];
  
  /** Find hypothesis that best matches a desired bounding box aspect ratio (width/height) */
  getBestHypothesisForAspect(targetAspectRatio: number, charWidthToLineHeightRatio?: number): LineBreakHypothesis;
  
  /** Estimate physical pixel dimensions for a given font size, line height, and char width */
  estimateDimensions(
    hypothesis: LineBreakHypothesis,
    fontSize: number,
    lineHeight: number,
    charWidthMultiplier?: number
  ): { width: number; height: number; aspectRatio: number };
}

// ─── Tokenization & Linguistic Analysis ─────────────────────────────────────

const SHORT_PARTICLES = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'by', 'with', 'from', 'as', 'is', 'it', 'its', 'be',
  'our', 'my', 'your', 'their', 'his', 'her', 'this', 'that', 'these', 'those', 'we', 'us', 'you'
]);

const ASCENDER_CHARS = /[bdfhkltA-Z0-9]/;
const DESCENDER_CHARS = /[gjpqy]/;

export function tokenizeCopy(text: string): LinguisticToken[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const rawTokens = trimmed.split(/\s+/).filter(Boolean);
  return rawTokens.map((word, idx) => {
    const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
    const hasTrailingPunctuation = /[,;:.!?—–-]$/.test(word);
    const isShortParticle = SHORT_PARTICLES.has(cleanWord) && word.length <= 4;
    const isLast = idx === rawTokens.length - 1;

    let breakPenalty = 0;
    if (isShortParticle && !hasTrailingPunctuation && !isLast) {
      // Breaking right after a particle like "the \n collection" is better than "the collection \n is"
      // but leaving a particle stranded at the end of a line ("discover \n the") is penalized.
      breakPenalty = 0.35;
    } else if (hasTrailingPunctuation) {
      // Punctuation represents a natural linguistic pause — ideal break point
      breakPenalty = -0.2;
    }

    return {
      text: word,
      charCount: word.length,
      isShortParticle,
      hasTrailingPunctuation,
      canBreakAfter: !isLast,
      breakPenalty,
    };
  });
}

// ─── Systematic Line-Break Hypothesis Generator ─────────────────────────────

function partitionTokens(
  tokens: LinguisticToken[],
  numLines: number,
  startIdx: number = 0,
  currentLines: string[][] = []
): string[][][] {
  if (tokens.length <= 1 && numLines > 1) {
    return []; // Never shatter a single word token into multi-line fragments
  }
  if (numLines === 1) {
    const remaining = tokens.slice(startIdx).map((t) => t.text).join(' ');
    return remaining ? [[...currentLines.map((l) => l.join(' ')), remaining].map((s) => [s])] : [];
  }

  const results: string[][][] = [];
  const maxWordsThisLine = tokens.length - startIdx - (numLines - 1);

  for (let take = 1; take <= maxWordsThisLine; take++) {
    const lineWords = tokens.slice(startIdx, startIdx + take).map((t) => t.text);
    const subPartitions = partitionTokens(tokens, numLines - 1, startIdx + take, [...currentLines, lineWords]);
    for (const sub of subPartitions) {
      results.push(sub);
    }
  }

  return results;
}

export function generateLineBreakHypotheses(
  tokens: LinguisticToken[],
  maxAllowedLines: number = 4
): LineBreakHypothesis[] {
  if (tokens.length === 0) return [];
  const totalChars = tokens.reduce((sum, t) => sum + t.charCount, 0) + (tokens.length - 1);
  const wordCount = tokens.length;
  const maxLines = Math.min(wordCount, Math.max(1, maxAllowedLines));

  const hypotheses: LineBreakHypothesis[] = [];

  for (let k = 1; k <= maxLines; k++) {
    if (k === 1) {
      const fullText = tokens.map((t) => t.text).join(' ');
      hypotheses.push({
        lines: [fullText],
        lineCount: 1,
        lineCharCounts: [fullText.length],
        maxLineChars: fullText.length,
        ragVariance: 0,
        hasWidowOrOrphan: false,
        syntacticPenalty: 0,
        compactness: 1.0,
        structuralScore: 0.95,
      });
      continue;
    }

    // Partition words across k lines
    const partitions = partitionTokens(tokens, k);
    for (const part of partitions) {
      const lineStrings = part.map((arr) => (Array.isArray(arr) ? arr[0] : arr));
      const lineCharCounts = lineStrings.map((l) => l.length);
      const maxLineChars = Math.max(...lineCharCounts);
      const meanLength = lineCharCounts.reduce((a, b) => a + b, 0) / k;

      // Variance in line lengths (rag quality)
      const variance = lineCharCounts.reduce((acc, len) => acc + Math.pow(len - meanLength, 2), 0) / k;
      const ragStdDev = Math.sqrt(variance);
      const normalizedRag = Number((ragStdDev / Math.max(1, meanLength)).toFixed(3));

      // Widow / Orphan check: last line has 1 short word or < 4 characters
      const lastLineWords = lineStrings[lineStrings.length - 1].split(/\s+/);
      const hasWidowOrOrphan =
        lastLineWords.length === 1 && (lastLineWords[0].length < 5 || SHORT_PARTICLES.has(lastLineWords[0].toLowerCase()));

      // Calculate syntactic break penalty at line boundaries
      let syntacticPenalty = 0;
      let tokenIdx = 0;
      for (let lineIdx = 0; lineIdx < lineStrings.length - 1; lineIdx++) {
        const wordsInLine = lineStrings[lineIdx].split(/\s+/).length;
        tokenIdx += wordsInLine;
        const breakToken = tokens[tokenIdx - 1];
        if (breakToken) {
          syntacticPenalty += breakToken.breakPenalty;
        }
      }

      // Overall structural score (0..1)
      let score = 1.0 - normalizedRag * 0.4 - (hasWidowOrOrphan ? 0.35 : 0) - Math.max(0, syntacticPenalty * 0.25);
      score = Number(Math.max(0.1, Math.min(1.0, score)).toFixed(3));

      hypotheses.push({
        lines: lineStrings,
        lineCount: k,
        lineCharCounts,
        maxLineChars,
        ragVariance: normalizedRag,
        hasWidowOrOrphan,
        syntacticPenalty: Number(syntacticPenalty.toFixed(2)),
        compactness: Number(((maxLineChars * k) / totalChars).toFixed(2)),
        structuralScore: score,
      });
    }
  }

  // Sort hypotheses: highest structural score first, then balanced compactness
  return hypotheses.sort((a, b) => b.structuralScore - a.structuralScore);
}

// ─── Dynamic Copy Object Construction ───────────────────────────────────────

export function createDynamicCopyModel(
  id: string,
  text: string,
  semanticRole: CopySemanticRole,
  priority: number = 1
): DynamicCopyVisualObject {
  const trimmed = text.trim();
  const tokens = tokenizeCopy(trimmed);
  const words = tokens.map((t) => t.text);
  const totalChars = trimmed.length;
  const totalWords = words.length;

  const longestWordChars = words.reduce((max, w) => Math.max(max, w.length), 0);
  const hasAscenders = ASCENDER_CHARS.test(trimmed);
  const hasDescenders = DESCENDER_CHARS.test(trimmed);

  const upperCount = (trimmed.match(/[A-Z]/g) || []).length;
  const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
  const isAllUppercase = alphaCount > 0 && upperCount === alphaCount;
  const isTitleCase =
    !isAllUppercase &&
    words.length > 1 &&
    words.every((w) => /^[A-Z]/.test(w) || SHORT_PARTICLES.has(w.toLowerCase()));

  // Visual importance map
  const importanceMap: Record<CopySemanticRole, number> = {
    'primary-hook': 1.0,
    'offer-badge': 0.85,
    'secondary-hook': 0.7,
    'cta': 0.65,
    'eyebrow': 0.5,
    'supporting-note': 0.4,
    'disclaimer': 0.2,
  };
  const visualImportance = Math.max(0.1, Math.min(1.0, (importanceMap[semanticRole] ?? 0.5) / Math.max(1, priority * 0.8)));

  const hypotheses = generateLineBreakHypotheses(tokens, semanticRole === 'primary-hook' ? 4 : 3);

  const getHypothesesForLineCount = (lineCount: number): LineBreakHypothesis[] => {
    return hypotheses.filter((h) => h.lineCount === lineCount);
  };

  const getBestHypothesisForAspect = (
    targetAspectRatio: number,
    charWidthToLineHeightRatio: number = 0.45
  ): LineBreakHypothesis => {
    if (hypotheses.length === 0) {
      return {
        lines: [trimmed],
        lineCount: 1,
        lineCharCounts: [totalChars],
        maxLineChars: totalChars,
        ragVariance: 0,
        hasWidowOrOrphan: false,
        syntacticPenalty: 0,
        compactness: 1,
        structuralScore: 1,
      };
    }

    // Find the hypothesis whose visual aspect ratio (width / height) is closest to targetAspectRatio
    let best = hypotheses[0];
    let minDiff = Infinity;

    for (const hyp of hypotheses) {
      const estimatedWidth = hyp.maxLineChars * charWidthToLineHeightRatio;
      const estimatedHeight = hyp.lineCount * 1.15;
      const aspect = estimatedWidth / Math.max(0.1, estimatedHeight);
      const diff = Math.abs(aspect - targetAspectRatio);

      // Score combination: aspect distance plus structural quality
      const penalizedDiff = diff * 0.7 + (1.0 - hyp.structuralScore) * 3.0;
      if (penalizedDiff < minDiff) {
        minDiff = penalizedDiff;
        best = hyp;
      }
    }

    return best;
  };

  const estimateDimensions = (
    hypothesis: LineBreakHypothesis,
    fontSize: number,
    lineHeight: number,
    charWidthMultiplier: number = 0.52
  ): { width: number; height: number; aspectRatio: number } => {
    const width = Math.round(hypothesis.maxLineChars * fontSize * charWidthMultiplier);
    const height = Math.round(hypothesis.lineCount * fontSize * lineHeight);
    const aspectRatio = Number((width / Math.max(1, height)).toFixed(3));
    return { width, height, aspectRatio };
  };

  return {
    id,
    text: trimmed,
    semanticRole,
    priority,
    visualImportance,
    tokens,
    totalChars,
    totalWords,
    longestWordChars,
    hasAscenders,
    hasDescenders,
    isAllUppercase,
    isTitleCase,
    hypotheses,
    getHypothesesForLineCount,
    getBestHypothesisForAspect,
    estimateDimensions,
  };
}
