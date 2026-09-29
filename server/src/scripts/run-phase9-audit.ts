import {
  createCanvasRepresentation,
  createBrandDesignRepresentation,
  createDesignField,
} from '../ai/render/design-representation';
import { analyzeImageField } from '../ai/render/image-field';
import { discoverOptimizedComposition } from '../ai/render/composition-evaluation';
import { discoverSurfaceCandidates } from '../ai/render/dynamic-surface';
import { discoverInkCandidates } from '../ai/render/dynamic-color';
import sharp from 'sharp';

async function createField(width: number, height: number, painter: (raw: Buffer) => void) {
  const raw = Buffer.alloc(width * height * 3).fill(220);
  painter(raw);
  const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const metrics = await analyzeImageField(png);
  return createDesignField(metrics);
}

async function runAudit() {
  console.log('=== PART 1: 10 CREATIVES DETAILED SURFACE CANDIDATE AUDIT ===\n');

  const archetypes = [
    { name: '1. Fashion / Editorial', setup: (r: Buffer) => r.fill(245), colors: ['#0f172a', '#e2e8f0'] },
    { name: '2. Food / Culinary', setup: (r: Buffer) => { for (let i = 0; i < r.length; i += 3) { r[i] = 210; r[i + 1] = 130; r[i + 2] = 50; } }, colors: ['#78350f', '#fef3c7'] },
    { name: '3. Technology', setup: (r: Buffer) => r.fill(25), colors: ['#0284c7', '#06b6d4', '#e0f2fe'] },
    { name: '4. Portrait Hero', setup: (r: Buffer) => { r.fill(220); for (let y = 40; y < 220; y++) for (let x = 110; x < 230; x++) { const idx = (y * 256 + x) * 3; r[idx] = 40; r[idx + 1] = 40; r[idx + 2] = 40; } }, colors: ['#18181b', '#fafafa'] },
    { name: '5. Product Hero', setup: (r: Buffer) => { r.fill(235); for (let y = 60; y < 210; y++) for (let x = 20; x < 110; x++) { const idx = (y * 256 + x) * 3; r[idx] = 30; r[idx + 1] = 35; r[idx + 2] = 45; } }, colors: ['#0f172a', '#38bdf8'] },
    { name: '6. Text-Heavy Editorial', setup: (r: Buffer) => r.fill(240), colors: ['#1c1917', '#44403c'] },
    { name: '7. Image-Heavy Minimalist', setup: (r: Buffer) => { for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const idx = (y * 256 + x) * 3; r[idx] = 20; r[idx + 1] = 70 + (y % 40); r[idx + 2] = 40; } }, colors: ['#064e3b', '#ecfdf5'] },
    { name: '8. Dark Automotive', setup: (r: Buffer) => r.fill(18), colors: ['#e11d48', '#f8fafc'] },
    { name: '9. Bright Cosmetics', setup: (r: Buffer) => r.fill(248), colors: ['#881337', '#ffe4e6'] },
    { name: '10. High-Detail Texture', setup: (r: Buffer) => { for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const idx = (y * 256 + x) * 3; const val = (x * 37 + y * 67) % 255; r[idx] = val; r[idx + 1] = val; r[idx + 2] = val; } }, colors: ['#1e293b', '#f1f5f9'] },
  ];

  const canvas = createCanvasRepresentation(1200, 1500);

  for (const arch of archetypes) {
    console.log(`----------------------------------------------------------------`);
    console.log(`CREATIVE: ${arch.name}`);
    console.log(`----------------------------------------------------------------`);

    const field = await createField(256, 256, arch.setup);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'Test', tone: 'clean' },
      creativeDna: { brandColors: arch.colors },
    });

    const footprint = { x: 0.1, y: 0.1, width: 0.7, height: 0.18 };
    const reg = field.evaluateRegion(footprint);
    console.log(`Image Field under [0.1, 0.1, 0.7, 0.18]:`);
    console.log(`  - Mean Lum: ${(reg.meanLuminance * 100).toFixed(1)}% | StdDev: ${reg.luminanceStdDev.toFixed(3)} | Detail Energy: ${(reg.detailEnergy * 100).toFixed(1)}% | Subject Overlap: ${((reg.subjectOcclusion || 0) * 100).toFixed(1)}%`);

    const inks = discoverInkCandidates({ role: 'headline', footprint, field, canvas, brand });
    const primaryInk = inks[0];
    console.log(`Primary Ink: ${primaryInk.color.hex} (${primaryInk.provenance.derivationType}) -> Baseline WCAG ${primaryInk.contrast.wcagRatio}:1, APCA ${primaryInk.contrast.apcaEstimatedLc}`);

    const surfaces = discoverSurfaceCandidates({
      targetElementIds: ['h1'],
      footprint,
      ink: primaryInk,
      field,
      canvas,
      brand,
      maxCandidates: 4,
    });

    console.log(`Generated Surface Candidates (${surfaces.length}):`);
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const isNull = s.surfaceField === null;
      console.log(`  Candidate ${i + 1}: ${isNull ? 'NO-SURFACE' : s.surfaceField!.provenance.derivationType}`);
      console.log(`    * Score: composite=${(s.scores.compositeSurfaceScore * 100).toFixed(1)}% | necessity=${(s.scores.necessityScore * 100).toFixed(1)}% | suitability=${(s.scores.suitabilityScore * 100).toFixed(1)}%`);
      console.log(`    * Signals: contrastGain=+${s.signals.contrastGain}:1 | clarityGain=${(s.signals.clarityGain * 100).toFixed(0)}% | detailReduction=${(s.signals.detailReduction * 100).toFixed(0)}% | imagePreservation=${(s.signals.imagePreservation * 100).toFixed(0)}% | subjectPreservation=${(s.signals.subjectPreservation * 100).toFixed(0)}% | disruption=${(s.signals.visualDisruption * 100).toFixed(0)}% | cost=${(s.signals.interventionCost * 100).toFixed(0)}%`);
      if (!isNull) {
        console.log(`    * Parameters: peakOpacity=${(s.surfaceField!.opacityField.peak * 100).toFixed(0)}% | blur=${s.surfaceField!.blurSigmaPx}px | falloff=${s.surfaceField!.falloffExponent} | color=${s.surfaceField!.colorField.baseColor.hex}`);
      }
    }
  }

  console.log('\n=== PART 2: FORCED DIFFICULT SURFACE CASE ===\n');
  {
    const noisyField = await createField(256, 256, (raw) => {
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const idx = (y * 256 + x) * 3;
          const val = (Math.sin(x * 0.3) * Math.cos(y * 0.3) > 0) ? 230 : 25;
          raw[idx] = val; raw[idx + 1] = val; raw[idx + 2] = val;
        }
      }
    });

    const footprint = { x: 0.1, y: 0.2, width: 0.8, height: 0.25 };
    const reg = noisyField.evaluateRegion(footprint);
    console.log(`Noisy High-Variance Field:`);
    console.log(`  - Mean Lum: ${(reg.meanLuminance * 100).toFixed(1)}% | StdDev: ${reg.luminanceStdDev.toFixed(3)} | Detail Energy: ${(reg.detailEnergy * 100).toFixed(1)}%`);

    const brand = createBrandDesignRepresentation({
      brandProfile: { name: 'NoisyTest', tone: 'bold' },
      creativeDna: { brandColors: ['#3b82f6', '#1e293b'] },
    });

    const inks = discoverInkCandidates({ role: 'headline', footprint, field: noisyField, canvas, brand });
    console.log(`Discovered Inks: ${inks.map(k => `${k.color.hex} (WCAG ${k.contrast.wcagRatio}:1)`).join(', ')}`);

    const surfaces = discoverSurfaceCandidates({
      targetElementIds: ['h1'],
      footprint,
      ink: inks[0],
      field: noisyField,
      canvas,
      brand,
      maxCandidates: 4,
    });

    console.log(`Surface Candidates under High Variance Noise:`);
    for (const s of surfaces) {
      const isNull = s.surfaceField === null;
      console.log(`  Candidate [${isNull ? 'NO-SURFACE' : s.surfaceField!.provenance.derivationType}]: composite=${(s.scores.compositeSurfaceScore * 100).toFixed(1)}% | necessity=${(s.scores.necessityScore * 100).toFixed(1)}% | suitability=${(s.scores.suitabilityScore * 100).toFixed(1)}% | contrastGain=+${s.signals.contrastGain}:1 | detailRed=${(s.signals.detailReduction * 100).toFixed(0)}% | cost=${(s.signals.interventionCost * 100).toFixed(0)}%`);
    }
  }

  console.log('\n=== PART 3: 20 SYNTHETIC IMAGE FIELDS PLACEMENT DISTRIBUTION TEST ===\n');
  {
    const results: Array<{ id: number; name: string; centroid: { x: number; y: number; w: number; h: number } }> = [];
    for (let i = 1; i <= 20; i++) {
      const field = await createField(256, 256, (raw) => {
        raw.fill(230);
        if (i <= 5) {
          // Subject on left (x: 10..130) -> quiet space is right
          for (let y = 30; y < 220; y++) for (let x = 10; x < 130; x++) { const idx = (y * 256 + x) * 3; raw[idx] = 20; raw[idx + 1] = 20; raw[idx + 2] = 20; }
        } else if (i <= 10) {
          // Subject on right (x: 125..245) -> quiet space is left
          for (let y = 30; y < 220; y++) for (let x = 125; x < 245; x++) { const idx = (y * 256 + x) * 3; raw[idx] = 20; raw[idx + 1] = 20; raw[idx + 2] = 20; }
        } else if (i <= 15) {
          // Subject in center (x: 60..196, y: 70..190) -> quiet space top or bottom
          for (let y = 70; y < 190; y++) for (let x = 60; x < 196; x++) { const idx = (y * 256 + x) * 3; raw[idx] = 20; raw[idx + 1] = 20; raw[idx + 2] = 20; }
        } else {
          // Asymmetrical vertical gradient
          for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const idx = (y * 256 + x) * 3; const val = (y * (i - 15) * 16) % 255; raw[idx] = val; raw[idx + 1] = val; raw[idx + 2] = val; }
        }
      });

      const copyItems = [{ id: 'h1', text: `DYNAMIC TITLE ${i}`, role: 'headline' as const, priority: 1 }];
      const opt = discoverOptimizedComposition({ copyItems, field, canvas });
      const el = opt.bestState.elements[0];
      results.push({
        id: i,
        name: i <= 5 ? `Subject Left (${i})` : i <= 10 ? `Subject Right (${i})` : i <= 15 ? `Subject Center (${i})` : `Gradient/Texture (${i})`,
        centroid: {
          x: Number(el.rect.x.toFixed(4)),
          y: Number(el.rect.y.toFixed(4)),
          w: Number(el.rect.width.toFixed(4)),
          h: Number(el.rect.height.toFixed(4)),
        },
      });
    }

    console.log(`Recorded 20 Placement Outcomes:`);
    for (const r of results) {
      console.log(`  Test ${r.id.toString().padStart(2, ' ')} [${r.name.padEnd(22, ' ')}]: x=${r.centroid.x.toFixed(3)}, y=${r.centroid.y.toFixed(3)}, w=${r.centroid.w.toFixed(3)}, h=${r.centroid.h.toFixed(3)}`);
    }
  }
}

runAudit().catch(console.error);
