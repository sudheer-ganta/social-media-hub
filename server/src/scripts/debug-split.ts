import sharp from 'sharp';
import { analyzeImageField } from '../ai/render/image-field';

async function createSyntheticImage(options: {
  width?: number;
  height?: number;
  backgroundColor?: [number, number, number];
  regions?: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    color?: [number, number, number];
    texture?: 'flat' | 'high-frequency' | 'gradient';
  }>;
}): Promise<Buffer> {
  const width = options.width ?? 256;
  const height = options.height ?? 256;
  const bg = options.backgroundColor ?? [240, 240, 240];
  const buf = Buffer.alloc(width * height * 3);

  for (let i = 0; i < width * height; i++) {
    buf[i * 3] = bg[0];
    buf[i * 3 + 1] = bg[1];
    buf[i * 3 + 2] = bg[2];
  }

  for (const reg of options.regions ?? []) {
    const x0 = Math.max(0, Math.round(reg.x * width));
    const y0 = Math.max(0, Math.round(reg.y * height));
    const x1 = Math.min(width, Math.round((reg.x + reg.w) * width));
    const y1 = Math.min(height, Math.round((reg.y + reg.h) * height));
    const col = reg.color ?? [40, 40, 40];

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * width + x) * 3;
        buf[idx] = col[0];
        buf[idx + 1] = col[1];
        buf[idx + 2] = col[2];
      }
    }
  }

  return sharp(buf, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function main() {
  const imgBuf = await createSyntheticImage({
    backgroundColor: [240, 240, 240],
    regions: [
      { x: 0.50, y: 0.0, w: 0.50, h: 1.0, color: [30, 30, 30], texture: 'flat' },
    ],
  });
  const raw = await analyzeImageField(imgBuf);
  console.log('Row 16 occupancy across x=0..31:');
  const row: string[] = [];
  for (let x = 0; x < 32; x++) {
    row.push(raw.grid.occupancy ? raw.grid.occupancy[16 * 32 + x].toFixed(2) : '-');
  }
  console.log(row.join(' '));

  console.log('leftOcc {x: 0.05, y: 0.2, w: 0.35, h: 0.6}:', raw.occupancyAt({ x: 0.05, y: 0.20, width: 0.35, height: 0.60 }));
}

main().catch(console.error);
