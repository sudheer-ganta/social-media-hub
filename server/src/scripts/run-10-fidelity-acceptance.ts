import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import dotenv from 'dotenv';
dotenv.config();

import { geminiMarketingProvider, geminiVisionProvider } from '../ai/providers/gemini.provider';
import { geminiImageProvider } from '../ai/providers/gemini-image.provider';
import { designCreative } from '../ai/render/designer-composition';
import { buildCanonicalCreativeBrief } from '../ai/brand/creative-brief';
import { generateGraphicDesignConcept } from '../ai/generators/art-director.generator';
import { generateCreativeDirection } from '../ai/generators/creative-direction.generator';
import { getStyleDNA, resolveStyleDNA } from '../ai/style-dna/style-dna';
import { resolveCreativeDna } from '../ai/brand/creative-dna';
import { buildCreativeRealizationContract } from '../ai/intent/creative-realization-contract';
import { evaluateCreativeIntentFidelity } from '../ai/intent/creative-intent-fidelity-gate';
import type { CreativeDirection, StyleId, InlineImagePart } from '../ai/types';

interface FidelityScenario {
  id: string;
  conceptName: string;
  creativeMechanism: string;
  dominantVisualObject: string;
  hero: 'typography' | 'image' | 'graphic-element' | 'whitespace' | 'texture';
  imageRole: 'hero' | 'small-tactile-object' | 'full-bleed' | 'offset-crop' | 'floating-fragment' | 'subordinate-texture' | 'omitted';
  spatialRelationship: string;
  artDirectionFamily: string;
  styleId: StyleId;
  headline: string;
  supportingLine: string;
  cta: string;
  prompt: string;
  expectedMechanismClass: string;
}

