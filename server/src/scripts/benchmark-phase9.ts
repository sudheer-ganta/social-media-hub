import {
  createCanvasRepresentation,
  createDesignField,
  createBrandDesignRepresentation,
} from '../ai/render/design-representation';
import { analyzeImageField } from '../ai/render/image-field';
import { discoverInkCandidates } from '../ai/render/dynamic-color';
import { discoverSurfaceCandidates } from '../ai/render/dynamic-surface';
import {
  discoverOptimizedComposition,
  evaluateCompositionState,
} from '../ai/render/composition-evaluation';
import sharp from 'sharp';

async function createSyntheticField(setup: (raw: Buffer, width: number, height: number) => void) {
  const width = 256;
  const height = 256;
  const raw = Buffer.alloc(width * height * 3).fill(235);
  setup(raw, width, height);
  const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const metrics = await analyzeImageField(png);
  return createDesignField(metrics);
}

async function runBenchmarks() {
  console.log('================================================================');
  console.log('FLOWPOST PHASE 9 — PERFORMANCE & LATENCY BENCHMARKS');
  console.log('================================================================\n');

  const canvas = createCanvasRepresentation(1200, 1500);
  const field = await createSyntheticField((raw) => raw.fill(220));

  const brand = createBrandDesignRepresentation({
    brandProfile: { name: 'BenchmarkBrand', tone: 'tech' },
    creativeDna: { brandColors: ['#0f172a', '#38bdf8'] },
  });

  const footprint = { x: 0.1, y: 0.1, width: 0.7, height: 0.2 };
  const inks = discoverInkCandidates({ role: 'headline', footprint, field, canvas, brand });
  const primaryInk = inks[0];

  // 1. Benchmark Surface Discovery
  {
    const iterations = 500;
    const times: number[] = [];

    // Warmup
    for (let i = 0; i < 20; i++) {
      discoverSurfaceCandidates({ targetElementIds: ['h1'], footprint, ink: primaryInk, field, canvas, brand });
    }

    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      discoverSurfaceCandidates({ targetElementIds: ['h1'], footprint, ink: primaryInk, field, canvas, brand });
      times.push(performance.now() - t0);
    }

    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / iterations;
    const p50 = times[Math.floor(iterations * 0.5)];
    const p95 = times[Math.floor(iterations * 0.95)];
    const min = times[0];
    const max = times[times.length - 1];

    console.log('1. Surface Discovery Benchmark (500 runs):');
    console.log(`   - Average: ${(avg * 1000).toFixed(1)} µs / run`);
    console.log(`   - Median (p50): ${(p50 * 1000).toFixed(1)} µs / run`);
    console.log(`   - 95th percentile (p95): ${(p95 * 1000).toFixed(1)} µs / run`);
    console.log(`   - Min / Max: ${(min * 1000).toFixed(1)} µs / ${(max * 1000).toFixed(1)} µs`);
  }

  // 2. Benchmark Full Composition Discovery Pipeline (Phases 3–9)
  {
    const copyItems = [
      { id: 'h1', text: 'IMMERSIVE SPATIAL AUDIO', role: 'headline' as const, priority: 1 },
      { id: 'sub', text: 'Studio-Grade Acoustic Precision', role: 'subheadline' as const, priority: 2 },
      { id: 'cta', text: 'EXPLORE NOW', role: 'cta' as const, priority: 3 },
    ];

    const iterations = 100;
    const times: number[] = [];

    // Cold Run
    const tCold0 = performance.now();
    discoverOptimizedComposition({ copyItems, field, canvas, brand });
    const coldTime = performance.now() - tCold0;

    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      discoverOptimizedComposition({ copyItems, field, canvas, brand });
      times.push(performance.now() - t0);
    }

    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / iterations;
    const p50 = times[Math.floor(iterations * 0.5)];
    const p95 = times[Math.floor(iterations * 0.95)];

    console.log('\n2. Complete Phase 3–9 Pipeline Discovery (100 runs):');
    console.log(`   - Cold Run: ${coldTime.toFixed(2)} ms`);
    console.log(`   - Warm Average: ${avg.toFixed(2)} ms`);
    console.log(`   - Median (p50): ${p50.toFixed(2)} ms`);
    console.log(`   - 95th percentile (p95): ${p95.toFixed(2)} ms`);
    console.log(`   - Status: ${avg < 50 ? 'PASSED (< 50ms interactive threshold)' : 'WARNING (> 50ms)'}`);
  }
}

runBenchmarks().catch(console.error);
