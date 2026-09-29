import { makeTestImage } from './test-helper';
import { createCanvasRepresentation, createBrandDesignRepresentation, createDesignField } from '../ai/render/design-representation';
import { discoverPlacementCandidates, evaluatePlacementRegion } from '../ai/render/dynamic-placement';
import { analyzeImageField } from '../ai/render/image-field';
import { createDynamicCopyModel } from '../ai/render/copy-model';
import { exploreLineStructures } from '../ai/typography/dynamic-line-structure';
import sharp from 'sharp';

async function makeTestImg(opts: {
  bgLuminance?: number;
  subjectRect?: { x: number; y: number; w: number; h: number; lum?: number };
}): Promise<Buffer> {
  const width = 256;
  const height = 256;
  const bgLum = opts.bgLuminance ?? 230;
  const buf = Buffer.alloc(width * height * 3).fill(bgLum);

  if (opts.subjectRect) {
    const sr = opts.subjectRect;
    const x0 = Math.round(sr.x * width);
    const y0 = Math.round(sr.y * height);
    const x1 = Math.min(width, x0 + Math.round(sr.w * width));
    const y1 = Math.min(height, y0 + Math.round(sr.h * height));
    const sLum = sr.lum ?? 30;

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * width + x) * 3;
        const val = (x + y) % 4 === 0 ? sLum : Math.min(255, sLum + 130);
        buf[idx] = val;
        buf[idx + 1] = val;
        buf[idx + 2] = val;
      }
    }
  }

  return sharp(buf, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function debugTest2() {
  const canvas = createCanvasRepresentation(1200, 1500);
  const img1 = await makeTestImg({ subjectRect: { x: 0.05, y: 0.55, w: 0.9, h: 0.4, lum: 20 } });
  const raw1 = await analyzeImageField(img1);
  const field1 = createDesignField(raw1);

  const copy = createDynamicCopyModel('h1', 'HARVEST ROAST COFFEE', 'primary-hook', 1);
  const lineStates = exploreLineStructures({ copy, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.8, height: 0.3 }, canvas });

  const candidates1 = discoverPlacementCandidates({ typographyState: lineStates[0], field: field1, canvas });
  console.log('Top 5 candidates for img1 (noisy bottom, quiet top):');
  candidates1.slice(0, 5).forEach((c, idx) => {
    console.log(`[${idx+1}] x=${c.rect.x.toFixed(3)} y=${c.rect.y.toFixed(3)} score=${c.scores.compositeScore.toFixed(4)} legib=${c.scores.legibilityScore} balance=${c.scores.spatialBalanceScore} harmony=${c.scores.subjectHarmonyScore}`);
  });
}

debugTest2().catch(console.error);
