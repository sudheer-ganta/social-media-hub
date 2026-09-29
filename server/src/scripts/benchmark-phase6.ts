import { createCanvasRepresentation, createDesignField } from '../ai/render/design-representation';
import { analyzeImageField } from '../ai/render/image-field';
import { createDynamicCopyModel } from '../ai/render/copy-model';
import { exploreLineStructures } from '../ai/typography/dynamic-line-structure';
import { discoverPlacementCandidates, discoverMultiElementPlacements } from '../ai/render/dynamic-placement';
import {
  discoverNaturalAxes,
  evaluateCandidateAlignment,
  enhancePlacementCandidatesWithAlignment,
} from '../ai/render/dynamic-alignment';
import sharp from 'sharp';

async function benchmark() {
  const canvas = createCanvasRepresentation(1200, 1500);

  // Synthetic image with subject
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

  const placements = discoverPlacementCandidates({
    typographyState: topState,
    field,
    canvas,
    maxCandidates: 8,
  });

  const discoveredAxes = discoverNaturalAxes({ field, canvas });

  // 1. Single alignment evaluation
  const tSingle0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    evaluateCandidateAlignment({
      candidate: placements[0],
      field,
      canvas,
      discoveredAxes,
    });
  }
  const tSingle1 = performance.now();

  // 2. 100 & 1,000 alignment evaluations
  const t100_0 = performance.now();
  for (let i = 0; i < 100; i++) {
    evaluateCandidateAlignment({
      candidate: placements[i % placements.length],
      field,
      canvas,
      discoveredAxes,
    });
  }
  const t100_1 = performance.now();

  const t1000_0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    evaluateCandidateAlignment({
      candidate: placements[i % placements.length],
      field,
      canvas,
      discoveredAxes,
    });
  }
  const t1000_1 = performance.now();

  // 3. Placement + Alignment Combined
  const tComb0 = performance.now();
  let enhanced: any[] = [];
  for (let i = 0; i < 50; i++) {
    const pl = discoverPlacementCandidates({
      typographyState: topState,
      field,
      canvas,
      maxCandidates: 6,
    });
    enhanced = enhancePlacementCandidatesWithAlignment({
      candidates: pl,
      field,
      canvas,
    });
  }
  const tComb1 = performance.now();

  console.log('=== Phase 6 Dynamic Alignment Engine Benchmark ===');
  console.log(`Discovered Natural Axes (${discoveredAxes.length} axes):`);
  for (const a of discoveredAxes.slice(0, 4)) {
    console.log(`  - [${a.orientation.toUpperCase()}] pos: ${a.position} | strength: ${a.strength} | ${a.description}`);
  }
  console.log(`Single Alignment Evaluation (1,000 calls): ${((tSingle1 - tSingle0) / 1000 * 1000).toFixed(2)} µs / call`);
  console.log(`100 Alignment Evaluations: ${(t100_1 - t100_0).toFixed(3)} ms (${((t100_1 - t100_0) / 100 * 1000).toFixed(2)} µs / eval)`);
  console.log(`1,000 Alignment Evaluations: ${(t1000_1 - t1000_0).toFixed(3)} ms (${((t1000_1 - t1000_0) / 1000 * 1000).toFixed(2)} µs / eval)`);
  console.log(`Combined Placement + Alignment Pipeline (50 runs): ${((tComb1 - tComb0) / 50).toFixed(3)} ms / cycle`);
  console.log(`Evaluated ${enhanced.length} enhanced candidate states:`);
  for (const c of enhanced.slice(0, 3)) {
    console.log(`  - [x: ${c.rect.x.toFixed(3)}, y: ${c.rect.y.toFixed(3)}] alignScore: ${c.alignmentScores.compositeAlignmentScore} | axisCoherence: ${(c.alignmentSignals.axisCoherence * 100).toFixed(0)}% | nearestV: ${c.alignmentSignals.nearestVerticalAxisDistance}`);
  }
}

benchmark().catch(console.error);
