import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { renderCreative } from '../src/ai/render/creative-renderer';
import { getStyleDNA } from '../src/ai/style-dna/style-dna';
import type { CreativeDirection, ResolvedCreativeDna } from '../src/ai/types';

const ARTIFACT_DIR = 'C:/Users/saikr/.gemini/antigravity-ide/brain/a6230dca-891d-40a0-8e6a-26c0251df48d';
const INPUT_IMAGE_PATH = path.join(ARTIFACT_DIR, 'seven_sisters_momos_1788802462776.jpg');

async function run() {
  const photoBuffer = fs.readFileSync(INPUT_IMAGE_PATH);

  // Style 1: Editorial (EDITORIAL_OVERLAP)
  const editorialDna = getStyleDNA('editorial')!;
  const editorialDirection: CreativeDirection = {
    concept: 'Artisanal Momo Relaunch',
    visualStory: 'Steaming Himalayan dumplings in bamboo basket with chili oil.',
    subject: 'Steamed momos with chili oil',
    environment: 'Warm rustic restaurant',
    composition: 'editorial frame',
    lighting: 'warm dramatic side light',
    mood: 'heritage, artisanal culinary craft',
    palette: ['#faf6f0', '#1c1917', '#881337'],
    brandConstraints: [],
    productTreatment: 'hero',
    background: 'rustic table',
    negativeVisualConstraints: [],
    aspectRatio: '4:5',
    platform: 'instagram',
    mode: 'EDITORIAL',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    copyTreatment: 'headline_support',
    headline: 'THE MOMO RELAUNCH',
    supportingLine: 'Hand-pinched Himalayan heritage, perfected in our kitchen.',
    cta: 'RESERVE A TABLE',
    interactionInstructions: '',
    marketingCreative: {
      brandMessage: 'Seven Sisters · Authentic Northeast Kitchen',
      secondaryInfo: ['Bhut Jolokia Sesame Dip', 'Daily Steamed Batches'],
    },
  };

  const creativeDna: ResolvedCreativeDna = {
    archetype: 'The Artisan',
    values: ['Heritage', 'Authenticity', 'Craftsmanship'],
    aesthetic: 'Tactile Editorial',
    paletteStyle: 'Warm Tonal Neutrals with Rich Crimson',
    typographyStyle: 'Contemporary Editorial Serif',
    compositionRules: ['Intentional overlap', 'Magazine hierarchy'],
    brandColors: ['#faf6f0', '#1c1917', '#881337'],
    fontFamily: 'Playfair Display',
    voiceTone: 'Warm, culinary, proud',
    vocabularyKeywords: ['hand-pinched', 'steamed', 'heritage'],
    prohibitedPhrases: ['cheap', 'fast food'],
  };

  console.log('Rendering Seven Sisters Momo Relaunch creative (Editorial Overlap)...');
  const result = await renderCreative({
    visualImage: { data: photoBuffer.toString('base64'), mimeType: 'image/jpeg' },
    direction: editorialDirection,
    creativeDna,
    styleDna: editorialDna,
    styleDnaVariant: 0,
    capabilities: { isCutout: false, hasTransparency: false },
  });

  const outPath = path.join(ARTIFACT_DIR, 'seven_sisters_momo_relaunch_editorial.png');
  fs.writeFileSync(outPath, Buffer.from(result.data, 'base64'));

  console.log('Saved rendered creative to:', outPath);
  console.log('Archetype:', result.plan.archetype);
  console.log('Structure:', result.plan.structure);
  console.log('Paper:', result.plan.paper);
  console.log('Blocks:', result.plan.blocks.map((b: any) => b.kind + (b.role ? `:${b.role}` : '')).join(', '));
  console.log('Validation:', result.validation.valid ? 'PASSED' : 'FAILED', result.validation.errors);

  // Style 2: Desi Maximalism / Frame with Overlap
  const desiDna = getStyleDNA('desi-maximalism')!;
  const desiDirection: CreativeDirection = {
    ...editorialDirection,
    concept: 'Festive Himalayan Momo Return',
    palette: ['#fef3c7', '#1c1917', '#be123c', '#f59e0b'],
    artDirectionFamily: 'CULTURAL_EDITORIAL',
    headline: 'BACK & BETTER: THE STEAMED CLASSIC',
    supportingLine: 'Seven secret mountain spices, one legendary table.',
    cta: 'TASTE THE RETURN',
  };

  const desiCreativeDna: ResolvedCreativeDna = {
    ...creativeDna,
    brandColors: ['#fef3c7', '#1c1917', '#be123c', '#f59e0b'],
  };

  console.log('\nRendering Seven Sisters Momo Relaunch creative (Frame with Overlap / Desi Maximalism)...');
  const resultDesi = await renderCreative({
    visualImage: { data: photoBuffer.toString('base64'), mimeType: 'image/jpeg' },
    direction: desiDirection,
    creativeDna: desiCreativeDna,
    styleDna: desiDna,
    styleDnaVariant: 1, // variant 1 selects FRAME_WITH_OVERLAP
    capabilities: { isCutout: false, hasTransparency: false },
  });

  const outPathDesi = path.join(ARTIFACT_DIR, 'seven_sisters_momo_relaunch_frame.png');
  fs.writeFileSync(outPathDesi, Buffer.from(resultDesi.data, 'base64'));
  console.log('Saved rendered creative to:', outPathDesi);
  console.log('Archetype:', resultDesi.plan.archetype);
  console.log('Structure:', resultDesi.plan.structure);
}

run().catch((err) => {
  console.error('Failed to render Seven Sisters creative:', err);
  process.exit(1);
});