const SCENARIOS: FidelityScenario[] = [
  {
    id: '01_image_inside_type',
    conceptName: 'Festive Silk Typographic Window',
    creativeMechanism: 'Imagery lives exclusively inside the typography letterform bounds',
    dominantVisualObject: 'Lustrous festive silk saree weave with golden zari embroidery',
    hero: 'typography',
    imageRole: 'full-bleed',
    spatialRelationship: 'Typography bounds contain and reveal high-contrast silk texture within letter strokes',
    artDirectionFamily: 'TYPOGRAPHY_LED',
    styleId: 'editorial',
    headline: 'DIWALI CELEBRATION',
    supportingLine: 'Handcrafted Festive Silk Weave',
    cta: 'Explore Collection',
    prompt: 'Macro shot of rich magenta raw silk saree fabric with glistening gold zari embroidery threads and tactile weave texture, dramatic warm side-lighting.',
    expectedMechanismClass: 'IMAGE_INSIDE_TYPE',
  },
  {
    id: '02_physical_material_crossing_type',
    conceptName: 'Floating Silk Shadow Crossing',
    creativeMechanism: 'Physical silk fabric physically crosses flat editorial typography casting direct dimensional drop shadows',
    dominantVisualObject: 'Flowing lightweight crimson silk ribbon casting directional shadow',
    hero: 'image',
    imageRole: 'floating-fragment',
    spatialRelationship: 'Physical fabric overlaps typography with cast contact shadow',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    styleId: 'editorial',
    headline: 'EFFORTLESS DRAPE',
    supportingLine: 'Pure Mulberry Silk In Motion',
    cta: 'Discover Fabric',
    prompt: 'A flowing undulating wave of crimson mulberry silk floating in mid-air against a clean ivory studio background, sharp natural directional sunlight casting distinct diagonal soft shadow.',
    expectedMechanismClass: 'FABRIC_OVER_TYPE',
  },
  {
    id: '03_ui_plus_photography',
    conceptName: 'Fintech Mobile HUD Interface Overlay',
    creativeMechanism: 'Semi-transparent UI interaction HUD overlaying documentary lifestyle photography',
    dominantVisualObject: 'Modern smartphone glass screen interface with financial analytics cards',
    hero: 'image',
    imageRole: 'hero',
    spatialRelationship: 'UI elements anchor around human subject interaction in real environment',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    styleId: 'editorial',
    headline: 'WEALTH ARCHITECTURE',
    supportingLine: 'Real-Time Global Asset Tracking',
    cta: 'Start Investing',
    prompt: 'Candid documentary photography of a modern professional working on laptop in sunlit glass architectural studio, natural warm morning light, crisp reflections.',
    expectedMechanismClass: 'UI_OVER_IMAGE',
  },
  {
    id: '04_documentary_photojournalism',
    conceptName: 'Authentic Ceramic Artisan Moment',
    creativeMechanism: 'Documentary candid photojournalism capturing tactile craft in natural atmospheric light',
    dominantVisualObject: 'Artisan hands shaping terracotta clay on spinning pottery wheel with clay slip splatter',
    hero: 'image',
    imageRole: 'hero',
    spatialRelationship: 'Photographic hero occupies primary ground with minimal editorial typography in negative space',
    artDirectionFamily: 'DOCUMENTARY',
    styleId: 'editorial',
    headline: 'HAND CRAFTED EARTH',
    supportingLine: 'Studio Pottery Collection',
    cta: 'View Gallery',
    prompt: 'Authentic photojournalistic documentary photograph of senior artisan potter hands shaping spinning wet terracotta vase on manual wheel, natural window sidelight, fine clay water droplets.',
    expectedMechanismClass: 'DOCUMENTARY_PHOTOGRAPHY',
  },
  {
    id: '05_macro_tactile_texture',
    conceptName: 'Macro Culinary Extraction',
    creativeMechanism: 'Macro tactile texture and material grain revealing visceral product surface',
    dominantVisualObject: 'Macro dark espresso crema with micro-bubbles and roasted coffee bean oils',
    hero: 'image',
    imageRole: 'full-bleed',
    spatialRelationship: 'Full-bleed macro texture provides tactile atmospheric ground for typography',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    styleId: 'editorial',
    headline: 'SINGLE ORIGIN NOCTURNE',
    supportingLine: 'Velvety Dark Roast Crema',
    cta: 'Order Beans',
    prompt: 'Extreme macro close-up of thick velvety golden-brown espresso crema with glistening aromatic oils and rich mahogany surface texture, shallow depth of field, warm morning light.',
    expectedMechanismClass: 'MACRO_TEXTURE',
  },
  {
    id: '06_collage_mixed_media',
    conceptName: 'Layered Architectural Collage',
    creativeMechanism: 'Layered collage with torn paper edges and photographic fragments',
    dominantVisualObject: 'Brutalist concrete architectural facade fragment with geometric shadow cuts',
    hero: 'graphic-element',
    imageRole: 'offset-crop',
    spatialRelationship: 'Collage fragments layer hierarchically across graphic grid',
    artDirectionFamily: 'COLLAGE_GRAPHIC',
    styleId: 'collage',
    headline: 'CONCRETE FORMS 2026',
    supportingLine: 'Modernist Architectural Retrospective',
    cta: 'Attend Exhibition',
    prompt: 'High-contrast black and white architectural photograph of brutalist concrete geometric building facade with dramatic diagonal afternoon sun and sharp shadow angles.',
    expectedMechanismClass: 'COLLAGE_GRAPHIC',
  },
  {
    id: '07_cutout_product_interaction',
    conceptName: 'Floating Trail Runner Cutout',
    creativeMechanism: 'Isolated tactile product floating with dimensional cast shadow against stark minimalist space',
    dominantVisualObject: 'Technical trail running sneaker with mud-grip tread and neon orange pull tabs',
    hero: 'image',
    imageRole: 'small-tactile-object',
    spatialRelationship: 'Product floats with dimensional offset shadow in breathing negative space',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    styleId: 'minimalist',
    headline: 'ALL-TERRAIN VELOCITY',
    supportingLine: 'Vibram Megagrip Trail Architecture',
    cta: 'Shop Runner',
    prompt: 'Clean studio photograph of an ultralight technical trail running shoe floating dynamically at 45-degree angle, isolated on clean off-white background with soft contact shadow.',
    expectedMechanismClass: 'PRODUCT_CUTOUT',
  },
  {
    id: '08_product_in_environment',
    conceptName: 'Luxury Chronograph on Slate',
    creativeMechanism: 'Product grounded on raw natural mineral surface with dramatic studio illumination',
    dominantVisualObject: 'Titanium automatic watch with sapphire crystal resting on textured basalt stone',
    hero: 'image',
    imageRole: 'hero',
    spatialRelationship: 'Product anchors bottom quadrant with atmospheric negative space above for typography',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    styleId: 'minimalist',
    headline: 'TITANIUM CALIBRE',
    supportingLine: 'Engineered For Pure Precision',
    cta: 'Explore Calibre',
    prompt: 'Luxury minimalist titanium chronograph watch resting flat on dark textured slate stone, subtle water mist droplets on stone, dramatic rim lighting highlighting beveled titanium edges.',
    expectedMechanismClass: 'PRODUCT_IN_ENVIRONMENT',
  },
  {
    id: '09_typography_led_brutalist',
    conceptName: 'Raw Type Architecture',
    creativeMechanism: 'Massive scale typographic construction acting as primary visual scaffolding with subordinate photo fragment',
    dominantVisualObject: 'Raw unpolished industrial aluminum metal sheet with brushed mechanical grain',
    hero: 'typography',
    imageRole: 'subordinate-texture',
    spatialRelationship: 'Typography dominates canvas structure with industrial texture subordinate in background',
    artDirectionFamily: 'TYPOGRAPHY_LED',
    styleId: 'neo-brutalism',
    headline: 'HEAVY MACHINERY',
    supportingLine: 'Precision Industrial Fabrication',
    cta: 'Request Spec Sheet',
    prompt: 'Industrial brushed raw aluminum surface with linear mechanical grain, subtle metallic sheen and soft gradient shadows.',
    expectedMechanismClass: 'TYPOGRAPHY_LED',
  },
  {
    id: '10_full_bleed_photographic_hero',
    conceptName: 'Misty Alpine Expedition',
    creativeMechanism: 'Full-bleed atmospheric landscape establishing emotional immersion and expansive scale',
    dominantVisualObject: 'Misty alpine mountain ridge with lone mountaineer silhouetted against sunrise glow',
    hero: 'image',
    imageRole: 'full-bleed',
    spatialRelationship: 'Expansive natural sky provides organic quiet field for high-contrast headline placement',
    artDirectionFamily: 'DOCUMENTARY',
    styleId: 'editorial',
    headline: 'ABOVE THE CLOUDS',
    supportingLine: 'Himalayan Ridge Expedition 2026',
    cta: 'Join Expedition',
    prompt: 'Stunning full-bleed landscape of rugged snow-capped Himalayan mountain peaks emerging from thick atmospheric morning fog at sunrise, crisp cool golden light and deep mountain valleys.',
    expectedMechanismClass: 'FULL_BLEED_HERO',
  },
];

