import { createCanvasRepresentation, createBrandDesignRepresentation, createDesignField } from '../ai/render/design-representation';
import { analyzeImageField } from '../ai/render/image-field';
import { createDynamicCopyModel } from '../ai/render/copy-model';
import { exploreLineStructures } from '../ai/typography/dynamic-line-structure';
import { discoverPlacementCandidates } from '../ai/render/dynamic-placement';
import {
  discoverNaturalAxes,
  enhancePlacementCandidatesWithAlignment,
} from '../ai/render/dynamic-alignment';
import {
  evaluateCompositionSpacing,
  enhanceMultiElementCompositionWithSpacing,
  SpacingElement,
} from '../ai/render/dynamic-spacing';
import sharp from 'sharp';

async function runCreativeValidation() {
  console.log('================================================================');
  console.log('PHASE 7 — DYNAMIC SPACING & GROUPING ENGINE REAL CREATIVE VALIDATION');
  console.log('================================================================\n');

  // CREATIVE 1: Lumina Audio (4:5 Studio Shot, Subject on Left x: 0.05..0.45)
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
    const subheadline = createDynamicCopyModel('sub', 'Studio-Grade Acoustic Precision', 'secondary-hook', 2);
    const cta = createDynamicCopyModel('cta', 'EXPLORE NOW', 'cta', 3);

    const h1States = exploreLineStructures({ copy: headline, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.7, height: 0.3 }, canvas });
    const subStates = exploreLineStructures({ copy: subheadline, font: 'Inter', weight: 400, spatialBox: { x: 0, y: 0, width: 0.6, height: 0.15 }, canvas });
    const ctaStates = exploreLineStructures({ copy: cta, font: 'Inter', weight: 600, spatialBox: { x: 0, y: 0, width: 0.35, height: 0.1 }, canvas });

    const primaryPlacements = discoverPlacementCandidates({
      typographyState: h1States[0],
      field,
      canvas,
      maxCandidates: 3,
      refineContinuous: true,
    });

    const discoveredAxes = discoverNaturalAxes({ field, canvas });
    const alignedCandidates = enhancePlacementCandidatesWithAlignment({
      candidates: primaryPlacements,
      field,
      canvas,
      discoveredAxes,
    });

    // Evaluate Spacing & Grouping Composition
    const topAlign = alignedCandidates[0];
    const subPlacement = {
      rect: { x: topAlign.rect.x, y: Number((topAlign.rect.y + topAlign.rect.height + 0.035).toFixed(3)), width: subStates[0].boundingBox.widthNormalized, height: 0.055 },
    };
    const ctaPlacement = {
      rect: { x: topAlign.rect.x, y: Number((subPlacement.rect.y + subPlacement.rect.height + 0.045).toFixed(3)), width: ctaStates[0].boundingBox.widthNormalized, height: 0.065 },
    };

    const composition = enhanceMultiElementCompositionWithSpacing({
      primaryPlacement: topAlign,
      secondaryPlacements: [
        { role: 'subheadline', candidate: subPlacement as any },
        { role: 'cta', candidate: ctaPlacement as any },
      ],
      field,
      canvas,
    });

    console.log(`Discovered ${composition.graph.discoveredGroups.length} Natural Group(s):`);
    for (const g of composition.graph.discoveredGroups) {
      console.log(`  - Group [${g.groupId}]: elements=[${g.elementIds.join(', ')}] | theme=${g.semanticTheme} | coherence=${(g.internalGroupingCoherence * 100).toFixed(0)}%`);
    }
    console.log(`Composition Spacing Scores:`);
    console.log(`  - Composite Spacing Score: ${composition.scores.compositeSpacingScore}`);
    console.log(`  - Semantic Spacing: ${composition.scores.semanticSpacingScore} | Gestalt Harmony: ${composition.scores.gestaltHarmonyScore} | Whitespace: ${composition.scores.whitespaceUtilizationScore}`);
    console.log(`Pairwise Spatial Relationships:`);
    for (const edge of composition.graph.edges) {
      console.log(`  - [${edge.roleA} ↔ ${edge.roleB}]: vertGap=${edge.verticalGap.toFixed(3)} | edgeDist=${edge.edgeDistance.toFixed(3)} | quietness=${(edge.localFieldQuietness * 100).toFixed(0)}% | affinity=${(edge.groupingAffinity * 100).toFixed(0)}%`);
    }
  }

  // CREATIVE 2: Artisan Bistro (1:1 Square Canvas, Centered Dish)
  {
    console.log('\n--- CREATIVE 2: Artisan Bistro (Centric Culinary Composition) ---');
    const canvas = createCanvasRepresentation(1080, 1080); // 1:1
    const width = 256;
    const height = 256;
    const raw = Buffer.alloc(width * height * 3).fill(210);

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
    const subheadline = createDynamicCopyModel('sub', 'Five Courses of Autumn Flavors', 'secondary-hook', 2);

    const h1States = exploreLineStructures({ copy: headline, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.75, height: 0.25 }, canvas });
    const subStates = exploreLineStructures({ copy: subheadline, font: 'Inter', weight: 400, spatialBox: { x: 0, y: 0, width: 0.6, height: 0.1 }, canvas });

    const primaryPlacements = discoverPlacementCandidates({
      typographyState: h1States[0],
      field,
      canvas,
      maxCandidates: 3,
      refineContinuous: true,
    });

    const discoveredAxes = discoverNaturalAxes({ field, canvas });
    const alignedCandidates = enhancePlacementCandidatesWithAlignment({
      candidates: primaryPlacements,
      field,
      canvas,
      discoveredAxes,
    });

    const topAlign = alignedCandidates[0];
    const subPlacement = {
      rect: { x: topAlign.rect.x, y: Number((topAlign.rect.y + topAlign.rect.height + 0.03).toFixed(3)), width: subStates[0].boundingBox.widthNormalized, height: 0.05 },
    };

    const composition = enhanceMultiElementCompositionWithSpacing({
      primaryPlacement: topAlign,
      secondaryPlacements: [
        { role: 'subheadline', candidate: subPlacement as any },
      ],
      field,
      canvas,
    });

    console.log(`Discovered ${composition.graph.discoveredGroups.length} Natural Group(s):`);
    for (const g of composition.graph.discoveredGroups) {
      console.log(`  - Group [${g.groupId}]: elements=[${g.elementIds.join(', ')}] | theme=${g.semanticTheme} | coherence=${(g.internalGroupingCoherence * 100).toFixed(0)}%`);
    }
    console.log(`Composition Spacing Scores:`);
    console.log(`  - Composite Spacing Score: ${composition.scores.compositeSpacingScore}`);
    console.log(`  - Semantic Spacing: ${composition.scores.semanticSpacingScore} | Gestalt Harmony: ${composition.scores.gestaltHarmonyScore} | Whitespace: ${composition.scores.whitespaceUtilizationScore}`);
    console.log(`Pairwise Spatial Relationships:`);
    for (const edge of composition.graph.edges) {
      console.log(`  - [${edge.roleA} ↔ ${edge.roleB}]: vertGap=${edge.verticalGap.toFixed(3)} | edgeDist=${edge.edgeDistance.toFixed(3)} | quietness=${(edge.localFieldQuietness * 100).toFixed(0)}% | affinity=${(edge.groupingAffinity * 100).toFixed(0)}%`);
    }
  }

  // CREATIVE 3: NovaTech Horizon (16:9 Landscape)
  {
    console.log('\n--- CREATIVE 3: NovaTech Horizon (Panoramic 16:9 Landscape) ---');
    const canvas = createCanvasRepresentation(1920, 1080); // 16:9
    const width = 256;
    const height = 256;
    const raw = Buffer.alloc(width * height * 3).fill(25);

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
    const cta = createDynamicCopyModel('cta', 'READ WHITE PAPER', 'cta', 2);

    const h1States = exploreLineStructures({ copy: headline, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.55, height: 0.35 }, canvas });
    const ctaStates = exploreLineStructures({ copy: cta, font: 'Inter', weight: 600, spatialBox: { x: 0, y: 0, width: 0.35, height: 0.1 }, canvas });

    const primaryPlacements = discoverPlacementCandidates({
      typographyState: h1States[0],
      field,
      canvas,
      maxCandidates: 3,
      refineContinuous: true,
    });

    const discoveredAxes = discoverNaturalAxes({ field, canvas });
    const alignedCandidates = enhancePlacementCandidatesWithAlignment({
      candidates: primaryPlacements,
      field,
      canvas,
      discoveredAxes,
    });

    const topAlign = alignedCandidates[0];
    const ctaPlacement = {
      rect: { x: topAlign.rect.x, y: Number((topAlign.rect.y + topAlign.rect.height + 0.05).toFixed(3)), width: ctaStates[0].boundingBox.widthNormalized, height: 0.07 },
    };

    const composition = enhanceMultiElementCompositionWithSpacing({
      primaryPlacement: topAlign,
      secondaryPlacements: [
        { role: 'cta', candidate: ctaPlacement as any },
      ],
      field,
      canvas,
    });

    console.log(`Discovered ${composition.graph.discoveredGroups.length} Natural Group(s):`);
    for (const g of composition.graph.discoveredGroups) {
      console.log(`  - Group [${g.groupId}]: elements=[${g.elementIds.join(', ')}] | theme=${g.semanticTheme} | coherence=${(g.internalGroupingCoherence * 100).toFixed(0)}%`);
    }
    console.log(`Composition Spacing Scores:`);
    console.log(`  - Composite Spacing Score: ${composition.scores.compositeSpacingScore}`);
    console.log(`  - Semantic Spacing: ${composition.scores.semanticSpacingScore} | Gestalt Harmony: ${composition.scores.gestaltHarmonyScore} | Whitespace: ${composition.scores.whitespaceUtilizationScore}`);
    console.log(`Pairwise Spatial Relationships:`);
    for (const edge of composition.graph.edges) {
      console.log(`  - [${edge.roleA} ↔ ${edge.roleB}]: vertGap=${edge.verticalGap.toFixed(3)} | edgeDist=${edge.edgeDistance.toFixed(3)} | quietness=${(edge.localFieldQuietness * 100).toFixed(0)}% | affinity=${(edge.groupingAffinity * 100).toFixed(0)}%`);
    }
  }
}

runCreativeValidation().catch(console.error);
