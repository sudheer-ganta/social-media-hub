import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import dotenv from 'dotenv';
dotenv.config();

import { FONT_CATALOG, getFontDefinition, nearestAvailableWeight, fontFilePath, type FontDefinition } from '../ai/typography/font-catalog';
import { selectTypography } from '../ai/typography/font-selector';
import { buildTypeSystem } from '../ai/typography/type-system';
import { exploreLineStructures } from '../ai/typography/dynamic-line-structure';
import { evaluateFontCandidates } from '../ai/typography/dynamic-typography';
import { measureText, measureMultiLineBlock, parseTrueTypeFont } from '../ai/typography/font-metrics.service';
import { analyzeImageField } from '../ai/render/image-field';
import { createDesignField, createCanvasRepresentation, createBrandDesignRepresentation } from '../ai/render/design-representation';
import { discoverOptimizedComposition } from '../ai/render/composition-evaluation';
import { fittedCopySvg, type DesignerPlan, type DesignNode } from '../ai/render/designer-composition';
import { resolveDesignRecipe } from '../ai/render/design-recipe';
import { resolveBrandProfile } from '../ai/brand/brand-profile';
import { resolveCreativeDna } from '../ai/brand/creative-dna';
import type { CreativeDirection, GraphicDesignConcept, ArtDirectionFamily } from '../ai/types';
import type { CampaignCopyLine } from '../ai/prompts/campaign-creative.prompt';

