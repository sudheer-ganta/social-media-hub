import { createCanvasRepresentation, createDesignField } from '../ai/render/design-representation';
import { analyzeImageField } from '../ai/render/image-field';
import { createDynamicCopyModel } from '../ai/render/copy-model';
import { exploreLineStructures } from '../ai/typography/dynamic-line-structure';
import { discoverPlacementCandidates } from '../ai/render/dynamic-placement';
import {
  discoverNaturalAxes,
  enhancePlacementCandidatesWithAlignment,
} from '../ai/render/dynamic-alignment';
import {
  evaluatePairwiseSpacing,
  evaluateCompositionSpacing,
  enhanceMultiElementCompositionWithSpacing,
  SpacingElement,
} from '../ai/render/dynamic-spacing';
import sharp from 'sharp';

async function benchmark() {
  const canvas = createCanvasRepresentation(1200, 1500);

  // Synthetic image with subject
  const raw = Buffer.alloc(256 * 256 * 3).fill(220);
  for (let y = 50; y < 200; y++) {
    for (let x = 30; x < 120; x++) {
      const idx = (y * 256 + x) * 3;
      const val = (x + y) % 3 === 0 ? 40 : 160;
      raw[idx] = val;
      raw[idx + 1] = val;
      raw[idx + 2] = val;
    }
  }
  const imgBuf = await sharp(raw, { raw: { width: 256, height: 256, channels: 3 } }).png().toBuffer();
  const field = createDesignField(await analyzeImageField(imgBuf));

  const copyH1 = createDynamicCopyModel('h1', 'THE NEW ARTISANAL BREW COLLECTION', 'primary-hook', 1);
  const lineStates = exploreLineStructures({ copy: copyH1, font: 'Inter', weight: 700, spatialBox: { x: 0, y: 0, width: 0.8, height: 0.4 }, canvas });
  const topState = lineStates[0];

  const primaryPlacements = discoverPlacementCandidates({
    typographyState: topState,
    field,
    canvas,
    maxCandidates: 4,
  });

  const discoveredAxes = discoverNaturalAxes({ field, canvas });
  const enhancedAlign = enhancePlacementCandidatesWithAlignment({
    candidates: primaryPlacements,
    field,
    canvas,
    discoveredAxes,
  });

  const elA: SpacingElement = {
    id: 'h1',
    role: 'headline',
    hierarchyLevel: 1,
    rect: { x: 0.1, y: 0.08, width: 0.75, height: 0.14 },
    geometry: enhancedAlign[0].geometry,
  };

  const elB: SpacingElement = {
    id: 'sub',
    role: 'subheadline',
    hierarchyLevel: 2,
    rect: { x: 0.1, y: 0.25, width: 0.6, height: 0.05 },
  };

  const elC: SpacingElement = {
    id: 'cta',
    role: 'cta',
    hierarchyLevel: 3,
    rect: { x: 0.1, y: 0.34, width: 0.3, height: 0.06 },
  };

  const elD: SpacingElement = {
    id: 'logo',
    role: 'logo',
    hierarchyLevel: 4,
    rect: { x: 0.75, y: 0.88, width: 0.18, height: 0.05 },
  };

  const elements = [elA, elB, elC, elD];

  // 1. Single pair relationship evaluation (1,000 calls)
  const tSingle0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    evaluatePairwiseSpacing({ elementA: elA, elementB: elB, field, canvas });
  }
  const tSingle1 = performance.now();

  // 2. 100 & 1,000 evaluations
  const t100_0 = performance.now();
  for (let i = 0; i < 100; i++) {
    evaluatePairwiseSpacing({ elementA: elA, elementB: elB, field, canvas });
  }
  const t100_1 = performance.now();

  const t1000_0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    evaluatePairwiseSpacing({ elementA: elA, elementB: elB, field, canvas });
  }
  const t1000_1 = performance.now();

  // 3. Multi-Element Graph Evaluation (100 runs)
  const tGraph0 = performance.now();
  let compResult: any;
  for (let i = 0; i < 100; i++) {
    compResult = evaluateCompositionSpacing({ elements, field, canvas });
  }
  const tGraph1 = performance.now();

  // 4. Full Placement + Alignment + Spacing Combined Pipeline (50 cycles)
  const tFull0 = performance.now();
  let fullResult: any;
  for (let i = 0; i < 50; i++) {
    const pl = discoverPlacementCandidates({
      typographyState: topState,
      field,
      canvas,
      maxCandidates: 4,
    });
    const al = enhancePlacementCandidatesWithAlignment({
      candidates: pl,
      field,
      canvas,
      discoveredAxes,
    });
    fullResult = enhanceMultiElementCompositionWithSpacing({
      primaryPlacement: al[0],
      secondaryPlacements: [
        { role: 'subheadline', candidate: { rect: elB.rect } as any },
        { role: 'cta', candidate: { rect: elC.rect } as any },
      ],
      field,
      canvas,
    });
  }
  const tFull1 = performance.now();

  console.log('=== Phase 7 Dynamic Spacing & Grouping Engine Benchmark ===');
  console.log(`Single Pair Relationship Evaluation (1,000 calls): ${(((tSingle1 - tSingle0) / 1000) * 1000).toFixed(2)} µs / call`);
  console.log(`100 Relationship Evaluations: ${(t100_1 - t100_0).toFixed(3)} ms (${(((t100_1 - t100_0) / 100) * 1000).toFixed(2)} µs / eval)`);
  console.log(`1,000 Relationship Evaluations: ${(t1000_1 - t1000_0).toFixed(3)} ms (${(((t1000_1 - t1000_0) / 1000) * 1000).toFixed(2)} µs / eval)`);
  console.log(`Multi-Element Spacing Graph Evaluation (4 elements, 6 edges): ${((tGraph1 - tGraph0) / 100).toFixed(3)} ms / eval`);
  console.log(`Full Combined Pipeline (Placement + Alignment + Spacing Graph): ${((tFull1 - tFull0) / 50).toFixed(3)} ms / cycle`);
  console.log('\nEvaluated Multi-Element Graph State:');
  console.log(`  - Discovered Groups: ${compResult.graph.discoveredGroups.length}`);
  console.log(`  - Composite Spacing Score: ${compResult.scores.compositeSpacingScore}`);
  console.log(`  - Group-Level Coherence: ${(compResult.graph.groupLevelCoherence * 100).toFixed(0)}%`);
  for (const edge of compResult.graph.edges.slice(0, 3)) {
    console.log(`  - Edge [${edge.roleA} ↔ ${edge.roleB}]: vertGap=${edge.verticalGap.toFixed(3)} | edgeDist=${edge.edgeDistance.toFixed(3)} | groupingAffinity=${(edge.groupingAffinity * 100).toFixed(0)}%`);
  }
}

benchmark().catch(console.error);
