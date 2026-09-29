import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import dotenv from 'dotenv';
dotenv.config();

import { geminiMarketingProvider, geminiVisionProvider } from '../ai/providers/gemini.provider';
import { geminiImageProvider } from '../ai/providers/gemini-image.provider';
import { designCreative, composeHighFidelityVisualPrompt, renderDesignerPlan } from '../ai/render/designer-composition';
import { resolveBrandProfile } from '../ai/brand/brand-profile';
import { resolveCreativeDna } from '../ai/brand/creative-dna';
import { analyzeImageField } from '../ai/render/image-field';
import { createDesignField, createCanvasRepresentation } from '../ai/render/design-representation';
import { discoverPlacementCandidates, evaluatePlacementRegion } from '../ai/render/dynamic-placement';
import { createDynamicCopyModel } from '../ai/render/copy-model';
import { exploreLineStructures } from '../ai/typography/dynamic-line-structure';
import { evaluateRenderedDesign } from '../ai/generators/design-critic.generator';
import { buildCanonicalCreativeBrief } from '../ai/brand/creative-brief';
import type { CreativeDirection } from '../ai/types';

interface ArchetypeScenario {
  id: string;
  category: string;
  brandName: string;
  prompt: string;
  headline: string;
  supportingLine: string;
  cta: string;
  colors: string[];
}

const ARCHETYPES: ArchetypeScenario[] = [
  {
    id: '01_person_fashion',
    category: 'person/fashion',
    brandName: 'Villy AI',
    prompt: 'Festive silk saree virtual try-on model posing gracefully. Elegant Indian celebration aesthetic.',
    headline: 'Experience 2D Virtual Saree Try-On',
    supportingLine: 'Festive Elegance from Home',
    cta: 'Try On Now',
    colors: ['#881337', '#FDE047', '#1E1B4B'],
  },
  {
    id: '02_product',
    category: 'product',
    brandName: 'Aero Chrono',
    prompt: 'Minimalist titanium luxury chronograph watch with sapphire glass resting on slate stone.',
    headline: 'Titanium Precision Automatic Calibre',
    supportingLine: 'Crafted for Pure Movement',
    cta: 'Explore Calibre',
    colors: ['#09090B', '#E4E4E7', '#71717A'],
  },
  {
    id: '03_interior_lifestyle',
    category: 'interior/lifestyle',
    brandName: 'Nordic Habitat',
    prompt: 'Sunlit modern Scandinavian living room with oak wood furniture, warm wool throw, and architectural fiddle leaf fig.',
    headline: 'Warm Minimalist Scandinavian Living',
    supportingLine: 'Handcrafted Solid Oak Collection',
    cta: 'View Catalog',
    colors: ['#FDFBF7', '#3F3F46', '#D97706'],
  },
  {
    id: '04_food_beverage',
    category: 'food',
    brandName: 'Artisan Crust',
    prompt: 'Freshly baked golden sourdough loaf sliced open on rustic flour-dusted marble counter with rosemary butter.',
    headline: 'Slow Fermented Artisan Sourdough',
    supportingLine: 'Crisp Crust Baked Fresh Daily',
    cta: 'Order Fresh',
    colors: ['#451A03', '#FEF3C7', '#78350F'],
  },
  {
    id: '05_outdoor_adventure',
    category: 'outdoor',
    brandName: 'Summit Technical',
    prompt: 'Ultralight waterproof alpine mountaineering backpack on misty Himalayan granite ridge at sunrise.',
    headline: 'Ultralight Expedition Alpine Pack',
    supportingLine: 'All-Weather Cordura Defense',
    cta: 'Gear Up',
    colors: ['#0F172A', '#0284C7', '#F8FAFC'],
  },
  {
    id: '06_dark_image',
    category: 'dark image',
    brandName: 'Nocturne Roast',
    prompt: 'Deep moody midnight espresso beans falling in slow motion with rich crema in obsidian ceramic cup.',
    headline: 'Midnight Dark Roast Single Origin',
    supportingLine: 'Intense Smoky Cocoa Notes',
    cta: 'Taste The Night',
    colors: ['#0A0A0A', '#D97706', '#E5E5E5'],
  },
  {
    id: '07_bright_image',
    category: 'bright image',
    brandName: 'Lumiere Botanical',
    prompt: 'Radiant clean glass dropper bottle of vitamin C skincare serum against bright sunlit white water ripple reflections.',
    headline: 'Pure Vitamin C Radiant Glow',
    supportingLine: 'Clean Botanical Actives',
    cta: 'Reveal Radiance',
    colors: ['#FFFFFF', '#F59E0B', '#0F766E'],
  },
  {
    id: '08_full_bleed_subject',
    category: 'full-bleed subject',
    brandName: 'Vachetta Studio',
    prompt: 'Full-bleed extreme close-up of handcrafted amber Italian leather tote bag showing rich grain texture and precision brass hardware.',
    headline: 'Handcrafted Tuscan Amber Leather',
    supportingLine: 'Lifetime Stitch Guarantee',
    cta: 'Shop Leather',
    colors: ['#78350F', '#FEF3C7', '#1C1917'],
  },
  {
    id: '09_multiple_subjects',
    category: 'multiple visual subjects',
    brandName: 'Matcha Atelier',
    prompt: 'Trio of exquisite Japanese ceremonial matcha desserts: matcha roll cake, cream choux, and dusted truffle arranged diagonally.',
    headline: 'Ceremonial Uji Matcha Pastry Trio',
    supportingLine: 'Handmade Kyoto Confections',
    cta: 'Order Box',
    colors: ['#14532D', '#DCFCE7', '#FDFBF7'],
  },
  {
    id: '10_negative_space',
    category: 'genuine negative-space composition',
    brandName: 'Forma Studio',
    prompt: 'Solitary minimalist matte terracotta vase on vast empty pale concrete floor with dramatic morning cast shadow.',
    headline: 'Handmade Architectural Ceramics',
    supportingLine: 'Limited Studio Series',
    cta: 'Collect Edition',
    colors: ['#9A3412', '#F5F5F4', '#292524'],
  },
];

