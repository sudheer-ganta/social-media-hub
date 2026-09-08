import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { renderCreative } from '../src/ai/render/creative-renderer';
import { getStyleDNA } from '../src/ai/style-dna/style-dna';
import type { CreativeDirection, ResolvedCreativeDna } from '../src/ai/types';

const ARTIFACT_DIR = 'C:/Users/saikr/.gemini/antigravity-ide/brain/a6230dca-891d-40a0-8e6a-26c0251df48d';

const TEST_STYLES = [
  'minimalist',
  'y2k',
  'neo-brutalism',
  'editorial',
  'collage',
] as const;

// Create a simple test photo buffer (solid with subtle noise) so sharp can render without network
async function createTestImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: 1200,
      height: 1500,
      channels: 4,
      background: { r: 180, g: 150, b: 130, alpha: 1 },
    },
  })
    .jpeg()
    .toBuffer();
}

async function run() {
  const photoBuffer = await createTestImage();
  console.log('=== GENERATING VISUAL VERIFICATION CREATIVES ===\n');

  const summaries: any[] = [];

  const styleConfigs = [
    { styleId: 'minimalist', variant: 0, concept: 'Minimal calm negative space' },
    { styleId: 'y2k', variant: 0, concept: 'Layered collage sticker aesthetic' },
    { styleId: 'neo-brutalism', variant: 0, concept: 'TYPOGRAPHY_LED bold loud poster' },
    { styleId: 'editorial', variant: 0, concept: 'Editorial publication magazine' },
    { styleId: 'collage', variant: 1, concept: 'Mixed layered paper collage cutout' },
  ] as const;

  for (const { styleId, variant, concept } of styleConfigs) {
    const styleDna = getStyleDNA(styleId);
    const direction: CreativeDirection = {
      concept,
      visualStory: 'Warm textured fabrics and sculptural design.',
      subject: 'Handcrafted leather tote',
      environment: 'Natural sunlight and textured backdrop',
      composition: 'asymmetric',
      lighting: 'soft directional',
      mood: 'art-directed modern',
      palette: styleDna.palette?.primaryColors ?? ['#111111', '#eaeaea'],
      brandConstraints: [],
      productTreatment: 'hero',
      background: 'textured',
      negativeVisualConstraints: [],
      aspectRatio: '4:5',
      platform: 'instagram',
      mode: 'EDITORIAL',
      artDirectionFamily: styleDna.artDirectionFamilies[0],
      copyTreatment: 'headline_support',
      headline: 'AUTUMN AURA 2026',
      supportingLine: 'Sculptural forms crafted for the contemporary wardrobe.',
      cta: 'DISCOVER NOW',
      interactionInstructions: '',
    };

    const creativeDna: ResolvedCreativeDna = {
      archetype: 'The Creator',
      values: ['Craftsmanship', 'Design', 'Elegance'],
      aesthetic: 'Modern Craft',
      paletteStyle: 'Editorial Tones',
      typographyStyle: 'Contemporary Serif & Sans',
      compositionRules: ['Asymmetric focus', 'Intentional whitespace'],
      brandColors: styleDna.palette?.primaryColors ?? ['#1a1a1a', '#f4f2ee'],
      fontFamily: 'Playfair Display',
      voiceTone: 'Confident, cultured',
      vocabularyKeywords: ['timeless', 'silhouette'],
      prohibitedPhrases: ['cheap', 'hurry'],
    };

    const result = await renderCreative({
      visualImage: { data: photoBuffer.toString('base64'), mimeType: 'image/jpeg' },
      direction,
      creativeDna,
      styleDna,
      styleDnaVariant: variant,
      capabilities: {
        isCutout: true,
        hasTransparency: true,
      },
    });

    const outPath = path.join(ARTIFACT_DIR, `visual_${styleId}.png`);
    const pngBuffer = Buffer.from(result.data, 'base64');
    fs.writeFileSync(outPath, pngBuffer);

    const summary = {
      styleId,
      archetype: result.plan.archetype,
      structure: result.plan.structure,
      palette: result.plan.paper,
      blockKinds: result.plan.blocks.map((b: any) => b.kind + (b.role ? `:${b.role}` : '')),
      imageRect: result.plan.imageRect,
      valid: result.validation.valid,
      errorCount: result.validation.errors.length,
      file: outPath,
    };

    summaries.push(summary);

    console.log(`[${styleId.toUpperCase()}]`);
    console.log(`  Archetype: ${summary.archetype}`);
    console.log(`  Structure: ${summary.structure}`);
    console.log(`  Image Geometry: ${JSON.stringify(summary.imageRect)}`);
    console.log(`  Blocks: ${summary.blockKinds.join(' | ')}`);
    console.log(`  Output: ${outPath}\n`);
  }

  console.log('=== SUMMARY OF ARCHETYPE DIVERSITY ===');
  const archetypes = summaries.map((s) => s.archetype);
  console.log('Archetypes selected:', archetypes);
  const uniqueArchetypes = new Set(archetypes);
  console.log(`Unique archetypes across 5 styles: ${uniqueArchetypes.size} / 5`);

  // Verify geometry differences
  const imgTops = summaries.map((s) => s.imageRect.y);
  console.log('Image Top Y positions:', imgTops);
  console.log('Visual verification completed successfully.');
}

run().catch((err) => {
  console.error('Visual verification failed:', err);
  process.exit(1);
});
