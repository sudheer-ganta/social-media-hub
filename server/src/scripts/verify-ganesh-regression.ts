import fs from 'fs';
import path from 'path';
import { analyzeImageField } from '../ai/render/image-field';
import { createDesignField, createCanvasRepresentation } from '../ai/render/design-representation';
import { discoverPlacementCandidates, evaluatePlacementRegion } from '../ai/render/dynamic-placement';
import { createDynamicCopyModel } from '../ai/render/copy-model';
import { exploreLineStructures } from '../ai/typography/dynamic-line-structure';

async function main() {
  console.log('=== GANESH/VILLY FORENSIC REGRESSION VERIFICATION ===\n');

  const imgPath = path.resolve('C:/Users/mail/.gemini/antigravity-ide/brain/883c88f1-51d2-48c5-9f76-362c1a730c46/scratch/validation-output/audit_raw_image.png');
  if (!fs.existsSync(imgPath)) {
    throw new Error('Could not find audit_raw_image.png at ' + imgPath);
  }

  const png = fs.readFileSync(imgPath);
  const rawField = await analyzeImageField(png);
  const field = createDesignField(rawField);
  const canvas = createCanvasRepresentation(1080, 1080);

  // Define spatial regions
  const headlineRegion = { x: 0.055, y: 0.749, width: 0.876, height: 0.116 };
  const faceRegion = { x: 0.35, y: 0.15, width: 0.30, height: 0.20 };
  const sareeRegion = { x: 0.20, y: 0.55, width: 0.60, height: 0.35 };
  const quietTopSide = { x: 0.05, y: 0.05, width: 0.25, height: 0.12 };

  // Occupancy measurements
  const headlineOcc = field.occupancyAt(headlineRegion);
  const faceOcc = field.occupancyAt(faceRegion);
  const sareeOcc = field.occupancyAt(sareeRegion);
  const quietOcc = field.occupancyAt(quietTopSide);

  console.log('SPATIAL OCCUPANCY MEASUREMENTS:');
  console.log(`- Headline region (x=0.055, y=0.749, w=0.876, h=0.116): ${(headlineOcc * 100).toFixed(1)}% (occupancy = ${headlineOcc.toFixed(4)})`);
  console.log(`- Face region     (x=0.350, y=0.150, w=0.300, h=0.200): ${(faceOcc * 100).toFixed(1)}% (occupancy = ${faceOcc.toFixed(4)})`);
  console.log(`- Saree region    (x=0.200, y=0.550, w=0.600, h=0.350): ${(sareeOcc * 100).toFixed(1)}% (occupancy = ${sareeOcc.toFixed(4)})`);
  console.log(`- Quiet BG region (x=0.050, y=0.050, w=0.250, h=0.120): ${(quietOcc * 100).toFixed(1)}% (occupancy = ${quietOcc.toFixed(4)})`);

  // Placement evaluation of the old winning headline rectangle
  const oldRectEval = evaluatePlacementRegion({
    rect: headlineRegion,
    field,
    canvas,
  });

  console.log('\nOLD WINNING HEADLINE RECTANGLE EVALUATION:');
  console.log(`- subjectOverlap (overlapRatio): ${oldRectEval.signals.subjectOverlap.overlapRatio}`);
  console.log(`- subjectOcclusionRatio:         ${oldRectEval.signals.subjectOverlap.subjectOcclusionRatio}`);
  console.log(`- overlapDetailEnergy:           ${oldRectEval.signals.subjectOverlap.overlapDetailEnergy}`);
  console.log(`- classification:                ${oldRectEval.signals.subjectOverlap.classification}`);
  console.log(`- subjectHarmonyScore:           ${oldRectEval.scores.subjectHarmonyScore}`);
  console.log(`- compositeScore:                ${oldRectEval.scores.compositeScore}`);

  // Discover candidate placements with actual headline copy
  const copy = createDynamicCopyModel('h1', 'Experience 2D Virtual Saree Try-On from Home', 'primary-hook', 1);
  const lineStates = exploreLineStructures({ copy, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.88, height: 0.12 }, canvas });

  const candidates = discoverPlacementCandidates({
    typographyState: lineStates[0],
    field,
    canvas,
    maxCandidates: 16,
  });

  console.log('\nCANDIDATE DISCOVERY & RANKING:');
  console.log(`Top 5 candidates:`);
  candidates.slice(0, 5).forEach((c, idx) => {
    console.log(`  [#${idx + 1}] x=${c.rect.x.toFixed(3)}, y=${c.rect.y.toFixed(3)}, score=${c.scores.compositeScore.toFixed(3)}, overlap=${c.signals.subjectOverlap.overlapRatio}, class=${c.signals.subjectOverlap.classification}`);
  });

  // Find where the old headline region ranks among all candidates
  const oldRank = candidates.findIndex((c) => Math.abs(c.rect.y - headlineRegion.y) < 0.08);
  console.log(`\nOld winning rectangle rank among discovered candidates: ${oldRank >= 0 ? `#${oldRank + 1} of ${candidates.length}` : 'Filtered out / ranked below cutoff'}`);
}

main().catch(console.error);
