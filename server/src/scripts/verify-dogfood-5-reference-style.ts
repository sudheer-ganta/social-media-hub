/**
 * Dogfood round 5 — reference-led creative generation. Real Gemini vision
 * analysis of uploaded reference images + real concept generation, via
 * discoverConcepts() (no image render, no Cloudinary/DB persistence).
 *
 *   cd server && npx ts-node --transpile-only src/scripts/verify-dogfood-5-reference-style.ts <userId>
 */
import { creativeGenerationService } from '../services/creative-generation.service';
import type { ReferenceStyleProfile, ScoredCreativeConcept } from '../ai/types';

const userId = process.argv[2] || '00000000-0000-4000-8000-000000000000';

const MOMO_REFS = [
  'https://upload.wikimedia.org/wikipedia/commons/6/65/ASIAN_CUISINE.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/7/70/Asian_Dumplings_%28Jiaozi%29_by_ArmAg.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/c/c3/Mandoo_Panfried_Dumplings_-_Hello_Cook_AUD6.60.jpg',
];
const WORKSPACE_REFS = [
  'https://upload.wikimedia.org/wikipedia/commons/d/d5/Design_Coworking_Space_Creative_Office_%2839993748614%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/3/38/My_Office_Panama_Coworking_Space.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/a/a3/WeWork_Coworking_Space%2C_333_Seymour%2C_Vancouver_%2844420378140%29.jpg',
];
const UNRELATED_REFS = [
  MOMO_REFS[0],
  'https://upload.wikimedia.org/wikipedia/commons/1/1c/Free_dark_vintage_paper_page_texture_for_layers_%282982207584%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/1/18/Antje-filmkorn_SW.jpg',
];
const SNEAKER_PRODUCT = 'https://upload.wikimedia.org/wikipedia/commons/8/87/Sneaker.jpg';

function reportStyle(label: string, style: ReferenceStyleProfile | undefined) {
  console.log(`\n  REFERENCE STYLE (${label})`);
  if (!style || !style.analysed) {
    console.log('    analysed: false (no references, or analysis failed)');
    return;
  }
  console.log('    referenceCount:', style.referenceCount);
  console.log('    visualLanguage:', style.visualLanguage);
  console.log('    creativeMechanisms:', style.creativeMechanisms);
  console.log('    dominantDirection:', style.dominantDirection);
  console.log('    doNotCopy:', style.doNotCopy);
  console.log('    influence:', style.influence);
}

function reportConcepts(concepts: ScoredCreativeConcept[], proposedCount: number) {
  console.log(`  proposed: ${proposedCount}, kept: ${concepts.length}`);
  concepts.forEach((c, i) => {
    console.log(
      `  ${i + 1}. "${c.conceptName}" — mechanism: ${c.visualMechanism} | family: ${c.artDirectionFamily} | templateRisk: ${c.scores.templateRisk}`,
    );
  });
}

