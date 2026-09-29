import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import dotenv from 'dotenv';
dotenv.config();

import { geminiMarketingProvider, geminiVisionProvider } from '../ai/providers/gemini.provider';
import { geminiImageProvider } from '../ai/providers/gemini-image.provider';
import { designCreative } from '../ai/render/designer-composition';
import { resolveBrandProfile } from '../ai/brand/brand-profile';
import { resolveCreativeDna } from '../ai/brand/creative-dna';
import { buildCanonicalCreativeBrief } from '../ai/brand/creative-brief';
import { generateGraphicDesignConcept } from '../ai/generators/art-director.generator';
import { generateCreativeDirection } from '../ai/generators/creative-direction.generator';
import { getStyleDNA, resolveStyleDNA } from '../ai/style-dna/style-dna';
import { analyzeImageField } from '../ai/render/image-field';
import { createDesignField } from '../ai/render/design-representation';
import type { CreativeDirection, StyleId } from '../ai/types';

interface ArchetypeScenario {
  id: string;
  category: string;
  brandName: string;
  prompt: string;
  styleId: StyleId;
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
    styleId: 'editorial',
    headline: 'Experience 2D Virtual Saree Try-On',
    supportingLine: 'Festive Elegance from Home',
    cta: 'Try On Now',
    colors: ['#881337', '#FDE047', '#1E1B4B'],
  },
  {
    id: '02_luxury_horology',
    category: 'product/hard-surface',
    brandName: 'Aero Chrono',
    prompt: 'Minimalist titanium luxury chronograph watch with sapphire glass resting on slate stone.',
    styleId: 'minimalist',
    headline: 'Titanium Precision Automatic Calibre',
    supportingLine: 'Crafted for Pure Movement',
    cta: 'Explore Calibre',
    colors: ['#09090B', '#E4E4E7', '#71717A'],
  },
  {
    id: '03_architectural_interior',
    category: 'interior/architecture',
    brandName: 'Nordic Habitat',
    prompt: 'Sunlit modern Scandinavian living room with oak wood furniture, warm wool throw, and architectural fiddle leaf fig.',
    styleId: 'editorial',
    headline: 'Warm Minimalist Scandinavian Living',
    supportingLine: 'Handcrafted Solid Oak Collection',
    cta: 'View Catalog',
    colors: ['#FDFBF7', '#3F3F46', '#D97706'],
  },
  {
    id: '04_culinary_artisan',
    category: 'food/macro',
    brandName: 'Artisan Crust',
    prompt: 'Freshly baked golden sourdough loaf sliced open on rustic flour-dusted marble counter with rosemary butter.',
    styleId: 'editorial',
    headline: 'Slow Fermented Artisan Sourdough',
    supportingLine: 'Crisp Crust Baked Fresh Daily',
    cta: 'Order Fresh',
    colors: ['#451A03', '#FEF3C7', '#78350F'],
  },
  {
    id: '05_technical_outdoor',
    category: 'outdoor/technical',
    brandName: 'Summit Technical',
    prompt: 'Ultralight waterproof alpine mountaineering backpack on misty Himalayan granite ridge at sunrise.',
    styleId: 'editorial',
    headline: 'Ultralight Expedition Alpine Pack',
    supportingLine: 'All-Weather Cordura Defense',
    cta: 'Gear Up',
    colors: ['#0F172A', '#0284C7', '#F8FAFC'],
  },
  {
    id: '06_moody_dark_beverage',
    category: 'dark/low-key',
    brandName: 'Nocturne Roast',
    prompt: 'Deep moody midnight espresso beans falling in slow motion with rich crema in obsidian ceramic cup.',
    styleId: 'editorial',
    headline: 'Midnight Dark Roast Single Origin',
    supportingLine: 'Intense Smoky Cocoa Notes',
    cta: 'Taste The Night',
    colors: ['#0A0A0A', '#D97706', '#E5E5E5'],
  },
  {
    id: '07_clean_bright_cosmetics',
    category: 'bright/high-key',
    brandName: 'Lumiere Botanical',
    prompt: 'Radiant clean glass dropper bottle of vitamin C skincare serum against bright sunlit white water ripple reflections.',
    styleId: 'minimalist',
    headline: 'Pure Vitamin C Radiant Glow',
    supportingLine: 'Clean Botanical Actives',
    cta: 'Reveal Radiance',
    colors: ['#FFFFFF', '#F59E0B', '#0F766E'],
  },
  {
    id: '08_full_bleed_craft',
    category: 'full-bleed/texture',
    brandName: 'Vachetta Studio',
    prompt: 'Full-bleed extreme close-up of handcrafted amber Italian leather tote bag showing rich grain texture and precision brass hardware.',
    styleId: 'editorial',
    headline: 'Handcrafted Tuscan Amber Leather',
    supportingLine: 'Lifetime Stitch Guarantee',
    cta: 'Shop Leather',
    colors: ['#78350F', '#FEF3C7', '#1C1917'],
  },
  {
    id: '09_multi_subject_culinary',
    category: 'multiple subjects',
    brandName: 'Matcha Atelier',
    prompt: 'Trio of exquisite Japanese ceremonial matcha desserts: matcha roll cake, cream choux, and dusted truffle arranged diagonally.',
    styleId: 'editorial',
    headline: 'Ceremonial Uji Matcha Pastry Trio',
    supportingLine: 'Handmade Kyoto Confections',
    cta: 'Order Box',
    colors: ['#14532D', '#DCFCE7', '#FDFBF7'],
  },
  {
    id: '10_minimal_negative_space',
    category: 'negative-space',
    brandName: 'Forma Studio',
    prompt: 'Solitary minimalist matte terracotta vase on vast empty pale concrete floor with dramatic morning cast shadow.',
    styleId: 'minimalist',
    headline: 'Handmade Architectural Ceramics',
    supportingLine: 'Limited Studio Series',
    cta: 'Collect Edition',
    colors: ['#9A3412', '#F5F5F4', '#292524'],
  },
];

