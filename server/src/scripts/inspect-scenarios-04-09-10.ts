import fs from 'fs';
import path from 'path';
import { analyzeImageField } from '../ai/render/image-field';
import { createDesignField, createCanvasRepresentation } from '../ai/render/design-representation';
import { discoverPlacementCandidates, evaluatePlacementRegion } from '../ai/render/dynamic-placement';
import { createDynamicCopyModel } from '../ai/render/copy-model';
import { exploreLineStructures } from '../ai/typography/dynamic-line-structure';

async function inspectScenario(scenarioId: string, headline: string) {
  const dir = path.resolve('C:/Users/mail/.gemini/antigravity-ide/brain/883c88f1-51d2-48c5-9f76-362c1a730c46/scratch/validation-output/10-creatives-v2');
  const imgPath = path.join(dir, `${scenarioId}_raw.png`);

  if (!fs.existsSync(imgPath)) {
    console.log(`Image not found: ${imgPath}`);
    return;
  }

  const png = fs.readFileSync(imgPath);
  const rawField = await analyzeImageField(png);
  const field = createDesignField(rawField);
  const canvas = createCanvasRepresentation(1080, 1080);

  const copyModel = createDynamicCopyModel('h1', headline, 'primary-hook', 1);
  const lineStates = exploreLineStructures({
    copy: copyModel,
    font: 'Inter',
    weight: 700,
    spatialBox: { x: 0, y: 0, width: 0.85, height: 0.20 },
    canvas,
  });

  const candidates = discoverPlacementCandidates({
    typographyState: lineStates[0],
    field,
    canvas,
    maxCandidates: 16,
  });

  console.log(`\n================================================================`);
  console.log(`SCENARIO: ${scenarioId}`);
  console.log(`Total Occupancy Mass: ${(rawField.totalOccupancyMass * 100).toFixed(1)}%`);
  console.log(`Field stats: subjectBox =`, rawField.subjectBox);

  // Quadrant occupancy breakdown
  const qTop = field.occupancyAt({ x: 0.05, y: 0.05, width: 0.90, height: 0.30 });
  const qMid = field.occupancyAt({ x: 0.05, y: 0.35, width: 0.90, height: 0.30 });
  const qBot = field.occupancyAt({ x: 0.05, y: 0.65, width: 0.90, height: 0.30 });
  console.log(`Quadrant Occupancies: Top: ${(qTop * 100).toFixed(1)}%, Mid: ${(qMid * 100).toFixed(1)}%, Bot: ${(qBot * 100).toFixed(1)}%`);

  console.log(`Top 5 candidates discovered:`);
  candidates.slice(0, 5).forEach((c, idx) => {
    console.log(`  [#${idx + 1}] y=${c.rect.y.toFixed(3)}, x=${c.rect.x.toFixed(3)}, w=${c.rect.width.toFixed(3)}, h=${c.rect.height.toFixed(3)} | Overlap: ${(c.signals.subjectOverlap.overlapRatio * 100).toFixed(1)}%, Occlusion: ${(c.signals.subjectOverlap.subjectOcclusionRatio * 100).toFixed(1)}%, Score: ${c.scores.compositeScore.toFixed(3)}`);
  });
}

async function main() {
  await inspectScenario('04_food_beverage', 'Slow Fermented Artisan Sourdough');
  await inspectScenario('09_multiple_subjects', 'Ceremonial Uji Matcha Pastry Trio');
  await inspectScenario('10_negative_space', 'Handmade Architectural Ceramics');
}

main().catch(console.error);