interface Scenario {
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

const SCENARIOS: Scenario[] = [
  {
    id: '01_diwali_feast',
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
    id: '02_luxury_horology',
    name: 'Titanium Calibre',
    domain: 'Horology / Precision',
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
    id: '03_ceramic_homeware',
    name: 'Ceramic Silence',
    domain: 'Minimalist Homeware',
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
    id: '04_culinary_sourdough',
    name: 'Artisan Crust',
    domain: 'Food / Macro Artisan',
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
    id: '05_technical_outdoor',
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
    id: '06_dark_roast_espresso',
    name: 'Nocturne Roast',
    domain: 'Dark / Low-Key Gourmet',
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
    id: '07_clean_botanical_cosmetics',
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
  {
    id: '08_streetwear_drop',
    name: 'Subversive Concrete',
    domain: 'Streetwear / Hype Drop',
    aspectRatio: '1:1',
    brandName: 'KINETIC 99',
    brandTone: 'loud, energetic, industrial, unapologetic, bold',
    brandColors: ['#000000', '#facc15', '#ffffff'],
    headline: 'HEAVYWEIGHT OVERSHIRT DROP',
    support: 'Custom milled 480gsm French terry with raw seam construction',
    offer: 'SHOP DROP',
    artDirectionFamily: 'TYPOGRAPHY_LED',
    generateImageSvg: (w, h) => `<svg width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#facc15"/>
      <rect x="${w * 0.10}" y="${h * 0.20}" width="${w * 0.80}" height="${h * 0.60}" fill="#000000"/>
    </svg>`,
  },
  {
    id: '09_high_altitude_tea',
    name: 'Single Estate Botanical',
    domain: 'Luxury Botanical / Tea',
    aspectRatio: '4:5',
    brandName: 'Kangra Reserve',
    brandTone: 'delicate, heritage, serene, contemplative, refined',
    brandColors: ['#14532d', '#15803d', '#f0fdf4'],
    headline: 'First Flush at 6000 Feet',
    support: 'Spring-plucked tender silver tips from unshaded glacial slopes',
    offer: 'Small Batch',
    artDirectionFamily: 'CULTURAL_EDITORIAL',
    generateImageSvg: (w, h) => `<svg width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="#f0fdf4"/>
      <ellipse cx="${w * 0.50}" cy="${h * 0.65}" rx="${w * 0.35}" ry="${h * 0.20}" fill="#15803d" opacity="0.6"/>
    </svg>`,
  },
  {
    id: '10_villy_virtual_tryon',
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
];

async function runForensicAudit() {
  console.log('=== FLOWPOST TYPOGRAPHY INTELLIGENCE FORENSIC AUDIT ===\n');

  // PART A: Catalog Metrics Analysis
  console.log('--- PART A: PHYSICAL OPENTYPE METRICS AUDIT ACROSS FONT CATALOG ---');
  for (const font of FONT_CATALOG) {
    const file = fontFilePath(font.family, font.weights[0] || 400);
    if (fs.existsSync(file)) {
      const buf = fs.readFileSync(file);
      const parsed = parseTrueTypeFont(buf, file);
      const measuredA = measureText({ family: font.family, weight: font.weights[0], text: 'Hxg', fontSize: 100 });
      const measuredHeadline = measureText({ family: font.family, weight: font.weights[0], text: 'The Quick Brown Fox Jumps Over The Lazy Dog', fontSize: 40 });
      console.log(`[FONT] ${font.family.padEnd(20)} | Cat: ${font.category.padEnd(11)} | Width: ${font.width.padEnd(9)} | upm: ${String(parsed.unitsPerEm).padEnd(5)} | asc: ${String(parsed.ascender).padEnd(5)} | desc: ${String(parsed.descender).padEnd(5)} | sampleW(40px): ${measuredHeadline.width}px`);
    } else {
      console.log(`[FONT MISSING] ${font.family}`);
    }
  }

  // PART B: 10 Scenario Forensic Traces
  console.log('\n--- PART B: INTENDED VS RENDERED TYPOGRAPHY ACROSS 10 PRODUCTION CREATIVES ---');

  for (const s of SCENARIOS) {
    const canvasW = s.aspectRatio === '4:5' ? 1280 : 1600;
    const canvasH = s.aspectRatio === '4:5' ? 1600 : 1600;
    const canvas = createCanvasRepresentation(canvasW, canvasH);

    const imageSvg = s.generateImageSvg(canvasW, canvasH);
    const imagePngBuf = await sharp(Buffer.from(imageSvg)).png().toBuffer();

    const brand = resolveBrandProfile({
      brand: { name: s.brandName, tone: s.brandTone, wordsToUse: [] },
    });

    const creativeDna = resolveCreativeDna({
      creativeDna: { brandColors: s.brandColors, mood: s.brandTone },
    });

    const concept: GraphicDesignConcept = {
      conceptName: s.name,
      visualIdea: s.headline,
      hero: 'image',
      imageRole: 'hero',
      firstRead: s.headline,
      elementsToOmit: [],
    };

    const direction: CreativeDirection = {
      concept: s.name,
      visualStory: s.headline,
      subject: s.domain,
      environment: 'studio',
      composition: 'asymmetric',
      lighting: 'balanced lighting',
      mood: s.brandTone,
      palette: s.brandColors,
      brandConstraints: [],
      productTreatment: '',
      background: s.brandColors[0],
      negativeVisualConstraints: [],
      aspectRatio: s.aspectRatio,
      platform: 'instagram',
      mode: 'EDITORIAL',
      artDirectionFamily: s.artDirectionFamily,
      copyTreatment: 'headline_support',
      headline: s.headline,
      supportingLine: s.support,
      cta: s.offer || 'Explore',
      interactionInstructions: '',
      marketingCreative: { offerText: s.offer || '' },
    };

    const { recipe } = resolveDesignRecipe(direction, creativeDna);

    const typoSelection = await selectTypography({ direction, creativeDna, recipe });

    const copyList: CampaignCopyLine[] = [
      { role: 'HEADLINE', text: s.headline },
      { role: 'SUPPORT', text: s.support },
      ...(s.offer ? [{ role: 'OFFER' as any, text: s.offer }] : []),
    ];
    const typeSystem = buildTypeSystem({ typography: typoSelection, concept, copy: copyList });

    const rawImageField = await analyzeImageField(imagePngBuf);
    const designField = createDesignField(rawImageField);
    const brandRepresentation = createBrandDesignRepresentation({ brandProfile: brand, creativeDna });

    const copyItems = [
      {
        id: 'primary-hook',
        text: s.headline,
        role: 'headline' as const,
        priority: 1,
        font: typoSelection.headlineFont,
        approvedFonts: typoSelection.approvedCandidates?.headline || [typoSelection.headlineFont],
        weight: typoSelection.headlineWeight,
      },
      {
        id: 'secondary-hook',
        text: s.support,
        role: 'subheadline' as const,
        priority: 2,
        font: typoSelection.bodyFont,
        approvedFonts: typoSelection.approvedCandidates?.body || [typoSelection.bodyFont],
        weight: typoSelection.bodyWeight,
      },
      ...(s.offer ? [{
        id: 'cta',
        text: s.offer,
        role: 'cta' as const,
        priority: 3,
        font: typoSelection.bodyFont,
        approvedFonts: typoSelection.approvedCandidates?.body || [typoSelection.bodyFont],
        weight: nearestAvailableWeight(typoSelection.bodyFont, 600),
      }] : []),
    ];

    const discoveryResult = discoverOptimizedComposition({
      copyItems,
      logoItem: { id: 'brand-mark', role: 'logo', aspectRatio: 3.33 },
      field: designField,
      canvas,
      brand: brandRepresentation,
      concept,
    });

    const bestState = discoveryResult.bestState;

    console.log(`\n========================================================================`);
    console.log(`SCENARIO [${s.id}] "${s.name}" (${s.domain})`);
    console.log(`Style Profile: ${s.artDirectionFamily} | Canvas: ${canvasW}x${canvasH}`);
    console.log(`Typography Selected: Headline="${typoSelection.headlineFont}" (${typoSelection.headlineWeight}), Body="${typoSelection.bodyFont}" (${typoSelection.bodyWeight})`);
    console.log(`TypeSystem Derived: Ratio=${typeSystem.ratio}, Base=${typeSystem.base.toFixed(4)}, HScale=${typeSystem.steps['primary-hook'].fontScale}, SScale=${typeSystem.steps['secondary-hook'].fontScale}`);
    console.log(`BestState Signals: HierarchyClarity=${bestState.signals.hierarchyClarity}, SpatialBalance=${bestState.signals.spatialBalance}, LineRhythm=${bestState.signals.lineRhythm}, WCAG=${bestState.signals.wcagRatio}`);

    for (const el of bestState.elements) {
      if (el.role === 'logo') {
        console.log(`  - [LOGO] id="${el.id}" | rect=[${el.rect.x.toFixed(3)}, ${el.rect.y.toFixed(3)}, ${el.rect.width.toFixed(3)}, ${el.rect.height.toFixed(3)}] | ink=${el.ink.color.hex}`);
        continue;
      }

      const copyLine = copyList.find(c => (el.id === 'primary-hook' && c.role === 'HEADLINE') || (el.id === 'secondary-hook' && c.role === 'SUPPORT') || (el.id === 'cta' && c.role === 'OFFER')) || copyList[0];
      const intendedTypoState = el.typographyState;
      const intendedLines = intendedTypoState.hypothesis.lines;

      const testNode: DesignNode = {
        id: el.id,
        kind: 'copy',
        x: el.rect.x,
        y: el.rect.y,
        width: el.rect.width,
        height: el.rect.height,
        color: el.ink.color.hex,
        surface: 'none',
        fontFamily: intendedTypoState.family,
        fontWeight: intendedTypoState.weight,
        fontScale: intendedTypoState.fontScale,
        tracking: intendedTypoState.letterSpacing,
        lineHeight: intendedTypoState.lineHeightMultiplier,
        align: el.rect.x + el.rect.width / 2 > 0.65 ? 'right' : Math.abs(el.rect.x + el.rect.width / 2 - 0.5) < 0.10 ? 'center' : 'left',
        shape: 'rectangle',
        lines: intendedLines,
      };

      const renderedSvgFragment = fittedCopySvg(testNode, copyLine, typoSelection, canvasW, canvasH, typeSystem);

      const familyMatch = renderedSvgFragment.match(/font-family="([^"]+)"/);
      const weightMatch = renderedSvgFragment.match(/font-weight="([^"]+)"/);
      const sizeMatch = renderedSvgFragment.match(/font-size="([^"]+)"/);
      const trackingMatch = renderedSvgFragment.match(/letter-spacing="([^"]+)"/);
      const textMatches = [...renderedSvgFragment.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(m => m[1]);

      const actualFamily = familyMatch ? familyMatch[1] : intendedTypoState.family;
      const actualWeight = weightMatch ? Number(weightMatch[1]) : intendedTypoState.weight;
      const actualFontSizePx = sizeMatch ? Number(sizeMatch[1]) : intendedTypoState.fontSizePx;
      const actualFontScale = Number((actualFontSizePx / canvas.shortEdge).toFixed(4));
      const actualTracking = trackingMatch ? Number(trackingMatch[1]) / actualFontSizePx : 0;
      const actualLines = textMatches;

      const testSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}">${renderedSvgFragment}</svg>`;
      const resvg = new Resvg(testSvg, {
        font: {
          loadSystemFonts: false,
          fontFiles: typoSelection.facesUsed.map(f => fontFilePath(f.family, f.weight, f.style)),
        }
      });
      const renderedBBox = resvg.getBBox();

      const shrinkRatio = Number((actualFontSizePx / intendedTypoState.fontSizePx).toFixed(3));
      const lineDiscrepancy = intendedLines.join('|') !== actualLines.join('|');
      const familyDiscrepancy = intendedTypoState.family !== actualFamily;
      const weightDiscrepancy = intendedTypoState.weight !== actualWeight;

      console.log(`  - [COPY: ${el.role.toUpperCase()}] id="${el.id}"`);
      console.log(`    INTENDED: Family="${intendedTypoState.family}", Weight=${intendedTypoState.weight}, Size=${intendedTypoState.fontSizePx}px (scale ${intendedTypoState.fontScale}), Tracking=${intendedTypoState.letterSpacing}, LineHeight=${intendedTypoState.lineHeightMultiplier}, Lines=[${intendedLines.join(' / ')}]`);
      console.log(`    RENDERED: Family="${actualFamily}", Weight=${actualWeight}, Size=${actualFontSizePx}px (scale ${actualFontScale}), Tracking=${actualTracking.toFixed(4)}, Lines=[${actualLines.join(' / ')}]`);
      console.log(`    BBOX: BestState Rect=[x:${el.rect.x.toFixed(3)}, y:${el.rect.y.toFixed(3)}, w:${el.rect.width.toFixed(3)}, h:${el.rect.height.toFixed(3)}] -> Resvg Pixels=[x:${renderedBBox?.x.toFixed(1)}, y:${renderedBBox?.y.toFixed(1)}, w:${renderedBBox?.width.toFixed(1)}, h:${renderedBBox?.height.toFixed(1)}]`);
      console.log(`    DISCREPANCIES: FamilyMismatch=${familyDiscrepancy}, WeightMismatch=${weightDiscrepancy}, ShrinkRatio=${shrinkRatio}x, LinesRebroken=${lineDiscrepancy}`);
    }
  }

  console.log('\n=== FORENSIC PASS AUDIT COMPLETE ===');
}

runForensicAudit().catch(console.error);
