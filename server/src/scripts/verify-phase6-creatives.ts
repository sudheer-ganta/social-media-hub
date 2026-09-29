import { createCanvasRepresentation, createBrandDesignRepresentation, createDesignField } from '../ai/render/design-representation';
import { analyzeImageField } from '../ai/render/image-field';
import { createDynamicCopyModel } from '../ai/render/copy-model';
import { exploreLineStructures } from '../ai/typography/dynamic-line-structure';
import { discoverPlacementCandidates } from '../ai/render/dynamic-placement';
import {
  discoverNaturalAxes,
  enhancePlacementCandidatesWithAlignment,
} from '../ai/render/dynamic-alignment';
import sharp from 'sharp';

async function runCreativeValidation() {
  console.log('================================================================');
  console.log('PHASE 6 — DYNAMIC ALIGNMENT ENGINE REAL CREATIVE VALIDATION');
  console.log('================================================================\n');

  // CREATIVE 1: Lumina Audio (Asymmetrical Studio Shot, Subject on Left x: 0.05..0.45)
  {
    console.log('--- CREATIVE 1: Lumina Audio (Editorial Audio Brand) ---');
    const canvas = createCanvasRepresentation(1200, 1500); // 4:5
    const width = 256;
    const height = 256;
    const raw = Buffer.alloc(width * height * 3).fill(240); // smooth background

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

    const headline = createDynamicCopyModel('h1', 'IMMERSIVE SPATIAL AUDIO', 'primary-hook', 1);
    const lineStates = exploreLineStructures({
      copy: headline,
      font: 'Inter',
      weight: 700,
      spatialBox: { x: 0, y: 0, width: 0.8, height: 0.35 },
      canvas,
    });
    const topTypo = lineStates[0];

    const discoveredAxes = discoverNaturalAxes({ field, canvas });
    console.log(`Discovered Natural Axes (${discoveredAxes.length} total):`);
    for (const a of discoveredAxes.slice(0, 5)) {
      console.log(`  - [${a.orientation.toUpperCase()}] pos: ${(a.position * 100).toFixed(1)}% | strength: ${a.strength.toFixed(2)} | ${a.description}`);
    }

    const placements = discoverPlacementCandidates({
      typographyState: topTypo,
      field,
      canvas,
      maxCandidates: 4,
      refineContinuous: true,
    });

    const enhanced = enhancePlacementCandidatesWithAlignment({
      candidates: placements,
      field,
      canvas,
      discoveredAxes,
    });

    console.log('\nDiscovered Alignment & Candidate States:');
    for (let i = 0; i < enhanced.length; i++) {
      const c = enhanced[i];
      console.log(`  Candidate ${i + 1}:`);
      console.log(`    - Placement Rect: x=${c.rect.x.toFixed(3)}, y=${c.rect.y.toFixed(3)}, w=${c.rect.width.toFixed(3)}, h=${c.rect.height.toFixed(3)}`);
      console.log(`    - Continuous Bounds: left=${c.geometry.left.toFixed(3)}, right=${c.geometry.right.toFixed(3)}, center=${c.geometry.centerX.toFixed(3)}`);
      console.log(`    - Alignment Scores: Composite=${c.alignmentScores.compositeAlignmentScore} | Axis=${c.alignmentScores.axisAlignmentScore} | Harmony=${c.alignmentScores.multiElementHarmonyScore} | Optical=${c.alignmentScores.opticalStabilityScore}`);
      console.log(`    - Nearest Natural Axis Dist: Vertical=${c.alignmentSignals.nearestVerticalAxisDistance.toFixed(3)}, Horizontal=${c.alignmentSignals.nearestHorizontalAxisDistance.toFixed(3)}`);
      console.log(`    - Signals: AxisCoherence=${(c.alignmentSignals.axisCoherence * 100).toFixed(0)}% | ElementRel=${(c.alignmentSignals.elementRelationshipCoherence * 100).toFixed(0)}% | OpticalQual=${(c.alignmentSignals.opticalAlignmentQuality * 100).toFixed(0)}%`);
      if (c.alignmentReasons.length > 0) {
        console.log(`    - Alignment Reasons: ${c.alignmentReasons.slice(0, 2).join('; ')}`);
      }
    }
  }

  // CREATIVE 2: Artisan Bistro / Food (Center-Bottom Dish, Quiet Top Region)
  {
    console.log('\n--- CREATIVE 2: Artisan Bistro (Centric Culinary Composition) ---');
    const canvas = createCanvasRepresentation(1080, 1080); // 1:1
    const width = 256;
    const height = 256;
    const raw = Buffer.alloc(width * height * 3).fill(210); // Warm neutral background

    // Circular culinary plate centered at x: 0.5, y: 0.65
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

    const headline = createDynamicCopyModel('h1', 'HANDCRAFTED SEASONAL TASTING MENU', 'primary-hook', 1);
    const lineStates = exploreLineStructures({
      copy: headline,
      font: 'Inter',
      weight: 700,
      spatialBox: { x: 0, y: 0, width: 0.85, height: 0.35 },
      canvas,
    });
    const topTypo = lineStates[0];

    const discoveredAxes = discoverNaturalAxes({ field, canvas });
    console.log(`Discovered Natural Axes (${discoveredAxes.length} total):`);
    for (const a of discoveredAxes.slice(0, 5)) {
      console.log(`  - [${a.orientation.toUpperCase()}] pos: ${(a.position * 100).toFixed(1)}% | strength: ${a.strength.toFixed(2)} | ${a.description}`);
    }

    const placements = discoverPlacementCandidates({
      typographyState: topTypo,
      field,
      canvas,
      maxCandidates: 4,
      refineContinuous: true,
    });

    const enhanced = enhancePlacementCandidatesWithAlignment({
      candidates: placements,
      field,
      canvas,
      discoveredAxes,
    });

    console.log('\nDiscovered Alignment & Candidate States:');
    for (let i = 0; i < enhanced.length; i++) {
      const c = enhanced[i];
      console.log(`  Candidate ${i + 1}:`);
      console.log(`    - Placement Rect: x=${c.rect.x.toFixed(3)}, y=${c.rect.y.toFixed(3)}, w=${c.rect.width.toFixed(3)}, h=${c.rect.height.toFixed(3)}`);
      console.log(`    - Continuous Bounds: left=${c.geometry.left.toFixed(3)}, right=${c.geometry.right.toFixed(3)}, center=${c.geometry.centerX.toFixed(3)}`);
      console.log(`    - Alignment Scores: Composite=${c.alignmentScores.compositeAlignmentScore} | Axis=${c.alignmentScores.axisAlignmentScore} | Harmony=${c.alignmentScores.multiElementHarmonyScore} | Optical=${c.alignmentScores.opticalStabilityScore}`);
      console.log(`    - Nearest Natural Axis Dist: Vertical=${c.alignmentSignals.nearestVerticalAxisDistance.toFixed(3)}, Horizontal=${c.alignmentSignals.nearestHorizontalAxisDistance.toFixed(3)}`);
      console.log(`    - Signals: AxisCoherence=${(c.alignmentSignals.axisCoherence * 100).toFixed(0)}% | ElementRel=${(c.alignmentSignals.elementRelationshipCoherence * 100).toFixed(0)}% | OpticalQual=${(c.alignmentSignals.opticalAlignmentQuality * 100).toFixed(0)}%`);
      if (c.alignmentReasons.length > 0) {
        console.log(`    - Alignment Reasons: ${c.alignmentReasons.slice(0, 2).join('; ')}`);
      }
    }
  }

  // CREATIVE 3: NovaTech Horizon (Panoramic / Landscape 16:9, Diagonal Structural Horizon)
  {
    console.log('\n--- CREATIVE 3: NovaTech Horizon (Panoramic 16:9 Landscape) ---');
    const canvas = createCanvasRepresentation(1920, 1080); // 16:9
    const width = 256;
    const height = 256;
    const raw = Buffer.alloc(width * height * 3).fill(25); // Sleek dark canvas

    // Horizon with architectural element on right half
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

    const headline = createDynamicCopyModel('h1', 'ARCHITECTING THE NEXT CLOUD REVOLUTION', 'primary-hook', 1);
    const lineStates = exploreLineStructures({
      copy: headline,
      font: 'Inter',
      weight: 700,
      spatialBox: { x: 0, y: 0, width: 0.6, height: 0.4 },
      canvas,
    });
    const topTypo = lineStates[0];

    const discoveredAxes = discoverNaturalAxes({ field, canvas });
    console.log(`Discovered Natural Axes (${discoveredAxes.length} total):`);
    for (const a of discoveredAxes.slice(0, 5)) {
      console.log(`  - [${a.orientation.toUpperCase()}] pos: ${(a.position * 100).toFixed(1)}% | strength: ${a.strength.toFixed(2)} | ${a.description}`);
    }

    const placements = discoverPlacementCandidates({
      typographyState: topTypo,
      field,
      canvas,
      maxCandidates: 4,
      refineContinuous: true,
    });

    const enhanced = enhancePlacementCandidatesWithAlignment({
      candidates: placements,
      field,
      canvas,
      discoveredAxes,
    });

    console.log('\nDiscovered Alignment & Candidate States:');
    for (let i = 0; i < enhanced.length; i++) {
      const c = enhanced[i];
      console.log(`  Candidate ${i + 1}:`);
      console.log(`    - Placement Rect: x=${c.rect.x.toFixed(3)}, y=${c.rect.y.toFixed(3)}, w=${c.rect.width.toFixed(3)}, h=${c.rect.height.toFixed(3)}`);
      console.log(`    - Continuous Bounds: left=${c.geometry.left.toFixed(3)}, right=${c.geometry.right.toFixed(3)}, center=${c.geometry.centerX.toFixed(3)}`);
      console.log(`    - Alignment Scores: Composite=${c.alignmentScores.compositeAlignmentScore} | Axis=${c.alignmentScores.axisAlignmentScore} | Harmony=${c.alignmentScores.multiElementHarmonyScore} | Optical=${c.alignmentScores.opticalStabilityScore}`);
      console.log(`    - Nearest Natural Axis Dist: Vertical=${c.alignmentSignals.nearestVerticalAxisDistance.toFixed(3)}, Horizontal=${c.alignmentSignals.nearestHorizontalAxisDistance.toFixed(3)}`);
      console.log(`    - Signals: AxisCoherence=${(c.alignmentSignals.axisCoherence * 100).toFixed(0)}% | ElementRel=${(c.alignmentSignals.elementRelationshipCoherence * 100).toFixed(0)}% | OpticalQual=${(c.alignmentSignals.opticalAlignmentQuality * 100).toFixed(0)}%`);
      if (c.alignmentReasons.length > 0) {
        console.log(`    - Alignment Reasons: ${c.alignmentReasons.slice(0, 2).join('; ')}`);
      }
    }
  }
}

runCreativeValidation().catch(console.error);
