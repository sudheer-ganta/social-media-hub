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

async function runCreativeValidation() {
  console.log('================================================================');
  console.log('PHASE 9 — GLOBAL COMPOSITION ENGINE REAL CREATIVE VALIDATION');
  console.log('Validating across 10 Distinct Design Archetypes');
  console.log('================================================================\n');

  const archetypes = [
    {
      name: '1. Fashion / Editorial (High-Key Minimalist)',
      canvas: createCanvasRepresentation(1200, 1500), // 4:5
      brand: { name: 'Maison Vogue', brandColors: ['#0f172a', '#e2e8f0'] },
      copy: [
        { id: 'h1', text: 'AUTUMN SILHOUETTES', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: 'Architectural Tailoring for the Modern Era', role: 'subheadline' as const, priority: 2 },
      ],
      fieldSetup: (raw: Buffer) => raw.fill(245), // clean bright high-key
    },
    {
      name: '2. Food / Culinary (Warm Ambient Centric)',
      canvas: createCanvasRepresentation(1080, 1080), // 1:1
      brand: { name: 'Artisan Bistro', brandColors: ['#78350f', '#fef3c7'] },
      copy: [
        { id: 'h1', text: 'HANDCRAFTED SEASONAL TASTING MENU', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: 'Seven Courses of Hyper-Local Gastronomy', role: 'subheadline' as const, priority: 2 },
      ],
      fieldSetup: (raw: Buffer) => {
        for (let i = 0; i < raw.length; i += 3) {
          raw[i] = 210; raw[i + 1] = 130; raw[i + 2] = 50; // warm amber
        }
      },
    },
    {
      name: '3. Technology (Dark Cyber Matrix)',
      canvas: createCanvasRepresentation(1920, 1080), // 16:9
      brand: { name: 'NovaTech', brandColors: ['#0284c7', '#06b6d4', '#e0f2fe'] },
      copy: [
        { id: 'h1', text: 'NEXT-GENERATION DISTRIBUTED CLOUD', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: 'Sub-millisecond Edge Intelligence', role: 'subheadline' as const, priority: 2 },
        { id: 'cta', text: 'DEPLOY CLUSTER', role: 'cta' as const, priority: 3 },
      ],
      fieldSetup: (raw: Buffer) => raw.fill(25), // deep dark matrix
    },
    {
      name: '4. Portrait (Subject Overlap Preservation)',
      canvas: createCanvasRepresentation(1200, 1500),
      brand: { name: 'Studio Persona', brandColors: ['#18181b', '#fafafa'] },
      copy: [
        { id: 'h1', text: 'THE ART OF AUTHENTIC LEADERSHIP', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: 'Executive Coaching with Dr. Elena Vance', role: 'subheadline' as const, priority: 2 },
      ],
      fieldSetup: (raw: Buffer) => {
        raw.fill(220);
        // Portrait subject in center-right
        for (let y = 40; y < 220; y++) {
          for (let x = 110; x < 230; x++) {
            const idx = (y * 256 + x) * 3;
            raw[idx] = 40; raw[idx + 1] = 40; raw[idx + 2] = 40;
          }
        }
      },
    },
    {
      name: '5. Product Hero (Off-Center Audio Hardware)',
      canvas: createCanvasRepresentation(1200, 1500),
      brand: { name: 'Lumina Audio', brandColors: ['#0f172a', '#38bdf8'] },
      copy: [
        { id: 'h1', text: 'IMMERSIVE SPATIAL AUDIO', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: '40mm Custom Beryllium Transducers', role: 'subheadline' as const, priority: 2 },
        { id: 'cta', text: 'EXPERIENCE SOUND', role: 'cta' as const, priority: 3 },
      ],
      fieldSetup: (raw: Buffer) => {
        raw.fill(235);
        // Headphone on left
        for (let y = 60; y < 210; y++) {
          for (let x = 20; x < 110; x++) {
            const idx = (y * 256 + x) * 3;
            raw[idx] = 30; raw[idx + 1] = 35; raw[idx + 2] = 45;
          }
        }
      },
    },
    {
      name: '6. Text-Heavy Editorial (Multi-Sentence Narrative)',
      canvas: createCanvasRepresentation(1200, 1500),
      brand: { name: 'Chronicle Review', brandColors: ['#1c1917', '#44403c'] },
      copy: [
        { id: 'h1', text: 'THE FUTURE OF COMPUTING BEYOND SILICON', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: 'How Quantum Photonics is Breaking the Moore Law Barrier', role: 'subheadline' as const, priority: 2 },
        { id: 'body', text: 'New room-temperature optical lattice architectures demonstrate 100x efficiency gains.', role: 'body' as const, priority: 3 },
      ],
      fieldSetup: (raw: Buffer) => raw.fill(240),
    },
    {
      name: '7. Image-Heavy Minimalist (Hero Photography Dominance)',
      canvas: createCanvasRepresentation(1920, 1080),
      brand: { name: 'Horizon Wild', brandColors: ['#064e3b', '#ecfdf5'] },
      copy: [
        { id: 'h1', text: 'UNTOUCHED WILDERNESS', role: 'headline' as const, priority: 1 },
      ],
      fieldSetup: (raw: Buffer) => {
        for (let y = 0; y < 256; y++) {
          for (let x = 0; x < 256; x++) {
            const idx = (y * 256 + x) * 3;
            raw[idx] = 20; raw[idx + 1] = 70 + (y % 40); raw[idx + 2] = 40;
          }
        }
      },
    },
    {
      name: '8. Dark Low-Key Atmospheric (Midnight Automotive)',
      canvas: createCanvasRepresentation(1920, 1080),
      brand: { name: 'Apex Motors', brandColors: ['#e11d48', '#f8fafc'] },
      copy: [
        { id: 'h1', text: 'PURE ELECTRIC PERFORMANCE', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: '0 to 100 km/h in 2.1 Seconds', role: 'subheadline' as const, priority: 2 },
      ],
      fieldSetup: (raw: Buffer) => raw.fill(18),
    },
    {
      name: '9. Bright Studio Surface (Cosmetics Clean Look)',
      canvas: createCanvasRepresentation(1080, 1080),
      brand: { name: 'Aura Skincare', brandColors: ['#881337', '#ffe4e6'] },
      copy: [
        { id: 'h1', text: 'CELLULAR RADIANCE ELIXIR', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: 'Botanical Ferments & Peptide Complex', role: 'subheadline' as const, priority: 2 },
      ],
      fieldSetup: (raw: Buffer) => raw.fill(248),
    },
    {
      name: '10. High-Detail Texture (Noisy Granular Surface)',
      canvas: createCanvasRepresentation(1200, 1500),
      brand: { name: 'Craft Concrete', brandColors: ['#1e293b', '#f1f5f9'] },
      copy: [
        { id: 'h1', text: 'RAW ARCHITECTURAL TEXTURES', role: 'headline' as const, priority: 1 },
        { id: 'sub', text: 'Bespoke Terrazzo & Cast Concrete Surfaces', role: 'subheadline' as const, priority: 2 },
      ],
      fieldSetup: (raw: Buffer) => {
        for (let y = 0; y < 256; y++) {
          for (let x = 0; x < 256; x++) {
            const idx = (y * 256 + x) * 3;
            const val = (x * 37 + y * 67) % 255;
            raw[idx] = val; raw[idx + 1] = val; raw[idx + 2] = val;
          }
        }
      },
    },
  ];

  for (const arch of archetypes) {
    console.log(`\n================================================================`);
    console.log(`ARCHETYPE: ${arch.name}`);
    console.log(`================================================================`);

    const field = await createField(256, 256, arch.fieldSetup);
    const brand = createBrandDesignRepresentation({
      brandProfile: { name: arch.brand.name, tone: 'professional' },
      creativeDna: { brandColors: arch.brand.brandColors },
    });

    const result = discoverOptimizedComposition({
      copyItems: arch.copy,
      field,
      canvas: arch.canvas,
      brand,
    });

    const state = result.bestState;
    console.log(`Selected Composition State [${state.id}]:`);
    console.log(`  - Aggregate Score: ${(state.evaluation.aggregateScore * 100).toFixed(1)}%`);
    console.log(`  - Active Surfaces: ${state.surfaces.length === 0 ? 'None (Clean no-surface baseline)' : state.surfaces.map(s => s.provenance.derivationType).join(', ')}`);
    console.log(`  - Elements (${state.elements.length}):`);
    for (const el of state.elements) {
      const surfaceCand = el.surface;
      const surfaceDiscovery = discoverSurfaceCandidates({
        targetElementIds: [el.id],
        footprint: el.rect,
        ink: el.ink,
        field,
        canvas: arch.canvas,
        brand,
      });
      const noSurfaceCand = surfaceDiscovery.find((s) => s.surfaceField === null);
      const topSurfaceCand = surfaceDiscovery.find((s) => s.surfaceField !== null);

      console.log(`    * [${el.role.toUpperCase()}] rect=[x:${el.rect.x.toFixed(3)}, y:${el.rect.y.toFixed(3)}, w:${el.rect.width.toFixed(3)}, h:${el.rect.height.toFixed(3)}]`);
      console.log(`      Font: scale=${el.typographyState.fontScale.toFixed(4)}, weight=${el.typographyState.weight} | Ink: ${el.ink.color.hex}`);
      console.log(`      Baseline Contrast: ${surfaceCand.signals.baselineWcag.toFixed(2)}:1 (APCA: ${el.ink.contrast.apcaEstimatedLc})`);
      console.log(`      Post-Surface Contrast: ${surfaceCand.signals.postSurfaceWcag.toFixed(2)}:1 | Gain: +${surfaceCand.signals.contrastGain.toFixed(2)}`);
      console.log(`      Surface Intervention Cost: ${(surfaceCand.signals.interventionCost * 100).toFixed(1)}% | Image Preservation: ${(surfaceCand.signals.imagePreservation * 100).toFixed(1)}%`);
      console.log(`      Candidate Scores: No-Surface=${noSurfaceCand ? (noSurfaceCand.scores.compositeSurfaceScore * 100).toFixed(1) + '%' : 'N/A'} | Top-Surface=${topSurfaceCand ? (topSurfaceCand.scores.compositeSurfaceScore * 100).toFixed(1) + '%' : 'N/A'}`);
      console.log(`      Selected State: ${surfaceCand.surfaceField ? surfaceCand.surfaceField.provenance.derivationType : 'no-surface'}`);
    }

    console.log(`  - Tradeoff Profile:`);
    console.log(`    * Legibility: ${(state.tradeoffProfile.legibilityScore * 100).toFixed(0)}%`);
    console.log(`    * Image Integrity: ${(state.tradeoffProfile.imageIntegrityScore * 100).toFixed(0)}%`);
    console.log(`    * Brand Adherence: ${(state.tradeoffProfile.brandAdherenceScore * 100).toFixed(0)}%`);
    console.log(`    * Spatial Harmony: ${(state.tradeoffProfile.spatialHarmonyScore * 100).toFixed(0)}%`);
    console.log(`    * Hierarchy Clarity: ${(state.tradeoffProfile.hierarchyClarityScore * 100).toFixed(0)}%`);

    console.log(`  - Interaction Signals:`);
    console.log(`    * Type × Image: ${(state.interactionSignals.typeImage * 100).toFixed(0)}%`);
    console.log(`    * Color × Surface: ${(state.interactionSignals.colorSurface * 100).toFixed(0)}%`);
    console.log(`    * Placement × Alignment: ${(state.interactionSignals.placementAlignment * 100).toFixed(0)}%`);
    console.log(`    * Spacing × Hierarchy: ${(state.interactionSignals.spacingHierarchy * 100).toFixed(0)}%`);
    console.log(`    * Subject × Type: ${(state.interactionSignals.subjectType * 100).toFixed(0)}%`);
  }

  // ─── SECTION 7: FORCED HIGH-DETAIL TEXTURE CASE AUDIT ───────────────────────
  console.log('\n================================================================');
  console.log('SECTION 7 — FORCED HIGH-DETAIL TEXTURE CASE AUDIT');
  console.log('Testing No-Surface vs Surface Candidates on High-Frequency Noise');
  console.log('================================================================\n');

  const canvasTexture = createCanvasRepresentation(1200, 1500);
  const textureField = await createField(256, 256, (raw) => {
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const idx = (y * 256 + x) * 3;
        const val = (x * 73 + y * 101) % 255;
        raw[idx] = val; raw[idx + 1] = val; raw[idx + 2] = val;
      }
    }
  });

  const testFootprint = { x: 0.12, y: 0.20, width: 0.76, height: 0.22 };
  const textureInks = discoverInkCandidates({
    role: 'headline',
    footprint: testFootprint,
    field: textureField,
    canvas: canvasTexture,
  });

  const textureSurfaces = discoverSurfaceCandidates({
    targetElementIds: ['h1'],
    footprint: testFootprint,
    ink: textureInks[0],
    field: textureField,
    canvas: canvasTexture,
  });

  const noSurf = textureSurfaces.find((c) => c.surfaceField === null);
  const surfaceCandidates = textureSurfaces.filter((c) => c.surfaceField !== null);

  if (noSurf) {
    console.log('No Surface:');
    console.log(`    contrast: ${noSurf.signals.baselineWcag.toFixed(2)}:1 (APCA Lc: ${noSurf.signals.postSurfaceApca})`);
    console.log(`    detail interference: ${(textureField.evaluateRegion(testFootprint).detailEnergy * 100).toFixed(1)}%`);
    console.log(`    preservation: ${(noSurf.signals.imagePreservation * 100).toFixed(1)}%`);
    console.log(`    intervention cost: ${(noSurf.signals.interventionCost * 100).toFixed(1)}%`);
    console.log(`    evaluation: ${(noSurf.scores.compositeSurfaceScore * 100).toFixed(1)}% (Suitability: ${(noSurf.scores.suitabilityScore * 100).toFixed(1)}%)`);
  }

  for (let i = 0; i < surfaceCandidates.length; i++) {
    const s = surfaceCandidates[i];
    console.log(`\nSurface ${String.fromCharCode(65 + i)} (${s.surfaceField?.provenance.derivationType}):`);
    console.log(`    contrast: ${s.signals.postSurfaceWcag.toFixed(2)}:1`);
    console.log(`    contrast gain: +${s.signals.contrastGain.toFixed(2)} (APCA Gain: +${s.signals.apcaGain})`);
    console.log(`    detail reduction: ${(s.signals.detailReduction * 100).toFixed(1)}%`);
    console.log(`    preservation: ${(s.signals.imagePreservation * 100).toFixed(1)}%`);
    console.log(`    intervention cost: ${(s.signals.interventionCost * 100).toFixed(1)}%`);
    console.log(`    evaluation: ${(s.scores.compositeSurfaceScore * 100).toFixed(1)}% (Suitability: ${(s.scores.suitabilityScore * 100).toFixed(1)}%)`);
  }
}

runCreativeValidation().catch(console.error);
