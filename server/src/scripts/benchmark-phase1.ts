import sharp from 'sharp';
import { analyzeImageField } from '../ai/render/image-field';
import {
  createCanvasRepresentation,
  createCopyElement,
  createBrandDesignRepresentation,
  createDesignField,
  createDynamicDesignContext,
} from '../ai/render/design-representation';

async function benchmark() {
  // 1. Create synthetic 1600x1600 image buffer
  const width = 1600;
  const height = 1600;
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height * 3; i += 3) {
    raw[i] = (i * 17) % 256;
    raw[i + 1] = (i * 31) % 256;
    raw[i + 2] = (i * 47) % 256;
  }
  const imgBuf = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();

  // 2. Measure ImageField + DesignField creation
  const t0 = performance.now();
  const imageField = await analyzeImageField(imgBuf);
  const tImageField = performance.now();
  const designField = createDesignField(imageField);
  const tDesignField = performance.now();

  // 3. Measure 10,000 continuous point samples
  const tSampleStart = performance.now();
  for (let i = 0; i < 10000; i++) {
    designField.sample((i % 100) / 100, ((i * 7) % 100) / 100);
  }
  const tSampleEnd = performance.now();

  // 4. Measure 1,000 region evaluations
  const tEvalStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    designField.evaluateRegion({
      x: ((i * 3) % 80) / 100,
      y: ((i * 5) % 80) / 100,
      width: 0.2,
      height: 0.1,
    });
  }
  const tEvalEnd = performance.now();

  // 5. Measure full DynamicDesignContext creation
  const tCtxStart = performance.now();
  const canvas = createCanvasRepresentation(1200, 1500);
  const copy = [
    createCopyElement('h1', 'THE NEW DROP', 'primary-hook', 1),
    createCopyElement('sub', 'Available worldwide', 'secondary-hook', 2),
  ];
  const brand = createBrandDesignRepresentation({
    brandProfile: { name: 'Benchmark Brand' },
    creativeDna: { brandColors: ['#111111', '#c2410c'] },
  });
  const ctx = createDynamicDesignContext({
    canvas,
    field: designField,
    copyElements: copy,
    brand,
  });
  const tCtxEnd = performance.now();

  console.log('--- Phase 1 Performance Benchmark ---');
  console.log(`ImageField downscale & SAT analysis: ${(tImageField - t0).toFixed(2)} ms`);
  console.log(`DesignField creation: ${(tDesignField - tImageField).toFixed(3)} ms`);
  console.log(`10,000 point samples: ${(tSampleEnd - tSampleStart).toFixed(2)} ms (${((tSampleEnd - tSampleStart) / 10).toFixed(3)} µs / sample)`);
  console.log(`1,000 region evaluations: ${(tEvalEnd - tEvalStart).toFixed(2)} ms (${((tEvalEnd - tEvalStart)).toFixed(3)} µs / eval)`);
  console.log(`DynamicDesignContext assembly: ${(tCtxEnd - tCtxStart).toFixed(3)} ms`);
}

benchmark().catch(console.error);
