import { createCanvasRepresentation, createBrandDesignRepresentation, createDesignField } from '../ai/render/design-representation';
import { analyzeImageField } from '../ai/render/image-field';
import { createDynamicCopyModel } from '../ai/render/copy-model';
import { exploreLineStructures } from '../ai/typography/dynamic-line-structure';
import { discoverPlacementCandidates, evaluatePlacementRegion } from '../ai/render/dynamic-placement';
import sharp from 'sharp';

async function runLuminaValidation() {
  const canvas = createCanvasRepresentation(1200, 1500); // 4:5 aspect ratio
  const brand = createBrandDesignRepresentation({
    brandProfile: { name: 'Lumina Audio', tone: 'editorial, minimalist, premium' },
    creativeDna: { brandColors: ['#0f172a', '#38bdf8'] },
  });

  // Recreate Lumina Audio visual field: high-detail headphones on the left (x: 0.05..0.45, y: 0.20..0.85)
  const width = 256;
  const height = 256;
  const raw = Buffer.alloc(width * height * 3).fill(240); // smooth bright studio backdrop

  for (let y = 50; y < 220; y++) {
    for (let x = 12; x < 115; x++) {
      const idx = (y * width + x) * 3;
      // High detail textures representing the headphone hardware
      const val = (x * 7 + y * 13) % 255 < 128 ? 25 : 80;
      raw[idx] = val;
      raw[idx + 1] = val;
      raw[idx + 2] = val;
    }
  }

  const imgBuf = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const field = createDesignField(await analyzeImageField(imgBuf));

  const headline = createDynamicCopyModel('h1', 'IMMERSIVE SPATIAL AUDIO', 'primary-hook', 1);
  const lineStates = exploreLineStructures({
    copy: headline,
    font: 'Inter',
    weight: 700,
    spatialBox: { x: 0, y: 0, width: 0.8, height: 0.35 },
    canvas,
  });

  const topTypography = lineStates[0];

  // OLD SYSTEM (Phase 0): Fixed box at top-left
  const oldFixedBox = { x: 0.08, y: 0.12, width: 0.84, height: 0.22 };
  const oldEval = evaluatePlacementRegion({ rect: oldFixedBox, field, canvas });

  // NEW SYSTEM (Phase 5): Continuous Placement Discovery
  const candidates = discoverPlacementCandidates({
    typographyState: topTypography,
    field,
    canvas,
    maxCandidates: 4,
    refineContinuous: true,
  });

  console.log('=== REAL CREATIVE VALIDATION: LUMINA AUDIO ===');
  console.log('OLD SYSTEM (Fixed Box):');
  console.log(`  - Box: x=${oldFixedBox.x}, y=${oldFixedBox.y}, w=${oldFixedBox.width}, h=${oldFixedBox.height}`);
  console.log(`  - Subject Overlap: ${oldEval.signals.subjectOverlap.classification} (${(oldEval.signals.subjectOverlap.overlapRatio * 100).toFixed(1)}% overlap)`);
  console.log(`  - Quietness: ${(oldEval.signals.quietness * 100).toFixed(1)}% | Composite Score: ${oldEval.scores.compositeScore}`);

  console.log('\nNEW SYSTEM (Continuous Placement Discovery):');
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    console.log(`  Candidate ${i + 1}:`);
    console.log(`    - Continuous Rect: x=${c.rect.x.toFixed(3)}, y=${c.rect.y.toFixed(3)}, w=${c.rect.width.toFixed(3)}, h=${c.rect.height.toFixed(3)}`);
    console.log(`    - Pixel Bounds: ${c.pixelBounds.xPx}px, ${c.pixelBounds.yPx}px (${c.pixelBounds.widthPx}x${c.pixelBounds.heightPx}px)`);
    console.log(`    - Quietness: ${(c.signals.quietness * 100).toFixed(1)}% | Detail Energy: ${c.signals.detailEnergy}`);
    console.log(`    - Subject Interaction: ${c.signals.subjectOverlap.classification} (${(c.signals.subjectOverlap.overlapRatio * 100).toFixed(1)}% overlap)`);
    console.log(`    - Composite Spatial Score: ${c.scores.compositeScore}`);
  }
}

runLuminaValidation().catch(console.error);
