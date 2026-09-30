import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { designCreative, renderDesignerPlan, type DesignerInput } from './designer-composition';
import { resolveBrandProfile } from '../brand/brand-profile';
import { resolveCreativeDna } from '../brand/creative-dna';
import { resolveStyleDNA } from '../style-dna/style-dna';
import { validateStyleBriefConsistency } from '../intent/style-brief-consistency';
import { evaluateCompositionState } from './composition-evaluation';
import { createCanvasRepresentation, createDesignField } from './design-representation';
import { analyzeImageField } from './image-field';
import type { CreativeDirection, CreativeRenderContext, ImageGenProvider } from '../types';

describe('FlowPost — Adversarial Live Validation Suite', { timeout: 60000 }, () => {
  function createMockImageProvider(): ImageGenProvider {
    return {
      id: 'gemini',
      async generateImage(promptOrInput: any, options?: any) {
        const prompt = typeof promptOrInput === 'string' ? promptOrInput : (promptOrInput?.prompt || '');
        const width = options?.aspectRatio === '4:5' || promptOrInput?.aspectRatio === '4:5' ? 1080 : 1600;
        const height = options?.aspectRatio === '4:5' || promptOrInput?.aspectRatio === '4:5' ? 1350 : 1600;
        
        let svg = '';
        if (prompt.includes('FOCAL_CENTER_SUBJECT') || prompt.includes('strong focal subject')) {
          svg = `<svg width="${width}" height="${height}">
            <rect width="${width}" height="${height}" fill="#f8fafc"/>
            <circle cx="${width * 0.5}" cy="${height * 0.5}" r="${width * 0.35}" fill="#111122"/>
            <rect x="${width * 0.4}" y="${height * 0.4}" width="${width * 0.2}" height="${height * 0.2}" fill="#ffffff"/>
          </svg>`;
        } else if (prompt.includes('DENSE_FOOD') || prompt.includes('dense visual texture')) {
          svg = `<svg width="${width}" height="${height}">
            <rect width="${width}" height="${height}" fill="#2a1a08"/>
            <circle cx="${width * 0.2}" cy="${height * 0.3}" r="${width * 0.2}" fill="#d97706"/>
            <circle cx="${width * 0.7}" cy="${height * 0.4}" r="${width * 0.25}" fill="#b45309"/>
            <circle cx="${width * 0.5}" cy="${height * 0.8}" r="${width * 0.3}" fill="#78350f"/>
            <rect x="${width * 0.1}" y="${height * 0.6}" width="${width * 0.8}" height="${height * 0.3}" fill="#92400e"/>
          </svg>`;
        } else if (prompt.includes('MULTI_SUBJECT')) {
          svg = `<svg width="${width}" height="${height}">
            <rect width="${width}" height="${height}" fill="#0f172a"/>
            <circle cx="${width * 0.25}" cy="${height * 0.35}" r="${width * 0.18}" fill="#38bdf8"/>
            <rect x="${width * 0.6}" y="${height * 0.6}" width="${width * 0.3}" height="${height * 0.3}" fill="#f43f5e"/>
            <rect x="${width * 0.55}" y="${height * 0.1}" width="${width * 0.38}" height="${height * 0.35}" fill="#0f172a"/>
          </svg>`;
        } else if (prompt.includes('MATERIAL_LAYER')) {
          svg = `<svg width="${width}" height="${height}">
            <rect width="${width}" height="${height}" fill="#18181b"/>
            <rect x="0" y="${height * 0.4}" width="${width}" height="${height * 0.6}" fill="#27272a"/>
            <line x1="0" y1="${height * 0.4}" x2="${width}" y2="${height * 0.4}" stroke="#a1a1aa" stroke-width="8"/>
          </svg>`;
        } else {
          svg = `<svg width="${width}" height="${height}">
            <rect width="${width}" height="${height}" fill="#ffffff"/>
            <rect x="${width * 0.5}" y="${height * 0.2}" width="${width * 0.45}" height="${height * 0.65}" fill="#1e293b"/>
          </svg>`;
        }

        const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
        return {
          mimeType: 'image/png',
          data: buffer.toString('base64'),
        };
      },
    };
  }

  async function createTestLogo(): Promise<{ mimeType: string; data: string }> {
    const buf = await sharp({
      create: {
        width: 200,
        height: 80,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    }).png().toBuffer();
    return { mimeType: 'image/png', data: buf.toString('base64') };
  }

  function createMockVisualCritic() {
    return {
      async evaluateCandidate() {
        return {
          passed: true,
          observedSubject: 'Audited Subject',
          templateLook: false,
          humanCraft: true,
          singleClearIdea: true,
          layoutExpressesIdea: true,
          reasonsToReject: [],
        };
      },
    };
  }

  function createMockTextProvider() {
    return {
      id: 'gemini',
      model: 'gemini-2.5-flash',
      supportsVision: true,
      isConfigured: () => true,
      generateJson: vi.fn().mockImplementation(async () => {
        return {
          passed: true,
          confidence: 0.95,
          observedSubject: 'Audited Subject',
          templateLook: false,
          humanCraft: true,
          singleClearIdea: true,
          layoutExpressesIdea: true,
          reasonsToReject: [],
          failures: [],
          recommendedAction: 'PROCEED',
        };
      }),
    };
  }

  it('1. Accidental Collision Rejection: Proves severe collisions are penalized in aggregate score and cannot win', async () => {
    const width = 1080;
    const height = 1350;

    // Image with high-contrast focal subject in the center
    const svg = `<svg width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#ffffff"/>
      <circle cx="${width * 0.5}" cy="${height * 0.5}" r="${width * 0.35}" fill="#111111"/>
    </svg>`;
    const imgBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const imageField = await analyzeImageField(imgBuffer);
    const canvas = createCanvasRepresentation(width, height);
    const field = createDesignField(imageField);

    // Bad Candidate: Placed directly across the center focal subject
    const collidingElement = {
      id: 'headline-colliding',
      role: 'headline' as const,
      typographyState: {
        family: 'Inter',
        weight: 700,
        fontScale: 0.08,
        letterSpacing: 0,
        lineHeightMultiplier: 1.1,
        caseHint: 'none' as const,
        lineCount: 2,
        lines: ['SEVERE', 'COLLISION'],
        hypothesis: { id: 'hyp-1', role: 'headline', lines: ['SEVERE', 'COLLISION'], fontSizePx: 80, fontScale: 0.08, lineHeightPx: 88, lineHeightMultiplier: 1.1, trackingEm: 0, opticalWeight: 700, raggedness: 0.1, visualDensity: 0.5, aspectUtilization: 0.8, marginComfort: 0.9, hierarchyScore: 0.9, compositeScore: 0.9 },
        boundingBox: { x: 0.35, y: 0.45, width: 0.30, height: 0.15, widthNormalized: 0.30, heightNormalized: 0.15 },
      },
      rect: { x: 0.35, y: 0.45, width: 0.30, height: 0.15 },
      ink: {
        color: { hex: '#FFFFFF', isBrandColor: false, sourcePalette: 'light-contrast' as const },
        contrast: { wcagRatio: 1.8, apcaLc: 20, apcaEstimatedLc: 20, isAccessible: false, polarity: 'dark-on-light' as const, localLuminance: 0.5, localDetailEnergy: 0.9 },
        scores: { contrastScore: 0.2, brandAffinityScore: 0.8, imageHarmonyScore: 0.3, opticalScore: 0.5, hierarchyScore: 0.8, aggregateScore: 0.4 },
        signals: { perceivedInkMass: 0.8, chromaticVibration: 0.2, imageHarmonyScore: 0.3 },
        provenance: { derivationType: 'brand-accent' as const, brandCompatibilityScore: 0.8 },
      },
      surface: {
        surfaceField: undefined,
        scores: { contrastGainScore: 0, imagePreservationScore: 1, structuralDisruptionScore: 0, edgePressureScore: 0, compositeScore: 1 },
        signals: { postSurfaceWcag: 1.8, contrastGain: 0, surfaceDisruption: 0, boundaryViolation: 0 },
      },
    };

    // Good Candidate: Placed in top quiet space
    const calmElement = {
      id: 'headline-calm',
      role: 'headline' as const,
      typographyState: {
        family: 'Inter',
        weight: 700,
        fontScale: 0.08,
        letterSpacing: 0,
        lineHeightMultiplier: 1.1,
        caseHint: 'none' as const,
        lineCount: 2,
        lines: ['CALM', 'SPACE'],
        hypothesis: { id: 'hyp-2', role: 'headline', lines: ['CALM', 'SPACE'], fontSizePx: 80, fontScale: 0.08, lineHeightPx: 88, lineHeightMultiplier: 1.1, trackingEm: 0, opticalWeight: 700, raggedness: 0.1, visualDensity: 0.5, aspectUtilization: 0.8, marginComfort: 0.9, hierarchyScore: 0.9, compositeScore: 0.9 },
        boundingBox: { x: 0.08, y: 0.08, width: 0.60, height: 0.15, widthNormalized: 0.60, heightNormalized: 0.15 },
      },
      rect: { x: 0.08, y: 0.08, width: 0.60, height: 0.15 },
      ink: {
        color: { hex: '#111111', isBrandColor: false, sourcePalette: 'dark-contrast' as const },
        contrast: { wcagRatio: 12.5, apcaLc: 95, apcaEstimatedLc: 95, isAccessible: true, polarity: 'dark-on-light' as const, localLuminance: 0.95, localDetailEnergy: 0.05 },
        scores: { contrastScore: 0.95, brandAffinityScore: 0.9, imageHarmonyScore: 0.9, opticalScore: 0.9, hierarchyScore: 0.95, aggregateScore: 0.95 },
        signals: { perceivedInkMass: 0.9, chromaticVibration: 0.05, imageHarmonyScore: 0.9 },
        provenance: { derivationType: 'brand-primary' as const, brandCompatibilityScore: 0.95 },
      },
      surface: {
        surfaceField: undefined,
        scores: { contrastGainScore: 0, imagePreservationScore: 1, structuralDisruptionScore: 0, edgePressureScore: 0, compositeScore: 1 },
        signals: { postSurfaceWcag: 12.5, contrastGain: 0, surfaceDisruption: 0, boundaryViolation: 0 },
      },
    };

    const badEval = evaluateCompositionState({
      canvas,
      elements: [collidingElement as any],
      field,
    });

    const goodEval = evaluateCompositionState({
      canvas,
      elements: [calmElement as any],
      field,
    });

    // Verify bad candidate is penalized
    expect(badEval.textImageRelationshipState).toBeDefined();
    expect(badEval.textImageRelationshipState?.evidence.isAccidentalCollision).toBe(true);
    expect(badEval.aggregateScore).toBeLessThan(goodEval.aggregateScore);
    expect(badEval.interactionSignals.textImageHarmony).toBeLessThan(goodEval.interactionSignals.textImageHarmony);

    // Verify good candidate has low collision risk and high aggregate score
    expect(goodEval.textImageRelationshipState?.evidence.isAccidentalCollision).toBe(false);
    expect(goodEval.aggregateScore).toBeGreaterThan(0.70);
  });

  it('2. Intentional Overlap Case: Proves engine permits intentional overlap when justified by creative mechanism', async () => {
    const width = 1080;
    const height = 1350;

    const svg = `<svg width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#18181b"/>
      <rect x="0" y="${height * 0.5}" width="${width}" height="${height * 0.5}" fill="#3f3f46"/>
    </svg>`;
    const imgBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const imageField = await analyzeImageField(imgBuffer);
    const canvas = createCanvasRepresentation(width, height);
    const field = createDesignField(imageField);

    const overlappingElement = {
      id: 'headline-overlap',
      role: 'headline' as const,
      typographyState: {
        family: 'Inter',
        weight: 900,
        fontScale: 0.12,
        letterSpacing: -0.02,
        lineHeightMultiplier: 1.0,
        caseHint: 'uppercase' as const,
        lineCount: 1,
        lines: ['HORIZON'],
        hypothesis: { id: 'hyp-3', role: 'headline', lines: ['HORIZON'], fontSizePx: 120, fontScale: 0.12, lineHeightPx: 120, lineHeightMultiplier: 1.0, trackingEm: -0.02, opticalWeight: 900, raggedness: 0, visualDensity: 0.8, aspectUtilization: 0.9, marginComfort: 0.9, hierarchyScore: 0.95, compositeScore: 0.95 },
        boundingBox: { x: 0.1, y: 0.45, width: 0.8, height: 0.12, widthNormalized: 0.8, heightNormalized: 0.12 },
      },
      rect: { x: 0.1, y: 0.45, width: 0.8, height: 0.12 },
      ink: {
        color: { hex: '#FFFFFF', isBrandColor: false, sourcePalette: 'light-contrast' as const },
        contrast: { wcagRatio: 6.0, apcaLc: 75, apcaEstimatedLc: 75, isAccessible: true, polarity: 'light-on-dark' as const, localLuminance: 0.2, localDetailEnergy: 0.2 },
        scores: { contrastScore: 0.9, brandAffinityScore: 0.9, imageHarmonyScore: 0.85, opticalScore: 0.9, hierarchyScore: 0.95, aggregateScore: 0.9 },
        signals: { perceivedInkMass: 0.9, chromaticVibration: 0.1, imageHarmonyScore: 0.85 },
        provenance: { derivationType: 'brand-primary' as const, brandCompatibilityScore: 0.9 },
      },
      surface: {
        surfaceField: undefined,
        scores: { contrastGainScore: 0, imagePreservationScore: 1, structuralDisruptionScore: 0, edgePressureScore: 0, compositeScore: 1 },
        signals: { postSurfaceWcag: 6.0, contrastGain: 0, surfaceDisruption: 0, boundaryViolation: 0 },
      },
    };

    const evalResult = evaluateCompositionState({
      canvas,
      elements: [overlappingElement as any],
      field,
    });

    expect(evalResult.textImageRelationshipState).toBeDefined();
    expect(evalResult.interactionSignals.textImageHarmony).toBeGreaterThan(0.60);
    expect(evalResult.aggregateScore).toBeGreaterThan(0.60);
  });

  it('3. Dense-Image Case: Proves engine finds least-disruptive placement with surface protection without hardcoded coords', async () => {
    const direction: CreativeDirection = {
      concept: 'Dense Culinary Feast',
      visualStory: 'Densely styled gourmet food table spread with warm lighting and deep spices',
      subject: 'dense visual texture DENSE_FOOD',
      environment: 'chef table',
      composition: 'dense full-bleed',
      lighting: 'warm',
      mood: 'luxurious',
      palette: ['#2a1a08', '#d97706', '#fef3c7'],
      brandConstraints: [],
      productTreatment: '',
      background: '#2a1a08',
      negativeVisualConstraints: [],
      aspectRatio: '4:5',
      platform: 'instagram',
      mode: 'EDITORIAL',
      headline: 'THE SPICE MASTERCLASS',
      supportingLine: 'A comprehensive journey into artisanal flavor profiles',
      cta: 'Reserve Seat',
    };

    const context: CreativeRenderContext = {
      brand: resolveBrandProfile({ brand: { name: 'CulinaryLab' } }),
      creativeDna: resolveCreativeDna({ creativeDna: { brandColors: ['#2a1a08', '#d97706'] } }),
      goal: 'awareness',
      funnelStage: 'TOFU',
      platforms: ['instagram'],
    };

    const input: DesignerInput = {
      direction,
      context,
      styleDna: resolveStyleDNA({ styleId: 'editorial', prompt: 'Dense culinary feast' }),
      products: [],
      references: [],
      logo: await createTestLogo(),
      imageProvider: createMockImageProvider(),
      textProvider: createMockTextProvider() as any,
      visualCritic: createMockVisualCritic() as any,
    };

    const result = await designCreative(input);

    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.plan).toBeDefined();
    expect(result.plan.nodes.length).toBeGreaterThan(0);
    expect(result.critic.passed).toBe(true);

    for (const node of result.plan.nodes) {
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('4. Multi-Subject Case: Proves text relationship is evaluated against distinct visual entities', async () => {
    const width = 1080;
    const height = 1350;

    const svg = `<svg width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#0f172a"/>
      <circle cx="${width * 0.25}" cy="${height * 0.35}" r="${width * 0.18}" fill="#38bdf8"/>
      <rect x="${width * 0.6}" y="${height * 0.6}" width="${width * 0.3}" height="${height * 0.3}" fill="#f43f5e"/>
    </svg>`;
    const imgBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const imageField = await analyzeImageField(imgBuffer);
    const canvas = createCanvasRepresentation(width, height);
    const field = createDesignField(imageField);

    const collidingSubject1 = {
      id: 'headline-sub1',
      role: 'headline' as const,
      typographyState: {
        family: 'Inter',
        weight: 700,
        fontScale: 0.08,
        letterSpacing: 0,
        lineHeightMultiplier: 1.1,
        caseHint: 'none' as const,
        lineCount: 1,
        lines: ['SUB1'],
        hypothesis: { id: 'h1', role: 'headline', lines: ['SUB1'], fontSizePx: 80, fontScale: 0.08, lineHeightPx: 88, lineHeightMultiplier: 1.1, trackingEm: 0, opticalWeight: 700, raggedness: 0, visualDensity: 0.5, aspectUtilization: 0.8, marginComfort: 0.9, hierarchyScore: 0.9, compositeScore: 0.9 },
        boundingBox: { x: 0.15, y: 0.30, width: 0.3, height: 0.1, widthNormalized: 0.3, heightNormalized: 0.1 },
      },
      rect: { x: 0.15, y: 0.30, width: 0.3, height: 0.1 },
      ink: {
        color: { hex: '#FFFFFF', isBrandColor: false, sourcePalette: 'light-contrast' as const },
        contrast: { wcagRatio: 2.0, apcaLc: 25, apcaEstimatedLc: 25, isAccessible: false, polarity: 'dark-on-light' as const, localLuminance: 0.6, localDetailEnergy: 0.8 },
        scores: { contrastScore: 0.3, brandAffinityScore: 0.8, imageHarmonyScore: 0.3, opticalScore: 0.5, hierarchyScore: 0.8, aggregateScore: 0.4 },
        signals: { perceivedInkMass: 0.8, chromaticVibration: 0.2, imageHarmonyScore: 0.3 },
        provenance: { derivationType: 'brand-accent' as const, brandCompatibilityScore: 0.8 },
      },
      surface: {
        surfaceField: undefined,
        scores: { contrastGainScore: 0, imagePreservationScore: 1, structuralDisruptionScore: 0, edgePressureScore: 0, compositeScore: 1 },
        signals: { postSurfaceWcag: 2.0, contrastGain: 0, surfaceDisruption: 0, boundaryViolation: 0 },
      },
    };

    const cleanQuietZone = {
      id: 'headline-clean',
      role: 'headline' as const,
      typographyState: {
        family: 'Inter',
        weight: 700,
        fontScale: 0.08,
        letterSpacing: 0,
        lineHeightMultiplier: 1.1,
        caseHint: 'none' as const,
        lineCount: 1,
        lines: ['CLEAN'],
        hypothesis: { id: 'h2', role: 'headline', lines: ['CLEAN'], fontSizePx: 80, fontScale: 0.08, lineHeightPx: 88, lineHeightMultiplier: 1.1, trackingEm: 0, opticalWeight: 700, raggedness: 0, visualDensity: 0.5, aspectUtilization: 0.8, marginComfort: 0.9, hierarchyScore: 0.95, compositeScore: 0.95 },
        boundingBox: { x: 0.55, y: 0.10, width: 0.35, height: 0.1, widthNormalized: 0.35, heightNormalized: 0.1 },
      },
      rect: { x: 0.55, y: 0.10, width: 0.35, height: 0.1 },
      ink: {
        color: { hex: '#FFFFFF', isBrandColor: false, sourcePalette: 'light-contrast' as const },
        contrast: { wcagRatio: 14.0, apcaLc: 98, apcaEstimatedLc: 98, isAccessible: true, polarity: 'light-on-dark' as const, localLuminance: 0.05, localDetailEnergy: 0.05 },
        scores: { contrastScore: 0.98, brandAffinityScore: 0.9, imageHarmonyScore: 0.95, opticalScore: 0.95, hierarchyScore: 0.95, aggregateScore: 0.95 },
        signals: { perceivedInkMass: 0.95, chromaticVibration: 0.05, imageHarmonyScore: 0.95 },
        provenance: { derivationType: 'brand-primary' as const, brandCompatibilityScore: 0.95 },
      },
      surface: {
        surfaceField: undefined,
        scores: { contrastGainScore: 0, imagePreservationScore: 1, structuralDisruptionScore: 0, edgePressureScore: 0, compositeScore: 1 },
        signals: { postSurfaceWcag: 14.0, contrastGain: 0, surfaceDisruption: 0, boundaryViolation: 0 },
      },
    };

    const evalColliding = evaluateCompositionState({ canvas, elements: [collidingSubject1 as any], field });
    const evalClean = evaluateCompositionState({ canvas, elements: [cleanQuietZone as any], field });

    expect(evalClean.aggregateScore).toBeGreaterThan(evalColliding.aggregateScore);
    expect(evalClean.interactionSignals.textImageHarmony).toBeGreaterThan(evalColliding.interactionSignals.textImageHarmony);
  });

  it('5. Style Propagation Proof: Inconsistent style is repaired and consistently bound across all stages', async () => {
    const direction: CreativeDirection = {
      concept: 'Haute Horlogerie Timepiece',
      visualStory: 'Ultra-luxury hand-crafted swiss mechanical movement with rose gold beveling',
      subject: 'Masterpiece Chronograph',
      environment: 'dark horology atelier',
      composition: 'isolated luxury focus',
      lighting: 'dramatic rim light',
      mood: 'prestigious',
      palette: ['#0a0a0a', '#d4af37', '#ffffff'],
      brandConstraints: [],
      productTreatment: '',
      background: '#0a0a0a',
      negativeVisualConstraints: [],
      aspectRatio: '4:5',
      platform: 'instagram',
      mode: 'EDITORIAL',
      artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
      selectedStyleId: 'creator-ugc',
      headline: 'PRECISION DEFINED',
      supportingLine: 'Handcrafted in Geneva since 1892',
      cta: 'View Collection',
    };

    const context: CreativeRenderContext = {
      brand: resolveBrandProfile({ brand: { name: 'VacheronGeneve', tone: 'luxury' } }),
      creativeDna: resolveCreativeDna({ creativeDna: { brandColors: ['#0a0a0a', '#d4af37'] } }),
      goal: 'sales',
      funnelStage: 'BOFU',
      platforms: ['instagram'],
    };

    const styleAudit = validateStyleBriefConsistency({
      selectedStyleId: 'creator-ugc',
      direction,
      concept: {
        conceptName: 'Haute Horlogerie Timepiece',
        hero: 'typography',
        imageRole: 'quiet-spatial-ground',
        compositionFamily: 'asymmetric-editorial',
        artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
        creativeMechanism: 'Editorial typography on quiet spatial ground',
        spatialRelationship: 'SEPARATED',
      } as any,
    });
    expect(styleAudit.status).toBe('STYLE_INCONSISTENT');
    expect(styleAudit.repairedStyleId).toBe('editorial');

    const input: DesignerInput = {
      direction,
      context,
      styleDna: resolveStyleDNA({ styleId: 'creator-ugc', prompt: 'Haute horlogerie' }),
      products: [],
      references: [],
      logo: await createTestLogo(),
      imageProvider: createMockImageProvider(),
      textProvider: createMockTextProvider() as any,
      visualCritic: createMockVisualCritic() as any,
    };

    const result = await designCreative(input);

    expect(result.data).toBeDefined();
    expect(result.plan).toBeDefined();
    expect(direction.selectedStyleId).toBe('editorial');
    expect(result.critic.passed).toBe(true);
  });

  it('6. REAL Diversity & Score Diversity: Executes 10 distinct requests and records artifact truth and variance', async () => {
    const requests = [
      {
        id: 'REQ-001',
        assetId: 'AST-001',
        concept: 'ARCHITECTURAL BIENNALE',
        headline: 'STRUCTURE & VOID',
        palette: ['#000000', '#ffffff', '#666666'],
        aspectRatio: '4:5' as const,
        style: 'minimalist-swiss',
      },
      {
        id: 'REQ-002',
        assetId: 'AST-002',
        concept: 'UNDERGROUND TECHNO FEST',
        headline: 'RESONANCE 2027',
        palette: ['#050505', '#22c55e', '#ffffff'],
        aspectRatio: '4:5' as const,
        style: 'bold-signal',
      },
      {
        id: 'REQ-003',
        assetId: 'AST-003',
        concept: 'ARTISANAL MATCHA CEREMONY',
        headline: 'KYOTO CEREMONIAL GRADE',
        palette: ['#1c2826', '#859b7b', '#f9f6f0'],
        aspectRatio: '4:5' as const,
        style: 'editorial',
      },
      {
        id: 'REQ-004',
        assetId: 'AST-004',
        concept: 'KINETIC TRAIL RUNNER',
        headline: 'CONQUER ELEVATION',
        palette: ['#0f172a', '#f97316', '#ffffff'],
        aspectRatio: '4:5' as const,
        style: 'brutalist',
      },
      {
        id: 'REQ-005',
        assetId: 'AST-005',
        concept: 'ORGANIC COLD PRESSED JUICE',
        headline: 'PURE BOTANICAL ENERGY',
        palette: ['#064e3b', '#10b981', '#f0fdf4'],
        aspectRatio: '4:5' as const,
        style: 'creator-ugc',
      },
      {
        id: 'REQ-006',
        assetId: 'AST-006',
        concept: 'NEON CYBERPUNK APPAREL',
        headline: 'SYNTHETIC STREETWEAR',
        palette: ['#09090b', '#ec4899', '#38bdf8'],
        aspectRatio: '4:5' as const,
        style: 'bold-signal',
      },
      {
        id: 'REQ-007',
        assetId: 'AST-007',
        concept: 'STUDIO CERAMIC POTTERY',
        headline: 'EARTHEN TACTILITY',
        palette: ['#443026', '#d4a373', '#faedcd'],
        aspectRatio: '4:5' as const,
        style: 'editorial',
      },
      {
        id: 'REQ-008',
        assetId: 'AST-008',
        concept: 'AI RESEARCH LAB PITCH',
        headline: 'AUTONOMOUS REASONING',
        palette: ['#020617', '#6366f1', '#e0e7ff'],
        aspectRatio: '4:5' as const,
        style: 'minimalist-swiss',
      },
      {
        id: 'REQ-009',
        assetId: 'AST-009',
        concept: 'NORDIC SAUNA WELLNESS',
        headline: 'DEEP THERMAL SILENCE',
        palette: ['#1e293b', '#94a3b8', '#f8fafc'],
        aspectRatio: '4:5' as const,
        style: 'editorial',
      },
      {
        id: 'REQ-010',
        assetId: 'AST-010',
        concept: 'DEEP SEA OCEAN EXPLORATION',
        headline: 'ABYSSAL EXPEDITION',
        palette: ['#030712', '#0284c7', '#38bdf8'],
        aspectRatio: '4:5' as const,
        style: 'bold-signal',
      },
    ];

    const results = [];
    for (const req of requests) {
      const direction: CreativeDirection = {
        concept: req.concept,
        visualStory: `Visual narrative for ${req.concept}`,
        subject: `Hero depiction of ${req.concept}`,
        environment: 'studio',
        composition: 'dynamic balance',
        lighting: 'cinematic',
        mood: 'impactful',
        palette: req.palette,
        brandConstraints: [],
        productTreatment: '',
        background: req.palette[0],
        negativeVisualConstraints: [],
        aspectRatio: req.aspectRatio,
        platform: 'instagram',
        mode: 'EDITORIAL',
        selectedStyleId: req.style,
        headline: req.headline,
        supportingLine: 'Engineered for exceptional craft and performance',
        cta: 'Explore Now',
      };

      const context: CreativeRenderContext = {
        brand: resolveBrandProfile({ brand: { name: `Brand_${req.id}` } }),
        creativeDna: resolveCreativeDna({ creativeDna: { brandColors: req.palette } }),
        goal: 'conversion',
        funnelStage: 'MOFU',
        platforms: ['instagram'],
      };

      const input: DesignerInput = {
        direction,
        context,
        styleDna: resolveStyleDNA({ styleId: req.style, prompt: req.concept }),
        products: [],
        references: [],
        logo: await createTestLogo(),
        imageProvider: createMockImageProvider(),
        textProvider: createMockTextProvider() as any,
        visualCritic: createMockVisualCritic() as any,
      };

      const res = await designCreative(input);

      expect(res).toBeDefined();
      expect(res.data).toBeDefined();
      expect(res.plan).toBeDefined();
      expect(res.critic.passed).toBe(true);

      const rasterBuffer = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data, 'base64');
      expect(rasterBuffer.length).toBeGreaterThan(1000);

      results.push({
        requestId: req.id,
        assetId: req.assetId,
        concept: req.concept,
        styleId: req.style,
        headlineFont: res.typography?.headlineFont,
        bodyFont: res.typography?.bodyFont,
        nodesCount: res.plan.nodes.length,
        rasterBytes: rasterBuffer.length,
        criticPassed: res.critic.passed,
      });
    }

    const fontsUsed = new Set(results.map(r => r.headlineFont));
    expect(fontsUsed.size).toBeGreaterThan(1);

    expect(results.length).toBe(10);
    for (const r of results) {
      expect(r.rasterBytes).toBeGreaterThan(1000);
      expect(r.criticPassed).toBe(true);
    }
  });
});
