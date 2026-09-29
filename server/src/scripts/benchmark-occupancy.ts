import sharp from 'sharp';
import { analyzeImageField } from '../ai/render/image-field';
import { createDesignField, createCanvasRepresentation } from '../ai/render/design-representation';
import { discoverPlacementCandidates, evaluatePlacementRegion } from '../ai/render/dynamic-placement';
import { createDynamicCopyModel } from '../ai/render/copy-model';
import { exploreLineStructures } from '../ai/typography/dynamic-line-structure';
import { performance } from 'perf_hooks';

async function main() {
  console.log('=== BENCHMARKING SPATIAL OCCUPANCY FIELD & PLACEMENT ENGINE ===\n');

  // Create a realistic 1080x1080 test image
  const width = 256;
  const height = 256;
  const buf = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      if (y > 80 && x > 40 && x < 200) {
        buf[idx] = (x * 7 + y * 13) % 200 + 40;
        buf[idx + 1] = (x * 11 + y * 17) % 180 + 30;
        buf[idx + 2] = (x * 5 + y * 23) % 220 + 20;
      } else {
        buf[idx] = 235;
        buf[idx + 1] = 230;
        buf[idx + 2] = 225;
      }
    }
  }
  const imgBuf = await sharp(buf, { raw: { width, height, channels: 3 } }).png().toBuffer();

  const t0 = performance.now();
  const rawField = await analyzeImageField(imgBuf);
  const tField = performance.now() - t0;
  console.log(`1. ImageField & Continuous Occupancy analysis: ${tField.toFixed(2)} ms`);

  const designField = createDesignField(rawField);
  const canvas = createCanvasRepresentation(1080, 1080);

  // 1 query
  const testRect = { x: 0.15, y: 0.20, width: 0.50, height: 0.12 };
  const t1_0 = performance.now();
  const res1 = designField.occupancyAt(testRect);
  const t1 = performance.now() - t1_0;
  console.log(`2. Single occupancy query: ${(t1 * 1000).toFixed(2)} µs (occupancy = ${res1.toFixed(3)})`);

  // 100 queries
  const t100_0 = performance.now();
  for (let i = 0; i < 100; i++) {
    const rx = (i % 10) * 0.08;
    const ry = Math.floor(i / 10) * 0.08;
    designField.occupancyAt({ x: rx, y: ry, width: 0.3, height: 0.1 });
  }
  const t100 = performance.now() - t100_0;
  console.log(`3. 100 occupancy queries (SAT O(1)): ${t100.toFixed(3)} ms (avg ${(t100 / 100 * 1000).toFixed(2)} µs/query)`);

  // 1000 queries
  const t1000_0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    const rx = (i % 30) * 0.03;
    const ry = (Math.floor(i / 30) % 30) * 0.03;
    designField.occupancyAt({ x: rx, y: ry, width: 0.3, height: 0.1 });
  }
  const t1000 = performance.now() - t1000_0;
  console.log(`4. 1,000 occupancy queries (SAT O(1)): ${t1000.toFixed(3)} ms (avg ${(t1000 / 1000 * 1000).toFixed(2)} µs/query)`);

  // 1,000 full evaluatePlacementRegion queries
  const tEval_0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    const rx = (i % 30) * 0.03;
    const ry = (Math.floor(i / 30) % 30) * 0.03;
    evaluatePlacementRegion({
      rect: { x: rx, y: ry, width: 0.3, height: 0.1 },
      field: designField,
      canvas,
    });
  }
  const tEval = performance.now() - tEval_0;
  console.log(`5. 1,000 full evaluatePlacementRegion calls: ${tEval.toFixed(3)} ms (avg ${(tEval / 1000).toFixed(3)} ms/eval)`);

  // Full candidate discovery
  const copy = createDynamicCopyModel('h1', 'ELEVATE YOUR ETHNIC STYLE', 'primary-hook', 1);
  const lineStates = exploreLineStructures({ copy, font: 'Outfit', weight: 700, spatialBox: { x: 0, y: 0, width: 0.8, height: 0.3 }, canvas });

  const tDisc_0 = performance.now();
  const candidates = discoverPlacementCandidates({
    typographyState: lineStates[0],
    field: designField,
    canvas,
    maxCandidates: 12,
  });
  const tDisc = performance.now() - tDisc_0;
  console.log(`6. Full placement candidate discovery: ${tDisc.toFixed(2)} ms (discovered ${candidates.length} scored candidates)`);
  console.log(`   Top candidate: x=${candidates[0].rect.x.toFixed(3)}, y=${candidates[0].rect.y.toFixed(3)}, compositeScore=${candidates[0].scores.compositeScore.toFixed(3)}, overlap=${candidates[0].signals.subjectOverlap.overlapRatio}`);
}

main().catch(console.error);
