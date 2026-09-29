import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { analyzeImageField, FieldRect } from '../ai/render/image-field';

const COLS = 32;
const ROWS = 32;

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function detailEnergy(luminance: Float32Array, cols: number, rows: number): Float32Array {
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

function computeSaliency(luminance: Float32Array, energy: Float32Array, cols: number, rows: number) {
  const border: number[] = [];
  for (let x = 0; x < cols; x++) {
    border.push(luminance[x], luminance[(rows - 1) * cols + x]);
  }
  for (let y = 0; y < rows; y++) {
    border.push(luminance[y * cols], luminance[y * cols + cols - 1]);
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

  const saliency = new Float32Array(cols * rows);
  for (let i = 0; i < saliency.length; i++) {
    const tone = maxDeviation > 0 ? deviation[i] / maxDeviation : 0;
    const detail = maxEnergy > 0 ? energy[i] / maxEnergy : 0;
    saliency[i] = Math.min(1, tone * 0.6 + detail * 0.4);
  }
  return { saliency, ground, maxDeviation, maxEnergy };
}

interface ComponentInfo {
  id: number;
  weight: number;
  tileCount: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  rect: FieldRect;
  meanSaliency: number;
  peakSaliency: number;
  meanEnergy: number;
  meanLum: number;
}

function extractAllConnectedComponents(saliency: Float32Array, luminance: Float32Array, energy: Float32Array, cols: number, rows: number, threshold: number): ComponentInfo[] {
  const seen = new Uint8Array(cols * rows);
  const components: ComponentInfo[] = [];
  let compId = 0;

  for (let start = 0; start < saliency.length; start++) {
    if (seen[start] || saliency[start] < threshold) continue;
    const stack = [start];
    seen[start] = 1;
    let weight = 0;
    let minX = cols;
    let minY = rows;
    let maxX = -1;
    let maxY = -1;
    let sumSal = 0;
    let peakSal = 0;
    let sumEnergy = 0;
    let sumLum = 0;
    let count = 0;

    while (stack.length) {
      const i = stack.pop() as number;
      const x = i % cols;
      const y = (i - x) / cols;
      const sal = saliency[i];
      count++;
      sumSal += sal;
      if (sal > peakSal) peakSal = sal;
      sumEnergy += energy[i];
      sumLum += luminance[i];

      weight += 1 - Math.hypot(x / cols - 0.5, y / rows - 0.5);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const neighbours = [
        x > 0 ? i - 1 : -1,
        x + 1 < cols ? i + 1 : -1,
        y > 0 ? i - cols : -1,
        y + 1 < rows ? i + cols : -1,
      ];
      for (const n of neighbours) {
        if (n >= 0 && !seen[n] && saliency[n] >= threshold) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }

    components.push({
      id: ++compId,
      weight,
      tileCount: count,
      minX,
      minY,
      maxX,
      maxY,
      rect: {
        x: minX / cols,
        y: minY / rows,
        width: (maxX - minX + 1) / cols,
        height: (maxY - minY + 1) / rows,
      },
      meanSaliency: sumSal / count,
      peakSaliency: peakSal,
      meanEnergy: sumEnergy / count,
      meanLum: sumLum / count,
    });
  }

  return components.sort((a, b) => b.weight - a.weight);
}

function evaluateRegionStats(rect: FieldRect, luminance: Float32Array, energy: Float32Array, saliency: Float32Array, threshold: number) {
  const x0 = Math.floor(rect.x * COLS);
  const y0 = Math.floor(rect.y * ROWS);
  const x1 = Math.min(COLS, Math.ceil((rect.x + rect.width) * COLS));
  const y1 = Math.min(ROWS, Math.ceil((rect.y + rect.height) * ROWS));

  let count = 0;
  let sumLum = 0;
  let sumEnergy = 0;
  let sumSal = 0;
  let maxSal = 0;
  let aboveThresholdCount = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = y * COLS + x;
      count++;
      sumLum += luminance[idx];
      sumEnergy += energy[idx];
      const sal = saliency[idx];
      sumSal += sal;
      if (sal > maxSal) maxSal = sal;
      if (sal >= threshold) aboveThresholdCount++;
    }
  }

  return {
    tileCount: count,
    meanLum: sumLum / Math.max(1, count),
    meanDetail: sumEnergy / Math.max(1, count),
    meanSaliency: sumSal / Math.max(1, count),
    maxSaliency: maxSal,
    semanticMass: sumSal,
    percentAboveThreshold: (aboveThresholdCount / Math.max(1, count)) * 100,
  };
}

async function runRawFieldAudit() {
  const imagePath = 'C:\\Users\\mail\\.gemini\\antigravity-ide\\brain\\883c88f1-51d2-48c5-9f76-362c1a730c46\\scratch\\validation-output\\audit_raw_image.png';
  if (!fs.existsSync(imagePath)) {
    console.error('Audit raw image not found at:', imagePath);
    return;
  }

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

  const energy = detailEnergy(luminance, COLS, ROWS);
  const { saliency, ground, maxDeviation, maxEnergy } = computeSaliency(luminance, energy, COLS, ROWS);

  let peakSaliency = 0;
  for (const v of saliency) if (v > peakSaliency) peakSaliency = v;
  const currentThreshold = peakSaliency * 0.45;

  console.log('================================================================');
  console.log('RAW IMAGE FIELD / SUBJECT REPRESENTATION FORENSIC AUDIT');
  console.log('================================================================');
  console.log(`Global Parameters:`);
  console.log(`  Grid: ${COLS}x${ROWS} (${COLS * ROWS} tiles)`);
  console.log(`  Ground Median Luminance: ${ground.toFixed(4)}`);
  console.log(`  Max Tone Deviation: ${maxDeviation.toFixed(4)}`);
  console.log(`  Max Detail Energy: ${maxEnergy.toFixed(4)}`);
  console.log(`  Peak Saliency: ${peakSaliency.toFixed(4)}`);
  console.log(`  Current Subject Threshold (peak * 0.45): ${currentThreshold.toFixed(4)}`);

  // 1. RAW GRID EXTRACTION (Formatted 32x32 maps)
  console.log('\n--- 1. RAW GRID EXTRACTION ---');
  console.log('\nSaliency Map (32x32, 0..99 scale):');
  for (let y = 0; y < ROWS; y++) {
    let rowStr = `y=${y.toString().padStart(2)}: `;
    for (let x = 0; x < COLS; x++) {
      const v = Math.round(saliency[y * COLS + x] * 99);
      rowStr += v.toString().padStart(3) + ' ';
    }
    console.log(rowStr);
  }

  console.log('\nDetail Energy Map (32x32, 0..99 scale):');
  for (let y = 0; y < ROWS; y++) {
    let rowStr = `y=${y.toString().padStart(2)}: `;
    for (let x = 0; x < COLS; x++) {
      const v = Math.round(energy[y * COLS + x] * 99);
      rowStr += v.toString().padStart(3) + ' ';
    }
    console.log(rowStr);
  }

  console.log('\nLuminance Map (32x32, 0..99 scale):');
  for (let y = 0; y < ROWS; y++) {
    let rowStr = `y=${y.toString().padStart(2)}: `;
    for (let x = 0; x < COLS; x++) {
      const v = Math.round(luminance[y * COLS + x] * 99);
      rowStr += v.toString().padStart(3) + ' ';
    }
    console.log(rowStr);
  }

  // 2. REGION ANALYSIS
  console.log('\n--- 2. REGION ANALYSIS ---');
  const regions = [
    { name: 'Model Face', rect: { x: 0.35, y: 0.15, width: 0.30, height: 0.20 } },
    { name: 'Head / Hair', rect: { x: 0.30, y: 0.06, width: 0.40, height: 0.16 } },
    { name: 'Upper Torso / Jewelry', rect: { x: 0.30, y: 0.30, width: 0.40, height: 0.18 } },
    { name: 'Saree / Fabric Lower', rect: { x: 0.10, y: 0.48, width: 0.80, height: 0.45 } },
    { name: 'Jewelry / Focal Patch', rect: { x: 0.34, y: 0.31, width: 0.41, height: 0.10 } },
    { name: 'Background (Top Left Ground)', rect: { x: 0.00, y: 0.00, width: 0.25, height: 0.30 } },
    { name: 'Background (Top Right Ground)', rect: { x: 0.75, y: 0.00, width: 0.25, height: 0.30 } },
  ];

  console.log('Region Name                    | Bounds (x,y,w,h)          | MeanSal | MaxSal | MeanDetail | MeanLum | SemMass | % Above Thresh');
  console.log('--------------------------------------------------------------------------------------------------------------------------');
  regions.forEach((r) => {
    const s = evaluateRegionStats(r.rect, luminance, energy, saliency, currentThreshold);
    const boundsStr = `[${r.rect.x.toFixed(2)},${r.rect.y.toFixed(2)},${r.rect.width.toFixed(2)},${r.rect.height.toFixed(2)}]`;
    console.log(
      `${r.name.padEnd(30)} | ${boundsStr.padEnd(25)} | ${s.meanSaliency.toFixed(3)}   | ${s.maxSaliency.toFixed(3)}  | ${s.meanDetail.toFixed(3)}      | ${s.meanLum.toFixed(3)}   | ${s.semanticMass.toFixed(1).padStart(7)} | ${s.percentAboveThreshold.toFixed(1).padStart(5)}%`
    );
  });

  // 3. CURRENT findSubjectBox() CONNECTED COMPONENTS
  console.log('\n--- 3. CURRENT findSubjectBox() CONNECTED COMPONENTS ---');
  const componentsCurrent = extractAllConnectedComponents(saliency, luminance, energy, COLS, ROWS, currentThreshold);
  console.log(`Discovered ${componentsCurrent.length} connected components at threshold ${currentThreshold.toFixed(4)}:`);
  componentsCurrent.forEach((c, idx) => {
    console.log(
      `Comp #${c.id}: Bounds [x=${c.rect.x.toFixed(3)}, y=${c.rect.y.toFixed(3)}, w=${c.rect.width.toFixed(3)}, h=${c.rect.height.toFixed(3)}] ` +
      `Tiles=${c.tileCount} Weight=${c.weight.toFixed(3)} MeanSal=${c.meanSaliency.toFixed(3)} PeakSal=${c.peakSaliency.toFixed(3)} MeanDetail=${c.meanEnergy.toFixed(3)} ${idx === 0 ? '--> WINNER (Best SubjectBox)' : '(Discarded)'}`
    );
  });

  // 4. THRESHOLD SENSITIVITY SIMULATION
  console.log('\n--- 4. THRESHOLD SENSITIVITY SIMULATION ---');
  const thresholdRatios = [0.45, 0.40, 0.35, 0.30, 0.25, 0.20];
  thresholdRatios.forEach((ratio) => {
    const t = peakSaliency * ratio;
    const comps = extractAllConnectedComponents(saliency, luminance, energy, COLS, ROWS, t);
    const best = comps[0];
    console.log(`\nThreshold ratio: ${ratio.toFixed(2)} (absolute: ${t.toFixed(4)}), Components Found: ${comps.length}`);
    if (best) {
      console.log(`  Top Component: [x=${best.rect.x.toFixed(3)}, y=${best.rect.y.toFixed(3)}, w=${best.rect.width.toFixed(3)}, h=${best.rect.height.toFixed(3)}], Tiles: ${best.tileCount}/${COLS * ROWS} (${((best.tileCount / (COLS * ROWS)) * 100).toFixed(1)}% canvas), Weight: ${best.weight.toFixed(3)}, MeanSal: ${best.meanSaliency.toFixed(3)}`);
    }
  });

  // 5. FALSE-QUIET ANALYSIS
  console.log('\n--- 5. FALSE-QUIET ANALYSIS ---');
  const chosenHeadlineRegion: FieldRect = { x: 0.055, y: 0.749, width: 0.876, height: 0.116 };
  const alternativeQuietRegion: FieldRect = { x: 0.56, y: 0.20, width: 0.44, height: 0.60 };

  const chosenStats = evaluateRegionStats(chosenHeadlineRegion, luminance, energy, saliency, currentThreshold);
  const altStats = evaluateRegionStats(alternativeQuietRegion, luminance, energy, saliency, currentThreshold);

  console.log('Chosen Headline Region (x=0.055, y=0.749, w=0.876, h=0.116):', chosenStats);
  console.log('Alternative Quiet Region (x=0.56, y=0.20, w=0.44, h=0.60):', altStats);

  // Save audit data to json
  const outJson = {
    gridStats: {
      cols: COLS,
      rows: ROWS,
      ground,
      maxDeviation,
      maxEnergy,
      peakSaliency,
      currentThreshold,
    },
    regions: regions.map(r => ({
      name: r.name,
      rect: r.rect,
      stats: evaluateRegionStats(r.rect, luminance, energy, saliency, currentThreshold),
    })),
    currentComponents: componentsCurrent,
    thresholdSensitivity: thresholdRatios.map(ratio => {
      const t = peakSaliency * ratio;
      const comps = extractAllConnectedComponents(saliency, luminance, energy, COLS, ROWS, t);
      return {
        ratio,
        absoluteThreshold: t,
        componentsCount: comps.length,
        bestComponent: comps[0] || null,
      };
    }),
    falseQuietComparison: {
      chosenHeadlineRegion: { rect: chosenHeadlineRegion, stats: chosenStats },
      alternativeQuietRegion: { rect: alternativeQuietRegion, stats: altStats },
    },
  };

  fs.writeFileSync(
    'C:\\Users\\mail\\.gemini\\antigravity-ide\\brain\\883c88f1-51d2-48c5-9f76-362c1a730c46\\scratch\\validation-output\\raw_field_audit_data.json',
    JSON.stringify(outJson, null, 2)
  );
  console.log('\nSaved full raw field audit to scratch/validation-output/raw_field_audit_data.json');
}

runRawFieldAudit().catch(console.error);
