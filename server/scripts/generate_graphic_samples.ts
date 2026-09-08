import fs from 'node:fs';
import path from 'node:path';
import { renderCreative } from '../src/ai/render/creative-renderer';
import { getStyleDNA, STYLE_PALETTES, type StyleDnaId } from '../src/ai/style-dna/style-dna';
import type { CreativeDirection, ResolvedCreativeDna } from '../src/ai/types';

const ARTIFACT_DIR = 'C:/Users/saikr/.gemini/antigravity-ide/brain/a6230dca-891d-40a0-8e6a-26c0251df48d';
const INPUT_IMAGE_PATH = path.join(ARTIFACT_DIR, 'seven_sisters_momos_1788802462776.jpg');

interface SampleConfig {
  id: string;
  styleId: StyleDnaId;
  variant: number;
  headline: string;
  supportingLine?: string;
  cta?: string;
  brandMessage?: string;
  eventBadge?: string;
  secondaryInfo?: string[];
  aspectRatio: '1:1' | '4:5' | '9:16';
}

const SAMPLES: SampleConfig[] = [
  // ── 1. Minimalist (Quiet, spacious, decisive, omitted elements) ──
  {
    id: 'sample_01_minimalist_negspace',
    styleId: 'minimalist',
    variant: 0, // NEGATIVE_SPACE
    headline: 'SEVEN SISTERS',
    supportingLine: 'Hand-pinched Himalayan heritage, steamed daily.',
    aspectRatio: '4:5',
    // Deliberately no CTA, pure editorial whitespace
  },
  {
    id: 'sample_02_minimalist_fullbleed',
    styleId: 'minimalist',
    variant: 1, // FULL_BLEED_TYPE
    headline: 'THE MOMO RELAUNCH',
    supportingLine: 'Purity in every fold.',
    cta: 'TASTE NOW',
    aspectRatio: '1:1',
  },
  {
    id: 'sample_03_minimalist_split',
    styleId: 'minimalist',
    variant: 2, // SPLIT_COMPOSITION
    headline: 'STEAMED DAILY',
    supportingLine: 'Seven Sisters Northeast Kitchen',
    aspectRatio: '4:5',
  },

  // ── 2. Editorial (Magazine-led, boundary overlap, sophisticated serif) ──
  {
    id: 'sample_04_editorial_overlap',
    styleId: 'editorial',
    variant: 0, // EDITORIAL_OVERLAP
    headline: 'THE MOMO RELAUNCH',
    supportingLine: 'Hand-pinched Himalayan dumplings perfected in our kitchen.',
    cta: 'RESERVE A TABLE',
    brandMessage: 'Seven Sisters · Authentic Northeast Kitchen',
    secondaryInfo: ['Bhut Jolokia Sesame Dip', 'Daily Fresh Batches'],
    aspectRatio: '4:5',
  },
  {
    id: 'sample_05_editorial_grid',
    styleId: 'editorial',
    variant: 1, // ASYMMETRIC_GRID
    headline: 'ORIGINAL HIMALAYAN FLAVOUR',
    supportingLine: 'A quiet masterclass in dough, steam, and mountain spice.',
    secondaryInfo: ['Seven Sisters', 'Issue No. 07'],
    aspectRatio: '1:1',
  },
  {
    id: 'sample_06_editorial_frame',
    styleId: 'editorial',
    variant: 3, // FRAME_WITH_OVERLAP
    headline: 'HERITAGE ON A PLATE',
    supportingLine: 'The steamed classic returns to Seven Sisters.',
    cta: 'DISCOVER THE MENU',
    aspectRatio: '4:5',
  },

  // ── 3. Neo Brutalism (Aggressive type, tilted tactile photo, tape, stamp) ──
  {
    id: 'sample_07_neobrutalism_typeposter',
    styleId: 'neo-brutalism',
    variant: 0, // TYPOGRAPHIC_POSTER
    headline: 'MOMO RELAUNCH',
    supportingLine: 'STEAMED DAILY · NO COMPROMISE',
    eventBadge: 'AUTHENTIC',
    cta: 'GRAB A BASKET',
    aspectRatio: '4:5',
  },
  {
    id: 'sample_08_neobrutalism_grid',
    styleId: 'neo-brutalism',
    variant: 1, // ASYMMETRIC_GRID
    headline: 'HAND PINCHED 07',
    supportingLine: 'NORTHEAST SOUL · FRESH CHILI DIP',
    secondaryInfo: ['Seven Sisters Kitchen', 'Vol. 01'],
    aspectRatio: '1:1',
  },
  {
    id: 'sample_09_neobrutalism_split',
    styleId: 'neo-brutalism',
    variant: 2, // SPLIT_COMPOSITION
    headline: 'HOT STEAM ONLY',
    supportingLine: 'SEVEN SISTERS RESTAURANT',
    aspectRatio: '9:16',
  },

  // ── 4. Collage (Layered paper panel, tilted photo, tape, stamp, handwritten note) ──
  {
    id: 'sample_10_collage_layered',
    styleId: 'collage',
    variant: 0, // COLLAGE_LAYERED
    headline: 'RAW KITCHEN NOTES',
    supportingLine: 'Authentic dumplings fresh from the bamboo steamer.',
    eventBadge: 'ORIGINAL',
    secondaryInfo: ['Seven Sisters Momo Relaunch'],
    aspectRatio: '4:5',
  },
  {
    id: 'sample_11_collage_cutout',
    styleId: 'collage',
    variant: 1, // PRODUCT_CUTOUT
    headline: 'SEVEN SISTERS SPECIAL',
    supportingLine: 'Steamed with fire, served with pride.',
    cta: 'TRY TODAY',
    aspectRatio: '1:1',
  },
  {
    id: 'sample_12_collage_frame',
    styleId: 'collage',
    variant: 2, // FRAME_WITH_OVERLAP
    headline: 'THE RETURN OF THE MOMO',
    supportingLine: 'Handmade daily at Seven Sisters kitchen.',
    eventBadge: 'BATCH 07',
    aspectRatio: '4:5',
  },

  // ── 5. Y2K (Bold geometric energy, chrome/candy accent, stamps) ──
  {
    id: 'sample_13_y2k_collage',
    styleId: 'y2k',
    variant: 0, // COLLAGE_LAYERED
    headline: 'CYBER MOMO 2000',
    supportingLine: 'Next-generation steam. Authentic mountain recipe.',
    eventBadge: 'NEW EDITION',
    aspectRatio: '1:1',
  },
  {
    id: 'sample_14_y2k_frame',
    styleId: 'y2k',
    variant: 3, // FRAME_WITH_OVERLAP
    headline: 'HOT & STEAMED',
    supportingLine: 'Ultra-fresh batches dropping daily.',
    cta: 'RELOAD NOW',
    aspectRatio: '4:5',
  },
  {
    id: 'sample_15_y2k_grid',
    styleId: 'y2k',
    variant: 2, // ASYMMETRIC_GRID
    headline: 'FUTURE HERITAGE',
    supportingLine: 'Seven Sisters culinary archives.',
    aspectRatio: '9:16',
  },

  // ── 6. Luxury (Deep tonal restraint, quiet high-contrast serif, generous breathing room) ──
  {
    id: 'sample_16_luxury_negspace',
    styleId: 'luxury',
    variant: 0, // NEGATIVE_SPACE
    headline: 'SEVEN SISTERS',
    supportingLine: 'The art of Himalayan culinary restraint.',
    aspectRatio: '4:5',
  },
  {
    id: 'sample_17_luxury_overlap',
    styleId: 'luxury',
    variant: 1, // EDITORIAL_OVERLAP
    headline: 'THE MOMO COLLECTION',
    supportingLine: 'Hand-crafted daily in strictly limited batches.',
    cta: 'RESERVE',
    brandMessage: 'Seven Sisters Northeast Kitchen',
    aspectRatio: '1:1',
  },
  {
    id: 'sample_18_luxury_frame',
    styleId: 'luxury',
    variant: 2, // FRAME_WITH_OVERLAP
    headline: 'PERFECTION IN STEAM',
    supportingLine: 'A signature reimagining of mountain heritage.',
    aspectRatio: '4:5',
  },
];

