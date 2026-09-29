import { createCanvasRepresentation, createBrandDesignRepresentation, createDesignField } from '../ai/render/design-representation';
import { discoverPlacementCandidates, evaluatePlacementRegion } from '../ai/render/dynamic-placement';
import { analyzeImageField } from '../ai/render/image-field';
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

async function debugImg1() {
  const canvas = createCanvasRepresentation(1200, 1500);
  const img1 = await makeTestImg({ subjectRect: { x: 0.05, y: 0.55, w: 0.9, h: 0.4, lum: 20 } });
  const raw1 = await analyzeImageField(img1);
  const field1 = createDesignField(raw1);

  const rectBottom = { x: 0.113, y: 0.637, width: 0.774, height: 0.187 };
  const rectTop = { x: 0.040, y: 0.040, width: 0.774, height: 0.187 };

  const evalBottom = evaluatePlacementRegion({ rect: rectBottom, field: field1, canvas });
  const evalTop = evaluatePlacementRegion({ rect: rectTop, field: field1, canvas });

  console.log('Eval Bottom (over subject):', JSON.stringify(evalBottom, null, 2));
  console.log('Eval Top (quiet background):', JSON.stringify(evalTop, null, 2));
}

debugImg1().catch(console.error);
