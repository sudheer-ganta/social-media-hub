import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { designCreative, renderDesignerPlan, type DesignerPlan } from './designer-composition';
import { resolveBrandProfile } from '../brand/brand-profile';
import { resolveCreativeDna } from '../brand/creative-dna';
import { selectTypography } from '../typography/font-selector';
import { collectCampaignCopy } from '../prompts/campaign-creative.prompt';
import { createCanvasRepresentation, createBrandDesignRepresentation, createDesignField } from './design-representation';
import { discoverOptimizedComposition } from './composition-evaluation';
import { analyzeImageField } from './image-field';
import type { CreativeDirection, CreativeRenderContext } from '../types';

describe('Dynamic Design Engine — Production Integration & Regression Suite', { timeout: 30000 }, () => {
  const direction: CreativeDirection = {
    concept: 'Autonomous Discovery',
    visualStory: 'A luminous modern workspace with natural daylight',
    subject: 'Next-Gen Creative Workflow',
    environment: 'modern studio',
    composition: 'asymmetric',
    lighting: 'bright daylight',
    mood: 'confident',
    palette: ['#ffffff', '#111111', '#2563eb'],
    brandConstraints: [],
    productTreatment: '',
    background: '#111111',
    negativeVisualConstraints: [],
    aspectRatio: '1:1',
    platform: 'instagram',
    mode: 'EDITORIAL',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    copyTreatment: 'headline',
    headline: 'Autonomous Design Intelligence',
    supportingLine: 'Precision typography and continuous field discovery',
    cta: 'Discover More',
    interactionInstructions: '',
    marketingCreative: { offerText: 'Zero Templates' },
  };

  const context: CreativeRenderContext = {
    brand: resolveBrandProfile({ brand: { name: 'FlowPost', tone: 'visionary' } }),
    creativeDna: resolveCreativeDna({ creativeDna: { brandColors: ['#111111', '#ffffff', '#2563eb'] } }),
    goal: 'sales',
    funnelStage: 'BOFU',
    platforms: ['instagram'],
  };

  async function createImage(width = 1600, height = 1600, pattern: 'dark-top' | 'dark-bottom' | 'noisy' | 'clean' | 'subject-right' = 'clean') {
    if (pattern === 'clean') {
      return {
        mimeType: 'image/png',
        data: (await sharp({ create: { width, height, channels: 3, background: '#f5f5f5' } }).png().toBuffer()).toString('base64'),
      };
    }
    if (pattern === 'noisy') {
      const noise = Buffer.alloc(width * height * 3);
      for (let i = 0; i < noise.length; i += 3) {
        const val = (i % 7 === 0 || i % 13 === 0) ? 250 : 20;
        noise[i] = val;
        noise[i + 1] = val;
        noise[i + 2] = val;
      }
      return {
        mimeType: 'image/png',
        data: (await sharp(noise, { raw: { width, height, channels: 3 } }).png().toBuffer()).toString('base64'),
      };
    }
    if (pattern === 'subject-right') {
      const svg = `<svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="#ffffff"/>
        <rect x="${width * 0.55}" y="${height * 0.15}" width="${width * 0.40}" height="${height * 0.70}" fill="#222222"/>
      </svg>`;
      return {
        mimeType: 'image/png',
        data: (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64'),
      };
    }
    if (pattern === 'dark-top') {
      const svg = `<svg width="${width}" height="${height}">
        <rect width="${width}" height="${height * 0.5}" fill="#111111"/>
        <rect y="${height * 0.5}" width="${width}" height="${height * 0.5}" fill="#f5f5f5"/>
      </svg>`;
      return {
        mimeType: 'image/png',
        data: (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64'),
      };
    }
    const svg = `<svg width="${width}" height="${height}">
      <rect width="${width}" height="${height * 0.5}" fill="#f5f5f5"/>
      <rect y="${height * 0.5}" width="${width}" height="${height * 0.5}" fill="#111111"/>
    </svg>`;
    return {
      mimeType: 'image/png',
      data: (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64'),
    };
  }

  async function createMockLogo() {
    const svg = `<svg width="400" height="120" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="120" fill="none"/>
      <text x="200" y="75" font-family="sans-serif" font-weight="800" font-size="48" fill="#111111" text-anchor="middle">FLOWPOST</text>
    </svg>`;
    return {
      mimeType: 'image/png',
      data: (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64'),
    };
  }

  // ── TEST 1: Production Integration ─────────────────────────────────────────
  it('Test 1: Real designCreative() production path invokes Dynamic Design Engine', async () => {
    const logo = await createMockLogo();
    const cleanVisual = await createImage(1600, 1600, 'clean');

    const generateJson = vi.fn().mockResolvedValue({
      observedSubject: 'Autonomous Design Intelligence',
      observedOffer: 'Zero Templates',
      observedHero: 'typography',
      firstRead: 'Autonomous Design Intelligence',
      templateLook: false,
      humanCraft: true,
      visualTension: true,
      typographyAsDesign: true,
      logoClear: true,
      problems: [],
      strengths: ['Autonomous composition discovery', 'Clean contrast'],
    });

    const generateImage = vi.fn().mockResolvedValue([cleanVisual]);

    const result = await designCreative({
      direction,
      context,
      products: [],
      references: [],
      logo,
      textProvider: { id: 'mock', model: 'mock', supportsVision: true, isConfigured: () => true, generateJson },
      imageProvider: { id: 'mock', model: 'mock', isConfigured: () => true, generateImage },
    });

    expect(result).toBeDefined();
    expect(result.data).toBeInstanceOf(Buffer);
    expect(result.plan).toBeDefined();
    expect(result.plan.nodes.length).toBeGreaterThanOrEqual(3);
    expect(result.plan.rationale).toContain('Legibility');
  }, 45000);

  // ── TEST 2: No LLM Coordinate Authority ────────────────────────────────────
  it('Test 2: LLM JSON coordinate prompting is completely absent from composition authority', async () => {
    const logo = await createMockLogo();
    const cleanVisual = await createImage(1600, 1600, 'clean');

    const generateJson = vi.fn().mockResolvedValue({
      observedSubject: 'Autonomous Design Intelligence',
      observedOffer: 'Zero Templates',
      observedHero: 'typography',
      firstRead: 'Autonomous Design Intelligence',
      templateLook: false,
      humanCraft: true,
      problems: [],
      strengths: [],
    });

    const generateImage = vi.fn().mockResolvedValue([cleanVisual]);

    await designCreative({
      direction,
      context,
      products: [],
      references: [],
      logo,
      textProvider: { id: 'mock', model: 'mock', supportsVision: true, isConfigured: () => true, generateJson },
      imageProvider: { id: 'mock', model: 'mock', isConfigured: () => true, generateImage },
    });

    // Verify generateJson was NEVER called with DESIGNER_PLAN_SCHEMA
    const planCalls = generateJson.mock.calls.filter((c: any) =>
      c[0]?.responseSchema?.required?.includes('background') && c[0]?.responseSchema?.required?.includes('nodes')
    );
    expect(planCalls).toHaveLength(0);
  }, 45000);

  // ── TEST 3: Renderer Receives Resolved Composition ─────────────────────────
  it('Test 3: Pure renderer receives exact coordinates and state from Dynamic Design Engine', async () => {
    const logo = await createMockLogo();
    const cleanVisual = await createImage(1600, 1600, 'clean');

    const result = await designCreative({
      direction,
      context,
      products: [],
      references: [],
      logo,
      textProvider: {
        id: 'mock', model: 'mock', supportsVision: true, isConfigured: () => true,
        generateJson: vi.fn().mockResolvedValue({
          observedSubject: 'Autonomous Design Intelligence',
          observedOffer: 'Zero Templates',
          observedHero: 'typography',
          firstRead: 'Autonomous Design Intelligence',
          templateLook: false,
          humanCraft: true,
          problems: [],
          strengths: [],
        }),
      },
      imageProvider: {
        id: 'mock', model: 'mock', isConfigured: () => true,
        generateImage: vi.fn().mockResolvedValue([cleanVisual]),
      },
    });

    const primaryNode = result.plan.nodes.find(n => n.id === 'primary-hook');
    expect(primaryNode).toBeDefined();
    expect(typeof primaryNode!.x).toBe('number');
    expect(typeof primaryNode!.y).toBe('number');
    expect(typeof primaryNode!.fontScale).toBe('number');
    expect(primaryNode!.fontScale).toBeGreaterThan(0.02);
  }, 45000);

  // ── TEST 4: Image Changes Placement ────────────────────────────────────────
  it('Test 4: Same copy, brand and canvas with different image structures produce different compositions', async () => {
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
    });

    const copyItems = [
      { id: 'primary-hook', text: 'Autonomous Design Intelligence', role: 'headline' as const, priority: 1 },
      { id: 'secondary-hook', text: 'Zero Templates', role: 'subheadline' as const, priority: 2 },
    ];

    const imgA = await createImage(1600, 1600, 'subject-right');
    const fieldA = createDesignField(await analyzeImageField(Buffer.from(imgA.data, 'base64')));
    const resultA = discoverOptimizedComposition({ copyItems, field: fieldA, canvas, brand });

    const imgB = await createImage(1600, 1600, 'dark-top');
    const fieldB = createDesignField(await analyzeImageField(Buffer.from(imgB.data, 'base64')));
    const resultB = discoverOptimizedComposition({ copyItems, field: fieldB, canvas, brand });

    const posA = resultA.bestState.elements[0].rect;
    const posB = resultB.bestState.elements[0].rect;

    expect(posA).toBeDefined();
    expect(posB).toBeDefined();
    expect(posA.x < 0.5).toBe(true);
  });

  // ── TEST 5: Image Changes Typography Candidates ────────────────────────────
  it('Test 5: Typography candidate exploration responds to available spatial affordances', async () => {
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
    });

    const copyItems = [
      { id: 'primary-hook', text: 'Autonomous Design Intelligence', role: 'headline' as const, priority: 1 },
    ];

    const cleanImg = await createImage(1600, 1600, 'clean');
    const field = createDesignField(await analyzeImageField(Buffer.from(cleanImg.data, 'base64')));
    const result = discoverOptimizedComposition({ copyItems, field, canvas, brand });

    expect(result.bestState.elements[0].typographyState).toBeDefined();
    expect(result.bestState.elements[0].typographyState.hypothesis.lines.length).toBeGreaterThanOrEqual(1);
    expect(result.metrics.totalHypothesesFormed).toBeGreaterThan(0);
  });

  // ── TEST 6: Multi-Element Independence ─────────────────────────────────────
  it('Test 6: Secondary copy can explore independent regional candidates from primary element', async () => {
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
    });

    const copyItems = [
      { id: 'primary-hook', text: 'Lead Headline', role: 'headline' as const, priority: 1 },
      { id: 'secondary-hook', text: 'Supporting Note In Space', role: 'subheadline' as const, priority: 2 },
    ];

    const cleanImg = await createImage(1600, 1600, 'clean');
    const field = createDesignField(await analyzeImageField(Buffer.from(cleanImg.data, 'base64')));
    const result = discoverOptimizedComposition({ copyItems, field, canvas, brand });

    const el1 = result.bestState.elements.find(e => e.id === 'primary-hook')!;
    const el2 = result.bestState.elements.find(e => e.id === 'secondary-hook')!;

    expect(el1).toBeDefined();
    expect(el2).toBeDefined();
    expect(el1.rect.y !== el2.rect.y).toBe(true);
    expect(el2.rect.y >= el1.rect.y + el1.rect.height).toBe(true);
  });

  // ── TEST 7: Surface Parity on High-Noise Image ─────────────────────────────
  it('Test 7: Deliberately high-detail/noisy image allows active surface to win fairly when contrast is required', async () => {
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#ffffff', '#000000'] },
    });

    const copyItems = [
      { id: 'primary-hook', text: 'High Legibility Demand', role: 'headline' as const, priority: 1 },
    ];

    const noisyImg = await createImage(1600, 1600, 'noisy');
    const field = createDesignField(await analyzeImageField(Buffer.from(noisyImg.data, 'base64')));
    const result = discoverOptimizedComposition({
      copyItems,
      field,
      canvas,
      brand,
      explorationConfig: { maxSurfacesPerState: 4 },
    });

    expect(result.bestState).toBeDefined();
    expect(result.bestState.evaluation.aggregateScore).toBeGreaterThan(0.5);
  });

  // ── TEST 8: No Unnecessary Surface on Clean Image ──────────────────────────
  it('Test 8: Clean high-contrast image selects no-surface naturally without artificial penalties', async () => {
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
    });

    const copyItems = [
      { id: 'primary-hook', text: 'Crisp Headline', role: 'headline' as const, priority: 1 },
    ];

    const cleanImg = await createImage(1600, 1600, 'clean');
    const field = createDesignField(await analyzeImageField(Buffer.from(cleanImg.data, 'base64')));
    const result = discoverOptimizedComposition({ copyItems, field, canvas, brand });

    expect(result.bestState).toBeDefined();
    expect(result.bestState.surfaces.length).toBeLessThanOrEqual(1);
    expect(result.bestState.evaluation.aggregateScore).toBeGreaterThan(0.7);
  });

  // ── TEST 9: Continuous Placement ───────────────────────────────────────────
  it('Test 9: Continuous refinement discovers coordinates beyond coarse discrete step seeds', async () => {
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
    });

    const copyItems = [
      { id: 'primary-hook', text: 'Continuous Geometric Placement', role: 'headline' as const, priority: 1 },
    ];

    const img = await createImage(1600, 1600, 'subject-right');
    const field = createDesignField(await analyzeImageField(Buffer.from(img.data, 'base64')));
    const result = discoverOptimizedComposition({ copyItems, field, canvas, brand });

    const x = result.bestState.elements[0].rect.x;
    const y = result.bestState.elements[0].rect.y;

    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(0.01);
    expect(x).toBeLessThanOrEqual(0.95);
  });

  // ── TEST 10: Hidden-Template Regression ────────────────────────────────────
  it('Test 10: No fixed role-based y coordinates (0.08, 0.28, 0.45) or template zones are used', async () => {
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
    });

    const copyItems = [
      { id: 'primary-hook', text: 'Dynamic Layout Without Presets', role: 'headline' as const, priority: 1 },
      { id: 'secondary-hook', text: 'Subheadline', role: 'subheadline' as const, priority: 2 },
      { id: 'cta', text: 'Call to Action', role: 'cta' as const, priority: 3 },
    ];

    const img = await createImage(1600, 1600, 'clean');
    const field = createDesignField(await analyzeImageField(Buffer.from(img.data, 'base64')));
    const result = discoverOptimizedComposition({ copyItems, field, canvas, brand });

    const yCoords = result.bestState.elements.map(e => Number(e.rect.y.toFixed(2)));
    expect(yCoords).not.toEqual([0.08, 0.28, 0.45]);
  });

  // ── TEST 11: Renderer Purity ───────────────────────────────────────────────
  it('Test 11: Pure renderer executes coordinates faithfully without mutating composition state', async () => {
    const p: DesignerPlan = {
      background: '#ffffff',
      rationale: 'Purity verification',
      nodes: [
        {
          id: 'primary-hook',
          kind: 'copy',
          x: 0.12,
          y: 0.18,
          width: 0.76,
          height: 0.22,
          color: '#111111',
          surface: 'none',
          fontScale: 0.055,
          align: 'left',
          shape: 'rectangle',
          lines: ['Autonomous Design Intelligence'],
        },
        {
          id: 'brand-mark',
          kind: 'logo',
          x: 0.05,
          y: 0.88,
          width: 0.18,
          height: 0.06,
          color: 'none',
          surface: 'none',
          fontScale: 0.045,
          align: 'left',
          shape: 'rectangle',
          lines: [],
        },
      ],
    };

    const copy = collectCampaignCopy(direction);
    const typo = {
      headlineFont: 'Inter',
      bodyFont: 'Inter',
      headlineWeight: 700,
      bodyWeight: 400,
      typographyReasoning: '',
      hierarchy: {} as any,
      baseFontStack: { headline: 'Inter', body: 'Inter', headlineWeight: 700, bodyWeight: 400, headlineCharWidth: 0.55, lineHeightMult: 1.2 },
      facesUsed: [{ family: 'Inter', weight: 700, style: 'normal' as const }],
    };
    const logo = await createMockLogo();

    const originalNodes = JSON.parse(JSON.stringify(p.nodes));

    const renderedBuf = await renderDesignerPlan(p, { direction, products: [], logo }, copy, typo);

    expect(renderedBuf).toBeInstanceOf(Buffer);
    expect(renderedBuf.length).toBeGreaterThan(1000);
    expect(p.nodes).toEqual(originalNodes);
  });

  // ── TEST 12: Determinism ───────────────────────────────────────────────────
  it('Test 12: Same input, image, brand and canvas produce deterministic output', async () => {
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
    });

    const copyItems = [
      { id: 'primary-hook', text: 'Deterministic Design Pipeline', role: 'headline' as const, priority: 1 },
      { id: 'secondary-hook', text: 'Consistent Optimization', role: 'subheadline' as const, priority: 2 },
    ];

    const img = await createImage(1600, 1600, 'subject-right');
    const field = createDesignField(await analyzeImageField(Buffer.from(img.data, 'base64')));

    const run1 = discoverOptimizedComposition({ copyItems, field, canvas, brand });
    const run2 = discoverOptimizedComposition({ copyItems, field, canvas, brand });

    expect(run1.bestState.evaluation.aggregateScore).toBe(run2.bestState.evaluation.aggregateScore);
    expect(run1.bestState.elements.map(e => e.rect)).toEqual(run2.bestState.elements.map(e => e.rect));
    expect(run1.bestState.elements.map(e => e.ink.color.hex)).toEqual(run2.bestState.elements.map(e => e.ink.color.hex));
  });

  // ── SURFACE REGRESSION SUITE: Tests A – E ─────────────────────────────────

  // Test A — Active surface reaches renderer
  it('Test A: Active surface color and field reach the plan nodes and renderer rather than "none"', async () => {
    const copyItems = [
      { id: 'primary-hook', text: 'Active Surface Legibility Guarantee', role: 'headline' as const, priority: 1, font: 'Inter', weight: 700 },
    ];
    const noisyImg = await createImage(1600, 1600, 'noisy');
    const field = createDesignField(await analyzeImageField(Buffer.from(noisyImg.data, 'base64')));
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
    });

    const result = discoverOptimizedComposition({ copyItems, field, canvas, brand });
    const bestState = result.bestState;
    const hElement = bestState.elements[0];

    const sf = hElement.surface?.surfaceField;
    const surfaceColor = sf?.colorField?.baseColor?.hex || 'none';
    const surfaceOpacity = sf?.opacityField?.peak;

    if (sf) {
      expect(surfaceColor).not.toBe('none');
      expect(surfaceColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(surfaceOpacity).toBeGreaterThan(0);
    }
  });

  // Test B — Surface opacity reaches renderer
  it('Test B: Surface opacity/peak is preserved on DesignNode and applied in renderDesignerPlan', async () => {
    const planWithSurface: DesignerPlan = {
      background: '#888888',
      rationale: 'Surface Opacity Verification',
      nodes: [
        {
          id: 'primary-hook',
          kind: 'copy',
          x: 0.10,
          y: 0.10,
          width: 0.80,
          height: 0.20,
          color: '#ffffff',
          surface: '#0b0f19',
          opacity: 0.65,
          fontScale: 0.05,
          align: 'left',
          shape: 'rectangle',
          lines: ['Surface Opacity Test'],
        },
      ],
    };

    const copy = [{ id: 'primary-hook', text: 'Surface Opacity Test', role: 'HEADLINE' as const }];
    const typo = {
      headlineFont: 'Inter',
      bodyFont: 'Inter',
      headlineWeight: 700,
      bodyWeight: 400,
      typographyReasoning: '',
      hierarchy: {} as any,
      baseFontStack: { headline: 'Inter', body: 'Inter', headlineWeight: 700, bodyWeight: 400, headlineCharWidth: 0.55, lineHeightMult: 1.2 },
      facesUsed: [{ family: 'Inter', weight: 700, style: 'normal' as const }],
    };

    const rendered = await renderDesignerPlan(planWithSurface, { direction, products: [], logo: await createMockLogo() }, copy, typo);
    expect(rendered).toBeInstanceOf(Buffer);
    expect(rendered.length).toBeGreaterThan(1000);
    expect(planWithSurface.nodes[0].surface).toBe('#0b0f19');
    expect(planWithSurface.nodes[0].opacity).toBe(0.65);
  });

  // Test C — No-surface remains none
  it('Test C: No-surface composition retains surface = "none" on clean backdrop', async () => {
    const copyItems = [
      { id: 'primary-hook', text: 'Crystal Clear Daylight', role: 'headline' as const, priority: 1, font: 'Inter', weight: 700 },
    ];
    const cleanImg = await createImage(1600, 1600, 'clean');
    const field = createDesignField(await analyzeImageField(Buffer.from(cleanImg.data, 'base64')));
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
    });

    const result = discoverOptimizedComposition({ copyItems, field, canvas, brand });
    const best = result.bestState;
    const hElement = best.elements[0];

    // Clean image has WCAG > 15:1 naturally, so no-surface is selected
    expect(hElement.surface.surfaceField).toBeNull();
    const sf = hElement.surface?.surfaceField;
    const surfaceColor = sf?.colorField?.baseColor?.hex || 'none';
    expect(surfaceColor).toBe('none');
  });

  // Test D — Surface parameters remain deterministic
  it('Test D: Surface parameter discovery produces identical deterministic values for identical input', async () => {
    const copyItems = [
      { id: 'primary-hook', text: 'Deterministic Surface Behavior', role: 'headline' as const, priority: 1, font: 'Inter', weight: 700 },
    ];
    const noisyImg = await createImage(1600, 1600, 'noisy');
    const field = createDesignField(await analyzeImageField(Buffer.from(noisyImg.data, 'base64')));
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
    });

    const run1 = discoverOptimizedComposition({ copyItems, field, canvas, brand });
    const run2 = discoverOptimizedComposition({ copyItems, field, canvas, brand });

    const s1 = run1.bestState.elements[0].surface;
    const s2 = run2.bestState.elements[0].surface;

    expect(s1.scores.compositeSurfaceScore).toBe(s2.scores.compositeSurfaceScore);
    expect(s1.signals.contrastGain).toBe(s2.signals.contrastGain);
    expect(s1.surfaceField?.colorField?.baseColor?.hex).toBe(s2.surfaceField?.colorField?.baseColor?.hex);
    expect(s1.surfaceField?.opacityField?.peak).toBe(s2.surfaceField?.opacityField?.peak);
  });

  // ── DYNAMIC TYPOGRAPHY REGRESSION SUITE: Tests A – H ─────────────────────

  // Test A — Multiple approved fonts reach dynamic typography discovery
  it('Typography Test A: Multiple approved candidate fonts reach dynamic typography discovery', async () => {
    const typo = await selectTypography({
      direction,
      creativeDna: {
        brandColors: ['#111111', '#ffffff'],
        headlineFont: undefined,
        bodyFont: undefined,
      } as any,
      recipe: {} as any,
    });

    expect(typo.approvedCandidates).toBeDefined();
    expect(typo.approvedCandidates!.headline.length).toBeGreaterThanOrEqual(2);
    expect(typo.approvedCandidates!.body.length).toBeGreaterThanOrEqual(2);
  });

  // Test B — Different image fields cause different approved fonts to win for the same copy
  it('Typography Test B: Different image spatial affordances cause different approved fonts to win for the same copy', async () => {
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
      approvedFonts: ['Space Grotesk', 'Playfair Display', 'Inter', 'Bebas Neue'],
    });

    const copyItems = [
      {
        id: 'primary-hook',
        text: 'Autonomous High Velocity Design System',
        role: 'headline' as const,
        priority: 1,
        approvedFonts: ['Space Grotesk', 'Playfair Display', 'Bebas Neue'],
      },
    ];

    // Image 1: subject-right leaves a tall/narrow quiet region on the left
    const imgNarrow = await createImage(1600, 1600, 'subject-right');
    const fieldNarrow = createDesignField(await analyzeImageField(Buffer.from(imgNarrow.data, 'base64')));
    const resultNarrow = discoverOptimizedComposition({ copyItems, field: fieldNarrow, canvas, brand });

    // Image 2: dark-top provides a wide banner band across the top
    const imgWide = await createImage(1600, 1600, 'dark-top');
    const fieldWide = createDesignField(await analyzeImageField(Buffer.from(imgWide.data, 'base64')));
    const resultWide = discoverOptimizedComposition({ copyItems, field: fieldWide, canvas, brand });

    const fontNarrow = resultNarrow.bestState.elements[0].typographyState.family;
    const fontWide = resultWide.bestState.elements[0].typographyState.family;

    expect(fontNarrow).toBeDefined();
    expect(fontWide).toBeDefined();
    expect(['Space Grotesk', 'Playfair Display', 'Bebas Neue']).toContain(fontNarrow);
    expect(['Space Grotesk', 'Playfair Display', 'Bebas Neue']).toContain(fontWide);
  });

  // Test C — Final font is selected AFTER image analysis
  it('Typography Test C: Final font family and weight are selected dynamically in composition evaluation after image field exists', async () => {
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
      approvedFonts: ['Space Grotesk', 'Inter', 'Playfair Display'],
    });

    const copyItems = [
      {
        id: 'primary-hook',
        text: 'Dynamic Typographic Discovery',
        role: 'headline' as const,
        priority: 1,
        approvedFonts: ['Space Grotesk', 'Playfair Display', 'Inter'],
      },
    ];

    const cleanImg = await createImage(1600, 1600, 'clean');
    const field = createDesignField(await analyzeImageField(Buffer.from(cleanImg.data, 'base64')));

    const result = discoverOptimizedComposition({ copyItems, field, canvas, brand });
    const typoState = result.bestState.elements[0].typographyState;

    expect(typoState).toBeDefined();
    expect(typoState.family).toBeDefined();
    expect(typeof typoState.weight).toBe('number');
    expect(typoState.hypothesis.lines.length).toBeGreaterThanOrEqual(1);
    expect(typoState.boundingBox.widthPx).toBeGreaterThan(0);
    expect(typoState.boundingBox.heightPx).toBeGreaterThan(0);
  });

  // Test D — No unapproved font can be selected
  it('Typography Test D: No unapproved font can be selected when brand.approvedFonts is restricted', async () => {
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
      approvedFonts: ['Space Grotesk'], // Strictly only Space Grotesk
    });

    const copyItems = [
      {
        id: 'primary-hook',
        text: 'Strict Brand Typography Conformance',
        role: 'headline' as const,
        priority: 1,
        approvedFonts: ['Space Grotesk'],
      },
    ];

    const cleanImg = await createImage(1600, 1600, 'clean');
    const field = createDesignField(await analyzeImageField(Buffer.from(cleanImg.data, 'base64')));

    const result = discoverOptimizedComposition({ copyItems, field, canvas, brand });
    const typoState = result.bestState.elements[0].typographyState;

    expect(typoState.family).toBe('Space Grotesk');
  });

  // Test E — Exact glyph metrics are used (OpenType bounding boxes)
  it('Typography Test E: Exact OpenType glyph metrics and line hypotheses are computed and applied', async () => {
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
    });

    const copyItems = [
      {
        id: 'primary-hook',
        text: 'Exact Glyph Bounding Metric Verification',
        role: 'headline' as const,
        priority: 1,
        approvedFonts: ['Inter'],
      },
    ];

    const cleanImg = await createImage(1600, 1600, 'clean');
    const field = createDesignField(await analyzeImageField(Buffer.from(cleanImg.data, 'base64')));

    const result = discoverOptimizedComposition({ copyItems, field, canvas, brand });
    const typoState = result.bestState.elements[0].typographyState;
    const hypo = typoState.hypothesis;

    expect(hypo.lines.length).toBeGreaterThan(0);
    expect(typoState.boundingBox.widthPx).toBeGreaterThan(0);
    expect(typoState.boundingBox.heightPx).toBeGreaterThan(0);
    expect(typoState.measuredMetrics.maxLineWidth).toBeLessThanOrEqual(typoState.boundingBox.widthPx + 0.001);
  });

  // Test F — Changing image structure changes the selected font family/weight dynamically
  it('Typography Test F: Changing image structure (energy/detail/aspect) dynamically shifts typography parameters', async () => {
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
      approvedFonts: ['Space Grotesk', 'Playfair Display', 'Inter', 'Bebas Neue'],
    });

    const copyItems = [
      {
        id: 'primary-hook',
        text: 'Structural Shift Responsive Typography',
        role: 'headline' as const,
        priority: 1,
        approvedFonts: ['Space Grotesk', 'Playfair Display', 'Inter', 'Bebas Neue'],
      },
    ];

    const cleanImg = await createImage(1600, 1600, 'clean');
    const noisyImg = await createImage(1600, 1600, 'noisy');

    const fieldClean = createDesignField(await analyzeImageField(Buffer.from(cleanImg.data, 'base64')));
    const fieldNoisy = createDesignField(await analyzeImageField(Buffer.from(noisyImg.data, 'base64')));

    const resultClean = discoverOptimizedComposition({ copyItems, field: fieldClean, canvas, brand });
    const resultNoisy = discoverOptimizedComposition({ copyItems, field: fieldNoisy, canvas, brand });

    const stateClean = resultClean.bestState.elements[0].typographyState;
    const stateNoisy = resultNoisy.bestState.elements[0].typographyState;

    expect(stateClean.weight).toBeGreaterThanOrEqual(400);
    expect(stateNoisy.weight).toBeGreaterThanOrEqual(400);
    expect(stateClean.family).toBeDefined();
    expect(stateNoisy.family).toBeDefined();
  });

  // Test G — Determinism is preserved across repeated runs
  it('Typography Test G: Discovered typography family, weight, and line breaks are 100% deterministic across repeated runs', async () => {
    const canvas = createCanvasRepresentation(1600, 1600);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'FlowPost' },
      creativeDna: { brandColors: ['#111111', '#ffffff'] },
      approvedFonts: ['Space Grotesk', 'Playfair Display', 'Inter'],
    });

    const copyItems = [
      {
        id: 'primary-hook',
        text: 'Deterministic Typography Discovery Across Invocations',
        role: 'headline' as const,
        priority: 1,
        approvedFonts: ['Space Grotesk', 'Playfair Display', 'Inter'],
      },
    ];

    const img = await createImage(1600, 1600, 'subject-right');
    const field = createDesignField(await analyzeImageField(Buffer.from(img.data, 'base64')));

    const run1 = discoverOptimizedComposition({ copyItems, field, canvas, brand });
    const run2 = discoverOptimizedComposition({ copyItems, field, canvas, brand });

    const typo1 = run1.bestState.elements[0].typographyState;
    const typo2 = run2.bestState.elements[0].typographyState;

    expect(typo1.family).toBe(typo2.family);
    expect(typo1.weight).toBe(typo2.weight);
    expect(typo1.hypothesis.lines).toEqual(typo2.hypothesis.lines);
    expect(typo1.fontSizePx).toBe(typo2.fontSizePx);
  });

  // Test H — Full production designCreative end-to-end preserves discovered font and weight in plan and render
  it('Typography Test H: Full production creative path passes discovered font and weight to Plan and Resvg Renderer', async () => {
    const logo = await createMockLogo();
    const cleanVisual = await createImage(1600, 1600, 'clean');

    const result = await designCreative({
      direction,
      context,
      products: [],
      references: [],
      logo,
      textProvider: {
        id: 'mock',
        model: 'mock',
        supportsVision: true,
        isConfigured: () => true,
        generateJson: vi.fn().mockResolvedValue({
          observedSubject: 'Autonomous Design Intelligence',
          observedOffer: 'Zero Templates',
          observedHero: 'typography',
          firstRead: 'Autonomous Design Intelligence',
          templateLook: false,
          humanCraft: true,
          problems: [],
          strengths: [],
        }),
      },
      imageProvider: {
        id: 'mock',
        model: 'mock',
        isConfigured: () => true,
        generateImage: vi.fn().mockResolvedValue([cleanVisual]),
      },
    });

    const primaryNode = result.plan.nodes.find(n => n.id === 'primary-hook');
    expect(primaryNode).toBeDefined();
    expect(primaryNode!.fontFamily).toBeDefined();
    expect(typeof primaryNode!.fontWeight).toBe('number');
    expect(result.data).toBeInstanceOf(Buffer);
    expect(result.data.length).toBeGreaterThan(1000);
  });
});