async function main() {
  const photoBuffer = fs.readFileSync(INPUT_IMAGE_PATH);
  console.log(`Loaded hero photo from: ${INPUT_IMAGE_PATH}`);
  console.log(`Starting generation of ${SAMPLES.length} graphic design samples across 6 styles...\n`);

  const results: Array<{
    id: string;
    style: string;
    archetype: string;
    structure: string;
    decisions: string[];
    valid: boolean;
    errors: any[];
    outPath: string;
  }> = [];

  for (let i = 0; i < SAMPLES.length; i++) {
    const s = SAMPLES[i];
    const style = getStyleDNA(s.styleId);
    if (!style) {
      console.error(`Unknown style: ${s.styleId}`);
      continue;
    }

    const palettes = STYLE_PALETTES[s.styleId] || [['#18181b', '#fafaf9', '#e11d48']];
    const chosenPalette = palettes[s.variant % palettes.length];

    const direction: CreativeDirection = {
      concept: `${style.name} Momo Relaunch`,
      visualStory: 'Steaming momos in a bamboo basket with chili oil.',
      subject: 'Steamed Himalayan momos',
      environment: 'Artisanal kitchen setting',
      composition: 'Art-directed graphic composition',
      lighting: 'Atmospheric natural lighting',
      mood: style.mood.join(', '),
      palette: chosenPalette,
      brandConstraints: [],
      productTreatment: 'hero',
      background: 'Tactile surface',
      negativeVisualConstraints: [],
      aspectRatio: s.aspectRatio,
      platform: 'instagram',
      mode: 'EDITORIAL',
      artDirectionFamily: style.artDirectionFamilies[0],
      copyTreatment: s.supportingLine ? 'headline_support' : 'headline',
      headline: s.headline,
      supportingLine: s.supportingLine,
      cta: s.cta,
      interactionInstructions: '',
      marketingCreative: {
        brandMessage: s.brandMessage,
        eventBadge: s.eventBadge,
        secondaryInfo: s.secondaryInfo,
      },
    };

    const creativeDna: ResolvedCreativeDna = {
      archetype: 'The Artisan',
      values: ['Heritage', 'Craftsmanship'],
      aesthetic: style.name,
      paletteStyle: style.color.relationships[0] ?? 'Harmonious tonal',
      typographyStyle: style.typography.preferredCategories.join(' / '),
      compositionRules: ['Generative geometry', 'Art-directed contrast'],
      brandColors: chosenPalette,
      fontFamily: style.typography.preferredCategories.includes('serif') ? 'Playfair Display' : 'Inter',
      voiceTone: 'Confident, culinary, authentic',
      vocabularyKeywords: ['momo', 'steamed', 'hand-pinched'],
      prohibitedPhrases: ['cheap', 'fast food'],
    };

    try {
      const renderRes = await renderCreative({
        visualImage: { data: photoBuffer.toString('base64'), mimeType: 'image/jpeg' },
        direction,
        creativeDna,
        styleDna: style,
        styleDnaVariant: s.variant,
        capabilities: { isCutout: false, hasTransparency: false },
      });

      const outPath = path.join(ARTIFACT_DIR, `${s.id}.png`);
      fs.writeFileSync(outPath, Buffer.from(renderRes.data, 'base64'));

      results.push({
        id: s.id,
        style: style.name,
        archetype: renderRes.plan.archetype ?? 'LEGACY',
        structure: renderRes.plan.structure ?? '',
        decisions: renderRes.plan.artDirectionDecisions ?? [],
        valid: renderRes.validation.valid,
        errors: renderRes.validation.errors,
        outPath,
      });

      console.log(`[${i + 1}/${SAMPLES.length}] ✓ ${s.id} (${style.name} - ${renderRes.plan.archetype})`);
      console.log(`       Decisions: ${renderRes.plan.artDirectionDecisions?.join(', ')}`);
      console.log(`       Validation: ${renderRes.validation.valid ? 'PASSED' : 'FAILED'}`);
      if (!renderRes.validation.valid) {
        console.warn('       Errors:', renderRes.validation.errors);
      }
    } catch (err: any) {
      console.error(`[${i + 1}/${SAMPLES.length}] ✗ ${s.id} failed:`, err.message);
    }
  }

  console.log('\n==================================================');
  console.log('GRAPHIC DESIGN GENERATION SUMMARY:');
  console.log(`Total generated: ${results.length}/${SAMPLES.length}`);
  console.log(`Valid: ${results.filter((r) => r.valid).length}`);
  console.log('==================================================');
}

main().catch(console.error);
