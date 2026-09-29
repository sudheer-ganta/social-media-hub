import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import dotenv from 'dotenv';
dotenv.config();

import { FONT_CATALOG, getFontDefinition, nearestAvailableWeight, fontFilePath } from '../ai/typography/font-catalog';
import { getFontMetrics, measureText, measureMultiLineBlock, calculateTypographicMassProxy } from '../ai/typography/font-metrics.service';
import { createDynamicCopyModel, generateLineBreakHypotheses } from '../ai/render/copy-model';
import { analyzeImageField } from '../ai/render/image-field';
import { createDesignField, createCanvasRepresentation, createBrandDesignRepresentation } from '../ai/render/design-representation';
import { discoverOptimizedComposition, evaluateCompositionState } from '../ai/render/composition-evaluation';
import { exploreLineStructures } from '../ai/typography/dynamic-line-structure';
import { evaluateFontFit } from '../ai/typography/dynamic-typography';
import { fittedCopySvg, renderDesignerPlan, type DesignerPlan, type DesignNode } from '../ai/render/designer-composition';
import type { ArtDirectionFamily } from '../ai/types';

interface CaseDef {
  id: string;
  name: string;
  domain: string;
  aspectRatio: '1:1' | '4:5';
  brandName: string;
  brandTone: string;
  brandColors: string[];
  headline: string;
  support: string;
  offer?: string;
  artDirectionFamily: ArtDirectionFamily;
  generateImageSvg: (w: number, h: number) => string;
}