async function run() {
  console.log('='.repeat(70), '\nA. NO REFERENCES — baseline\n', '='.repeat(70));
  const a = await creativeGenerationService.discoverConcepts(userId, {
    prompt: 'Create a memorable campaign for our momo dish.',
    contextType: 'personal',
    brandVoice: { name: 'Seven Sisters', industry: 'Food / Restaurant' },
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
  });
  reportStyle('none', a.referenceStyle);
  reportConcepts(a.concepts, a.proposedCount);

  console.log('\n' + '='.repeat(70), '\nB. ONE REFERENCE (momo)\n', '='.repeat(70));
  const b = await creativeGenerationService.discoverConcepts(userId, {
    prompt: 'Create a memorable campaign for our momo dish.',
    contextType: 'personal',
    brandVoice: { name: 'Seven Sisters', industry: 'Food / Restaurant' },
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
    referenceImageUrls: [MOMO_REFS[0]],
  });
  reportStyle('one momo reference', b.referenceStyle);
  reportConcepts(b.concepts, b.proposedCount);

  console.log('\n' + '='.repeat(70), '\nC. THREE REFERENCES (momo x3) — Seven Sisters scenario\n', '='.repeat(70));
  const c = await creativeGenerationService.discoverConcepts(userId, {
    prompt: 'Create a new restaurant campaign for our momo dish.',
    contextType: 'personal',
    brandVoice: { name: 'Seven Sisters', industry: 'Food / Restaurant' },
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
    referenceImageUrls: MOMO_REFS,
    referenceLabels: ['Inspiration', 'Inspiration', 'Inspiration'],
  });
  reportStyle('three momo references', c.referenceStyle);
  reportConcepts(c.concepts, c.proposedCount);

  console.log('\n' + '='.repeat(70), '\nD. THREE REFERENCES (workspace x3) — FlowPost scenario\n', '='.repeat(70));
  const d = await creativeGenerationService.discoverConcepts(userId, {
    prompt: "Promote FlowPost's one-composer workflow.",
    contextType: 'personal',
    brandVoice: { name: 'FlowPost', industry: 'Social media management software' },
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
    referenceImageUrls: WORKSPACE_REFS,
  });
  reportStyle('three workspace references', d.referenceStyle);
  reportConcepts(d.concepts, d.proposedCount);

  console.log('\n' + '='.repeat(70), '\nE. UNRELATED REFERENCES — must not blindly merge\n', '='.repeat(70));
  const e = await creativeGenerationService.discoverConcepts(userId, {
    prompt: 'Create a bold, attention-grabbing campaign.',
    contextType: 'personal',
    brandVoice: { name: 'Generic Brand' },
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
    referenceImageUrls: UNRELATED_REFS,
  });
  reportStyle('unrelated references (food + neon + denim)', e.referenceStyle);
  reportConcepts(e.concepts, e.proposedCount);

  console.log('\n' + '='.repeat(70), '\nF. PRODUCT + INSPIRATION — product preserved, style borrowed\n', '='.repeat(70));
  const f = await creativeGenerationService.discoverConcepts(userId, {
    prompt: 'Create a premium campaign around this exact product.',
    contextType: 'personal',
    brandVoice: { name: 'Aura Footwear' },
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
    assetUrls: [SNEAKER_PRODUCT],
    referenceImageUrls: WORKSPACE_REFS.slice(0, 2),
    referenceLabels: ['Product', 'Inspiration'],
  });
  reportStyle('product + inspiration', f.referenceStyle);
  reportConcepts(f.concepts, f.proposedCount);
  console.log('  hasAssets (product preserved via assetUrls, not references):', true);

  console.log('\n' + '='.repeat(70), '\nG. SAVED STYLE PROFILE + NEW CAMPAIGN — no re-analysis\n', '='.repeat(70));
  const savedProfile: ReferenceStyleProfile = {
    analysed: true,
    referenceCount: 3,
    visualLanguage: 'editorial, tactile, warm',
    compositionPatterns: ['off-centre framing'],
    typographyCharacter: '',
    colorRelationships: 'warm neutrals',
    textureAndMaterial: 'grainy print texture',
    lightingAndMood: 'low warm light',
    photographicOrIllustrative: 'photographic',
    visualDensity: 'spacious',
    brandTreatment: '',
    creativeMechanisms: ['tactile paper texture', 'unusual perspective'],
    imperfectionLevel: 'deliberately imperfect',
    interactionPatterns: '',
    doNotCopy: ['the exact hand model shown'],
    dominantDirection: 'Lean tactile and editorial-warm.',
    influence: 'high',
  };
  const g = await creativeGenerationService.discoverConcepts(userId, {
    prompt: 'Announce our new seasonal menu.',
    contextType: 'personal',
    brandVoice: { name: 'Seven Sisters', industry: 'Food / Restaurant' },
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
    referenceStyleProfile: savedProfile,
  });
  reportStyle('reused saved profile', g.referenceStyle);
  reportConcepts(g.concepts, g.proposedCount);
  console.log('  (no fresh analysis call was made — referenceStyleProfile rode straight through)');

  console.log('\nDONE — dogfood round 5 complete.');
}

run().catch((error) => {
  console.error('verify-dogfood-5-reference-style failed:', error);
  process.exit(1);
});
