import { createCanvasRepresentation } from '../ai/render/design-representation';
import { createDynamicCopyModel } from '../ai/render/copy-model';
import { exploreLineStructures } from '../ai/typography/dynamic-line-structure';
import { measureText, measureMultiLineBlock } from '../ai/typography/font-metrics.service';

async function benchmark() {
  const canvas = createCanvasRepresentation(1200, 1500);
  const headlineCopy = createDynamicCopyModel(
    'h1',
    'DISCOVER THE NEW ARTISANAL BREW COLLECTION',
    'primary-hook',
    1
  );

  const spatialBox = { widthPx: 800, heightPx: 350 };

  // 1. Single text measurement (1,000 iterations)
  const tSingle0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    measureText({ family: 'Inter', weight: 700, text: 'DISCOVER THE NEW ARTISANAL BREW', fontSize: 52 });
  }
  const tSingle1 = performance.now();

  // 2. Multi-line block measurement (1,000 iterations)
  const tMulti0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    measureMultiLineBlock({
      family: 'Inter',
      weight: 700,
      lines: ['DISCOVER THE NEW', 'ARTISANAL BREW', 'COLLECTION'],
      fontSize: 48,
    });
  }
  const tMulti1 = performance.now();

  // 3. Complete Line Structure Exploration with multi-hypothesis binary search fit
  const tExplore0 = performance.now();
  let states: any[] = [];
  for (let i = 0; i < 100; i++) {
    states = exploreLineStructures({
      copy: headlineCopy,
      font: 'Inter',
      weight: 700,
      spatialBox,
      canvas,
    });
  }
  const tExplore1 = performance.now();

  console.log('=== Phase 4 Dynamic Line Structure Benchmark ===');
  console.log(`Single-Line Glyph Measurement (1,000 iterations): ${((tSingle1 - tSingle0) / 1000 * 1000).toFixed(2)} µs / call`);
  console.log(`Multi-Line Block Measurement (1,000 iterations): ${((tMulti1 - tMulti0) / 1000 * 1000).toFixed(2)} µs / call`);
  console.log(`Complete Line Structure Exploration (${headlineCopy.hypotheses.length} hypotheses, 100 iterations): ${((tExplore1 - tExplore0) / 100).toFixed(3)} ms / exploration`);
  console.log(`Discovered ${states.length} viable typographic states:`);
  for (const s of states.slice(0, 3)) {
    console.log(`  - [${s.hypothesis.lineCount} lines @ ${s.fontSizePx}px] score: ${s.scores.compositeScore} | ${s.boundingBox.widthPx}x${s.boundingBox.heightPx}px | lines: ${JSON.stringify(s.hypothesis.lines)}`);
  }
}

benchmark().catch(console.error);
