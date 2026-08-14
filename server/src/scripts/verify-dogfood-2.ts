/**
 * Dogfood round 2 — real product asset fidelity + refinement composition
 * fix, run through the ACTUAL service (creativeGenerationService), including
 * real Cloudinary persistence now that CLOUDINARY_* is configured.
 *
 * Writes real rows to generated_assets under one real auth user and real
 * assets to the flowpost/generated Cloudinary folder — this is the genuine
 * pipeline, not a bypass, which is the point: verifying persistence for real.
 *
 *   cd server && npx ts-node --transpile-only src/scripts/verify-dogfood-2.ts <userId> <outDir>
 */
import fs from 'fs';
import path from 'path';
import { creativeGenerationService } from '../services/creative-generation.service';

const userId = process.argv[2];
const OUT_DIR = process.argv[3] || path.resolve(__dirname, '../../../dogfood-out-2');
if (!userId) {
  console.error('Usage: verify-dogfood-2.ts <userId> <outDir>');
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

async function saveFromUrl(name: string, url: string) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = url.includes('.png') ? 'png' : 'jpg';
  const file = path.join(OUT_DIR, `${name}.${ext}`);
  fs.writeFileSync(file, buf);
  console.log(`  saved: ${file}`);
}

function report(label: string, asset: Awaited<ReturnType<typeof creativeGenerationService.generate>>) {
  console.log(`\n${label}`);
  console.log('  id:', asset.id);
  console.log('  status:', asset.status);
  console.log('  source:', asset.source);
  console.log('  imageUrl:', asset.imageUrl);
  console.log('  cloudinaryPublicId:', asset.cloudinaryPublicId);
  console.log('  width/height/format:', asset.width, asset.height, asset.format);
  console.log('  concept:', asset.creativeBrief.concept);
  console.log('  composition:', asset.creativeBrief.composition);
  console.log('  environment:', asset.creativeBrief.environment);
}

async function run() {
  // ── Real product asset fidelity test ──────────────────────────────────────
  console.log('='.repeat(70), '\nREAL PRODUCT ASSET — sneakers (Wikimedia Commons, CC-licensed)\n', '='.repeat(70));

  const productUrl = 'https://upload.wikimedia.org/wikipedia/commons/8/87/Sneaker.jpg';
  const original = await creativeGenerationService.generate(userId, {
    prompt: 'Create a premium campaign around this exact product.',
    contextType: 'personal',
    assetUrls: [productUrl],
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
  });
  report('ORIGINAL (AI_GENERATED)', original);
  if (original.imageUrl) await saveFromUrl('A-original', original.imageUrl);

  // ── C. Refine darker, same concept/composition ────────────────────────────
  console.log('\n' + '='.repeat(70), '\nREFINE C — "Make it darker and more premium, keep the same concept and composition."\n', '='.repeat(70));
  const refineC = await creativeGenerationService.refine(userId, {
    assetId: original.id,
    instruction: 'Make it darker and more premium, keep the same concept and composition.',
  });
  report('REFINE C (AI_REFINED)', refineC);
  if (refineC.imageUrl) await saveFromUrl('B-refine-darker', refineC.imageUrl);

  // ── D. Change only the environment ────────────────────────────────────────
  console.log('\n' + '='.repeat(70), '\nREFINE D — "Keep the product exactly the same, change only the environment."\n', '='.repeat(70));
  const refineD = await creativeGenerationService.refine(userId, {
    assetId: refineC.id,
    instruction: 'Keep the product exactly the same, change only the environment.',
  });
  report('REFINE D (AI_REFINED)', refineD);
  if (refineD.imageUrl) await saveFromUrl('C-refine-environment', refineD.imageUrl);

  // ── History check ──────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70), '\nHISTORY — original still present, nothing deleted\n', '='.repeat(70));
  const history = await creativeGenerationService.history(userId, { contextType: 'personal' });
  const ids = [original.id, refineC.id, refineD.id];
  for (const id of ids) {
    const found = history.find((h) => h.id === id);
    console.log(`  ${id}: ${found ? `present (${found.status}, ${found.source})` : 'MISSING'}`);
  }

  console.log('\nDONE —', OUT_DIR);
}

run().catch((error) => {
  console.error('verify-dogfood-2 failed:', error);
  process.exit(1);
});
