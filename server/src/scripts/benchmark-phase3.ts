import {
  createCanvasRepresentation,
  createBrandDesignRepresentation,
  createDesignField,
} from '../ai/render/design-representation';
import { createDynamicCopyModel } from '../ai/render/copy-model';
import { analyzeImageField } from '../ai/render/image-field';
import { evaluateFontCandidates, deriveDynamicTypeSystem } from '../ai/typography/dynamic-typography';
import { getFontMetrics, measureText, measureMultiLineBlock } from '../ai/typography/font-metrics.service';
import { fontFilePath } from '../ai/typography/font-catalog';
import sharp from 'sharp';

async function benchmark() {
  const canvas = createCanvasRepresentation(1200, 1500);
  const brand = createBrandDesignRepresentation({
    brandProfile: { name: 'Benchmark Brand', tone: 'editorial, bold' },
    creativeDna: { brandColors: ['#1c1917', '#881337'] },
  });
  const copy = [
    createDynamicCopyModel('h1', 'THE NEW AUTUMN DROP', 'primary-hook', 1),
    createDynamicCopyModel('sub', 'Exclusively at Villy Studio & select boutiques', 'secondary-hook', 2),
    createDynamicCopyModel('cta', 'DISCOVER NOW', 'cta', 3),
  ];

  const raw = Buffer.alloc(256 * 256 * 3).fill(200);
  const imgBuf = await sharp(raw, { raw: { width: 256, height: 256, channels: 3 } }).png().toBuffer();
  const field = createDesignField(await analyzeImageField(imgBuf));

  // Font loading & parsing cold vs cached
  const testPath = fontFilePath('Inter', 700);
  const tCold0 = performance.now();
  const coldMetrics = getFontMetrics(testPath);
  const tCold1 = performance.now();

  const tWarm0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    getFontMetrics(testPath);
  }
  const tWarm1 = performance.now();

  // Single text measurement
  const tSingle0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    measureText({ family: 'Inter', weight: 700, text: 'THE NEW AUTUMN DROP', fontSize: 64 });
  }
  const tSingle1 = performance.now();

  // Multi-line measurement
  const tMulti0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    measureMultiLineBlock({
      family: 'Inter',
      weight: 700,
      lines: ['THE NEW AUTUMN DROP', 'EXCLUSIVELY AT VILLY STUDIO', '& SELECT BOUTIQUES'],
      fontSize: 48,
    });
  }
  const tMulti1 = performance.now();

  const t0 = performance.now();
  const candidates = evaluateFontCandidates({
    brand,
    copy,
    spatialBox: { x: 0.1, y: 0.1, width: 0.8, height: 0.35 },
    canvas,
    field,
  });
  const tCandidates = performance.now();

  const typeSystem = deriveDynamicTypeSystem({
    candidate: candidates[0],
    copy,
    spatialBox: { x: 0.1, y: 0.1, width: 0.8, height: 0.35 },
    canvas,
    intensity: 'high',
  });
  const tTypeSystem = performance.now();

  console.log('=== Phase 3 Dynamic Typography Benchmark ===');
  console.log(`Cold Font Parse (OpenType head/hhea/hmtx/cmap binary parsing): ${(tCold1 - tCold0).toFixed(3)} ms`);
  console.log(`Cached Font Lookup (1,000 iterations): ${((tWarm1 - tWarm0) / 1000 * 1000).toFixed(2)} µs/lookup`);
  console.log(`Single Line Measurement (1,000 iterations): ${((tSingle1 - tSingle0) / 1000 * 1000).toFixed(2)} µs/call`);
  console.log(`Multi-Line Block Measurement (1,000 iterations): ${((tMulti1 - tMulti0) / 1000 * 1000).toFixed(2)} µs/call`);
  console.log(`Font Candidate Evaluation (scored ${candidates.length} candidate pairings): ${(tCandidates - t0).toFixed(3)} ms`);
  console.log(`Dynamic Type Scale Derivation (all copy steps + line fit + exact glyph metrics): ${(tTypeSystem - tCandidates).toFixed(3)} ms`);
}

benchmark().catch(console.error);