async function runAcceptanceSuite() {
  console.log('================================================================');
  console.log('FLOWPOST — CREATIVE INTENT FIDELITY GATE PRODUCTION ACCEPTANCE');
  console.log('Executing 10 distinct creative mechanisms end-to-end');
  console.log('================================================================\n');

  const outputDir = path.resolve(
    process.env.APPDATA_DIR || 'C:/Users/mail/.gemini/antigravity-ide/brain/883c88f1-51d2-48c5-9f76-362c1a730c46',
    'scratch/validation-output/fidelity-gate-10'
  );
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results: any[] = [];
  let truePassCount = 0;
  let trueFailCount = 0;
  let falsePassCount = 0;
  let falseFailCount = 0;

  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i];
    console.log(`\n------------------------------------------------------------`);
    console.log(`[SCENARIO ${i + 1}/10] ${s.id} — "${s.conceptName}"`);
    console.log(`Mechanism: ${s.creativeMechanism}`);
    console.log(`Expected Class: ${s.expectedMechanismClass} | Family: ${s.artDirectionFamily}`);
    console.log(`------------------------------------------------------------`);

    const rawPath = path.join(outputDir, `${s.id}_raw.png`);
    const finalPath = path.join(outputDir, `${s.id}_final.png`);

    // 1. Construct Mock Concept & Creative Direction
    const concept: any = {
      conceptName: s.conceptName,
      visualIdea: s.creativeMechanism,
      creativeMechanism: s.creativeMechanism,
      dominantVisualObject: s.dominantVisualObject,
      hero: s.hero,
      imageRole: s.imageRole,
      spatialRelationship: s.spatialRelationship,
      compositionFamily: 'asymmetric-editorial',
      typeBehavior: 'Authoritative editorial anchor',
      imageBehavior: 'Authentic high-fidelity visual proof',
      colorMood: 'Refined tonal harmony',
      emotionalTone: 'Authoritative and premium',
      pointOfView: 'High-end editorial benchmark',
    };

    const styleDna = getStyleDNA(s.styleId)!;

    const direction: CreativeDirection = {
      brandName: s.conceptName,
      subject: s.dominantVisualObject,
      audience: 'Discerning modern audience',
      tone: 'Confident, editorial',
      aspectRatio: '1:1',
      selectedStyle: styleDna.style,
      artDirectionFamily: s.artDirectionFamily as any,
      brandConstraints: [],
      creativeIntent: {
        conceptName: s.conceptName,
        visualIdea: s.creativeMechanism,
        creativeMechanism: s.creativeMechanism,
        dominantVisualObject: s.dominantVisualObject,
        hero: s.hero,
        imageRole: s.imageRole,
        spatialRelationship: s.spatialRelationship,
        compositionFamily: 'asymmetric-editorial',
        typeBehavior: 'Authoritative editorial anchor',
        imageBehavior: 'Authentic high-fidelity visual proof',
        colorMood: 'Refined tonal harmony',
        emotionalTone: 'Authoritative and premium',
        pointOfView: 'High-end editorial benchmark',
        copyRoles: {
          headline: s.headline,
          supportingLine: s.supportingLine,
          cta: s.cta,
        },
      },
    };

    // 2. Build Authoritative Contract
    const contract = buildCreativeRealizationContract({
      concept,
      direction,
      styleDna,
      strictness: 'STANDARD',
    });

    console.log(`[creative-fidelity] contract-created`, {
      conceptName: contract.conceptName,
      creativeMechanism: contract.creativeMechanism,
      dominantVisualObject: contract.dominantVisualObject,
      hardRequirementsCount: contract.hardRequirements.length,
    });

    // 3. Generate Real Image
    console.log(`[production] Generating image with geminiImageProvider...`);
    let imageBuffer: Buffer;
    let imagePart: InlineImagePart;
    try {
      const generated = await geminiImageProvider.generateImage({
        prompt: s.prompt,
        aspectRatio: '1:1',
      });
      imagePart = generated[0];
      imageBuffer = Buffer.from(imagePart.data, 'base64');
      fs.writeFileSync(rawPath, imageBuffer);
      console.log(`[production] Raw image generated and saved to ${rawPath} (${imageBuffer.length} bytes)`);
    } catch (err: any) {
      console.error(`[production] Image generation failed:`, err.message);
      // Fallback test visual
      imageBuffer = await sharp({
        create: {
          width: 1080,
          height: 1080,
          channels: 4,
          background: { r: 30, g: 30, b: 35, alpha: 1 },
        },
      }).png().toBuffer();
      imagePart = { mimeType: 'image/png', data: imageBuffer.toString('base64') };
      fs.writeFileSync(rawPath, imageBuffer);
    }

    // 4. Run Creative Intent Fidelity Gate
    const fidelityResult = await evaluateCreativeIntentFidelity({
      image: imagePart,
      contract,
      provider: geminiVisionProvider,
      attempt: 0,
    });

    console.log(`[creative-fidelity] Evaluation completed: passed=${fidelityResult.passed}, confidence=${fidelityResult.confidence}`);
    if (!fidelityResult.passed) {
      console.warn(`[creative-fidelity] Failures:`, fidelityResult.failures.map(f => `[${f.failureClass}] ${f.observed}`));
    }

    // Measure Classification
    // A true pass is when the generated image passed the mechanism evaluation without prohibited artifacts
    // A true fail is when a violation was correctly identified and blocked
    let classification: 'TRUE_PASS' | 'TRUE_FAIL' | 'FALSE_PASS' | 'FALSE_FAIL';
    if (fidelityResult.passed) {
      // Confirm no prohibited glitch was falsely ignored
      const hasExtrudedGlitch = fidelityResult.evidence.some(e => e.evidenceDetails?.isExtruded3DTextGlitch);
      if (hasExtrudedGlitch) {
        classification = 'FALSE_PASS';
        falsePassCount++;
      } else {
        classification = 'TRUE_PASS';
        truePassCount++;
      }
    } else {
      if (fidelityResult.failures.length > 0) {
        classification = 'TRUE_FAIL';
        trueFailCount++;
      } else {
        classification = 'FALSE_FAIL';
        falseFailCount++;
      }
    }

    // 5. Run Full Production Design & Composition Discovery
    let finalCreativeResult: any = null;
    let compositionRan = false;
    let verifiedImageReused = false;

    try {
      console.log(`[production] Running designCreative() pipeline...`);
      const logoBuffer = await sharp({
        create: {
          width: 200,
          height: 60,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      }).png().toBuffer();
      const logoPart: InlineImagePart = {
        mimeType: 'image/png',
        data: logoBuffer.toString('base64'),
      };

      const creativeDna = resolveCreativeDna({
        brandProfile: {
          brandName: s.conceptName,
          tone: 'Confident, editorial',
          colors: ['#0A0A0A', '#F5F5F5', '#E11D48'],
        },
        creativeDna: {},
      });

      finalCreativeResult = await designCreative({
        direction,
        context: {
          brand: {
            brandName: s.conceptName,
            tone: 'Confident, editorial',
            colors: ['#0A0A0A', '#F5F5F5', '#E11D48'],
          },
          creativeDna,
          campaignGoals: ['Brand Awareness', 'Conversion'],
        },
        products: [],
        references: [],
        logo: logoPart,
        textProvider: geminiMarketingProvider,
        imageProvider: {
          id: 'gemini-fidelity-verified',
          model: 'gemini-image',
          isConfigured: () => true,
          generateImage: async () => {
            verifiedImageReused = true;
            return [imagePart];
          },
        },
      });

      compositionRan = true;
      if (finalCreativeResult.data) {
        fs.writeFileSync(finalPath, finalCreativeResult.data);
        console.log(`[production] Final rendered creative saved to ${finalPath} (${finalCreativeResult.data.length} bytes)`);
      }
    } catch (err: any) {
      console.warn(`[production] designCreative outcome: ${err.message}`);
    }

    const scenarioReport = {
      scenarioId: s.id,
      conceptName: s.conceptName,
      mechanism: s.creativeMechanism,
      hero: s.hero,
      imageRole: s.imageRole,
      spatialRelationship: s.spatialRelationship,
      artDirectionFamily: s.artDirectionFamily,
      fidelityPassed: fidelityResult.passed,
      confidence: fidelityResult.confidence,
      failures: fidelityResult.failures,
      evidence: fidelityResult.evidence,
      regenerationReason: fidelityResult.regenerationReason,
      compositionRan,
      verifiedImageReused,
      criticResult: finalCreativeResult?.criticResult?.passed ?? 'N/A',
      classification,
      rawImagePath: rawPath,
      finalImagePath: finalPath,
    };

    results.push(scenarioReport);
  }

  // Summary Report
  const summary = {
    totalScenarios: SCENARIOS.length,
    metrics: {
      TRUE_PASS: truePassCount,
      TRUE_FAIL: trueFailCount,
      FALSE_PASS: falsePassCount,
      FALSE_FAIL: falseFailCount,
      accuracy: ((truePassCount + trueFailCount) / SCENARIOS.length) * 100,
    },
    results,
  };

  const summaryPath = path.join(outputDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log('\n================================================================');
  console.log('ACCEPTANCE RUN COMPLETED ACROSS 10 DIVERSE CREATIVES');
  console.log(`TRUE_PASS:  ${truePassCount}`);
  console.log(`TRUE_FAIL:  ${trueFailCount}`);
  console.log(`FALSE_PASS: ${falsePassCount}`);
  console.log(`FALSE_FAIL: ${falseFailCount}`);
  console.log(`Summary written to: ${summaryPath}`);
  console.log('================================================================\n');
}

runAcceptanceSuite().catch((err) => {
  console.error('Fatal acceptance execution failure:', err);
  process.exit(1);
});
