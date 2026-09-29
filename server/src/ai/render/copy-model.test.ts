import { describe, it, expect } from 'vitest';
import {
  tokenizeCopy,
  generateLineBreakHypotheses,
  createDynamicCopyModel,
} from './copy-model';

describe('Dynamic Copy Model — Phase 2', () => {
  describe('Linguistic Tokenization', () => {
    it('accurately identifies particles, punctuation, and break affordances', () => {
      const tokens = tokenizeCopy('Discover our new, handcrafted festive collection!');
      expect(tokens.length).toBe(6);

      // "new," has trailing punctuation -> ideal break point (negative penalty)
      const commaToken = tokens.find((t) => t.text === 'new,');
      expect(commaToken?.hasTrailingPunctuation).toBe(true);
      expect(commaToken?.breakPenalty).toBeLessThan(0);

      // "our" is a short particle
      const particle = tokens.find((t) => t.text === 'our');
      expect(particle?.isShortParticle).toBe(true);
    });

    it('handles empty or whitespace strings gracefully', () => {
      expect(tokenizeCopy('')).toEqual([]);
      expect(tokenizeCopy('   \n  \t ')).toEqual([]);
    });
  });

  describe('Multi-Hypothesis Line Break Generation', () => {
    it('generates 1-line and 2-line hypotheses for short copy', () => {
      const tokens = tokenizeCopy('NEW COLLECTION');
      const hypotheses = generateLineBreakHypotheses(tokens, 3);

      expect(hypotheses.length).toBe(2);
      expect(hypotheses.some((h) => h.lineCount === 1 && h.lines[0] === 'NEW COLLECTION')).toBe(true);
      expect(hypotheses.some((h) => h.lineCount === 2 && h.lines.join(' | ') === 'NEW | COLLECTION')).toBe(true);
    });

    it('generates multiple line structures and scores rag quality and balance for medium copy', () => {
      const tokens = tokenizeCopy('Discover our new festive collection');
      const hypotheses = generateLineBreakHypotheses(tokens, 4);

      // Should have 1-line, 2-line, 3-line, and 4-line hypotheses
      const lineCounts = new Set(hypotheses.map((h) => h.lineCount));
      expect(lineCounts.has(1)).toBe(true);
      expect(lineCounts.has(2)).toBe(true);
      expect(lineCounts.has(3)).toBe(true);

      // Find the balanced 2-line hypothesis: "Discover our new" (16 chars) / "festive collection" (18 chars)
      const balanced2Line = hypotheses.find(
        (h) => h.lineCount === 2 && h.lines[0] === 'Discover our new' && h.lines[1] === 'festive collection'
      );
      expect(balanced2Line).toBeDefined();
      expect(balanced2Line!.ragVariance).toBeLessThan(0.15); // Very even lengths
      expect(balanced2Line!.hasWidowOrOrphan).toBe(false);
      expect(balanced2Line!.structuralScore).toBeGreaterThan(0.85);

      // An awkward 2-line hypothesis: "Discover our new festive" (24 chars) / "collection" (10 chars)
      const unbalanced2Line = hypotheses.find(
        (h) => h.lineCount === 2 && h.lines[0] === 'Discover our new festive' && h.lines[1] === 'collection'
      );
      expect(unbalanced2Line).toBeDefined();
      expect(unbalanced2Line!.ragVariance).toBeGreaterThan(balanced2Line!.ragVariance);
      expect(unbalanced2Line!.structuralScore).toBeLessThan(balanced2Line!.structuralScore);
    });

    it('heavily penalizes widow or orphan endings', () => {
      const tokens = tokenizeCopy('Exclusive crafted apparel for you');
      const hypotheses = generateLineBreakHypotheses(tokens, 3);

      // Hypothesis ending with single short word "you"
      const orphanHyp = hypotheses.find(
        (h) => h.lineCount === 2 && h.lines[1] === 'you'
      );
      expect(orphanHyp).toBeDefined();
      expect(orphanHyp!.hasWidowOrOrphan).toBe(true);
      expect(orphanHyp!.structuralScore).toBeLessThan(0.65);
    });
  });

  describe('Dynamic Copy Visual Object Integration', () => {
    it('creates a complete visual object with typography affordances and casing detection', () => {
      const headline = createDynamicCopyModel('h_1', 'THE NEW AUTUMN DROP', 'primary-hook', 1);

      expect(headline.id).toBe('h_1');
      expect(headline.isAllUppercase).toBe(true);
      expect(headline.isTitleCase).toBe(false);
      expect(headline.longestWordChars).toBe(6); // AUTUMN
      expect(headline.hasAscenders).toBe(true);
      expect(headline.visualImportance).toBe(1.0);
      expect(headline.hypotheses.length).toBeGreaterThan(0);

      const mixed = createDynamicCopyModel('h_mixed', 'The new autumn drop', 'primary-hook', 1);
      expect(mixed.hasDescenders).toBe(true); // p in drop
      expect(mixed.isAllUppercase).toBe(false);
    });

    it('dynamically discovers the best hypothesis for a target bounding box aspect ratio', () => {
      const copy = createDynamicCopyModel('h_2', 'Discover handcrafted artisan coffee roasters today', 'primary-hook', 1);

      // Target ultra-wide single line (e.g. 18:1 aspect ratio)
      const wideHyp = copy.getBestHypothesisForAspect(18.0);
      expect(wideHyp.lineCount).toBe(1);

      // Target medium horizontal rectangle (e.g. 5:1 aspect ratio)
      const mediumHyp = copy.getBestHypothesisForAspect(5.0);
      expect(mediumHyp.lineCount).toBe(2);

      // Target compact / tall column (e.g. 1.8:1 aspect ratio)
      const tallHyp = copy.getBestHypothesisForAspect(1.8);
      expect(tallHyp.lineCount).toBeGreaterThanOrEqual(3);
    });

    it('estimates physical pixel dimensions accurately across scales and line heights', () => {
      const copy = createDynamicCopyModel('h_3', 'SLOW CRAFT COFFEE', 'primary-hook', 1);
      const hyp1Line = copy.getHypothesesForLineCount(1)[0];
      const hyp2Line = copy.getHypothesesForLineCount(2)[0];

      const dim1 = copy.estimateDimensions(hyp1Line, 50, 1.15, 0.52);
      expect(dim1.width).toBeGreaterThan(400);
      expect(dim1.height).toBe(Math.round(1 * 50 * 1.15));

      const dim2 = copy.estimateDimensions(hyp2Line, 50, 1.15, 0.52);
      expect(dim2.width).toBeLessThan(dim1.width);
      expect(dim2.height).toBe(Math.round(2 * 50 * 1.15));
      expect(dim2.aspectRatio).toBeLessThan(dim1.aspectRatio);
    });
  });

  describe('Anti-Template Copy Verification', () => {
    it('proves that line hypotheses are computed purely dynamically without hardcoded dictionary lookup', () => {
      const arbitraryUniqueCopy = 'Xylophone zebra quantum nebula harmonic frequency';
      const copy = createDynamicCopyModel('arb_1', arbitraryUniqueCopy, 'primary-hook', 1);

      expect(copy.hypotheses.length).toBeGreaterThan(3);
      expect(copy.totalWords).toBe(6);
      expect(copy.longestWordChars).toBe(9); // Xylophone / frequency

      // Verify that every single word is strictly preserved in all hypotheses
      for (const hyp of copy.hypotheses) {
        const wordsInHyp = hyp.lines.join(' ').split(/\s+/);
        expect(wordsInHyp).toEqual(arbitraryUniqueCopy.split(/\s+/));
      }
    });
  });
});
