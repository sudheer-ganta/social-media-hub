import sharp from 'sharp';
import { createCanvasRepresentation, createDesignField } from '../ai/render/design-representation';
import { analyzeImageField } from '../ai/render/image-field';
import { evaluatePlacementRegion } from '../ai/render/dynamic-placement';

async function makeTestImage(opts: {
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

async function main() {
  const img = await makeTestImage({ subjectRect: { x: 0.2, y: 0.3, w: 0.6, h: 0.4, lum: 30 } });
  const raw = await analyzeImageField(img);
  const field = createDesignField(raw);
  const canvas = createCanvasRepresentation(1200, 1500);
  const peripheralEval = evaluatePlacementRegion({
    rect: { x: 0.1, y: 0.25, width: 0.2, height: 0.15 },
    field,
    canvas,
  });
  console.log('totalMass:', raw.totalOccupancyMass);
  console.log('rect:', { x: 0.1, y: 0.25, width: 0.2, height: 0.15 });
  console.log('occupancyMass:', raw.occupancyMass ? raw.occupancyMass({ x: 0.1, y: 0.25, width: 0.2, height: 0.15 }) : 'none');
  console.log('occupancyAt:', raw.occupancyAt({ x: 0.1, y: 0.25, width: 0.2, height: 0.15 }));
  console.log('signals:', peripheralEval.signals.subjectOverlap);
}

main().catch(console.error);
