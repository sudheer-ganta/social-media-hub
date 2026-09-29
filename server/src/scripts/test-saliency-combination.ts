import { createCanvasRepresentation, createBrandDesignRepresentation, createDesignField } from '../ai/render/design-representation';
import { discoverPlacementCandidates, evaluatePlacementRegion } from '../ai/render/dynamic-placement';
import { computeSpatialOccupancyField, computeSaliency, detailEnergy } from '../ai/render/image-field';
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

async function testWithSaliencyCombined() {
  const COLS = 32;
  const ROWS = 32;
  const canvas = createCanvasRepresentation(1200, 1500);
  const img1 = await makeTestImg({ subjectRect: { x: 0.05, y: 0.55, w: 0.9, h: 0.4, lum: 20 } });
  
  const toLinear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  const { data } = await sharp(img1)
    .removeAlpha()
    .resize(COLS, ROWS, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const luminance = new Float32Array(COLS * ROWS);
  for (let i = 0; i < COLS * ROWS; i++) {
    const o = i * 3;
    luminance[i] = 0.2126 * toLinear(data[o]) + 0.7152 * toLinear(data[o + 1]) + 0.0722 * toLinear(data[o + 2]);
  }

  // Energy
  const energy = new Float32Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      const here = luminance[i];
      const dx = x + 1 < COLS ? Math.abs(luminance[i + 1] - here) : 0;
      const dy = y + 1 < ROWS ? Math.abs(luminance[i + COLS] - here) : 0;
      energy[i] = Math.min(1, Math.hypot(dx, dy) * 2);
    }
  }

  // Saliency
  const border: number[] = [];
  for (let x = 0; x < COLS; x++) {
    border.push(luminance[x], luminance[(ROWS - 1) * COLS + x]);
  }
  for (let y = 0; y < ROWS; y++) {
    border.push(luminance[y * COLS], luminance[y * COLS + COLS - 1]);
  }
  border.sort((a, b) => a - b);
  const ground = border[Math.floor(border.length / 2)];

  const deviation = Float32Array.from(luminance, (v) => Math.abs(v - ground));
  let maxDeviation = 0;
  let maxEnergy = 0;
  for (let i = 0; i < deviation.length; i++) {
    if (deviation[i] > maxDeviation) maxDeviation = deviation[i];
    if (energy[i] > maxEnergy) maxEnergy = energy[i];
  }

  const saliency = new Float32Array(COLS * ROWS);
  for (let i = 0; i < saliency.length; i++) {
    const tone = maxDeviation > 0 ? deviation[i] / maxDeviation : 0;
    const detail = maxEnergy > 0 ? energy[i] / maxEnergy : 0;
    saliency[i] = Math.min(1, tone * 0.6 + detail * 0.4);
  }

  console.log('Ground:', ground, 'MaxDev:', maxDeviation);
  console.log('Saliency at y=0 (top quiet):', saliency[0], 'Saliency at y=20 (bottom subject):', saliency[20 * 32 + 16]);
}

testWithSaliencyCombined().catch(console.error);
