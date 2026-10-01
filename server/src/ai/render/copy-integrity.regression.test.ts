import { describe, it, expect } from 'vitest';
import {
  isStructuredArtifact,
  validateAndBuildRenderableCopy,
} from '../intent/copy-sanitizer';
import {
  classifyCriticFailure,
  type RenderCriticEvaluation,
} from './critic-recovery';
import sharp from 'sharp';
import {
  assertRenderableCopy,
  InvalidRenderableCopyError,
} from './designer-composition';
import { discoverOptimizedComposition } from './composition-evaluation';
import { createCanvasRepresentation, createBrandDesignRepresentation, createDesignField } from './design-representation';
import { analyzeImageField } from './image-field';
import type { CampaignCopyLine } from '../prompts/campaign-creative.prompt';

describe('Copy Integrity & Multi-Failure Recovery Regression Suite', () => {
  describe('1. Structural Artifact Detection (isStructuredArtifact)', () => {
    it('rejects the exact Ganesh/Villy production corruption string', () => {
      const corruptedString = "from home.', 'cta': 'Experience 2D Try On', 'marketin";
      expect(isStructuredArtifact(corruptedString)).toBe(true);
    });

    it('rejects various JSON and code serialization fragments', () => {
      expect(isStructuredArtifact("{ 'headline': 'Celebrate with Joy' }")).toBe(true);
      expect(isStructuredArtifact('{"cta": "Shop Now", "body": "Special Offer"}')).toBe(true);
      expect(isStructuredArtifact("['headline', 'cta', 'body']")).toBe(true);
      expect(isStructuredArtifact("marketing': 'True 3D'")).toBe(true);
      expect(isStructuredArtifact("cta: 'Try Now'")).toBe(true);
      expect(isStructuredArtifact("<function generate_copy at 0x7f8b>")).toBe(true);
    });

    it('preserves valid natural marketing copy with punctuation, colons, hyphens, and apostrophes', () => {
      expect(isStructuredArtifact("Celebrate Ganesh Chaturthi with Villy's AI")).toBe(false);
      expect(isStructuredArtifact('50% Off: Limited Time Offer')).toBe(false);
      expect(isStructuredArtifact('Experience 2D Try-On')).toBe(false);
      expect(isStructuredArtifact("India's Best Festive Collection")).toBe(false);
      expect(isStructuredArtifact('"Pure Elegance" - The Autumn Edit')).toBe(false);
      expect(isStructuredArtifact('Available now: In stores & online')).toBe(false);
      expect(isStructuredArtifact("Don't miss out!")).toBe(false);
    });
  });

  describe('2. Authoritative Copy Gate (validateAndBuildRenderableCopy)', () => {
    it('filters out corrupted items and produces clean RenderableCopy[]', () => {
      const rawLines: CampaignCopyLine[] = [
        { role: 'HEADLINE', text: 'Celebrate Ganesh Chaturthi with Joy' },
        { role: 'BODY', text: "from home.', 'cta': 'Experience 2D Try On', 'marketin" },
        { role: 'CTA', text: 'Experience 2D Try-On' },
      ];

      const renderable = validateAndBuildRenderableCopy(rawLines, [], 3);
      expect(renderable.length).toBe(2);
      expect(renderable.map((r) => r.text)).toEqual([
        'Celebrate Ganesh Chaturthi with Joy',
        'Experience 2D Try-On',
      ]);
      expect(renderable.some((r) => r.text.includes('marketin'))).toBe(false);
      expect(renderable.some((r) => r.text.includes("from home.'"))).toBe(false);
    });

    it('PROVES required claims CANNOT reintroduce contamination (Protection Test)', () => {
      // If an LLM-derived or dirty requiredClaims list contains the corrupted fragment:
      const contaminatedClaims = [
        "from home.', 'cta': 'Experience 2D Try On', 'marketin",
      ];

      const rawLines: CampaignCopyLine[] = [
        { role: 'HEADLINE', text: 'Festive Season Arrivals' },
        { role: 'BODY', text: "from home.', 'cta': 'Experience 2D Try On', 'marketin" },
        { role: 'CTA', text: 'Shop Now' },
      ];

      const renderable = validateAndBuildRenderableCopy(rawLines, contaminatedClaims, 3);

      // 1. Contaminated claim is rejected
      // 2. Contaminated claim is NOT injected or matched
      // 3. No malformed text reaches renderable copy
      expect(renderable.every((r) => !isStructuredArtifact(r.text))).toBe(true);
      expect(renderable.some((r) => r.text.includes('marketin'))).toBe(false);
      expect(renderable.some((r) => r.text.includes('from home.'))).toBe(false);
      expect(renderable.length).toBe(2);
      expect(renderable[0].text).toBe('Festive Season Arrivals');
      expect(renderable[1].text).toBe('Shop Now');
    });

    it('dynamically prioritizes essential claims over optional claims without a hardcoded count', () => {
      const rawLines: CampaignCopyLine[] = [
        { role: 'HEADLINE', text: 'Ganesh Chaturthi Mega Sale' },
        { role: 'OFFER', text: 'Flat 50% Off Everything' },
        { role: 'CTA', text: 'Claim Offer' },
        { role: 'SUPPORT', text: 'Free shipping on all festive orders across India' },
      ];

      // When maxElements is 2, essential headline and supporting offer/cta remain, optional support is shed
      const renderable = validateAndBuildRenderableCopy(rawLines, ['Flat 50% Off Everything'], 2);
      expect(renderable.length).toBe(2);
      expect(renderable.map((r) => r.role)).toEqual(['HEADLINE', 'OFFER']);
      expect(renderable.map((r) => r.text)).toEqual([
        'Ganesh Chaturthi Mega Sale',
        'Flat 50% Off Everything',
      ]);
    });
  });

  describe('3. Multi-Failure Critic Recovery (classifyCriticFailure)', () => {
    it('preserves all detected defects in failures[] and prioritizes COPY_INTEGRITY_FAILURE over OCCLUSION_FAILURE', () => {
      // Exact scenario from the real Ganesh/Villy failure:
      // Critic complained about BOTH raw JSON artifacts visible AND type sitting on the subject
      const critic: RenderCriticEvaluation = {
        passed: false,
        templateLook: false,
        humanCraft: false,
        singleClearIdea: true,
        layoutExpressesIdea: false,
        interchangeableWithAnotherEvent: false,
        problems: [
          'Raw code/JSON string artifacts visible inside body text ("from home.\', \'cta\': \'Experience 2D Try On\', \'marketin")',
          'Headline type is sitting on the subject face',
          'Low contrast on CTA over dark detailed background',
        ],
        reasonsToReject: [
          'Code artifact in artwork',
          'Subject occlusion',
          'Insufficient text contrast',
        ],
        redesignFeedback: 'Fix raw JSON artifacts and move copy away from the hero subject.',
      };

      const analysis = classifyCriticFailure(critic);

      // Must record ALL detected failures
      expect(analysis.failures).toContain('COPY_INTEGRITY_FAILURE');
      expect(analysis.failures).toContain('OCCLUSION_FAILURE');
      expect(analysis.failures).toContain('LEGIBILITY_FAILURE');

      // Primary recovery driver MUST be COPY_INTEGRITY_FAILURE (dependency-ordered upstream failure)
      expect(analysis.failureClass).toBe('COPY_INTEGRITY_FAILURE');
      expect(analysis.responsibleLayer).toBe('COPY');
      expect(analysis.action).toBe('REBUILD_COPY');
      // Must reuse the generated image in memory
      expect(analysis.shouldReuseImage).toBe(true);
    });

    it('prioritizes dependency order: COPY_INTEGRITY > COPY_VALIDITY > COPY_VOLUME > LEGIBILITY > OCCLUSION > BRAND > COMPOSITION > CONCEPT > IMAGE', () => {
      const criticWithAll: RenderCriticEvaluation = {
        passed: false,
        templateLook: true,
        humanCraft: false,
        singleClearIdea: false,
        layoutExpressesIdea: false,
        interchangeableWithAnotherEvent: true,
        problems: [
          'Raw code/JSON string artifact visible',
          'Placeholder copy remaining',
          'Too much copy for canvas',
          'Dark text on dark background low contrast',
          'Type sits directly over hero product',
          'Brand voice is completely wrong colors',
          'Composition feels unaligned',
          'Wrong occasion and swapped picture',
        ],
        reasonsToReject: ['Everything failed'],
        redesignFeedback: 'Rebuild everything.',
      };

      const analysis = classifyCriticFailure(criticWithAll);
      expect(analysis.failures.length).toBeGreaterThanOrEqual(7);
      expect(analysis.failureClass).toBe('COPY_INTEGRITY_FAILURE');
      expect(analysis.action).toBe('REBUILD_COPY');
    });

    it('classifies COPY_VOLUME_FAILURE and triggers dynamic copy reduction with image reuse', () => {
      const critic: RenderCriticEvaluation = {
        passed: false,
        templateLook: false,
        humanCraft: false,
        singleClearIdea: true,
        layoutExpressesIdea: false,
        interchangeableWithAnotherEvent: false,
        problems: ['Too much copy cluttering the frame and competing for visual attention'],
        reasonsToReject: ['Copy volume overload'],
        redesignFeedback: 'Reduce copy density to allow the visual hero to breathe.',
      };

      const analysis = classifyCriticFailure(critic);
      expect(analysis.failures).toContain('COPY_VOLUME_FAILURE');
      expect(analysis.failureClass).toBe('COPY_VOLUME_FAILURE');
      expect(analysis.responsibleLayer).toBe('COPY');
      expect(analysis.action).toBe('REDUCE_COPY');
      expect(analysis.shouldReuseImage).toBe(true);
    });
  });

  describe('4. Renderer Fail-Closed Invariant Assertion (assertRenderableCopy)', () => {
    it('throws InvalidRenderableCopyError when structured code artifacts are passed to the renderer', () => {
      const invalidNodes = [
        {
          id: 'primary-hook',
          kind: 'copy',
          lines: ['Celebrate Ganesh Chaturthi'],
        },
        {
          id: 'supporting-note',
          kind: 'copy',
          lines: ["from home.', 'cta': 'Experience 2D Try On', 'marketin"],
        },
      ];

      expect(() => assertRenderableCopy(invalidNodes)).toThrow(InvalidRenderableCopyError);
      try {
        assertRenderableCopy(invalidNodes);
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidRenderableCopyError);
        expect((err as InvalidRenderableCopyError).invalidContent).toContain('marketin');
      }
    });

    it('passes clean marketing copy without errors', () => {
      const validNodes = [
        {
          id: 'primary-hook',
          kind: 'copy',
          lines: ['Celebrate Ganesh Chaturthi with Joy'],
        },
        {
          id: 'cta',
          kind: 'copy',
          lines: ['Experience 2D Try-On'],
        },
      ];

      expect(() => assertRenderableCopy(validNodes)).not.toThrow();
    });
  });

  describe('5. Production Recovery Regression (Request 43df2ab4: Dark Food Multi-Defect Recovery)', () => {
    it('accurately captures all 3 critic defects, reuses image, and promotes action to REDISCOVER_COMPOSITION', () => {
      // Observed critic defects from request 43df2ab4:
      // 1. Dark blue typography sits directly on dark roasted duck (zero contrast)
      // 2. Brand logo at top center is undersized and illegible
      // 3. Type is sitting on the subject rather than in the available visual space
      const criticEvaluation: RenderCriticEvaluation = {
        passed: false,
        templateLook: false,
        humanCraft: false,
        singleClearIdea: true,
        layoutExpressesIdea: false,
        interchangeableWithAnotherEvent: false,
        textOccludesSubject: true,
        logoClear: false,
        problems: [
          'Dark blue typography sits directly on dark roasted duck with zero contrast',
          'Brand logo at top center is undersized and illegible',
          'Type is sitting on the subject rather than in the available visual space',
        ],
        reasonsToReject: [
          'Legibility failure: dark blue on dark duck',
          'Occlusion failure: headline occludes primary roasted duck subject',
          'Logo illegibility: brand logo is undersized',
        ],
        redesignFeedback: 'Move headline to negative space, increase text contrast, and make the logo legible.',
      };

      const analysis = classifyCriticFailure(criticEvaluation);

      // 1. All 3 failure classes must be preserved
      expect(analysis.failures).toContain('OCCLUSION_FAILURE');
      expect(analysis.failures).toContain('LEGIBILITY_FAILURE');
      expect(analysis.failures).toContain('LOGO_LEGIBILITY_FAILURE');

      // 2. Multi-defect composition failure promotes action to REDISCOVER_COMPOSITION
      expect(analysis.action).toBe('REDISCOVER_COMPOSITION');
      expect(analysis.responsibleLayer).toBe('COMPOSITION');

      // 3. Image must be reused because the visual asset itself passed fidelity
      expect(analysis.shouldReuseImage).toBe(true);
    });

    it('reruns DDE with recoveryContext and successfully discovers unoccluded placement, high contrast, and larger logo', async () => {
      const width = 1080;
      const height = 1080;
      const canvas = createCanvasRepresentation(width, height);

      // Dark roasted duck in upper half (fill: #1a1008 dark brown/black), quiet light negative space in lower half (fill: #f5f0e8)
      const duckSvg = `<svg width="${width}" height="${height}">
        <rect width="${width}" height="${height * 0.55}" fill="#1a1008"/>
        <rect y="${height * 0.55}" width="${width}" height="${height * 0.45}" fill="#f5f0e8"/>
      </svg>`;
      const duckBuffer = await sharp(Buffer.from(duckSvg)).png().toBuffer();
      const rawImageField = await analyzeImageField(duckBuffer);
      const field = createDesignField(rawImageField);

      const copyItems = [
        {
          id: 'headline',
          text: 'Crispy Roasted Duck Feast',
          role: 'headline' as const,
          priority: 1,
          font: 'Montserrat',
          weight: 700,
        },
      ];

      const logoItem = {
        id: 'brand-mark',
        role: 'logo' as const,
        aspectRatio: 2.5,
        sourceDimensions: { width: 250, height: 100 },
      };

      const brand = createBrandDesignRepresentation({
        colors: ['#1A2B4C', '#D4AF37'],
        approvedFonts: { headline: ['Montserrat'], body: ['Inter'] },
        logo: {
          aspectRatio: 2.5,
          detectedColor: '#FFFFFF',
          recommendedPlacement: 'top-left',
        },
      });

      // 1. Initial run without recovery context (simulating attempt 0 candidate rejected in upper dark zone)
      const attempt0 = {
        failures: ['OCCLUSION_FAILURE', 'LEGIBILITY_FAILURE', 'LOGO_LEGIBILITY_FAILURE'] as any[],
        reasons: ['Headline occludes roasted duck', 'Dark blue on dark duck zero contrast', 'Logo undersized'],
        priorRejections: [
          {
            id: 'headline',
            rect: { x: 0.10, y: 0.10, width: 0.80, height: 0.25 }, // in upper dark zone
            reasons: ['Headline occludes roasted duck'],
          },
        ],
      };

      // 2. Recovery run with activeRecoveryContext
      const recoveryResult = discoverOptimizedComposition({
        copyItems,
        logoItem,
        field,
        canvas,
        brand,
        recoveryContext: attempt0,
      });

      const recoveredState = recoveryResult.bestState;
      expect(recoveredState).toBeDefined();

      const recoveredHeadline = recoveredState.elements.find((e) => e.id === 'headline');
      const recoveredLogo = recoveredState.elements.find((e) => e.role === 'logo');

      expect(recoveredHeadline).toBeDefined();
      expect(recoveredLogo).toBeDefined();

      // Headline must move into quiet negative space (avoiding upper dark duck zone)
      expect(recoveredHeadline!.rect.y).toBeGreaterThanOrEqual(0.40);

      // Logo must be given first-class prominence (scale >= 0.060)
      expect(recoveredLogo!.rect.height).toBeGreaterThanOrEqual(0.060);

      // Logo must remain inside canvas safe bounds
      expect(recoveredLogo!.rect.x).toBeGreaterThanOrEqual(canvas.safeBounds.x - 0.005);
      expect(recoveredLogo!.rect.y).toBeGreaterThanOrEqual(canvas.safeBounds.y - 0.005);
      expect(recoveredLogo!.rect.x + recoveredLogo!.rect.width).toBeLessThanOrEqual(1.0 - canvas.safeBounds.x + 0.005);
      expect(recoveredLogo!.rect.y + recoveredLogo!.rect.height).toBeLessThanOrEqual(1.0 - canvas.safeBounds.y + 0.005);

      // Logo and headline must not collide
      const hRect = recoveredHeadline!.rect;
      const lRect = recoveredLogo!.rect;
      const overlapX = Math.max(0, Math.min(hRect.x + hRect.width, lRect.x + lRect.width) - Math.max(hRect.x, lRect.x));
      const overlapY = Math.max(0, Math.min(hRect.y + hRect.height, lRect.y + lRect.height) - Math.max(hRect.y, lRect.y));
      expect(overlapX * overlapY).toBe(0);

      // Contrast must be adequate
      expect(recoveredHeadline!.ink.contrast.wcagRatio).toBeGreaterThanOrEqual(3.0);
    });

    it('6. "The Festive Rangoli Platter" regression: discovers physically legible logo scale and high-contrast treatment on dark/complex food image', async () => {
      const width = 1080;
      const height = 1080;
      const canvas = createCanvasRepresentation(width, height);

      // Dark food / festive background: dark textured background (#18120c) with warm central/lower rangoli platter (#8c3a10)
      const rangoliSvg = `<svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="#18120c"/>
        <circle cx="${width * 0.5}" cy="${height * 0.6}" r="${width * 0.35}" fill="#8c3a10"/>
        <rect x="${width * 0.05}" y="${height * 0.75}" width="${width * 0.30}" height="${height * 0.20}" fill="#23170e"/>
      </svg>`;
      const rangoliBuffer = await sharp(Buffer.from(rangoliSvg)).png().toBuffer();
      const rawImageField = await analyzeImageField(rangoliBuffer);
      const field = createDesignField(rawImageField);

      const copyItems = [
        {
          id: 'headline',
          text: 'The Festive Rangoli Platter',
          role: 'headline' as const,
          priority: 1,
          font: 'Playfair Display',
          weight: 700,
        },
      ];

      const logoItem = {
        id: 'brand-mark',
        role: 'logo' as const,
        aspectRatio: 2.5,
        sourceDimensions: { width: 250, height: 100 },
      };

      const brand = createBrandDesignRepresentation({
        colors: ['#2A1810', '#E5A93C'], // Dark brand primary, golden secondary
        approvedFonts: { headline: ['Playfair Display'], body: ['Inter'] },
        logo: {
          aspectRatio: 2.5,
          detectedColor: '#2A1810',
          recommendedPlacement: 'bottom-left',
        },
      });

      // Simulating Attempt 0 failure: Logo in lower-left became tiny, dark, and illegible
      const attempt0Context = {
        failures: ['OCCLUSION_FAILURE', 'LEGIBILITY_FAILURE', 'LOGO_LEGIBILITY_FAILURE'] as any[],
        reasons: [
          'Headline occludes central food platter',
          'Dark text has poor contrast',
          'Brand logo in the bottom-left corner is extremely small, dark, and illegible against the background',
        ],
        priorRejections: [
          {
            id: 'headline',
            rect: { x: 0.10, y: 0.50, width: 0.80, height: 0.25 },
            reasons: ['Headline occludes rangoli platter'],
          },
        ],
      };

      // Rerun DDE Discovery with active recovery context
      const result = discoverOptimizedComposition({
        copyItems,
        logoItem,
        field,
        canvas,
        brand,
        recoveryContext: attempt0Context,
      });

      const best = result.bestState;
      expect(best).toBeDefined();

      const logo = best.elements.find((e) => e.role === 'logo');
      const headline = best.elements.find((e) => e.id === 'headline');

      expect(logo).toBeDefined();
      expect(headline).toBeDefined();

      // 1. Logo discovers physically legible scale (height >= 0.058, width >= 0.14)
      expect(logo!.rect.height).toBeGreaterThanOrEqual(0.058);
      expect(logo!.rect.width).toBeGreaterThanOrEqual(0.14);

      // 2. Logo discovers high contrast (WCAG >= 3.0:1 on its actual backdrop)
      const effectiveLogoWcag = logo!.surface.signals.postSurfaceWcag ?? logo!.ink.contrast.wcagRatio;
      expect(effectiveLogoWcag).toBeGreaterThanOrEqual(3.0);

      // 3. Logo remains within canvas safe bounds without clipping
      expect(logo!.rect.x).toBeGreaterThanOrEqual(canvas.safeBounds.x - 0.005);
      expect(logo!.rect.y).toBeGreaterThanOrEqual(canvas.safeBounds.y - 0.005);
      expect(logo!.rect.x + logo!.rect.width).toBeLessThanOrEqual(1.0 - canvas.safeBounds.x + 0.005);
      expect(logo!.rect.y + logo!.rect.height).toBeLessThanOrEqual(1.0 - canvas.safeBounds.y + 0.005);

      // 4. Logo does not collide with headline
      const hRect = headline!.rect;
      const lRect = logo!.rect;
      const ox = Math.max(0, Math.min(hRect.x + hRect.width, lRect.x + lRect.width) - Math.max(hRect.x, lRect.x));
      const oy = Math.max(0, Math.min(hRect.y + hRect.height, lRect.y + lRect.height) - Math.max(hRect.y, lRect.y));
      expect(ox * oy).toBe(0);

      // 5. Overall holistic score reflects viable, high-quality composition
      expect(best.evaluation.aggregateScore).toBeGreaterThan(0.40);
    });
  });
});