const CASES: CaseDef[] = [
  {
    id: '01_steamer_momos',
    name: 'The Light Within the Steamer',
    domain: 'Culinary / Artisan Dim Sum',
    aspectRatio: '1:1',
    brandName: 'Momo Craft',
    brandTone: 'warm, artisanal, culinary, authentic, wholesome',
    brandColors: ['#451a03', '#d97706', '#fef3c7'],
    headline: 'The Light Within the Steamer',
    support: 'Handmade heritage momos folded fresh at dawn with volcanic chili dip',
    offer: 'Taste The Craft',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    generateImageSvg: (w, h) => `<svg width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#fef3c7"/>
      <ellipse cx="${w * 0.50}" cy="${h * 0.52}" rx="${w * 0.38}" ry="${h * 0.28}" fill="#78350f" opacity="0.85"/>
      <circle cx="${w * 0.35}" cy="${h * 0.50}" r="${w * 0.09}" fill="#fde68a"/>
      <circle cx="${w * 0.52}" cy="${h * 0.48}" r="${w * 0.09}" fill="#fef08a"/>
      <circle cx="${w * 0.65}" cy="${h * 0.54}" r="${w * 0.09}" fill="#fde047"/>
    </svg>`,
  },
  {
    id: '02_spice_rangoli',
    name: 'Spice Rangoli Heritage',
    domain: 'Heritage Culinary / Festive Spices',
    aspectRatio: '1:1',
    brandName: 'Rangoli Masala',
    brandTone: 'festive, vibrant, authentic, artisanal, rich',
    brandColors: ['#7c2d12', '#ea580c', '#fef08a', '#ffffff'],
    headline: 'Spice Rangoli Heritage Blends',
    support: 'Stone-ground whole spices layered in artisanal symmetry',
    offer: 'Order Harvest Box',
    artDirectionFamily: 'DESI_MAXIMALISM',
    generateImageSvg: (w, h) => `<svg width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#7c2d12"/>
      <circle cx="${w * 0.50}" cy="${h * 0.50}" r="${w * 0.32}" fill="#ea580c"/>
      <circle cx="${w * 0.50}" cy="${h * 0.50}" r="${w * 0.20}" fill="#f59e0b"/>
      <circle cx="${w * 0.50}" cy="${h * 0.50}" r="${w * 0.10}" fill="#fde047"/>
    </svg>`,
  },
  {
    id: '03_diwali_feast',
    name: 'The Longest Table',
    domain: 'Festival / Communal Dining',
    aspectRatio: '1:1',
    brandName: 'Seven Sisters',
    brandTone: 'warm, communal, festive, artisanal, authentic',
    brandColors: ['#0f172a', '#b45309', '#fcfbf9'],
    headline: 'The Longest Table',
    support: 'Himalayan homecoming feast shared across generations',
    offer: 'Reserve Dinner',
    artDirectionFamily: 'CULTURAL_EDITORIAL',
    generateImageSvg: (w, h) => `<svg width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#fcfbf9"/>
      <rect x="${w * 0.08}" y="${h * 0.38}" width="${w * 0.84}" height="${h * 0.40}" rx="24" fill="#78350f" opacity="0.85"/>
      <circle cx="${w * 0.30}" cy="${h * 0.58}" r="${w * 0.16}" fill="#d97706"/>
      <circle cx="${w * 0.70}" cy="${h * 0.58}" r="${w * 0.16}" fill="#b45309"/>
      <circle cx="${w * 0.50}" cy="${h * 0.55}" r="${w * 0.12}" fill="#fef3c7"/>
    </svg>`,
  },
  {
    id: '04_nocturne_roast',
    name: 'Nocturne Roast',
    domain: 'Dark / Low-Key Gourmet Coffee',
    aspectRatio: '1:1',
    brandName: 'Nocturne Roast',
    brandTone: 'moody, intense, sophisticated, luxurious, dark',
    brandColors: ['#0a0a0a', '#d97706', '#e5e5e5'],
    headline: 'Midnight Dark Roast Single Origin',
    support: 'Intense smoky dark chocolate and molasses notes from volcanic soil',
    offer: 'Taste The Night',
    artDirectionFamily: 'CINEMATIC',
    generateImageSvg: (w, h) => `<svg width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#0a0a0a"/>
      <circle cx="${w * 0.50}" cy="${h * 0.50}" r="${w * 0.22}" fill="#1c1917"/>
      <circle cx="${w * 0.50}" cy="${h * 0.50}" r="${w * 0.14}" fill="#d97706" opacity="0.8"/>
    </svg>`,
  },
  {
    id: '05_summit_technical',
    name: 'Summit Technical',
    domain: 'Outdoor / Technical Performance',
    aspectRatio: '1:1',
    brandName: 'Summit Technical',
    brandTone: 'utilitarian, rugged, fearless, high-performance, technical',
    brandColors: ['#0f172a', '#0284c7', '#f8fafc'],
    headline: 'Ultralight Expedition Alpine Pack',
    support: 'All-weather diamond ripstop Cordura defense for extreme ascents',
    offer: 'Gear Up',
    artDirectionFamily: 'TYPOGRAPHY_LED',
    generateImageSvg: (w, h) => `<svg width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#f8fafc"/>
      <polygon points="${w * 0.15},${h * 0.85} ${w * 0.50},${h * 0.30} ${w * 0.85},${h * 0.85}" fill="#0f172a"/>
    </svg>`,
  },
  {
    id: '06_villy_virtual_tryon',
    name: 'Villy AI Festive Saree',
    domain: 'Fashion Tech / Festive Ethnic',
    aspectRatio: '1:1',
    brandName: 'Villy AI',
    brandTone: 'innovative, festive, confident, modern',
    brandColors: ['#0f172a', '#d97706', '#f59e0b', '#ffffff'],
    headline: 'Experience 2D Virtual Saree Try-On',
    support: 'Festive silk fitting from the comfort of home',
    offer: 'Try On Now',
    artDirectionFamily: 'CULTURAL_EDITORIAL',
    generateImageSvg: (w, h) => `<svg width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#0f172a"/>
      <ellipse cx="${w * 0.50}" cy="${h * 0.55}" rx="${w * 0.28}" ry="${h * 0.35}" fill="#881337"/>
    </svg>`,
  },
  {
    id: '07_titanium_calibre',
    name: 'Titanium Calibre',
    domain: 'Horology / Precision Minimalist',
    aspectRatio: '1:1',
    brandName: 'Aero Chrono',
    brandTone: 'precise, architectural, luxurious, technical, minimalist',
    brandColors: ['#09090b', '#71717a', '#ffffff'],
    headline: 'Engineered for Gravity',
    support: 'Grade 5 titanium casing with double-axis tourbillon',
    offer: 'First Edition',
    artDirectionFamily: 'MINIMAL_ART',
    generateImageSvg: (w, h) => `<svg width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#09090b"/>
      <circle cx="${w * 0.50}" cy="${h * 0.50}" r="${w * 0.25}" fill="#27272a"/>
      <circle cx="${w * 0.50}" cy="${h * 0.50}" r="${w * 0.12}" fill="#52525b"/>
    </svg>`,
  },
  {
    id: '08_ceramic_silence',
    name: 'Ceramic Silence',
    domain: 'Minimalist Homeware / Organic Silence',
    aspectRatio: '4:5',
    brandName: 'Forma Studio',
    brandTone: 'quiet, tactile, organic, restrained, artisanal',
    brandColors: ['#1c1917', '#78716c', '#fafaf9'],
    headline: 'Form Follows Silence',
    support: 'Hand-thrown stoneware fired with unrefined wood ash',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    generateImageSvg: (w, h) => `<svg width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#fafaf9"/>
      <ellipse cx="${w * 0.50}" cy="${h * 0.55}" rx="${w * 0.28}" ry="${h * 0.22}" fill="#78716c"/>
    </svg>`,
  },
  {
    id: '09_artisan_crust',
    name: 'Artisan Crust Sourdough',
    domain: 'Food / Macro Bread',
    aspectRatio: '1:1',
    brandName: 'Artisan Crust',
    brandTone: 'warm, wholesome, rustic, appetizing, crafted',
    brandColors: ['#451a03', '#fef3c7', '#78350f'],
    headline: 'Slow Fermented Artisan Sourdough',
    support: 'Crisp blistered crust baked fresh daily at sunrise',
    offer: 'Order Fresh',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    generateImageSvg: (w, h) => `<svg width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#fef3c7"/>
      <ellipse cx="${w * 0.50}" cy="${h * 0.55}" rx="${w * 0.38}" ry="${h * 0.26}" fill="#78350f"/>
    </svg>`,
  },
  {
    id: '10_lumiere_botanical',
    name: 'Lumiere Botanical',
    domain: 'High-Key Skincare / Clean Beauty',
    aspectRatio: '1:1',
    brandName: 'Lumiere Botanical',
    brandTone: 'pure, radiant, scientific, elegant, luminous',
    brandColors: ['#ffffff', '#f59e0b', '#0f766e'],
    headline: 'Pure Vitamin C Radiant Glow',
    support: 'Clinical-grade botanical bio-actives for luminous clarity',
    offer: 'Reveal Radiance',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    generateImageSvg: (w, h) => `<svg width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#ffffff"/>
      <rect x="${w * 0.40}" y="${h * 0.25}" width="${w * 0.20}" height="${h * 0.50}" rx="12" fill="#0f766e" opacity="0.25"/>
    </svg>`,
  },
];

