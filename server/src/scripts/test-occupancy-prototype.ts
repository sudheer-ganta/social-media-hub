import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const COLS = 32;
const ROWS = 32;

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

class SummedArea {
  private readonly table: Float64Array;

  constructor(values: ArrayLike<number>, private readonly cols: number, rows: number) {
    this.table = new Float64Array((cols + 1) * (rows + 1));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        this.table[(y + 1) * (cols + 1) + (x + 1)] =
          values[y * cols + x] +
          this.table[y * (cols + 1) + (x + 1)] +
          this.table[(y + 1) * (cols + 1) + x] -
          this.table[y * (cols + 1) + x];
      }
    }
  }

  sum(x0: number, y0: number, x1: number, y1: number): number {
    const w = this.cols + 1;
    return this.table[y1 * w + x1] - this.table[y0 * w + x1] - this.table[y1 * w + x0] + this.table[y0 * w + x0];
  }
}

function computeDetailEnergy(luminance: Float32Array, cols: number, rows: number): Float32Array {
  const energy = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const here = luminance[i];
      const dx = x + 1 < cols ? Math.abs(luminance[i + 1] - here) : 0;
      const dy = y + 1 < rows ? Math.abs(luminance[i + cols] - here) : 0;
      energy[i] = Math.min(1, Math.hypot(dx, dy) * 2);
    }
  }
  return energy;
}

function computeSpatialOccupancyField(luminance: Float32Array, energy: Float32Array, cols: number, rows: number): Float32Array {
  // 1. Calculate local 3x3 variance / stdDev per tile
  const localStdDev = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sum = 0;
      let sqSum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= cols) continue;
          const v = luminance[ny * cols + nx];
          sum += v;
          sqSum += v * v;
          count++;
        }
      }
      const mean = sum / count;
      const variance = Math.max(0, sqSum / count - mean * mean);
      localStdDev[y * cols + x] = Math.sqrt(variance);
    }
  }

  // 2. Compute local structural occupation:
  // Visual occupancy is physical presence: high-frequency detail energy + local variance.
  // Smooth, flat fields (whether bright wall, white backdrop, or dark vignette) have low structure and are quiet ground.
  const rawOccupancy = new Float32Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    const detailSig = Math.min(1.0, energy[i] * 2.2);
    const varianceSig = Math.min(1.0, localStdDev[i] * 4.0);
    // Structural presence: high when detail or local variance is active
    const structuralPresence = Math.min(1.0, detailSig * 0.65 + varianceSig * 0.35);
    rawOccupancy[i] = structuralPresence;
  }

  // 3. Spatial Coherence (3x3 kernel diffusion to bridge solid interior regions flanked by edges)
  const occupancy = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      const center = rawOccupancy[idx];
      let neighborMax = 0;
      let neighborSum = 0;
      let neighborCount = 0;

      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x + 1 < cols ? idx + 1 : -1,
        y > 0 ? idx - cols : -1,
        y + 1 < rows ? idx + cols : -1,
      ];

      for (const n of neighbors) {
        if (n >= 0) {
          const val = rawOccupancy[n];
          if (val > neighborMax) neighborMax = val;
          neighborSum += val;
          neighborCount++;
        }
      }

      // If neighbors have strong structural edges, solid interior tiles between them inherit continuous occupancy
      const inherited = center < 0.20 && neighborMax > 0.40 ? center * 0.50 + neighborMax * 0.35 : center;
      const smoothed = inherited * 0.70 + (neighborCount > 0 ? (neighborSum / neighborCount) * 0.30 : 0);
      occupancy[idx] = Number(Math.min(1.0, Math.max(0.0, smoothed)).toFixed(4));
    }
  }

  return occupancy;
}

async function testPrototype() {
  const imagePath = 'C:\\Users\\mail\\.gemini\\antigravity-ide\\brain\\883c88f1-51d2-48c5-9f76-362c1a730c46\\scratch\\validation-output\\audit_raw_image.png';
  const pngBuffer = fs.readFileSync(imagePath);
  const { data } = await sharp(pngBuffer)
    .removeAlpha()
    .resize(COLS, ROWS, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const luminance = new Float32Array(COLS * ROWS);
  for (let i = 0; i < COLS * ROWS; i++) {
    const o = i * 3;
    luminance[i] = 0.2126 * toLinear(data[o]) + 0.7152 * toLinear(data[o + 1]) + 0.0722 * toLinear(data[o + 2]);
  }

  const energy = computeDetailEnergy(luminance, COLS, ROWS);
  const occupancy = computeSpatialOccupancyField(luminance, energy, COLS, ROWS);
  const occSum = new SummedArea(occupancy, COLS, ROWS);

  const tileRange = (rect: { x: number; y: number; width: number; height: number }) => {
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const left = clamp01(rect.x);
    const top = clamp01(rect.y);
    const right = clamp01(rect.x + Math.max(0, rect.width));
    const bottom = clamp01(rect.y + Math.max(0, rect.height));
    const x0 = Math.min(COLS - 1, Math.floor(left * COLS));
    const y0 = Math.min(ROWS - 1, Math.floor(top * ROWS));
    const x1 = Math.max(x0 + 1, Math.min(COLS, Math.ceil(right * COLS)));
    const y1 = Math.max(y0 + 1, Math.min(ROWS, Math.ceil(bottom * ROWS)));
    return { x0, y0, x1, y1, tiles: (x1 - x0) * (y1 - y0) };
  };

  const occupancyAt = (rect: { x: number; y: number; width: number; height: number }) => {
    const { x0, y0, x1, y1, tiles } = tileRange(rect);
    return occSum.sum(x0, y0, x1, y1) / tiles;
  };

  console.log('=== Spatial Occupancy Field Prototype Results on Ganesh/Villy Image ===');
  console.log('Occupancy Map (32x32, 0..99 scale):');
  for (let y = 0; y < ROWS; y++) {
    let rowStr = `y=${y.toString().padStart(2)}: `;
    for (let x = 0; x < COLS; x++) {
      const v = Math.round(occupancy[y * COLS + x] * 99);
      rowStr += v.toString().padStart(3) + ' ';
    }
    console.log(rowStr);
  }

  const regions = [
    { name: 'Model Face', rect: { x: 0.35, y: 0.15, width: 0.30, height: 0.20 } },
    { name: 'Head / Hair', rect: { x: 0.30, y: 0.06, width: 0.40, height: 0.16 } },
    { name: 'Upper Torso / Saree', rect: { x: 0.30, y: 0.30, width: 0.40, height: 0.18 } },
    { name: 'Saree / Fabric Lower', rect: { x: 0.10, y: 0.48, width: 0.80, height: 0.45 } },
    { name: 'Winning Headline Region (Old Overlap=0)', rect: { x: 0.055, y: 0.749, width: 0.876, height: 0.116 } },
    { name: 'Side Negative Space Column', rect: { x: 0.56, y: 0.20, width: 0.44, height: 0.60 } },
    { name: 'Top-Left Background Wall', rect: { x: 0.00, y: 0.00, width: 0.25, height: 0.25 } },
  ];

  console.log('\nRegion Occupancy Readings:');
  regions.forEach(r => {
    const occ = occupancyAt(r.rect);
    console.log(`  ${r.name.padEnd(45)}: occupancy = ${occ.toFixed(3)} (${(occ * 100).toFixed(1)}%)`);
  });
}

testPrototype().catch(console.error);