async function createDynamicBrandLogo(brandName: string, color: string = '#111111') {
  const svg = `<svg width="400" height="120" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="120" fill="none"/>
    <text x="200" y="75" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="42" letter-spacing="3" fill="${color}" text-anchor="middle">${brandName.toUpperCase()}</text>
  </svg>`;
  return {
    mimeType: 'image/png',
    data: (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64'),
  };
}

interface AcceptanceRecord {
  scenarioId: string;
  category: string;
  brandName: string;
  renderedImagePath: string;
  selectedComposition: {
    archetype?: string;
    family?: string;
    gridCols?: number;
  };
  typography: {
    headlineFamily?: string;
    headlineWeight?: number;
    headlineFontSize?: number;
    bodyFamily?: string;
  };
  placement: Record<string, { x: number; y: number; width: number; height: number }>;
  occupancyOfTextRegion: number;
  subjectOverlap: {
    overlapRatio: number;
    subjectOcclusionRatio: number;
    classification: string;
  };
  contrastLegibility: {
    meanLuminance: number;
    stdDev: number;
    scrimApplied: boolean;
  };
  criticResult: {
    passed: boolean;
    templateLook: boolean;
    humanCraft: boolean;
    singleClearIdea: boolean;
    layoutExpressesIdea: boolean;
    problems: string[];
    reasonsToReject: string[];
    feedback?: string;
  };
  criticFailureClasses: string[];
  recoveryActionTaken?: string;
  durationMs: number;
}

async function runAcceptanceCreative(scenario: ArchetypeScenario, outputDir: string): Promise<AcceptanceRecord> {
  const startTime = Date.now();
  console.log(`\n================================================================`);
  console.log(`>>> ACCEPTANCE ${scenario.id}: ${scenario.category.toUpperCase()} (${scenario.brandName}) <<<`);
  console.log(`================================================================`);

  const brand = resolveBrandProfile({
    brand: {
      name: scenario.brandName,
      description: scenario.prompt,
      tone: 'modern, premium, clear, authoritative',
      wordsToUse: ['crafted', 'pure', 'precision', 'experience'],
      wordsToAvoid: ['unleash', 'disrupt'],
    },
  });

  const creativeDna = resolveCreativeDna({
    creativeDna: {
      brandColors: scenario.colors,
      personalityArchetype: 'Creator',
    },
  });

  const styleDna = getStyleDNA(scenario.styleId)!;
  const resolvedStyleDna = resolveStyleDNA({ styleId: scenario.styleId, prompt: scenario.prompt })!;
  const logo = await createDynamicBrandLogo(scenario.brandName, scenario.colors[0]);

  // 1. Canonical Creative Brief
  console.log(`[Stage 1] Building Canonical Creative Brief...`);
  const brief = buildCanonicalCreativeBrief({
    userPrompt: scenario.prompt,
    requiredClaims: [scenario.headline, scenario.supportingLine],
    brand,
    creativeDna,
    styleDna: resolvedStyleDna,
    rawParameters: {
      aspectRatio: '1:1',
      platform: 'instagram',
      goal: 'engagement',
    },
  });

  // 2. Graphic Design Concept
  console.log(`[Stage 2] Generating Graphic Design Blueprint...`);
  const graphicConcept = await generateGraphicDesignConcept({
    provider: geminiVisionProvider,
    brief,
  });

  // 3. Creative Direction
  console.log(`[Stage 3] Generating Creative Direction...`);
  const { direction } = await generateCreativeDirection({
    provider: geminiMarketingProvider,
    request: scenario.prompt,
    goal: 'engagement',
    funnelStage: 'MOFU',
    platforms: ['instagram'],
    hasAssets: false,
    brand,
    creativeDna,
    mode: scenario.styleId === 'minimalist' ? 'MINIMAL' : 'EDITORIAL',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    selectedStyle: styleDna,
  });

  // Overwrite copy fields with scenario guarantees for strict comparison
  direction.headline = scenario.headline;
  direction.supportingLine = scenario.supportingLine;
  if (direction.marketingCreative) {
    direction.marketingCreative.brandMessage = scenario.supportingLine;
    direction.marketingCreative.callToAction = scenario.cta;
  }

  // 4. Full Production Execution via designCreative with interception to save PNGs
  console.log(`[Stage 4] Executing designCreative with Dynamic Design Engine & Spatial Occupancy...`);
  let latestRenderedPng: Buffer | null = null;
  let latestRawImage: Buffer | null = null;
  let attemptCount = 0;

  const wrappedImageProvider = {
    ...geminiImageProvider,
    generateImage: async (opts: any) => {
      const parts = await geminiImageProvider.generateImage(opts);
      if (parts && parts[0]?.data) {
        latestRawImage = Buffer.from(parts[0].data, 'base64');
        const rawPath = path.join(outputDir, `${scenario.id}_raw.png`);
        fs.writeFileSync(rawPath, latestRawImage);
      }
      return parts;
    },
  };

  const wrappedTextProvider = {
    ...geminiMarketingProvider,
    generateJson: async (schema: any, systemPrompt: string, userPrompt: string, images?: any[]) => {
      if (images && images.length > 0 && images[0]?.data) {
        const buf = Buffer.from(images[0].data, 'base64');
        latestRenderedPng = buf;
        const attemptPath = path.join(outputDir, `${scenario.id}_attempt_${attemptCount}.png`);
        fs.writeFileSync(attemptPath, buf);
        const finalPath = path.join(outputDir, `${scenario.id}_final.png`);
        fs.writeFileSync(finalPath, buf);
        attemptCount++;
      }
      return geminiMarketingProvider.generateJson(schema, systemPrompt, userPrompt, images);
    },
  };

  let compositionResult: any = null;
  let executionError: Error | null = null;

  try {
    compositionResult = await designCreative({
      direction,
      concept: graphicConcept,
      graphicConcept,
      canonicalBrief: brief,
      styleDna: resolvedStyleDna,
      context: {
        brand,
        creativeDna,
        intent: {
          goal: 'ENGAGEMENT',
          funnelStage: 'MOFU',
          aspectRatio: '1:1',
          requiredClaims: [scenario.headline, scenario.supportingLine],
        },
      },
      products: [],
      references: [],
      logo,
      textProvider: wrappedTextProvider,
      imageProvider: wrappedImageProvider,
    });
  } catch (err: any) {
    executionError = err;
    console.warn(`  -> designCreative completed with critic rejection: ${err.message}`);
  }

  const durationMs = Date.now() - startTime;
  console.log(`[Stage 5] Design Creative Completed in ${(durationMs / 1000).toFixed(1)}s`);

  const renderedImagePath = path.join(outputDir, `${scenario.id}_final.png`);
  const finalPngBuffer = compositionResult?.data || latestRenderedPng;
  if (finalPngBuffer) {
    fs.writeFileSync(renderedImagePath, finalPngBuffer);
    console.log(`  -> Saved final rendered artwork to: ${renderedImagePath}`);
  }

  // Extract Nodes & Placement coordinates if plan is present
  const plan = compositionResult?.plan;
  const placement: Record<string, { x: number; y: number; width: number; height: number }> = {};
  if (plan?.nodes) {
    for (const node of plan.nodes) {
      placement[node.id] = {
        x: node.box.x,
        y: node.box.y,
        width: node.box.width,
        height: node.box.height,
      };
    }
  }

  const primaryNode = plan?.nodes.find((n: any) => n.id === 'primary-hook' || n.id === 'headline');
  const headlineFamily = primaryNode?.fontFamily;
  const headlineWeight = primaryNode?.fontWeight;
  const headlineFontSize = primaryNode?.fontSize;

  const supportNode = plan?.nodes.find((n: any) => n.id === 'secondary-hook' || n.id === 'supporting-note');
  const bodyFamily = supportNode?.fontFamily;

  const critic = compositionResult?.critic || {
    passed: false,
    templateLook: false,
    humanCraft: false,
    singleClearIdea: false,
    layoutExpressesIdea: false,
    problems: executionError ? [executionError.message] : ['Rejected by design critic'],
    reasonsToReject: executionError ? [executionError.message] : ['Rejected by design critic'],
    critiqueFeedback: executionError?.message,
  };

  // Analyze exact text region occupancy from the rendered plan nodes
  let headlineOccupancy = 0;
  let headlineOverlap = 0;
  let headlineOcclusion = 0;
  let headlineCls = 'none';
  let tone = { meanLuminance: 0.5, stdDev: 0.1, verdict: 'light' };

  if (finalPngBuffer) {
    const rawBgField = await analyzeImageField(finalPngBuffer);
    if (primaryNode) {
      const rect = {
        x: primaryNode.box.x / 1080,
        y: primaryNode.box.y / 1080,
        width: primaryNode.box.width / 1080,
        height: primaryNode.box.height / 1080,
      };
      headlineOccupancy = rawBgField.occupancyAt ? rawBgField.occupancyAt(rect) : 0;
      headlineOverlap = headlineOccupancy;
      headlineOcclusion = rawBgField.occupancyMass ? rawBgField.occupancyMass(rect) / Math.max(0.001, rawBgField.totalOccupancyMass) : 0;
      if (headlineOverlap > 0.72 || headlineOcclusion > 0.28) headlineCls = 'focal-core';
      else if (headlineOverlap > 0.20 || headlineOcclusion > 0.10) headlineCls = 'textured-field';
      else if (headlineOverlap > 0.04) headlineCls = 'peripheral';
      else headlineCls = 'none';
    }
    tone = rawBgField.toneAt ? rawBgField.toneAt({
      x: primaryNode ? primaryNode.box.x / 1080 : 0.1,
      y: primaryNode ? primaryNode.box.y / 1080 : 0.1,
      width: primaryNode ? primaryNode.box.width / 1080 : 0.8,
      height: primaryNode ? primaryNode.box.height / 1080 : 0.2,
    }) : tone;
  }

  return {
    scenarioId: scenario.id,
    category: scenario.category,
    brandName: scenario.brandName,
    renderedImagePath,
    selectedComposition: {
      archetype: plan?.compositionArchetype || plan?.archetype,
      family: plan?.compositionFamily,
      gridCols: plan?.grid?.cols,
    },
    typography: {
      headlineFamily,
      headlineWeight,
      headlineFontSize,
      bodyFamily,
    },
    placement,
    occupancyOfTextRegion: Number(headlineOccupancy.toFixed(3)),
    subjectOverlap: {
      overlapRatio: Number(headlineOverlap.toFixed(3)),
      subjectOcclusionRatio: Number(headlineOcclusion.toFixed(3)),
      classification: headlineCls,
    },
    contrastLegibility: {
      meanLuminance: Number(tone.meanLuminance.toFixed(3)),
      stdDev: Number(tone.stdDev.toFixed(3)),
      scrimApplied: plan ? plan.nodes.some((n: any) => n.id.includes('scrim') || n.id.includes('surface')) : false,
    },
    criticResult: {
      passed: critic.passed,
      templateLook: critic.templateLook,
      humanCraft: critic.humanCraft,
      singleClearIdea: critic.singleClearIdea,
      layoutExpressesIdea: critic.layoutExpressesIdea,
      problems: critic.problems,
      reasonsToReject: critic.reasonsToReject,
      feedback: critic.critiqueFeedback || critic.feedback,
    },
    criticFailureClasses: (critic as any).failures || (executionError ? ['CRITIC_REJECTION'] : []),
    recoveryActionTaken: compositionResult?.recoverySummary?.action || 'NONE',
    durationMs,
  };
}

async function run() {
  const outputDir = 'C:/Users/mail/.gemini/antigravity-ide/brain/883c88f1-51d2-48c5-9f76-362c1a730c46/scratch/validation-output/acceptance-10';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results: AcceptanceRecord[] = [];

  for (const scenario of ARCHETYPES) {
    try {
      const record = await runAcceptanceCreative(scenario, outputDir);
      results.push(record);
    } catch (err: any) {
      console.error(`[ERROR] Scenario ${scenario.id} failed:`, err.message);
      results.push({
        scenarioId: scenario.id,
        category: scenario.category,
        brandName: scenario.brandName,
        renderedImagePath: '',
        selectedComposition: {},
        typography: {},
        placement: {},
        occupancyOfTextRegion: 0,
        subjectOverlap: { overlapRatio: 0, subjectOcclusionRatio: 0, classification: 'none' },
        contrastLegibility: { meanLuminance: 0, stdDev: 0, scrimApplied: false },
        criticResult: {
          passed: false,
          templateLook: true,
          humanCraft: false,
          singleClearIdea: false,
          layoutExpressesIdea: false,
          problems: [err.message],
          reasonsToReject: [err.message],
        },
        criticFailureClasses: ['SYSTEM_ERROR'],
        durationMs: 0,
      });
    }
  }

  const summaryPath = path.join(outputDir, 'acceptance-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  console.log(`\n\n================================================================`);
  console.log(`>>> ACCEPTANCE RUN COMPLETE: ${results.filter(r => r.criticResult.passed).length}/10 CRITIC PASSED <<<`);
  console.log(`Summary written to: ${summaryPath}`);
  console.log(`================================================================\n`);
}

run().catch(console.error);
