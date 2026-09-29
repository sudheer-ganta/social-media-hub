import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { analyzeImageField, type FieldRect } from '../ai/render/image-field';
import { resolveBrandProfile } from '../ai/brand/brand-profile';
import { resolveCreativeDna } from '../ai/brand/creative-dna';
import { getStyleDNA, resolveStyleDNA } from '../ai/style-dna/style-dna';
import { selectTypography } from '../ai/typography/font-selector';
import { buildTypeSystem } from '../ai/typography/type-system';
import { resolveDesignRecipe } from '../ai/render/design-recipe';
import { fitCopyToField } from '../ai/render/text-placement';
import { renderTextBlock, esc } from '../ai/render/primitives';
import { Resvg } from '@resvg/resvg-js';
import type { DesignerPlan, DesignNode } from '../ai/render/designer-composition';
import type { GraphicDesignConcept } from '../ai/brand/creative-brief';

interface BaselineRecord {
  scenarioId: string;
  name: string;
  imageDimensions: { width: number; height: number };
  subjectBox: FieldRect;
  selectedFont: {
    headlineFont: string;
    bodyFont: string;
    headlineWeight: number;
    bodyWeight: number;
    modularRatio: number;
    typeSystemReasoning: string;
  };
  typographyNodes: Array<{
    id: string;
    text: string[];
    fontFamily: string;
    fontWeight: number;
    fontSize: number;
    fontScale: number;
    coordinates: { x: number; y: number; width: number; height: number };
    alignment: string;
    color: string;
    scrim?: { direction: string; color: string; opacity: number };
  }>;
  logo: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  outputPath: string;
}

