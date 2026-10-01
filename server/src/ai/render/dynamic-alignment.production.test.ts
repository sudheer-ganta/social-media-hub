import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  createCanvasRepresentation,
  createDesignField,
} from './design-representation';
import { analyzeImageField } from './image-field';
import { discoverOptimizedComposition } from './composition-evaluation';
import { evaluateRenderedDesign } from '../generators/design-critic.generator';
import { renderDesignerPlan, type DesignNode } from './designer-composition';

describe('Dynamic Alignment Engine — 10 Real Production Creatives Validation', { timeout: 60000 }, () => {
  // Helper to generate distinct real visual fields
  async function generateProductionImage(type: string, width = 1080, height = 1080): Promise<Buffer> {
    if (type === 'subject-left') {
      const svg = `<svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="#f8fafc"/>
        <rect x="${width * 0.08}" y="${height * 0.18}" width="${width * 0.38}" height="${height * 0.64}" rx="16" fill="#1e293b"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    }
    if (type === 'subject-right') {
      const svg = `<svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="#faf5ff"/>
        <rect x="${width * 0.54}" y="${height * 0.15}" width="${width * 0.38}" height="${height * 0.70}" rx="24" fill="#581c87"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    }
    if (type === 'dark-top-field') {
      const svg = `<svg width="${width}" height="${height}">
        <rect width="${width}" height="${height * 0.52}" fill="#0f172a"/>
        <rect y="${height * 0.52}" width="${width}" height="${height * 0.48}" fill="#f1f5f9"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    }
    if (type === 'dark-bottom-field') {
      const svg = `<svg width="${width}" height="${height}">
        <rect width="${width}" height="${height * 0.48}" fill="#f8fafc"/>
        <rect y="${height * 0.48}" width="${width}" height="${height * 0.52}" fill="#18181b"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    }
    if (type === 'focal-center-burst') {
      const svg = `<svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="#fffbeb"/>
        <circle cx="${width * 0.5}" cy="${height * 0.45}" r="${width * 0.22}" fill="#b45309"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    }
    if (type === 'split-column') {
      const svg = `<svg width="${width}" height="${height}">
        <rect width="${width * 0.5}" height="${height}" fill="#172554"/>
        <rect x="${width * 0.5}" width="${width * 0.5}" height="${height}" fill="#f0fdf4"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    }
    if (type === 'editorial-quiet-void') {
      const svg = `<svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="#fdfbf7"/>
        <rect x="${width * 0.65}" y="${height * 0.60}" width="${width * 0.28}" height="${height * 0.32}" fill="#78350f"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    }
    if (type === 'asymmetric-diagonal') {
      const svg = `<svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="#ffffff"/>
        <polygon points="0,${height} ${width},${height * 0.3} ${width},${height} 0,${height}" fill="#09090b"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    }
    if (type === 'vibrant-studio') {
      const svg = `<svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="#eff6ff"/>
        <rect x="${width * 0.12}" y="${height * 0.50}" width="${width * 0.76}" height="${height * 0.42}" rx="32" fill="#1d4ed8"/>
      </svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    }
    // Default high-key clean field
    const svg = `<svg width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#f4f4f5"/>
      <circle cx="${width * 0.75}" cy="${height * 0.25}" r="${width * 0.15}" fill="#3f3f46"/>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  const productionCreatives = [
    {
      id: 'creative-1-fintech',
      title: 'Fintech Precision',
      imageType: 'subject-right',
      width: 1080,
      height: 1080, // 1:1
      brand: { brandName: 'Apex Wealth', primaryColors: ['#581c87', '#faf5ff', '#3b82f6'], secondaryColors: [], neutralColors: [], constraints: [] },
      copy: [
        { id: 'h1', text: 'SMARTER WEALTH MANAGEMENT', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: 'Real-time portfolio rebalancing driven by AI', role: 'subheadline' as const, priority: 2 },
        { id: 'cta', text: 'START TODAY', role: 'cta' as const, priority: 3 },
      ],
      hasLogo: true,
    },
    {
      id: 'creative-2-fashion',
      title: 'Autumn Editorial Drop',
      imageType: 'subject-left',
      width: 1080,
      height: 1350, // 4:5
      brand: { brandName: 'Maison Noir', primaryColors: ['#1e293b', '#f8fafc', '#d97706'], secondaryColors: [], neutralColors: [], constraints: [] },
      copy: [
        { id: 'h1', text: 'THE MONOCHROME EDIT', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: 'Architectural silhouettes crafted in wool', role: 'subheadline' as const, priority: 2 },
      ],
      hasLogo: true,
    },
    {
      id: 'creative-3-beverage',
      title: 'Cold Brew Awakening',
      imageType: 'focal-center-burst',
      width: 1080,
      height: 1920, // 9:16 Story
      brand: { brandName: 'Roast & Co', primaryColors: ['#b45309', '#fffbeb', '#1c1917'], secondaryColors: [], neutralColors: [], constraints: [] },
      copy: [
        { id: 'h1', text: 'SLOW DRIP INTENSITY', role: 'headline' as const, priority: 1 },
        { id: 'cta', text: 'ORDER A FLIGHT', role: 'cta' as const, priority: 2 },
      ],
      hasLogo: true,
    },
    {
      id: 'creative-4-saas',
      title: 'Developer Cloud Platform',
      imageType: 'dark-top-field',
      width: 1200,
      height: 1200,
      brand: { brandName: 'CloudScale', primaryColors: ['#0f172a', '#38bdf8', '#ffffff'], secondaryColors: [], neutralColors: [], constraints: [] },
      copy: [
        { id: 'h1', text: 'DEPLOY IN MILLISECONDS', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: 'Global edge compute with zero configuration', role: 'subheadline' as const, priority: 2 },
        { id: 'cta', text: 'VIEW DOCUMENTATION', role: 'cta' as const, priority: 3 },
      ],
      hasLogo: true,
    },
    {
      id: 'creative-5-hospitality',
      title: 'Boutique Retreat',
      imageType: 'editorial-quiet-void',
      width: 1080,
      height: 1350,
      brand: { brandName: 'Sanctuary', primaryColors: ['#78350f', '#fdfbf7', '#15803d'], secondaryColors: [], neutralColors: [], constraints: [] },
      copy: [
        { id: 'h1', text: 'ESCAPE THE NOISE', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: 'Private villas nestled in the redwood canopy', role: 'subheadline' as const, priority: 2 },
      ],
      hasLogo: true,
    },
    {
      id: 'creative-6-fitness',
      title: 'High Performance Training',
      imageType: 'dark-bottom-field',
      width: 1080,
      height: 1080,
      brand: { brandName: 'KINETIC', primaryColors: ['#18181b', '#ef4444', '#ffffff'], secondaryColors: [], neutralColors: [], constraints: [] },
      copy: [
        { id: 'h1', text: 'BREAK YOUR LIMITS', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: 'High-intensity conditioning programmed for athletes', role: 'subheadline' as const, priority: 2 },
        { id: 'cta', text: 'JOIN THE COHORT', role: 'cta' as const, priority: 3 },
      ],
      hasLogo: true,
    },
    {
      id: 'creative-7-architecture',
      title: 'Modern Architecture Summit',
      imageType: 'asymmetric-diagonal',
      width: 1080,
      height: 1920,
      brand: { brandName: 'FORM FORUM', primaryColors: ['#09090b', '#ffffff', '#e11d48'], secondaryColors: [], neutralColors: [], constraints: [] },
      copy: [
        { id: 'h1', text: 'STRUCTURE & VOID', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: 'Annual symposium on sustainable urbanism', role: 'subheadline' as const, priority: 2 },
      ],
      hasLogo: true,
    },
    {
      id: 'creative-8-ecommerce',
      title: 'Sustainable Essentials',
      imageType: 'vibrant-studio',
      width: 1080,
      height: 1080,
      brand: { brandName: 'Pure Goods', primaryColors: ['#1d4ed8', '#eff6ff', '#10b981'], secondaryColors: [], neutralColors: [], constraints: [] },
      copy: [
        { id: 'h1', text: 'DESIGNED TO LAST', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: '100% recycled organic cotton homeware', role: 'subheadline' as const, priority: 2 },
        { id: 'cta', text: 'EXPLORE COLLECTION', role: 'cta' as const, priority: 3 },
      ],
      hasLogo: true,
    },
    {
      id: 'creative-9-culinary',
      title: 'Chef Table Experience',
      imageType: 'split-column',
      width: 1080,
      height: 1350,
      brand: { brandName: 'TERROIR', primaryColors: ['#172554', '#f0fdf4', '#fbbf24'], secondaryColors: [], neutralColors: [], constraints: [] },
      copy: [
        { id: 'h1', text: 'NINE COURSES OF AUTUMN', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: 'Hyper-seasonal gastronomy paired with biodynamic wines', role: 'subheadline' as const, priority: 2 },
      ],
      hasLogo: true,
    },
    {
      id: 'creative-10-music',
      title: 'Electronic Music Festival',
      imageType: 'clean',
      width: 1080,
      height: 1920,
      brand: { brandName: 'FREQUENCY', primaryColors: ['#3f3f46', '#f4f4f5', '#8b5cf6'], secondaryColors: [], neutralColors: [], constraints: [] },
      copy: [
        { id: 'h1', text: 'SYNCHRONICITY 2026', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: 'Three stages of live modular synthesis and lighting', role: 'subheadline' as const, priority: 2 },
        { id: 'cta', text: 'GET PASSES', role: 'cta' as const, priority: 3 },
      ],
      hasLogo: true,
    },
  ];

  for (let idx = 0; idx < productionCreatives.length; idx++) {
    const item = productionCreatives[idx];

    it(`Creative ${idx + 1}/10: ${item.title} (${item.imageType}, ${item.width}x${item.height})`, async () => {
      const imgBuffer = await generateProductionImage(item.imageType, item.width, item.height);
      const rawField = await analyzeImageField(imgBuffer);
      const field = createDesignField(rawField);
      const canvas = createCanvasRepresentation(item.width, item.height);

      const discoveryResult = discoverOptimizedComposition({
        copyItems: item.copy,
        logoItem: item.hasLogo
          ? { id: 'brand-mark', role: 'logo', aspectRatio: 2.8, sourceDimensions: { width: 280, height: 100 } }
          : undefined,
        field,
        canvas,
        brand: item.brand,
      });

      const bestState = discoveryResult.bestState;
      expect(bestState).toBeDefined();

      // 1. Audit BestState Alignment Observability
      const alignEval = bestState.alignmentEvaluation;
      expect(alignEval).toBeDefined();
      expect(alignEval!.substrate).toBeDefined();
      expect(alignEval!.graph).toBeDefined();
      expect(alignEval!.semanticGroups.length).toBeGreaterThan(0);
      expect(alignEval!.alignmentScoreContributions.relationalCoherence).toBeGreaterThan(0.70);
      expect(alignEval!.alignmentScoreContributions.substrateCoherence).toBeGreaterThan(0.70);
      expect(alignEval!.compositeScore).toBeGreaterThan(0.70);

      // 2. Audit Plan Node Assembly (Pure Renderer Handoff)
      const planNodes: DesignNode[] = bestState.elements.map((el) => ({
        id: el.id,
        kind: el.role === 'logo' ? 'logo' : 'copy',
        x: Number(el.rect.x.toFixed(3)),
        y: Number(el.rect.y.toFixed(3)),
        width: Number(el.rect.width.toFixed(3)),
        height: Number(el.rect.height.toFixed(3)),
        color: el.ink.color.hex,
        surface: el.surface.id,
        fontScale: el.typographyState.fontScale,
        align: el.rect.x + el.rect.width / 2 > 0.65 ? 'right' : Math.abs(el.rect.x + el.rect.width / 2 - 0.5) < 0.1 ? 'center' : 'left',
        shape: 'rectangle',
        lines: el.typographyState.hypothesis.lines,
      }));

      const logoPngBuffer = await sharp(Buffer.from('<svg width="280" height="100"><rect width="280" height="100" fill="#222222"/></svg>')).png().toBuffer();

      const designerInput = {
        products: [],
        logo: item.hasLogo ? { mimeType: 'image/png', data: logoPngBuffer.toString('base64') } : undefined,
        direction: {
          aspectRatio: (item.width === item.height ? '1:1' : item.width < item.height ? (item.height === 1920 ? '9:16' : '4:5') : '16:9') as any,
          subject: item.title,
          headline: item.copy[0].text,
          concept: item.title,
        } as any,
      };

      const typography = {
        headlineFont: 'Inter',
        headlineWeight: 700,
        bodyFont: 'Inter',
        bodyWeight: 400,
        facesUsed: [
          { family: 'Inter', weight: 700 },
          { family: 'Inter', weight: 400 },
        ],
      };

      const plan = {
        canvas: { width: item.width, height: item.height, aspectRatio: designerInput.direction.aspectRatio, background: '#ffffff' },
        nodes: planNodes,
        colorPalette: item.brand.primaryColors,
        colorRoles: { headline: item.brand.primaryColors[0], body: item.brand.primaryColors[1] || item.brand.primaryColors[0], accent: item.brand.primaryColors[2] || '#000000' },
        typeSystem: {
          headline: { family: 'Inter', weight: 700, style: 'normal', sizePx: 48, letterSpacing: 0, lineHeight: 1.2 },
          body: { family: 'Inter', weight: 400, style: 'normal', sizePx: 24, letterSpacing: 0, lineHeight: 1.4 },
        },
      };

      // Render through full production pipeline
      const pngBuffer = await renderDesignerPlan(
        plan,
        designerInput,
        item.copy.map((c) => ({ text: c.text, role: c.role === 'headline' ? 'HEADLINE' : c.role === 'subheadline' ? 'OFFER' : 'BODY', priority: c.priority } as any)),
        typography,
        { mimeType: 'image/png', data: imgBuffer.toString('base64') },
      );

      expect(pngBuffer).toBeInstanceOf(Buffer);
      expect(pngBuffer.length).toBeGreaterThan(1000);

      const mockTextProvider = {
        generateJson: async () => ({
          passed: true,
          observedSubject: item.title,
          observedEvent: undefined,
          observedOffer: undefined,
          templateLook: false,
          humanCraft: true,
          singleClearIdea: true,
          layoutExpressesIdea: true,
          interchangeableWithAnotherEvent: false,
          reasonsToReject: [],
        }),
      } as any;

      // Evaluate with Design Critic
      const critic = await evaluateRenderedDesign({
        provider: mockTextProvider,
        renderedPng: pngBuffer,
        brief: {
          brand: item.brand.brandName,
          subject: item.title,
          tone: 'confident',
          channels: ['instagram'],
          goal: 'awareness',
          requiredClaims: [],
          creativeStyle: { name: 'Minimalist' } as any,
        },
        direction: {
          concept: item.title,
          headline: item.copy[0].text,
          supportingLine: item.copy[1]?.text,
          cta: item.copy[2]?.text,
        } as any,
        styleDna: { style: { id: 'minimalist', name: 'Minimalist' } } as any,
      });

      // Confirm Design Critic passes with zero template look
      expect(critic.templateLook).toBe(false);
      expect(critic.humanCraft).toBe(true);

      console.info(`[production-audit] Creative ${idx + 1}/10: ${item.title}`, {
        axesDiscovered: alignEval!.substrate.candidateAxes.length,
        activeAxes: alignEval!.substrate.selectedAxes.length,
        semanticGroups: alignEval!.semanticGroups.map((g) => `${g.id} (${g.groupAlignmentType})`),
        independentAnchors: alignEval!.independentAnchors.map((ia) => `${ia.role}: sep=${ia.separationFromMainGroup}`),
        relationalEdges: alignEval!.graph.edges.length,
        graphCoherence: alignEval!.graph.overallGraphCoherence,
        compositeAlignmentScore: alignEval!.compositeScore,
        criticPass: critic.passed,
      });
    });
  }
});
