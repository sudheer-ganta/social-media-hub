import { createCanvasRepresentation, createDesignField } from '../ai/render/design-representation';
import { analyzeImageField } from '../ai/render/image-field';
import { createDynamicCopyModel } from '../ai/render/copy-model';
import { exploreLineStructures } from '../ai/typography/dynamic-line-structure';
import {
  evaluatePlacementRegion,
  discoverPlacementCandidates,
  discoverMultiElementPlacements,
} from '../ai/render/dynamic-placement';
import sharp from 'sharp';

async function benchmark() {
  const canvas = createCanvasRepresentation(1200, 1500);

  // Create synthetic 256x256 image with realistic subject
  const raw = Buffer.alloc(256 * 256 * 3).fill(220);
  for (let y = 50; y < 200; y++) {
    for (let x = 30; x < 120; x++) {
      const idx = (y * 256 + x) * 3;
      const val = (x + y) % 3 === 0 ? 40 : 160;
      raw[idx] = val;
      raw[idx + 1] = val;
      raw[idx + 2] = val;
    }
  }
  const imgBuf = await sharp(raw, { raw: { width: 256, height: 256, channels: 3 } }).png().toBuffer();
  const field = createDesignField(await analyzeImageField(imgBuf));

  const copy = createDynamicCopyModel('h1', 'THE NEW ARTISANAL BREW COLLECTION', 'primary-hook', 1);
  const lineStates = exploreLineStructures({ copy, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.8, height: 0.4 }, canvas });
  const topState = lineStates[0];

  // 1. Single placement evaluation
  const testRect = { x: 0.1, y: 0.1, width: topState.boundingBox.widthNormalized, height: topState.boundingBox.heightNormalized };
  const tSingle0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    evaluatePlacementRegion({ rect: testRect, field, canvas });
  }
  const tSingle1 = performance.now();

  // 2. 100 & 1,000 evaluations
  const t100_0 = performance.now();
  for (let i = 0; i < 100; i++) {
    evaluatePlacementRegion({ rect: { x: 0.05 + (i % 10) * 0.08, y: 0.05 + Math.floor(i / 10) * 0.08, width: 0.5, height: 0.15 }, field, canvas });
  }
  const t100_1 = performance.now();

  const t1000_0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    evaluatePlacementRegion({ rect: { x: 0.05 + (i % 20) * 0.04, y: 0.05 + (i % 20) * 0.04, width: 0.5, height: 0.15 }, field, canvas });
  }
  const t1000_1 = performance.now();

  // 3. Complete Continuous Placement Discovery (sampling + evaluation + refinement + diversity filtering)
  const tDisc0 = performance.now();
  let candidates: any[] = [];
  for (let i = 0; i < 50; i++) {
    candidates = discoverPlacementCandidates({
      typographyState: topState,
      field,
      canvas,
      maxCandidates: 6,
      refineContinuous: true,
    });
  }
  const tDisc1 = performance.now();

  // 4. Multi-element placement
  const subCopy = createDynamicCopyModel('sub', 'Single origin beans roasted in small batches', 'secondary-hook', 2);
  const subStates = exploreLineStructures({ copy: subCopy, font: 'Inter', weight: 400, spatialBox: { x: 0, y: 0, width: 0.6, height: 0.2 }, canvas });

  const tMulti0 = performance.now();
  let multiComps: any[] = [];
  for (let i = 0; i < 50; i++) {
    multiComps = discoverMultiElementPlacements({
      primaryState: topState,
      secondaryStates: [subStates[0]],
      field,
      canvas,
    });
  }
  const tMulti1 = performance.now();

  console.log('=== Phase 5 Dynamic Placement Engine Benchmark ===');
  console.log(`Single Placement Region Evaluation (1,000 calls): ${((tSingle1 - tSingle0) / 1000 * 1000).toFixed(2)} µs / call`);
  console.log(`100 Candidate Evaluations: ${(t100_1 - t100_0).toFixed(3)} ms (${((t100_1 - t100_0) / 100 * 1000).toFixed(2)} µs / eval)`);
  console.log(`1,000 Candidate Evaluations: ${(t1000_1 - t1000_0).toFixed(3)} ms (${((t1000_1 - t1000_0) / 1000 * 1000).toFixed(2)} µs / eval)`);
  console.log(`Full Continuous Placement Discovery (50 runs): ${((tDisc1 - tDisc0) / 50).toFixed(3)} ms / discovery`);
  console.log(`Multi-Element Composition Discovery (50 runs): ${((tMulti1 - tMulti0) / 50).toFixed(3)} ms / composition`);
  console.log(`Discovered ${candidates.length} diverse continuous placement candidates:`);
  for (const c of candidates) {
    console.log(`  - [x: ${c.rect.x.toFixed(3)}, y: ${c.rect.y.toFixed(3)} | ${c.pixelBounds.widthPx}x${c.pixelBounds.heightPx}px] score: ${c.scores.compositeScore} | quiet: ${(c.signals.quietness * 100).toFixed(0)}% | subjOverlap: ${c.signals.subjectOverlap.classification}`);
  }
}

benchmark().catch(console.error);