interface ProductionResult {
  scenarioId: string;
  category: string;
  brandName: string;
  imageGenerated: boolean;
  occupancyFieldCreated: boolean;
  totalOccupancyMass: number;
  topCandidatePlacement: { x: number; y: number; width: number; height: number; compositeScore: number; overlapRatio: number; classification: string };
  criticPassed: boolean;
  criticProblems: string[];
  criticFeedback?: string;
  rawImagePath: string;
}

async function runScenarioDirect(scenario: ArchetypeScenario, outputDir: string): Promise<ProductionResult> {
  console.log(`\n================================================================`);
  console.log(`>>> VALIDATION ${scenario.id}: ${scenario.category.toUpperCase()} (${scenario.brandName}) <<<`);
  console.log(`================================================================`);

  const brand = resolveBrandProfile({
    brand: {
      name: scenario.brandName,
      description: scenario.prompt,
      tone: 'modern, premium, clear, authoritative',
      wordsToUse: ['experience', 'crafted', 'pure', 'precision'],
      wordsToAvoid: ['unleash', 'disrupt'],
    },
  });

  const creativeDna = resolveCreativeDna({
    creativeDna: {
      brandColors: scenario.colors,
      personalityArchetype: 'Creator',
    },
  });

  // 1. Generate real production image via Gemini Imagen
  console.log(`[1/4] Generating Real Production Image with Gemini Imagen...`);
  const visualPrompt = `${scenario.prompt}. Commercial editorial photography, natural lighting, ultra-high resolution 8k, award-winning composition. Absolutely clean without any text, letters, numerals or watermarks.`;
  const imgParts = await geminiImageProvider.generateImage({
    prompt: visualPrompt,
    aspectRatio: '1:1',
  });

  const imgBuf = Buffer.from(imgParts[0].data, 'base64');
  const rawImagePath = path.join(outputDir, `${scenario.id}_raw.png`);
  fs.writeFileSync(rawImagePath, imgBuf);

  // 2. Perform Image Field & Spatial Occupancy Field Analysis
  console.log(`[2/4] Analyzing 32x32 Spatial Occupancy Field...`);
  const rawField = await analyzeImageField(imgBuf);
  const designField = createDesignField(rawField);
  const canvas = createCanvasRepresentation(1080, 1080);

  // 3. Dynamic Placement with Continuous Spatial Occupancy
  console.log(`[3/4] Discovering Continuous Placement Candidates...`);
  const copyModel = createDynamicCopyModel('h1', scenario.headline, 'primary-hook', 1);
  const lineStates = exploreLineStructures({
    copy: copyModel,
    font: 'Inter',
    weight: 700,
    spatialBox: { x: 0, y: 0, width: 0.85, height: 0.20 },
    canvas,
  });

  const candidates = discoverPlacementCandidates({
    typographyState: lineStates[0],
    field: designField,
    canvas,
    maxCandidates: 12,
  });

  const top = candidates[0];
  const headlineEval = evaluatePlacementRegion({
    rect: top.rect,
    field: designField,
    canvas,
  });

  console.log(`  -> Discovered ${candidates.length} scored placement candidates.`);
  console.log(`  -> Top Selected Placement: [x=${top.rect.x.toFixed(3)}, y=${top.rect.y.toFixed(3)}, w=${top.rect.width.toFixed(3)}, h=${top.rect.height.toFixed(3)}]`);
  console.log(`  -> Total Occupancy Mass: ${rawField.totalOccupancyMass.toFixed(3)}`);
  console.log(`  -> Selected Placement Overlap: ${(top.signals.subjectOverlap.overlapRatio * 100).toFixed(1)}% (Classification: ${top.signals.subjectOverlap.classification})`);
  console.log(`  -> Composite Placement Score: ${top.scores.compositeScore.toFixed(3)}`);

  // 4. Design Critic Evaluation of Image & Space
  console.log(`[4/4] Design Critic Review of Generated Artwork...`);
  const brief = buildCanonicalCreativeBrief({
    userPrompt: scenario.prompt,
    requiredClaims: [scenario.headline, scenario.supportingLine],
    rawParameters: {
      aspectRatio: '1:1',
      platform: 'instagram',
      goal: 'engagement',
    },
  });

  const criticReview = await evaluateRenderedDesign({
    provider: geminiVisionProvider,
    renderedPng: imgBuf,
    brief,
  });

  console.log(`  -> Critic Passed: ${criticReview.passed}`);
  console.log(`  -> Critic Feedback: ${criticReview.critiqueFeedback || 'Approved'}`);

  return {
    scenarioId: scenario.id,
    category: scenario.category,
    brandName: scenario.brandName,
    imageGenerated: true,
    occupancyFieldCreated: rawField.totalOccupancyMass > 0,
    totalOccupancyMass: rawField.totalOccupancyMass,
    topCandidatePlacement: {
      x: top.rect.x,
      y: top.rect.y,
      width: top.rect.width,
      height: top.rect.height,
      compositeScore: top.scores.compositeScore,
      overlapRatio: top.signals.subjectOverlap.overlapRatio,
      classification: top.signals.subjectOverlap.classification,
    },
    criticPassed: criticReview.passed,
    criticProblems: criticReview.problems || [],
    criticFeedback: criticReview.critiqueFeedback,
    rawImagePath,
  };
}