// Generate realistic synthetic image backdrops for baseline capture
async function createSyntheticBackdrop(
  width: number,
  height: number,
  type: 'fashion-right-subject' | 'food-centered-dark' | 'tech-left-bright'
): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      let r = 0, g = 0, b = 0;
      const idx = (y * width + x) * 3;

      if (type === 'fashion-right-subject') {
        // Warm light backdrop with a textured high-detail subject on the right (x: 0.55-0.9, y: 0.15-0.85)
        const inSubject = nx >= 0.55 && nx <= 0.9 && ny >= 0.15 && ny <= 0.85;
        if (inSubject) {
          // Model in dark terracotta dress with high texture detail
          const grain = (Math.sin(x * 0.4) * Math.cos(y * 0.4) + 1) * 20;
          r = Math.min(255, 140 + grain);
          g = Math.min(255, 50 + grain * 0.8);
          b = Math.min(255, 40 + grain * 0.5);
        } else {
          // Cream/beige quiet studio background
          r = 245 - ny * 15;
          g = 240 - ny * 15;
          b = 230 - ny * 20;
        }
      } else if (type === 'food-centered-dark') {
        // Deep charcoal/wood background with centered rich warm dish (x: 0.3-0.7, y: 0.35-0.8)
        const inSubject = nx >= 0.3 && nx <= 0.7 && ny >= 0.35 && ny <= 0.8;
        if (inSubject) {
          // Warm golden/amber roasted food
          const grain = (Math.sin(x * 0.3) * Math.sin(y * 0.3) + 1) * 35;
          r = Math.min(255, 200 + grain);
          g = Math.min(255, 110 + grain * 0.6);
          b = Math.min(255, 25 + grain * 0.2);
        } else {
          // Dark moody slate slate background
          r = 24 + ny * 8;
          g = 25 + ny * 8;
          b = 28 + ny * 10;
        }
      } else if (type === 'tech-left-bright') {
        // Minimal crisp bright background with sleek device on left (x: 0.1-0.45, y: 0.25-0.75)
        const inSubject = nx >= 0.1 && nx <= 0.45 && ny >= 0.25 && ny <= 0.75;
        if (inSubject) {
          // Deep matte black & silver metallic device
          const metallic = ((x + y) % 12) * 5;
          r = 30 + metallic;
          g = 35 + metallic;
          b = 45 + metallic;
        } else {
          // Clean pale silver gradient
          r = 238 + nx * 10;
          g = 242 + nx * 8;
          b = 248 + nx * 5;
        }
      }

      raw[idx] = Math.floor(r);
      raw[idx + 1] = Math.floor(g);
      raw[idx + 2] = Math.floor(b);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function runBaseline() {
  const outDir = path.join(__dirname, '..', '..', '..', 'out', 'baseline');
  fs.mkdirSync(outDir, { recursive: true });

  const scenarios = [
    {
      id: 'fashion_villy',
      name: 'Villy Studio Autumn Drop (Editorial Fashion - Right Subject)',
      type: 'fashion-right-subject' as const,
      width: 1200,
      height: 1500, // 4:5
      brand: {
        name: 'Villy Studio',
        description: 'High-end contemporary fashion house.',
        tone: 'editorial, sophisticated, confident',
        wordsToUse: ['autumn', 'collection', 'tailored', 'silhouette'],
      },
      creativeDna: {
        brandColors: ['#1c1917', '#881337', '#faf6f0', '#d97706'],
        mood: 'editorial, premium, artistic',
      },
      styleId: 'editorial',
      headline: 'THE NEW AUTUMN DROP',
      supporting: 'Exclusively at Villy Studio & select boutiques',
      logoText: 'VILLY',
    },
    {
      id: 'food_slowpour',
      name: 'Slowpour Coffee Roasters (Craft Food - Centered Subject Dark)',
      type: 'food-centered-dark' as const,
      width: 1200,
      height: 1200, // 1:1
      brand: {
        name: 'Slowpour Coffee',
        description: 'Single origin artisanal cold brew.',
        tone: 'quiet, tactile, artisanal',
        wordsToUse: ['slow', 'craft', 'batch', 'single origin'],
      },
      creativeDna: {
        brandColors: ['#faf6f0', '#c2410c', '#18181b', '#d97706'],
        mood: 'warm, tactile, artisanal',
      },
      styleId: 'editorial',
      headline: 'SLOW CRAFT COFFEE',
      supporting: 'Brewed over 18 hours in small single batches',
      logoText: 'SLOWPOUR',
    },
    {
      id: 'tech_lumina',
      name: 'Lumina Audio (Modern Minimalist Tech - Left Subject Bright)',
      type: 'tech-left-bright' as const,
      width: 1080,
      height: 1920, // 9:16
      brand: {
        name: 'Lumina Audio',
        description: 'Precision acoustic engineering.',
        tone: 'futuristic, minimal, sharp',
        wordsToUse: ['precision', 'clarity', 'acoustic', 'spatial'],
      },
      creativeDna: {
        brandColors: ['#09090b', '#2563eb', '#f4f4f5', '#71717a'],
        mood: 'minimalist, technical, clean',
      },
      styleId: 'minimalist',
      headline: 'FUTURE OF AUDIO',
      supporting: 'Spatial precision engineered for pure acoustic clarity',
      logoText: 'LUMINA',
    },
  ];

  const baselineResults: BaselineRecord[] = [];

  for (const s of scenarios) {
    console.log(`\n==================================================`);
    console.log(`Recording Baseline for: ${s.name}`);
    console.log(`Canvas: ${s.width}x${s.height}`);

    const imageBuffer = await createSyntheticBackdrop(s.width, s.height, s.type);
    const field = await analyzeImageField(imageBuffer);

    console.log('Subject Box detected:', {
      x: Number(field.subjectBox.x.toFixed(3)),
      y: Number(field.subjectBox.y.toFixed(3)),
      width: Number(field.subjectBox.width.toFixed(3)),
      height: Number(field.subjectBox.height.toFixed(3)),
    });
    console.log('Focal Centroid:', {
      x: Number(field.focalCentroid.x.toFixed(3)),
      y: Number(field.focalCentroid.y.toFixed(3)),
    });

    const brand = resolveBrandProfile({ brand: s.brand });
    const creativeDna = resolveCreativeDna({ creativeDna: s.creativeDna });
    const resolvedStyle = resolveStyleDNA({ styleId: s.styleId, prompt: s.headline })!;

    const direction: any = {
      headline: s.headline,
      supportingLine: s.supporting,
      callToAction: 'DISCOVER NOW',
      concept: s.name,
      subject: s.name,
      environment: 'studio',
      brandConstraints: [],
      artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
      visualPrompt: s.name,
    };

    const { recipe } = resolveDesignRecipe(direction, creativeDna, {
      styleDna: resolvedStyle.style,
      styleDnaVariant: resolvedStyle.variant,
    });

    const typography = await selectTypography({
      direction,
      creativeDna,
      recipe,
      styleDna: resolvedStyle.style,
    });

    const graphicConcept: GraphicDesignConcept = {
      conceptName: s.name,
      visualIdea: s.name,
      compositionFamily: 'type-dominant-poster',
      spatialRelationship: 'layered-crossing',
      typeBehavior: 'oversized-editorial',
      typographyScaleContrast: 'high',
      hierarchyStrategy: 'headline-led',
      typographyStrategy: 'expressive-modern',
      imageBehavior: 'asymmetric-bleed',
      paletteStrategy: 'brand-dominant',
      textureStrategy: 'fine-grain',
      surfaceDepth: 'subtle',
      tensionAnchor: 'focal-point',
      brandIntegration: 'integrated-lockup',
    };

    const typeSystem = buildTypeSystem({
      typography,
      concept: graphicConcept,
      copy: [
        { role: 'HEADLINE', text: s.headline },
        { role: 'SUPPORT', text: s.supporting },
        { role: 'CTA', text: 'DISCOVER NOW' },
      ],
    });

    console.log('Typography Selection:', {
      headlineFont: typography.headlineFont,
      bodyFont: typography.bodyFont,
      headlineWeight: typography.headlineWeight,
      bodyWeight: typography.bodyWeight,
      ratio: typeSystem.ratio,
    });

    // Baseline layout generation using current DesignerPlan + fitCopyToField repair
    const shortEdge = Math.min(s.width, s.height);
    const nodes: DesignNode[] = [
      {
        id: 'node_headline',
        kind: 'copy',
        x: 0.08,
        y: 0.12,
        width: 0.84,
        height: 0.22,
        fontScale: typeSystem.steps['primary-hook'].fontScale,
        align: 'left',
        color: s.creativeDna.brandColors[0],
        surface: 'none',
        shape: 'rectangle',
        lines: [s.headline],
      },
      {
        id: 'node_support',
        kind: 'copy',
        x: 0.08,
        y: 0.36,
        width: 0.84,
        height: 0.12,
        fontScale: typeSystem.steps['secondary-hook'].fontScale,
        align: 'left',
        color: s.creativeDna.brandColors[1] || s.creativeDna.brandColors[0],
        surface: 'none',
        shape: 'rectangle',
        lines: [s.supporting],
      },
      {
        id: 'node_cta',
        kind: 'copy',
        x: 0.08,
        y: 0.86,
        width: 0.35,
        height: 0.06,
        fontScale: typeSystem.steps['supporting-note'].fontScale,
        align: 'left',
        color: s.creativeDna.brandColors[2] || '#ffffff',
        surface: 'none',
        shape: 'rectangle',
        lines: ['DISCOVER NOW'],
      },
    ];

    const plan: DesignerPlan = {
      background: '#000000',
      rationale: 'Baseline initial plan',
      nodes,
    };

    // Run current text-placement repair
    const fitResult = fitCopyToField({
      plan,
      field,
      typeSystem,
      concept: graphicConcept,
      palette: s.creativeDna.brandColors,
      imageIsBackdrop: true,
    });

    console.log('Placement Report:', fitResult.report);

    const logoRect = {
      x: 0.08,
      y: 0.05,
      width: 0.22,
      height: 0.045,
    };

    // Render baseline SVG composite
    const copyNodes = fitResult.plan.nodes.filter((n) => n.kind === 'copy');
    let svgCopyLayers = '';
    const textNodesRecord: BaselineRecord['typographyNodes'] = [];

    for (const node of copyNodes) {
      const fontSizePx = Math.round(node.fontScale * shortEdge);
      const isPrimary = node.id === 'node_headline';
      const family = isPrimary ? typography.headlineFont : typography.bodyFont;
      const weight = isPrimary ? typography.headlineWeight : typography.bodyWeight;

      const posX = Math.round(node.x * s.width);
      const posY = Math.round(node.y * s.height + fontSizePx);

      let scrimSvg = '';
      if (node.scrim) {
        const scX = Math.round(node.x * s.width - 20);
        const scY = Math.round(node.y * s.height - 10);
        const scW = Math.round(node.width * s.width + 40);
        const scH = Math.round(node.height * s.height + 20);
        scrimSvg = `<rect x="${scX}" y="${scY}" width="${scW}" height="${scH}" fill="${node.scrim.color}" fill-opacity="${node.scrim.opacity}" rx="8"/>`;
      }

      const textSvg = renderTextBlock({
        lines: node.lines,
        x: posX,
        y: posY,
        fontSize: fontSizePx,
        lineHeight: 1.15,
        fontFamily: family,
        fontWeight: weight,
        fill: node.color,
        align: node.align,
      });

      svgCopyLayers += `${scrimSvg}\n${textSvg}\n`;

      textNodesRecord.push({
        id: node.id,
        text: node.lines,
        fontFamily: family,
        fontWeight: weight,
        fontSize: fontSizePx,
        fontScale: node.fontScale,
        coordinates: {
          x: Number(node.x.toFixed(3)),
          y: Number(node.y.toFixed(3)),
          width: Number(node.width.toFixed(3)),
          height: Number(node.height.toFixed(3)),
        },
        alignment: node.align,
        color: node.color,
        scrim: node.scrim ? {
          direction: node.scrim.direction,
          color: node.scrim.color,
          opacity: node.scrim.opacity,
        } : undefined,
      });
    }

    // Add Logo
    const logoSvg = `<text x="${Math.round(logoRect.x * s.width)}" y="${Math.round(logoRect.y * s.height + 24)}" font-family="sans-serif" font-weight="bold" font-size="24" fill="${s.creativeDna.brandColors[0]}" letter-spacing="4">${esc(s.logoText)}</text>`;

    const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s.width}" height="${s.height}" viewBox="0 0 ${s.width} ${s.height}">
      ${logoSvg}
      ${svgCopyLayers}
    </svg>`;

    const resvg = new Resvg(fullSvg, { fitTo: { mode: 'width', value: s.width } });
    const renderedTextPng = resvg.render().asPng();

    const finalComposite = await sharp(imageBuffer)
      .composite([{ input: renderedTextPng, top: 0, left: 0 }])
      .png()
      .toBuffer();

    const outPath = path.join(outDir, `baseline-${s.id}.png`);
    fs.writeFileSync(outPath, finalComposite);
    console.log(`Saved baseline render: ${outPath}`);

    baselineResults.push({
      scenarioId: s.id,
      name: s.name,
      imageDimensions: { width: s.width, height: s.height },
      subjectBox: {
        x: Number(field.subjectBox.x.toFixed(3)),
        y: Number(field.subjectBox.y.toFixed(3)),
        width: Number(field.subjectBox.width.toFixed(3)),
        height: Number(field.subjectBox.height.toFixed(3)),
      },
      selectedFont: {
        headlineFont: typography.headlineFont,
        bodyFont: typography.bodyFont,
        headlineWeight: typography.headlineWeight,
        bodyWeight: typography.bodyWeight,
        modularRatio: typeSystem.ratio,
        typeSystemReasoning: typeSystem.reasoning,
      },
      typographyNodes: textNodesRecord,
      logo: logoRect,
      outputPath: outPath,
    });
  }

  const jsonReportPath = path.join(outDir, 'baseline-report-phase0.json');
  fs.writeFileSync(jsonReportPath, JSON.stringify(baselineResults, null, 2));
  console.log(`\n==================================================`);
  console.log(`Baseline complete. Report saved to: ${jsonReportPath}`);
}

runBaseline().catch((err) => {
  console.error('Failed to run baseline:', err);
  process.exit(1);
});
