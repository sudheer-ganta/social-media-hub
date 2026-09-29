import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import dotenv from 'dotenv';
dotenv.config();

import { FONT_CATALOG, getFontDefinition, nearestAvailableWeight } from '../ai/typography/font-catalog';
import { selectTypography } from '../ai/typography/font-selector';
import { evaluateFontFit, evaluateFontCandidates } from '../ai/typography/dynamic-typography';
import { createDynamicCopyModel } from '../ai/render/copy-model';
import { analyzeImageField } from '../ai/render/image-field';
import { createDesignField, createCanvasRepresentation, createBrandDesignRepresentation } from '../ai/render/design-representation';
import { discoverOptimizedComposition } from '../ai/render/composition-evaluation';
import { resolveDesignRecipe } from '../ai/render/design-recipe';
import { resolveBrandProfile } from '../ai/brand/brand-profile';
import { resolveCreativeDna } from '../ai/brand/creative-dna';
import type { CreativeDirection, GraphicDesignConcept, ArtDirectionFamily } from '../ai/types';

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

async function main() {
  console.log('========================================================================');
  console.log('DEEP EVIDENCE AUDIT — STEP 2 CANDIDATE TRACE & IMAGE SIGNAL VALIDITY');
  console.log('========================================================================\n');

  for (const c of CASES) {
    const canvasW = c.aspectRatio === '4:5' ? 1280 : 1600;
    const canvasH = c.aspectRatio === '4:5' ? 1600 : 1600;
    const canvas = createCanvasRepresentation(canvasW, canvasH);

    const imageSvg = c.generateImageSvg(canvasW, canvasH);
    const imagePngBuf = await sharp(Buffer.from(imageSvg)).png().toBuffer();

    const brand = resolveBrandProfile({
      brand: { name: c.brandName, tone: c.brandTone, wordsToUse: [] },
    });
    const creativeDna = resolveCreativeDna({
      creativeDna: { brandColors: c.brandColors, mood: c.brandTone },
    });
    const { recipe } = resolveDesignRecipe(
      { artDirectionFamily: c.artDirectionFamily } as any,
      creativeDna
    );

    const typoPre = await selectTypography({
      direction: {
        concept: c.name,
        visualStory: c.headline,
        subject: c.domain,
        environment: 'studio',
        composition: 'asymmetric',
        lighting: 'balanced',
        mood: c.brandTone,
        palette: c.brandColors,
        brandConstraints: [],
        productTreatment: '',
        background: c.brandColors[0],
        negativeVisualConstraints: [],
        aspectRatio: c.aspectRatio,
        platform: 'instagram',
        mode: 'EDITORIAL',
        artDirectionFamily: c.artDirectionFamily,
        copyTreatment: 'headline_support',
        headline: c.headline,
        supportingLine: c.support,
        cta: c.offer || 'Explore',
        interactionInstructions: '',
        marketingCreative: { offerText: c.offer || '' },
      },
      creativeDna,
      recipe,
    });

    const rawImageField = await analyzeImageField(imagePngBuf);
    const designField = createDesignField(rawImageField);
    const brandRep = createBrandDesignRepresentation({
      brandProfile: brand,
      creativeDna,
      approvedFonts: typoPre.approvedCandidates,
    });

    const copyItems = [
      {
        id: 'primary-hook',
        text: c.headline,
        role: 'headline' as const,
        priority: 1,
        font: typoPre.headlineFont,
        approvedFonts: typoPre.approvedCandidates?.headline || [typoPre.headlineFont],
        weight: typoPre.headlineWeight,
      },
      {
        id: 'secondary-hook',
        text: c.support,
        role: 'subheadline' as const,
        priority: 2,
        font: typoPre.bodyFont,
        approvedFonts: typoPre.approvedCandidates?.body || [typoPre.bodyFont],
        weight: typoPre.bodyWeight,
      },
      ...(c.offer ? [{
        id: 'cta',
        text: c.offer,
        role: 'cta' as const,
        priority: 3,
        font: typoPre.bodyFont,
        approvedFonts: typoPre.approvedCandidates?.body || [typoPre.bodyFont],
        weight: nearestAvailableWeight(typoPre.bodyFont, 600),
      }] : []),
    ];

    const discovery = discoverOptimizedComposition({
      copyItems,
      logoItem: { id: 'brand-mark', role: 'logo', aspectRatio: 3.33 },
      field: designField,
      canvas,
      brand: brandRep,
    });

    const bestState = discovery.bestState;
    const headlineEl = bestState.elements.find((e) => e.id === 'primary-hook')!;
    const regEval = designField.evaluateRegion(headlineEl.rect);

    console.log(`========================================================================`);
    console.log(`CASE: [${c.id}] "${c.name}"`);
    console.log(`Sampled Headline Rect: [x: ${headlineEl.rect.x.toFixed(3)}, y: ${headlineEl.rect.y.toFixed(3)}, w: ${headlineEl.rect.width.toFixed(3)}, h: ${headlineEl.rect.height.toFixed(3)}]`);
    console.log(`Actual Image Signals: meanL=${regEval.meanLuminance.toFixed(4)}, stdDev=${regEval.luminanceStdDev.toFixed(4)}, detailEnergy=${regEval.detailEnergy.toFixed(4)}, quietness=${regEval.quietness.toFixed(4)}, occupancy=${regEval.occupancy.toFixed(4)}`);
    console.log(`Pre-Image Nominal Winner: "${typoPre.headlineFont}" (${typoPre.headlineWeight})`);
    console.log(`Post-Image Discovered Winner: "${headlineEl.typographyState.family}" (${headlineEl.typographyState.weight})`);

    const copyObj = createDynamicCopyModel(c.headline, c.headline, 'primary-hook', 1);
    console.log(`\nCandidate Scoring Breakdown across Approved Pool:`);
    for (const fam of typoPre.approvedCandidates?.headline || []) {
      const fDef = getFontDefinition(fam);
      if (!fDef) continue;
      const evalFit = evaluateFontFit({
        font: fDef,
        role: 'primary-hook',
        copy: copyObj,
        spatialBox: headlineEl.rect,
        canvas,
        field: designField,
        brand: brandRep,
      });
      const b = evalFit.scoreBreakdown;
      console.log(`  - ${fam.padEnd(20)} | Weight: ${evalFit.recommendedWeight} | FitScore: ${evalFit.fitScore.toFixed(2).padStart(6)} | [brand=${b.brandApproved}, tone=${b.personalityMatch}, role=${b.roleFit}, spatial=${b.spatialFit}, texture=${b.textureAdaptation}, word=${b.wordFit}]`);
    }
  }

  // Determinism Verification
  console.log(`\n========================================================================`);
  console.log(`DETERMINISM AUDIT (5 RUNS ON IDENTICAL INPUTS)`);
  console.log(`========================================================================`);
  const testCase = CASES[0];
  const runs: Array<{ font: string; weight: number; score: number }> = [];
  for (let i = 0; i < 5; i++) {
    const canvas = createCanvasRepresentation(1600, 1600);
    const imageSvg = testCase.generateImageSvg(1600, 1600);
    const imagePngBuf = await sharp(Buffer.from(imageSvg)).png().toBuffer();
    const rawImageField = await analyzeImageField(imagePngBuf);
    const designField = createDesignField(rawImageField);
    const brand = resolveBrandProfile({ brand: { name: testCase.brandName, tone: testCase.brandTone, wordsToUse: [] } });
    const creativeDna = resolveCreativeDna({ creativeDna: { brandColors: testCase.brandColors, mood: testCase.brandTone } });
    const { recipe } = resolveDesignRecipe({ artDirectionFamily: testCase.artDirectionFamily } as any, creativeDna);
    const typoPre = await selectTypography({
      direction: {
        concept: testCase.name,
        visualStory: testCase.headline,
        subject: testCase.domain,
        environment: 'studio',
        composition: 'asymmetric',
        lighting: 'balanced',
        mood: testCase.brandTone,
        palette: testCase.brandColors,
        brandConstraints: [],
        productTreatment: '',
        background: testCase.brandColors[0],
        negativeVisualConstraints: [],
        aspectRatio: testCase.aspectRatio,
        platform: 'instagram',
        mode: 'EDITORIAL',
        artDirectionFamily: testCase.artDirectionFamily,
        copyTreatment: 'headline_support',
        headline: testCase.headline,
        supportingLine: testCase.support,
        cta: testCase.offer || 'Explore',
        interactionInstructions: '',
        marketingCreative: { offerText: testCase.offer || '' },
      },
      creativeDna,
      recipe,
    });
    const brandRep = createBrandDesignRepresentation({ brandProfile: brand, creativeDna, approvedFonts: typoPre.approvedCandidates });
    const copyItems = [
      { id: 'primary-hook', text: testCase.headline, role: 'headline' as const, priority: 1, font: typoPre.headlineFont, approvedFonts: typoPre.approvedCandidates?.headline || [typoPre.headlineFont], weight: typoPre.headlineWeight },
      { id: 'secondary-hook', text: testCase.support, role: 'subheadline' as const, priority: 2, font: typoPre.bodyFont, approvedFonts: typoPre.approvedCandidates?.body || [typoPre.bodyFont], weight: typoPre.bodyWeight },
    ];
    const discovery = discoverOptimizedComposition({ copyItems, field: designField, canvas, brand: brandRep });
    const headlineEl = discovery.bestState.elements.find((e) => e.id === 'primary-hook')!;
    const score = discovery.bestState.signals.hierarchyClarity;
    runs.push({ font: headlineEl.typographyState.family, weight: headlineEl.typographyState.weight, score });
    console.log(`Run ${i + 1}: Winning Font = "${headlineEl.typographyState.family}" (Weight: ${headlineEl.typographyState.weight}), Hierarchy Clarity = ${score.toFixed(4)}`);
  }
  const allIdentical = runs.every(r => r.font === runs[0].font && r.weight === runs[0].weight && r.score === runs[0].score);
  console.log(`Determinism Result: ${allIdentical ? 'PASS (100% IDENTICAL ACROSS ALL RUNS)' : 'FAIL'}`);
}

main().catch(console.error);
