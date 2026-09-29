import sharp from 'sharp';
import { analyzeImageField } from '../ai/render/image-field';

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
  const rect = { x: 0.3, y: 0.35, width: 0.4, height: 0.3 };
  console.log('busynessAt rect:', raw.busynessAt(rect));
  console.log('occupancyAt rect:', raw.occupancyAt(rect));
  console.log('toneAt rect:', raw.toneAt(rect));
  console.log('subjectBox:', raw.subjectBox);

  // Let's print grid values inside subject rect
  console.log('Grid cols:', raw.grid.cols, 'rows:', raw.grid.rows);
  const rLums: number[] = [];
  const rEng: number[] = [];
  const rOcc: number[] = [];
  for (let y = 11; y <= 20; y++) {
    for (let x = 10; x <= 22; x++) {
      rLums.push(raw.grid.luminance[y * 32 + x]);
      rEng.push(raw.grid.energy[y * 32 + x]);
      rOcc.push(raw.grid.occupancy ? raw.grid.occupancy[y * 32 + x] : -1);
    }
  }
  console.log('Avg inside subject: lum=', rLums.reduce((a,b)=>a+b)/rLums.length, 'eng=', rEng.reduce((a,b)=>a+b)/rEng.length, 'occ=', rOcc.reduce((a,b)=>a+b)/rOcc.length);
}

main().catch(console.error);