async function runForensics() {
  console.log('========================================================================');
  console.log('FLOWPOST TYPOGRAPHY STEP 3 — FORENSIC TRACE & OPTICAL MASS AUDIT');
  console.log('========================================================================\n');

  for (const c of CASES) {
    const canvasW = c.aspectRatio === '4:5' ? 1080 : 1080;
    const canvasH = c.aspectRatio === '4:5' ? 1350 : 1080;
    const svgContent = c.generateImageSvg(canvasW, canvasH);
    const pngBuf = await sharp(Buffer.from(svgContent)).png().toBuffer();

    const rawField = await analyzeImageField(pngBuf);
    const field = createDesignField(rawField);
    const canvas = createCanvasRepresentation(canvasW, canvasH);

    const brand = createBrandDesignRepresentation({
      colors: c.brandColors,
      approvedFonts: {
        headline: ['Playfair Display', 'Cinzel', 'Outfit', 'Plus Jakarta Sans', 'Inter', 'Anton', 'Syne'],
        body: ['Inter', 'Plus Jakarta Sans', 'Outfit', 'Lora'],
      },
    });

    const copyItems = [
      {
        id: 'headline',
        role: 'headline' as const,
        text: c.headline,
        priority: 1,
        approvedFonts: brand.approvedFonts.headline,
        font: 'Inter',
        weight: 700,
      },
      {
        id: 'support',
        role: 'subheadline' as const,
        text: c.support,
        priority: 2,
        approvedFonts: brand.approvedFonts.body,
        font: 'Inter',
        weight: 400,
      },
    ];

    if (c.offer) {
      copyItems.push({
        id: 'cta',
        role: 'subheadline' as const,
        text: c.offer,
        priority: 3,
        approvedFonts: brand.approvedFonts.body,
        font: 'Inter',
        weight: 600,
      });
    }

    const discovery = discoverOptimizedComposition({
      copyItems,
      logoItem: {
        id: 'brand-mark',
        role: 'logo',
        aspectRatio: 2.5,
      },
      field,
      canvas,
      brand,
    });

    const bestState = discovery.bestState;

    console.log(`\n========================================================================`);
    console.log(`CREATIVE: ${c.name.toUpperCase()} (${c.domain})`);
    console.log(`Canvas: ${canvasW}x${canvasH} (${c.aspectRatio}) | Tone: ${c.brandTone}`);
    console.log(`------------------------------------------------------------------------`);

    // Trace elements
    const elementMasses: Record<string, number> = {};

    for (const el of bestState.elements) {
      const typeState = el.typographyState;
      const isCopy = el.role !== 'logo';
      const lines = typeState.hypothesis?.lines || [el.id];
      const contrast = el.ink?.contrast?.wcagRatio || 4.5;
      const fam = typeState.family || (typeState as any).fontFamily || 'Inter';
      const fSize = typeState.fontSizePx || Math.round(canvasW * (typeState.fontScale || 0.045));
      const fScale = typeState.fontScale || (fSize / canvasW);
      const tracking = typeState.letterSpacing ?? (typeState as any).trackingEm ?? 0;
      const lHeightPx = typeState.lineHeightPx || Math.round(fSize * (typeState.lineHeightMultiplier || 1.15));
      const ragVar = typeState.scores?.ragVariance ?? 0;
      const lingScore = typeState.scores?.linguisticScore ?? 1.0;
      const wPx = typeState.boundingBox?.widthPx || Math.round(el.rect.width * canvasW);
      const wNorm = typeState.boundingBox?.widthNormalized || el.rect.width;

      const massProxy = typeState.typographicMass ?? calculateTypographicMassProxy({
        family: fam,
        weight: typeState.weight || 400,
        fontSize: fSize,
        lines,
      });

      elementMasses[el.id] = massProxy.massProxy;

      console.log(`  [NODE: ${el.id.toUpperCase()}] Role: ${el.role}`);
      console.log(`    - Family: ${fam} | Weight: ${typeState.weight || 400}`);
      console.log(`    - Font Size: ${fSize}px | FontScale: ${(fScale * 100).toFixed(2)}% of shortEdge`);
      console.log(`    - Measure/Width: ${wPx}px (${(wNorm * 100).toFixed(1)}% canvas) | Lines: ${lines.length}`);
      console.log(`    - Line Height: ${lHeightPx}px (Mul: ${(typeState.lineHeightMultiplier || 1.15).toFixed(2)})`);
      console.log(`    - Tracking / LetterSpacing: ${tracking.toFixed(4)} em`);
      console.log(`    - Rag Variance: ${(ragVar * 100).toFixed(1)}% | Linguistic Score: ${lingScore.toFixed(3)}`);
      console.log(`    - Ink Color: ${el.ink?.color?.hex || 'none'} | WCAG: ${contrast.toFixed(2)}:1 | APCA Lc: ${(el.ink?.contrast?.apcaEstimatedLc || 0).toFixed(1)}`);
      console.log(`    - Typographic Mass Proxy: ${massProxy.massProxy} (advance=${massProxy.totalAdvancePx}px, height=${massProxy.opticalHeightPx}px, weightRatio=${massProxy.weightRatio})`);
      console.log(`    - Lines rendered: [ ${lines.map((l: string) => `"${l}"`).join(' / ')} ]`);
    }

    // Pairwise Hierarchy Analysis
    const hMass = elementMasses['headline'] || 1;
    const sMass = elementMasses['support'] || 1;
    const cMass = elementMasses['cta'] || 0;
    const lMass = elementMasses['brand-mark'] || 1;

    console.log(`\n  PAIRWISE HIERARCHY RELATIONSHIPS:`);
    console.log(`    - Headline / Support Mass Ratio : ${(hMass / Math.max(0.1, sMass)).toFixed(2)}x`);
    if (cMass > 0) {
      console.log(`    - Headline / CTA Mass Ratio     : ${(hMass / Math.max(0.1, cMass)).toFixed(2)}x`);
      console.log(`    - Support / CTA Mass Ratio      : ${(sMass / Math.max(0.1, cMass)).toFixed(2)}x`);
    }
    console.log(`    - Headline / Logo Prominence    : ${(hMass / Math.max(0.1, lMass)).toFixed(2)}x`);
    console.log(`    - Holistic Hierarchy Clarity    : ${bestState.signals.hierarchyClarity.toFixed(3)}`);
    console.log(`    - Holistic Aggregate Score      : ${bestState.evaluation.aggregateScore.toFixed(3)}`);
  }
}

runForensics().catch(console.error);
