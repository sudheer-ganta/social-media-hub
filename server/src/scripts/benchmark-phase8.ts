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
  enhanceMultiElementCompositionWithSpacing,
  SpacingElement,
} from '../ai/render/dynamic-spacing';
import {
  evaluateLocalColorField,
  discoverInkCandidates,
  evaluateCompositionColors,
  parseColor,
} from '../ai/render/dynamic-color';
import sharp from 'sharp';

async function benchmark() {
  const canvas = createCanvasRepresentation(1200, 1500);

  // Synthetic studio visual with rich textures
  const raw = Buffer.alloc(256 * 256 * 3).fill(220);
  for (let y = 50; y < 200; y++) {
    for (let x = 30; x < 120; x++) {
      const idx = (y * 256 + x) * 3;
      const val = (x + y) % 3 === 0 ? 35 : 175;
      raw[idx] = val;
      raw[idx + 1] = Math.max(10, val - 20);
      raw[idx + 2] = Math.min(255, val + 30);
    }
  }
  const imgBuf = await sharp(raw, { raw: { width: 256, height: 256, channels: 3 } }).png().toBuffer();
  const field = createDesignField(await analyzeImageField(imgBuf));

  const brand = createBrandDesignRepresentation({
    brandProfile: { name: 'Lumina Audio', tone: 'editorial, minimalist, premium' },
    creativeDna: { brandColors: ['#0f172a', '#38bdf8', '#f43f5e'] },
  });

  const copyH1 = createDynamicCopyModel('h1', 'THE NEW ARTISANAL BREW COLLECTION', 'primary-hook', 1);
  const lineStates = exploreLineStructures({ copy: copyH1, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.75, height: 0.35 }, canvas });
  const topState = lineStates[0];

  const primaryPlacements = discoverPlacementCandidates({
    typographyState: topState,
    field,
    canvas,
    maxCandidates: 4,
  });

  const discoveredAxes = discoverNaturalAxes({ field, canvas });
  const enhancedAlign = enhancePlacementCandidatesWithAlignment({
    candidates: primaryPlacements,
    field,
    canvas,
    discoveredAxes,
  });

  const footprint = enhancedAlign[0].rect;

  // 1. Single Local Color Field Evaluation (1,000 calls)
  const tLocal0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    evaluateLocalColorField({ footprint, field, canvas });
  }
  const tLocal1 = performance.now();

  // 2. Single Ink Candidate Evaluation (1,000 calls)
  const tInk0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    discoverInkCandidates({
      role: 'headline',
      footprint,
      field,
      canvas,
      brand,
      typographyState: topState,
    });
  }
  const tInk1 = performance.now();

  // 3. 100 & 1,000 Ink Candidate Discovery
  const t100_0 = performance.now();
  for (let i = 0; i < 100; i++) {
    discoverInkCandidates({
      role: 'headline',
      footprint,
      field,
      canvas,
      brand,
      typographyState: topState,
    });
  }
  const t100_1 = performance.now();

  const t1000_0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    discoverInkCandidates({
      role: 'headline',
      footprint,
      field,
      canvas,
      brand,
      typographyState: topState,
    });
  }
  const t1000_1 = performance.now();

  // 4. Complete Multi-Element Color Evaluation (100 runs)
  const elements = [
    { id: 'h1', role: 'headline' as const, rect: footprint, typographyState: topState },
    { id: 'sub', role: 'subheadline' as const, rect: { x: footprint.x, y: footprint.y + footprint.height + 0.04, width: 0.6, height: 0.05 } },
    { id: 'cta', role: 'cta' as const, rect: { x: footprint.x, y: footprint.y + footprint.height + 0.12, width: 0.35, height: 0.06 } },
  ];

  const tMulti0 = performance.now();
  let multiResult: any;
  for (let i = 0; i < 100; i++) {
    multiResult = evaluateCompositionColors({ elements, field, canvas, brand });
  }
  const tMulti1 = performance.now();

  // 5. Full Pipeline: Placement (5) + Alignment (6) + Spacing (7) + Color (8) (50 cycles)
  const tFull0 = performance.now();
  let fullPipelineResult: any;
  for (let i = 0; i < 50; i++) {
    const pl = discoverPlacementCandidates({ typographyState: topState, field, canvas, maxCandidates: 3 });
    const al = enhancePlacementCandidatesWithAlignment({ candidates: pl, field, canvas, discoveredAxes });
    const sp = enhanceMultiElementCompositionWithSpacing({
      primaryPlacement: al[0],
      secondaryPlacements: [
        { role: 'subheadline', candidate: { rect: elements[1].rect } as any },
        { role: 'cta', candidate: { rect: elements[2].rect } as any },
      ],
      field,
      canvas,
      brand,
    });
    fullPipelineResult = evaluateCompositionColors({ elements, field, canvas, brand });
  }
  const tFull1 = performance.now();

  console.log('=== Phase 8 Dynamic Color & Contrast Engine Benchmark ===');
  console.log(`Single Local Color Field Evaluation (1,000 calls): ${(((tLocal1 - tLocal0) / 1000) * 1000).toFixed(2)} µs / call`);
  console.log(`Single Ink Discovery (1,000 calls): ${(((tInk1 - tInk0) / 1000) * 1000).toFixed(2)} µs / call`);
  console.log(`100 Ink Discoveries: ${(t100_1 - t100_0).toFixed(3)} ms (${(((t100_1 - t100_0) / 100) * 1000).toFixed(2)} µs / call)`);
  console.log(`1,000 Ink Discoveries: ${(t1000_1 - t1000_0).toFixed(3)} ms (${(((t1000_1 - t1000_0) / 1000) * 1000).toFixed(2)} µs / call)`);
  console.log(`Multi-Element Color Evaluation (3 elements): ${((tMulti1 - tMulti0) / 100).toFixed(3)} ms / eval`);
  console.log(`Full Pipeline (Placement + Alignment + Spacing + Color, 50 runs): ${((tFull1 - tFull0) / 50).toFixed(3)} ms / cycle`);
  console.log('\nDiscovered Top Ink Candidates for Headline:');
  const headlineInks = multiResult.elementColors[0].candidates;
  for (const ink of headlineInks.slice(0, 3)) {
    console.log(`  - [${ink.color.hex}] type: ${ink.provenance.derivationType} | WCAG: ${ink.contrast.wcagRatio}:1 (APCA: ${ink.contrast.apcaEstimatedLc}) | composite: ${ink.scores.compositeColorScore} | ΔE_OK: ${ink.provenance.deltaEOklab}`);
  }
}

benchmark().catch(console.error);
