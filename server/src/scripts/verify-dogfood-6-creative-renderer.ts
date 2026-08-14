/**
 * Dogfood round 6 — the deterministic creative renderer, end to end. Real
 * Gemini (visual-only image), real FlowPost renderer (headline/CTA/logo/
 * decoration composited afterward), real Cloudinary upload. Runs the spec's
 * four benchmark cases and saves each finished PNG locally for inspection.
 *
 *   cd server && npx ts-node --transpile-only src/scripts/verify-dogfood-6-creative-renderer.ts <userId> <outDir>
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { creativeGenerationService } from '../services/creative-generation.service';
import type { StoredGeneratedAsset } from '../repositories/generated-asset.repository';

const userId = process.argv[2] || '00000000-0000-4000-8000-000000000000';
const outDir = process.argv[3] || path.join(__dirname, '..', '..', '..', 'dogfood-6-output');

const TACTILE_EDITORIAL_REFS = [
  'https://upload.wikimedia.org/wikipedia/commons/1/1c/Free_dark_vintage_paper_page_texture_for_layers_%282982207584%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/6/65/ASIAN_CUISINE.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/7/70/Asian_Dumplings_%28Jiaozi%29_by_ArmAg.jpg',
];
const PLAYFUL_REFS = [
  'https://upload.wikimedia.org/wikipedia/commons/2/29/Colorful_balloons.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/e/e6/Rubber_ducks_%285817354340%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/8/8e/Lego_Color_Bricks.jpg',
];
const BOLD_SAAS_REFS = [
  'https://upload.wikimedia.org/wikipedia/commons/d/d5/Design_Coworking_Space_Creative_Office_%2839993748614%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/3/38/My_Office_Panama_Coworking_Space.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/a/a3/WeWork_Coworking_Space%2C_333_Seymour%2C_Vancouver_%2844420378140%29.jpg',
];

async function saveImage(asset: StoredGeneratedAsset, filename: string) {
  if (!asset.imageUrl) {
    console.log(`  (no imageUrl to save — status: ${asset.status})`);
    return;
  }
  const response = await axios.get<ArrayBuffer>(asset.imageUrl, { responseType: 'arraybuffer' });
  const filePath = path.join(outDir, filename);
  fs.writeFileSync(filePath, Buffer.from(response.data));
  console.log(`  saved: ${filePath} (${asset.width}x${asset.height} ${asset.format})`);
}

function reportBrief(asset: StoredGeneratedAsset) {
  const brief = asset.creativeBrief;
  console.log('  headline:', JSON.stringify(brief.headline));
  console.log('  cta:', JSON.stringify(brief.cta));
  console.log('  brandMessage:', JSON.stringify(brief.marketingCreative?.brandMessage ?? ''));
  console.log('  artDirectionFamily:', brief.artDirectionFamily, '| aspectRatio:', brief.aspectRatio);
  console.log('  (see the "[creative] generation complete" log line above for the chosen templateId)');
}

async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Output directory: ${outDir}\n`);

  console.log('='.repeat(70), '\nCASE 1 — Tactile/editorial references + momo promotion\n', '='.repeat(70));
  const case1 = await creativeGenerationService.generate(userId, {
    prompt: 'Promote our momo dish for the weekend.',
    contextType: 'personal',
    brandVoice: { name: 'Seven Sisters', industry: 'Food / Restaurant' },
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
    referenceImageUrls: TACTILE_EDITORIAL_REFS,
  });
  reportBrief(case1);
  await saveImage(case1, 'case1-tactile-momo.png');

  console.log('\n' + '='.repeat(70), '\nCASE 2 — Playful/interactive references + momo promotion\n', '='.repeat(70));
  const case2 = await creativeGenerationService.generate(userId, {
    prompt: 'Promote our momo dish for the weekend.',
    contextType: 'personal',
    brandVoice: { name: 'Seven Sisters', industry: 'Food / Restaurant' },
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
    referenceImageUrls: PLAYFUL_REFS,
  });
  reportBrief(case2);
  await saveImage(case2, 'case2-playful-momo.png');

  console.log('\n' + '='.repeat(70), '\nCASE 3 — Bold modern SaaS references + FlowPost promotion\n', '='.repeat(70));
  const case3 = await creativeGenerationService.generate(userId, {
    prompt: "Promote FlowPost's one-composer workflow.",
    contextType: 'personal',
    brandVoice: { name: 'FlowPost', industry: 'Social media management software' },
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['linkedin'],
    referenceImageUrls: BOLD_SAAS_REFS,
  });
  reportBrief(case3);
  await saveImage(case3, 'case3-bold-saas-flowpost.png');

  console.log('\n' + '='.repeat(70), '\nCASE 4 — Same prompt, reference set A vs. set B\n', '='.repeat(70));
  const case4a = await creativeGenerationService.generate(userId, {
    prompt: 'Promote our product.',
    contextType: 'personal',
    brandVoice: { name: 'Seven Sisters', industry: 'Food / Restaurant' },
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
    referenceImageUrls: TACTILE_EDITORIAL_REFS,
  });
  reportBrief(case4a);
  await saveImage(case4a, 'case4a-set-tactile.png');

  const case4b = await creativeGenerationService.generate(userId, {
    prompt: 'Promote our product.',
    contextType: 'personal',
    brandVoice: { name: 'Seven Sisters', industry: 'Food / Restaurant' },
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
    referenceImageUrls: BOLD_SAAS_REFS,
  });
  reportBrief(case4b);
  await saveImage(case4b, 'case4b-set-bold-saas.png');

  console.log('\nDONE — dogfood round 6 complete. Inspect the saved PNGs for:');
  console.log('  - text is crisp/vector-sharp (FlowPost-rendered), not Gemini-rendered');
  console.log('  - case1 vs case2 vs case3 use visibly different layout templates, not the same skeleton re-coloured');
  console.log('  - case4a vs case4b: same marketing message, different design language');
}

run().catch((error) => {
  console.error('verify-dogfood-6-creative-renderer failed:', error);
  process.exit(1);
});