async function main() {
  const outputDir = path.resolve('C:/Users/mail/.gemini/antigravity-ide/brain/883c88f1-51d2-48c5-9f76-362c1a730c46/scratch/validation-output/10-creatives-v2');
  fs.mkdirSync(outputDir, { recursive: true });

  const results: ProductionResult[] = [];

  for (const scenario of ARCHETYPES) {
    try {
      const res = await runScenarioDirect(scenario, outputDir);
      results.push(res);
    } catch (err: any) {
      console.error(`Error in scenario ${scenario.id}:`, err?.message || err);
      results.push({
        scenarioId: scenario.id,
        category: scenario.category,
        brandName: scenario.brandName,
        imageGenerated: false,
        occupancyFieldCreated: false,
        totalOccupancyMass: 0,
        topCandidatePlacement: { x: 0, y: 0, width: 0, height: 0, compositeScore: 0, overlapRatio: 0, classification: 'none' },
        criticPassed: false,
        criticProblems: [err?.message || String(err)],
        rawImagePath: '',
      });
    }
  }

  const summaryPath = path.join(outputDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));

  console.log('\n================================================================');
  console.log('>>> 10-CREATIVE PRODUCTION VALIDATION SUMMARY (V2) <<<');
  console.log('================================================================');
  console.table(results.map((r) => ({
    Scenario: r.scenarioId,
    Category: r.category,
    Image: r.imageGenerated ? 'OK' : 'FAIL',
    OccupancyMass: r.totalOccupancyMass.toFixed(3),
    Placement_Y: r.topCandidatePlacement.y.toFixed(3),
    Overlap: (r.topCandidatePlacement.overlapRatio * 100).toFixed(1) + '%',
    Class: r.topCandidatePlacement.classification,
    Score: r.topCandidatePlacement.compositeScore.toFixed(3),
    Critic: r.criticPassed ? 'PASS' : 'FAIL',
  })));
  console.log(`Saved detailed summary to: ${summaryPath}`);
}

main().catch(console.error);
