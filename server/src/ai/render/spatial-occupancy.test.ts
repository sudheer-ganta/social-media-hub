import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { analyzeImageField } from './image-field';
import { createDesignField, createCanvasRepresentation } from './design-representation';
import { evaluatePlacementRegion } from './dynamic-placement';

// Helper to construct synthetic images with explicit structures
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

  // Fill background
  for (let i = 0; i < width * height; i++) {
    buf[i * 3] = bg[0];
    buf[i * 3 + 1] = bg[1];
    buf[i * 3 + 2] = bg[2];
  }

  // Draw regions
  for (const reg of options.regions ?? []) {
    const x0 = Math.max(0, Math.round(reg.x * width));
    const y0 = Math.max(0, Math.round(reg.y * height));
    const x1 = Math.min(width, Math.round((reg.x + reg.w) * width));
    const y1 = Math.min(height, Math.round((reg.y + reg.h) * height));
    const col = reg.color ?? [40, 40, 40];

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * width + x) * 3;
        if (reg.texture === 'high-frequency') {
          const noise = ((x * 17 + y * 31) % 50) - 25;
          buf[idx] = Math.max(0, Math.min(255, col[0] + noise));
          buf[idx + 1] = Math.max(0, Math.min(255, col[1] + noise));
          buf[idx + 2] = Math.max(0, Math.min(255, col[2] + noise));
        } else if (reg.texture === 'gradient') {
          const factor = (x - x0) / Math.max(1, x1 - x0);
          buf[idx] = Math.round(col[0] * factor);
          buf[idx + 1] = Math.round(col[1] * factor);
          buf[idx + 2] = Math.round(col[2] * factor);
        } else {
          buf[idx] = col[0];
          buf[idx + 1] = col[1];
          buf[idx + 2] = col[2];
        }
      }
    }
  }

  return sharp(buf, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe('Spatial Occupancy Field — Targeted Suite (A through I)', () => {
  const canvas = createCanvasRepresentation(1200, 1500);

  // A. Full-bleed person (Production Ganesh / Villy scenario)
  it('A. Full-bleed person represents face, fabric, and distinguishes quiet space', async () => {
    // Generate image with model head/face at top center, saree fabric filling lower half, and quiet side margin
    const imgBuf = await createSyntheticImage({
      backgroundColor: [235, 230, 225], // warm studio backdrop
      regions: [
        { x: 0.35, y: 0.15, w: 0.30, h: 0.25, color: [140, 90, 70], texture: 'high-frequency' }, // Model face & features
        { x: 0.10, y: 0.40, w: 0.80, h: 0.60, color: [160, 40, 50], texture: 'high-frequency' }, // Saree folds & rich fabric
      ],
    });

    const field = createDesignField(await analyzeImageField(imgBuf));

    // 1. Face region has meaningful occupancy
    const faceOccupancy = field.occupancyAt({ x: 0.38, y: 0.18, width: 0.24, height: 0.20 });
    expect(faceOccupancy).toBeGreaterThan(0.40);

    // 2. Saree / fabric region has meaningful occupancy
    const sareeOccupancy = field.occupancyAt({ x: 0.15, y: 0.60, width: 0.70, height: 0.30 });
    expect(sareeOccupancy).toBeGreaterThan(0.40);

    // 3. Unrelated quiet background region has much lower occupancy
    const quietCornerOccupancy = field.occupancyAt({ x: 0.02, y: 0.02, width: 0.25, height: 0.15 });
    expect(quietCornerOccupancy).toBeLessThan(0.15);
    expect(quietCornerOccupancy).toBeLessThan(sareeOccupancy * 0.3);

    // 4. Bottom saree region is NOT interpreted as empty space (unlike old subjectBox)
    const bottomRegionEval = evaluatePlacementRegion({
      rect: { x: 0.10, y: 0.75, width: 0.80, height: 0.15 },
      field,
      canvas,
    });
    expect(bottomRegionEval.signals.subjectOverlap.overlapRatio).toBeGreaterThan(0.35);
  });

  // B. Bright background / dark subject
  it('B. Bright background / dark subject follows visual mass rather than absolute brightness', async () => {
    const imgBuf = await createSyntheticImage({
      backgroundColor: [245, 245, 245], // Bright white studio
      regions: [
        { x: 0.25, y: 0.25, w: 0.50, h: 0.50, color: [25, 25, 30], texture: 'flat' }, // Dark subject
      ],
    });

    const field = createDesignField(await analyzeImageField(imgBuf));
    const subjectOcc = field.occupancyAt({ x: 0.30, y: 0.30, width: 0.40, height: 0.40 });
    const bgOcc = field.occupancyAt({ x: 0.05, y: 0.05, width: 0.15, height: 0.15 });

    expect(subjectOcc).toBeGreaterThan(0.60);
    expect(bgOcc).toBeLessThan(0.10);
  });

  // C. Dark background / bright subject
  it('C. Dark background / bright subject correctly assigns occupancy to the subject', async () => {
    const imgBuf = await createSyntheticImage({
      backgroundColor: [20, 20, 25], // Dark moody backdrop
      regions: [
        { x: 0.30, y: 0.20, w: 0.40, h: 0.60, color: [230, 220, 190], texture: 'high-frequency' }, // Bright glowing subject
      ],
    });

    const field = createDesignField(await analyzeImageField(imgBuf));
    const subjectOcc = field.occupancyAt({ x: 0.35, y: 0.25, width: 0.30, height: 0.50 });
    const bgOcc = field.occupancyAt({ x: 0.05, y: 0.05, width: 0.20, height: 0.20 });

    expect(subjectOcc).toBeGreaterThan(0.60);
    expect(bgOcc).toBeLessThan(0.10);
  });

  // D. Subject touching image edge
  it('D. Subject touching image edge is not suppressed or discarded', async () => {
    const imgBuf = await createSyntheticImage({
      backgroundColor: [230, 230, 230],
      regions: [
        // Subject firmly touches left edge (x=0) and bottom edge (y=1)
        { x: 0.0, y: 0.40, w: 0.60, h: 0.60, color: [50, 60, 90], texture: 'high-frequency' },
      ],
    });

    const field = createDesignField(await analyzeImageField(imgBuf));
    const edgeOcc = field.occupancyAt({ x: 0.0, y: 0.50, width: 0.40, height: 0.40 });
    const emptyOcc = field.occupancyAt({ x: 0.65, y: 0.05, width: 0.30, height: 0.30 });

    expect(edgeOcc).toBeGreaterThan(0.50);
    expect(emptyOcc).toBeLessThan(0.10);
  });

  // E. Full-bleed product
  it('E. Full-bleed product region receives continuous spatial occupancy', async () => {
    const imgBuf = await createSyntheticImage({
      backgroundColor: [240, 240, 240],
      regions: [
        { x: 0.10, y: 0.10, w: 0.80, h: 0.80, color: [80, 50, 40], texture: 'high-frequency' },
      ],
    });

    const field = createDesignField(await analyzeImageField(imgBuf));
    const productOcc = field.occupancyAt({ x: 0.20, y: 0.20, width: 0.60, height: 0.60 });

    expect(productOcc).toBeGreaterThan(0.60);
    expect(field.rawImageField.totalOccupancyMass).toBeGreaterThan(0.30);
  });

  // F. Multiple occupied regions
  it('F. Field represents multiple disconnected occupied regions without falsely occupying space between', async () => {
    const imgBuf = await createSyntheticImage({
      backgroundColor: [235, 235, 235],
      regions: [
        { x: 0.05, y: 0.05, w: 0.35, h: 0.35, color: [40, 40, 50], texture: 'high-frequency' }, // Top-left object
        { x: 0.60, y: 0.60, w: 0.35, h: 0.35, color: [40, 40, 50], texture: 'high-frequency' }, // Bottom-right object
      ],
    });

    const field = createDesignField(await analyzeImageField(imgBuf));
    const topLeftOcc = field.occupancyAt({ x: 0.08, y: 0.08, width: 0.28, height: 0.28 });
    const bottomRightOcc = field.occupancyAt({ x: 0.63, y: 0.63, width: 0.28, height: 0.28 });
    const centerEmptyOcc = field.occupancyAt({ x: 0.35, y: 0.35, width: 0.25, height: 0.25 });

    expect(topLeftOcc).toBeGreaterThan(0.50);
    expect(bottomRightOcc).toBeGreaterThan(0.50);
    expect(centerEmptyOcc).toBeLessThan(0.20);
    expect(centerEmptyOcc).toBeLessThan(topLeftOcc * 0.40);
  });

  // G. Actual quiet negative space
  it('G. Genuinely quiet negative space remains low occupancy (< 0.10)', async () => {
    const imgBuf = await createSyntheticImage({
      backgroundColor: [240, 240, 240], // Completely uniform flat canvas
    });

    const field = createDesignField(await analyzeImageField(imgBuf));
    const wholeFieldOcc = field.occupancyAt({ x: 0, y: 0, width: 1, height: 1 });
    const centerOcc = field.occupancyAt({ x: 0.2, y: 0.2, width: 0.6, height: 0.6 });

    expect(wholeFieldOcc).toBeLessThan(0.05);
    expect(centerOcc).toBeLessThan(0.05);
  });

  // H. Partial overlap produces graded continuous occupancy
  it('H. Rectangle partially covering occupied pixels produces proportional continuous occupancy', async () => {
    const imgBuf = await createSyntheticImage({
      backgroundColor: [240, 240, 240],
      regions: [
        { x: 0.50, y: 0.0, w: 0.50, h: 1.0, color: [30, 30, 30], texture: 'flat' }, // Right half occupied
      ],
    });

    const field = createDesignField(await analyzeImageField(imgBuf));

    // 100% inside left (empty)
    const leftOcc = field.occupancyAt({ x: 0.05, y: 0.20, width: 0.35, height: 0.60 });
    // 100% inside right (occupied)
    const rightOcc = field.occupancyAt({ x: 0.60, y: 0.20, width: 0.35, height: 0.60 });
    // Exactly 50% covering left, 50% covering right
    const straddlingOcc = field.occupancyAt({ x: 0.325, y: 0.20, width: 0.35, height: 0.60 });

    expect(leftOcc).toBeLessThan(0.20);
    expect(rightOcc).toBeGreaterThan(0.70);
    // Straddling rect must be between left and right in a proportional graded manner
    expect(straddlingOcc).toBeGreaterThan(leftOcc);
    expect(straddlingOcc).toBeLessThan(rightOcc);
    expect(straddlingOcc).toBeGreaterThan(0.30);
    expect(straddlingOcc).toBeLessThan(0.70);
  });

  // I. No hardcoded coordinates
  it('I. Architectural check: code contains no image-specific coordinates or magic bounding boxes', () => {
    const filesToCheck = [
      path.resolve(__dirname, './image-field.ts'),
      path.resolve(__dirname, './design-representation.ts'),
      path.resolve(__dirname, './dynamic-placement.ts'),
    ];

    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Assert no hardcoded bounding boxes matching Ganesh or test specifics
      expect(content).not.toMatch(/0\.344.*0\.313/);
      expect(content).not.toMatch(/0\.055.*0\.749/);
      expect(content).not.toMatch(/saree/i);
      expect(content).not.toMatch(/ganesh/i);
      expect(content).not.toMatch(/if\s*\(.*model.*\)/i);
      expect(content).not.toMatch(/if\s*\(.*face.*\)/i);
    }
  });
});
