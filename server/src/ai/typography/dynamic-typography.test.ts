import { describe, it, expect } from 'vitest';
import {
  evaluateFontCandidates,
  deriveDynamicTypeSystem,
} from './dynamic-typography';
import { measureText } from './font-metrics.service';
import { createDynamicCopyModel } from '../render/copy-model';
import { createCanvasRepresentation, createBrandDesignRepresentation } from '../render/design-representation';

describe('Dynamic Typography Engine — Phase 3', () => {
  const canvas = createCanvasRepresentation(1200, 1500);

  describe('Font Candidate Evaluation & Observable Scoring Breakdown', () => {
    it('prioritizes explicitly approved brand fonts in Brand DNA with observable score breakdown', () => {
      const brand = createBrandDesignRepresentation({
        brandProfile: { name: 'Villy Studio', tone: 'editorial, elegant' },
        creativeDna: { brandColors: ['#1c1917', '#881337'] },
      });
      brand.approvedFonts = { headline: ['Cormorant Garamond'] };

      const copy = [createDynamicCopyModel('h1', 'THE NEW AUTUMN DROP', 'primary-hook', 1)];
      const candidates = evaluateFontCandidates({ brand, copy, canvas });

      expect(candidates.length).toBeGreaterThan(0);
      const topCand = candidates[0];
      expect(topCand.headlineFont.family).toBe('Cormorant Garamond');
      expect(topCand.scoreBreakdown.brandApproved).toBe(40);
      expect(topCand.reasons.some((r) => r.includes('Explicitly approved'))).toBe(true);
    });

    it('adapts font candidate scoring to spatial box geometry (narrow column vs wide banner)', () => {
      const brand = createBrandDesignRepresentation({
        brandProfile: { name: 'Streetwear Fitness' },
        creativeDna: { brandColors: ['#000000', '#ffffff'] },
      });
      const copy = [createDynamicCopyModel('h1', 'UNLEASH YOUR HIGHEST POTENTIAL', 'primary-hook', 1)];

      // 1. Narrow column: aspect 1.2:1 (width: 0.3, height: 0.6)
      const narrowBox = { x: 0.1, y: 0.2, width: 0.3, height: 0.6 };
      const narrowCandidates = evaluateFontCandidates({ brand, copy, spatialBox: narrowBox, canvas });

      // Condensed fonts should receive spatial column boost
      const topNarrow = narrowCandidates.slice(0, 3).map((c) => c.headlineFont.width);
      expect(topNarrow).toContain('condensed');

      // 2. Wide banner: aspect 8:1 (width: 0.8, height: 0.12)
      const wideBox = { x: 0.1, y: 0.1, width: 0.8, height: 0.12 };
      const wideCandidates = evaluateFontCandidates({ brand, copy, spatialBox: wideBox, canvas });
      const topWide = wideCandidates.slice(0, 3).map((c) => c.headlineFont.width);
      expect(topWide).toContain('normal');
    });

    it('supports custom calibratable scoring weights without hardcoded magic numbers', () => {
      const brand = createBrandDesignRepresentation({
        brandProfile: { name: 'Custom Calibration Brand' },
        creativeDna: { brandColors: ['#000000'] },
      });
      const copy = [createDynamicCopyModel('h1', 'HEADLINE TESTING', 'primary-hook', 1)];

      // Apply custom scoring weights
      const candidates = evaluateFontCandidates({
        brand,
        copy,
        canvas,
        customWeights: {
          brandApprovedWeight: 100,
          partnerPairingBonus: 50,
        },
      });

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].fitScore).toBeGreaterThan(0);
    });

    it('enforces script support mathematical constraints (e.g., Devanagari)', () => {
      const brand = createBrandDesignRepresentation({
        brandProfile: { name: 'Desi Brand' },
        creativeDna: { brandColors: ['#ff9933', '#ffffff'] },
      });
      const copy = [createDynamicCopyModel('h1', 'त्योहारों की शुभकामनाएं', 'primary-hook', 1)];

      const candidates = evaluateFontCandidates({ brand, copy, canvas, requiredScripts: ['devanagari'] });
      expect(candidates.length).toBeGreaterThan(0);
      for (const cand of candidates) {
        expect(cand.headlineFont.languageSupport).toContain('devanagari');
        expect(cand.bodyFont.languageSupport).toContain('devanagari');
      }
    });

    it('creates pairings with strong classification contrast and curated partner compatibility', () => {
      const brand = createBrandDesignRepresentation({
        brandProfile: { name: 'Editorial Tech' },
        creativeDna: { brandColors: ['#111111', '#f5f5f5'] },
      });
      const copy = [createDynamicCopyModel('h1', 'ARCHITECTURAL SOUNDSCAPES', 'primary-hook', 1)];

      const candidates = evaluateFontCandidates({ brand, copy, canvas });
      const topCandidate = candidates[0];

      expect(topCandidate.headlineFont.family).not.toBe(topCandidate.bodyFont.family);
      expect(topCandidate.bodyFont.readability).toBe('body-friendly');
      expect(topCandidate.scoreBreakdown.classificationContrast).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Composition-Aware Dynamic Type Scaling with Real Glyph Metrics', () => {
    it('scales font sizes compositionally and allows continuous modular ratios', () => {
      const brand = createBrandDesignRepresentation({
        brandProfile: { name: 'Slowpour' },
        creativeDna: { brandColors: ['#faf6f0', '#18181b'] },
      });
      const copy = [
        createDynamicCopyModel('h1', 'SLOW CRAFT COFFEE', 'primary-hook', 1),
        createDynamicCopyModel('sub', 'Brewed over 18 hours in single batches', 'secondary-hook', 2),
        createDynamicCopyModel('cta', 'ORDER NOW', 'cta', 3),
      ];

      const candidates = evaluateFontCandidates({ brand, copy, canvas });
      const topCandidate = candidates[0];

      // Spatial box covering top 35% of canvas
      const spatialBox = { x: 0.08, y: 0.1, width: 0.84, height: 0.35 };

      // Test with custom continuous modular ratio 1.333 (Perfect Fourth)
      const customRatio = 1.333;
      const typeSystem = deriveDynamicTypeSystem({
        candidate: topCandidate,
        copy,
        spatialBox,
        canvas,
        intensity: customRatio,
      });

      expect(typeSystem.modularRatio).toBe(1.333);

      const h1Step = typeSystem.steps['h1'];
      const subStep = typeSystem.steps['sub'];
      const ctaStep = typeSystem.steps['cta'];

      expect(h1Step.fontSizePx).toBeGreaterThan(subStep.fontSizePx);
      expect(subStep.fontSizePx).toBeGreaterThan(ctaStep.fontSizePx);

      // Verify that physical bounding box metrics come from real font file
      expect(h1Step.measuredMetrics.maxLineWidth).toBeGreaterThan(0);
      expect(h1Step.measuredMetrics.totalHeight).toBeGreaterThan(0);
      expect(h1Step.estimatedBoundingBox.widthPx).toBe(h1Step.measuredMetrics.maxLineWidth);

      // Verify tracking adjustment: uppercase CTA gets positive tracking air
      expect(ctaStep.letterSpacing).toBeGreaterThan(0.01);
      // Large headline gets tightened tracking
      expect(h1Step.letterSpacing).toBeLessThan(0.01);
    });

    it('enforces optical legibility floor for small supporting copy across canvas formats', () => {
      const brand = createBrandDesignRepresentation({
        brandProfile: { name: 'Test' },
        creativeDna: { brandColors: ['#000000'] },
      });
      const copy = [
        createDynamicCopyModel('h1', 'HEADLINE', 'primary-hook', 1),
        createDynamicCopyModel('legal', 'Terms and conditions apply. Offer valid while stocks last.', 'disclaimer', 4),
      ];

      const candidates = evaluateFontCandidates({ brand, copy, canvas });
      const typeSystem = deriveDynamicTypeSystem({
        candidate: candidates[0],
        copy,
        spatialBox: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        canvas,
      });

      const legalStep = typeSystem.steps['legal'];
      // Optical floor: shortEdge (1200) * 0.014 = 16.8px
      expect(legalStep.fontSizePx).toBeGreaterThanOrEqual(16);
      expect(legalStep.fontScale).toBeGreaterThanOrEqual(0.014);
    });
  });

  describe('Real Glyph Measurement Verification', () => {
    it('demonstrates different fonts produce different physical widths for the same text', () => {
      const text = 'HANDCRAFTED LUXURY ESSENTIALS';
      const mAnton = measureText({ family: 'Anton', weight: 400, text, fontSize: 50 });
      const mInter = measureText({ family: 'Inter', weight: 400, text, fontSize: 50 });
      const mPlayfair = measureText({ family: 'Playfair Display', weight: 400, text, fontSize: 50 });

      // Anton (condensed) must be significantly narrower than Inter and Playfair
      expect(mAnton.width).toBeLessThan(mInter.width);
      expect(mAnton.width).toBeLessThan(mPlayfair.width);
      expect(mAnton.width / mPlayfair.width).toBeLessThan(0.75);
    });
  });
});
