import {
  createCanvasRepresentation,
  createBrandDesignRepresentation,
  createDesignField,
} from '../ai/render/design-representation';
import { analyzeImageField } from '../ai/render/image-field';
import { createDynamicCopyModel } from '../ai/render/copy-model';
import { exploreLineStructures } from '../ai/typography/dynamic-line-structure';
import { discoverPlacementCandidates } from '../ai/render/dynamic-placement';
import {
  discoverNaturalAxes,
  enhancePlacementCandidatesWithAlignment,
} from '../ai/render/dynamic-alignment';
import {
  evaluateLocalColorField,
  discoverInkCandidates,
  evaluateCompositionColors,
} from '../ai/render/dynamic-color';
import sharp from 'sharp';

async function runCreativeValidation() {
  console.log('================================================================');
  console.log('PHASE 8 — DYNAMIC COLOR & CONTRAST ENGINE REAL CREATIVE VALIDATION');
  console.log('================================================================\n');

  // CREATIVE 1: Lumina Audio (4:5 Studio Shot, Dark Headphone on Left x: 0.05..0.45, Bright Smooth Studio Right)
  {
    console.log('--- CREATIVE 1: Lumina Audio (Editorial Audio Brand) ---');
    const canvas = createCanvasRepresentation(1200, 1500); // 4:5
    const width = 256;
    const height = 256;
    const raw = Buffer.alloc(width * height * 3).fill(240); // smooth bright studio backdrop

    for (let y = 50; y < 220; y++) {
      for (let x = 12; x < 115; x++) {
        const idx = (y * width + x) * 3;
        const val = (x * 7 + y * 13) % 255 < 128 ? 25 : 80;
        raw[idx] = val;
        raw[idx + 1] = val;
        raw[idx + 2] = val;
      }
    }
    const imgBuf = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const field = createDesignField(await analyzeImageField(imgBuf));

    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'Lumina Audio', tone: 'editorial, minimalist, premium' },
      creativeDna: { brandColors: ['#0f172a', '#38bdf8', '#64748b'] },
    });

    const headline = createDynamicCopyModel('h1', 'IMMERSIVE SPATIAL AUDIO', 'primary-hook', 1);
    const subheadline = createDynamicCopyModel('sub', 'Studio-Grade Acoustic Precision', 'secondary-hook', 2);

    const h1States = exploreLineStructures({ copy: headline, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.7, height: 0.3 }, canvas });
    const subStates = exploreLineStructures({ copy: subheadline, font: 'Inter', weight: 400, spatialBox: { x: 0, y: 0, width: 0.6, height: 0.15 }, canvas });

    const primaryPlacements = discoverPlacementCandidates({ typographyState: h1States[0], field, canvas, maxCandidates: 3, refineContinuous: true });
    const discoveredAxes = discoverNaturalAxes({ field, canvas });
    const alignedCandidates = enhancePlacementCandidatesWithAlignment({ candidates: primaryPlacements, field, canvas, discoveredAxes });
    const topAlign = alignedCandidates[0];

    const h1Footprint = topAlign.rect;
    const subFootprint = { x: topAlign.rect.x, y: Number((topAlign.rect.y + topAlign.rect.height + 0.035).toFixed(3)), width: subStates[0].boundingBox.widthNormalized, height: 0.055 };

    const localH1 = evaluateLocalColorField({ footprint: h1Footprint, field, canvas });
    console.log(`Local Image Color Field under Headline Footprint:`);
    console.log(`  - Mean Lum: ${(localH1.meanLuminance * 100).toFixed(1)}% | Variance: ${localH1.luminanceVariance.toFixed(3)} | Stability: ${(localH1.colorStability * 100).toFixed(0)}%`);
    console.log(`  - Mean Color: ${localH1.meanColor.hex} (Oklab L: ${localH1.meanColor.oklab.L.toFixed(3)}, a: ${localH1.meanColor.oklab.a.toFixed(3)}, b: ${localH1.meanColor.oklab.b.toFixed(3)})`);
    console.log(`  - Temperature Index: ${localH1.temperature.toFixed(2)} (Neutral-Cool) | Edge Detail Energy: ${(localH1.edgeInterference * 100).toFixed(0)}%`);

    const headlineInks = discoverInkCandidates({ role: 'headline', footprint: h1Footprint, field, canvas, brand, typographyState: h1States[0] });
    console.log(`\nDiscovered ${headlineInks.length} Viable Ink Candidates for Headline:`);
    for (let i = 0; i < headlineInks.length; i++) {
      const ink = headlineInks[i];
      console.log(`  Candidate ${i + 1} [${ink.color.hex}] (${ink.provenance.derivationType}):`);
      console.log(`    - Provenance: source=${ink.provenance.sourceColor} | transformation="${ink.provenance.transformation.description}"`);
      console.log(`    - Brand Distance: ΔE_OK=${ink.provenance.deltaEOklab} (dL=${ink.provenance.lightnessDistance}, dC=${ink.provenance.chromaDistance}, dH=${ink.provenance.hueDistance}°) | calibratedTol=${ink.provenance.isCalibratedBrandToleranceAvailable}`);
      console.log(`    - Oklch: L=${ink.color.oklch.L.toFixed(3)}, C=${ink.color.oklch.C.toFixed(3)}, h=${ink.color.oklch.h.toFixed(1)}° | Temp=${ink.color.temperature.toFixed(2)} | Chroma=${ink.color.oklch.C.toFixed(3)}`);
      console.log(`    - Contrast: WCAG=${ink.contrast.wcagRatio}:1 | APCA Lc estimate=${ink.contrast.apcaEstimatedLc} | LightnessDelta=${ink.contrast.oklabLightnessDelta.toFixed(3)}`);
      console.log(`    - Signals: OpticalDensity=${ink.signals.opticalDensityScore} | HierarchySuitability=${ink.signals.hierarchySuitabilityScore} | ImageHarmony=${ink.signals.imageHarmonyScore}`);
      console.log(`    - Tradeoff Profile: contrast=${ink.signals.tradeoffProfile.contrastQuality} | brandAdherence=${ink.signals.tradeoffProfile.brandAdherence} | harmony=${ink.signals.tradeoffProfile.harmonyQuality} | optical=${ink.signals.tradeoffProfile.opticalSuitability}`);
      console.log(`    - Scores: Composite=${ink.scores.compositeColorScore} | Legibility=${ink.scores.legibilityScore} | Harmony=${ink.scores.harmonyScore}`);
    }

    const compColorResult = evaluateCompositionColors({
      elements: [
        { id: 'h1', role: 'headline', rect: h1Footprint, typographyState: h1States[0] },
        { id: 'sub', role: 'subheadline', rect: subFootprint, typographyState: subStates[0] },
      ],
      field,
      canvas,
      brand,
    });
    console.log(`\nMulti-Element Coordinated Inks:`);
    console.log(`  - Headline Ink: ${compColorResult.elementColors[0].topCandidate.color.hex} (${compColorResult.elementColors[0].topCandidate.provenance.derivationType})`);
    console.log(`  - Subheadline Ink: ${compColorResult.elementColors[1].topCandidate.color.hex} (${compColorResult.elementColors[1].topCandidate.provenance.derivationType})`);
    console.log(`  - Overall Harmony: ${(compColorResult.overallHarmonyScore * 100).toFixed(0)}% | Contrast Health: ${(compColorResult.contrastHealthScore * 100).toFixed(0)}% | Quality: ${(compColorResult.compositeColorQuality * 100).toFixed(0)}%`);
  }

  // CREATIVE 2: Artisan Bistro (1:1 Centered Warm Dish, Ambient Neutral Backdrop)
  {
    console.log('\n--- CREATIVE 2: Artisan Bistro (Centric Culinary Composition) ---');
    const canvas = createCanvasRepresentation(1080, 1080); // 1:1
    const width = 256;
    const height = 256;
    const raw = Buffer.alloc(width * height * 3).fill(210); // warm neutral

    for (let y = 100; y < 240; y++) {
      for (let x = 40; x < 216; x++) {
        const dx = x - 128;
        const dy = y - 170;
        if (dx * dx + dy * dy < 70 * 70) {
          const idx = (y * width + x) * 3;
          const val = ((x + y) * 11) % 255 < 120 ? 30 : 120;
          raw[idx] = val;
          raw[idx + 1] = val - 10;
          raw[idx + 2] = val - 20;
        }
      }
    }
    const imgBuf = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const field = createDesignField(await analyzeImageField(imgBuf));

    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'Artisan Bistro', tone: 'warm, rustic, artisanal' },
      creativeDna: { brandColors: ['#78350f', '#d97706', '#fef3c7'] }, // amber / warm wood tones
    });

    const headline = createDynamicCopyModel('h1', 'HANDCRAFTED SEASONAL TASTING MENU', 'primary-hook', 1);
    const h1States = exploreLineStructures({ copy: headline, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.75, height: 0.25 }, canvas });
    const primaryPlacements = discoverPlacementCandidates({ typographyState: h1States[0], field, canvas, maxCandidates: 3, refineContinuous: true });
    const discoveredAxes = discoverNaturalAxes({ field, canvas });
    const alignedCandidates = enhancePlacementCandidatesWithAlignment({ candidates: primaryPlacements, field, canvas, discoveredAxes });
    const topAlign = alignedCandidates[0];

    const h1Footprint = topAlign.rect;
    const localH1 = evaluateLocalColorField({ footprint: h1Footprint, field, canvas });
    console.log(`Local Image Color Field under Headline Footprint:`);
    console.log(`  - Mean Lum: ${(localH1.meanLuminance * 100).toFixed(1)}% | Variance: ${localH1.luminanceVariance.toFixed(3)} | Stability: ${(localH1.colorStability * 100).toFixed(0)}%`);
    console.log(`  - Temperature Index: ${localH1.temperature.toFixed(2)} (Warm Golden Tone)`);

    const headlineInks = discoverInkCandidates({ role: 'headline', footprint: h1Footprint, field, canvas, brand, typographyState: h1States[0] });
    console.log(`\nDiscovered ${headlineInks.length} Viable Ink Candidates for Headline:`);
    for (let i = 0; i < headlineInks.length; i++) {
      const ink = headlineInks[i];
      console.log(`  Candidate ${i + 1} [${ink.color.hex}] (${ink.provenance.derivationType}):`);
      console.log(`    - Provenance: source=${ink.provenance.sourceColor} | transformation="${ink.provenance.transformation.description}"`);
      console.log(`    - Brand Distance: ΔE_OK=${ink.provenance.deltaEOklab} (dL=${ink.provenance.lightnessDistance}, dC=${ink.provenance.chromaDistance}, dH=${ink.provenance.hueDistance}°)`);
      console.log(`    - Oklch: L=${ink.color.oklch.L.toFixed(3)}, C=${ink.color.oklch.C.toFixed(3)}, h=${ink.color.oklch.h.toFixed(1)}° | Temp=${ink.color.temperature.toFixed(2)} | Chroma=${ink.color.oklch.C.toFixed(3)}`);
      console.log(`    - Contrast: WCAG=${ink.contrast.wcagRatio}:1 | APCA Lc estimate=${ink.contrast.apcaEstimatedLc} | LightnessDelta=${ink.contrast.oklabLightnessDelta.toFixed(3)}`);
      console.log(`    - Signals: OpticalDensity=${ink.signals.opticalDensityScore} | HierarchySuitability=${ink.signals.hierarchySuitabilityScore} | ImageHarmony=${ink.signals.imageHarmonyScore}`);
      console.log(`    - Tradeoff Profile: contrast=${ink.signals.tradeoffProfile.contrastQuality} | brandAdherence=${ink.signals.tradeoffProfile.brandAdherence} | harmony=${ink.signals.tradeoffProfile.harmonyQuality} | optical=${ink.signals.tradeoffProfile.opticalSuitability}`);
      console.log(`    - Scores: Composite=${ink.scores.compositeColorScore} | Legibility=${ink.scores.legibilityScore} | Harmony=${ink.scores.harmonyScore}`);
    }
  }

  // CREATIVE 3: NovaTech Horizon (16:9 Landscape, Dark Minimal Architecture)
  {
    console.log('\n--- CREATIVE 3: NovaTech Horizon (Panoramic 16:9 Landscape) ---');
    const canvas = createCanvasRepresentation(1920, 1080); // 16:9
    const width = 256;
    const height = 256;
    const raw = Buffer.alloc(width * height * 3).fill(25); // dark canvas

    for (let y = 60; y < 240; y++) {
      for (let x = 140; x < 245; x++) {
        const idx = (y * width + x) * 3;
        const val = ((x * 3 + y * 5) % 255 < 100) ? 190 : 230;
        raw[idx] = val;
        raw[idx + 1] = val;
        raw[idx + 2] = val;
      }
    }
    const imgBuf = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const field = createDesignField(await analyzeImageField(imgBuf));

    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'NovaTech', tone: 'futuristic, dark, high-contrast' },
      creativeDna: { brandColors: ['#0284c7', '#06b6d4', '#e0f2fe'] }, // cyber cyan / electric blue
    });

    const headline = createDynamicCopyModel('h1', 'ARCHITECTING THE NEXT CLOUD REVOLUTION', 'primary-hook', 1);
    const h1States = exploreLineStructures({ copy: headline, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.55, height: 0.35 }, canvas });
    const primaryPlacements = discoverPlacementCandidates({ typographyState: h1States[0], field, canvas, maxCandidates: 3, refineContinuous: true });
    const discoveredAxes = discoverNaturalAxes({ field, canvas });
    const alignedCandidates = enhancePlacementCandidatesWithAlignment({ candidates: primaryPlacements, field, canvas, discoveredAxes });
    const topAlign = alignedCandidates[0];

    const h1Footprint = topAlign.rect;
    const localH1 = evaluateLocalColorField({ footprint: h1Footprint, field, canvas });
    console.log(`Local Image Color Field under Headline Footprint:`);
    console.log(`  - Mean Lum: ${(localH1.meanLuminance * 100).toFixed(1)}% | Variance: ${localH1.luminanceVariance.toFixed(3)} | Stability: ${(localH1.colorStability * 100).toFixed(0)}%`);
    console.log(`  - Temperature Index: ${localH1.temperature.toFixed(2)} (Cool Dark Matrix)`);

    const headlineInks = discoverInkCandidates({ role: 'headline', footprint: h1Footprint, field, canvas, brand, typographyState: h1States[0] });
    console.log(`\nDiscovered ${headlineInks.length} Viable Ink Candidates for Headline:`);
    for (let i = 0; i < headlineInks.length; i++) {
      const ink = headlineInks[i];
      console.log(`  Candidate ${i + 1} [${ink.color.hex}] (${ink.provenance.derivationType}):`);
      console.log(`    - Provenance: source=${ink.provenance.sourceColor} | transformation="${ink.provenance.transformation.description}"`);
      console.log(`    - Brand Distance: ΔE_OK=${ink.provenance.deltaEOklab} (dL=${ink.provenance.lightnessDistance}, dC=${ink.provenance.chromaDistance}, dH=${ink.provenance.hueDistance}°)`);
      console.log(`    - Oklch: L=${ink.color.oklch.L.toFixed(3)}, C=${ink.color.oklch.C.toFixed(3)}, h=${ink.color.oklch.h.toFixed(1)}° | Temp=${ink.color.temperature.toFixed(2)} | Chroma=${ink.color.oklch.C.toFixed(3)}`);
      console.log(`    - Contrast: WCAG=${ink.contrast.wcagRatio}:1 | APCA Lc estimate=${ink.contrast.apcaEstimatedLc} | LightnessDelta=${ink.contrast.oklabLightnessDelta.toFixed(3)}`);
      console.log(`    - Signals: OpticalDensity=${ink.signals.opticalDensityScore} | HierarchySuitability=${ink.signals.hierarchySuitabilityScore} | ImageHarmony=${ink.signals.imageHarmonyScore}`);
      console.log(`    - Tradeoff Profile: contrast=${ink.signals.tradeoffProfile.contrastQuality} | brandAdherence=${ink.signals.tradeoffProfile.brandAdherence} | harmony=${ink.signals.tradeoffProfile.harmonyQuality} | optical=${ink.signals.tradeoffProfile.opticalSuitability}`);
      console.log(`    - Scores: Composite=${ink.scores.compositeColorScore} | Legibility=${ink.scores.legibilityScore} | Harmony=${ink.scores.harmonyScore}`);
    }
  }
}

runCreativeValidation().catch(console.error);
