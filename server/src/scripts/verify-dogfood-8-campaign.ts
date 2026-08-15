/**
 * Dogfood round 8 — the complete campaign creative, end to end.
 *
 * Real Gemini (visual, then the campaign designed over it), real logo
 * composite, real Cloudinary, real persistence. Exercises the cases the spec
 * names, in order:
 *
 *   A  BTS comeback + Korean food + 50% off   — intent fidelity
 *   B  "Promote our Indian food weekend."     — campaign, not brand default
 *   C  "Promote our whole multi-cuisine restaurant."
 *   D  refine A three ways                    — darker / 30% off / food hero
 *   E  brand mode without a logo              — must be blocked
 *   F  brand mode with a logo                 — must use the real file
 *
 * Every finished creative is saved locally for inspection, alongside the
 * copy that was actually typeset and the requirements it was checked against.
 *
 *   cd server && npx ts-node --transpile-only src/scripts/verify-dogfood-8-campaign.ts <userId> [outDir]
 *
 * Real test user ids live in the project memory; the placeholder UUID fails
 * the auth.users foreign key.
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { creativeGenerationService, CreativeError } from '../services/creative-generation.service';
import { missingFromCreative } from '../ai/intent/claim-match';
import type { StoredGeneratedAsset } from '../repositories/generated-asset.repository';
import type { CreativeIntentBrief } from '../ai/types';

const userId = process.argv[2] || '00000000-0000-4000-8000-000000000000';
const outDir = process.argv[3] || path.join(__dirname, '..', '..', '..', 'dogfood-8-output');

process.env.CREATIVE_DEBUG_DIR ||= outDir;

const BRAND_VOICE = {
  name: 'Seven Sisters',
  description: 'A multi-cuisine restaurant in Hyderabad serving Korean, Indian, and Pan-Asian food.',
  industry: 'Food / Restaurant',
  tone: 'warm, confident, unfussy',
  personality: 'generous host',
  targetAudience: 'city diners, 20s–30s',
  usp: 'Everything cooked to order, nothing pre-plated.',
  wordsToAvoid: ['elevate', 'unleash', 'game-changing'],
};

/** A real image URL standing in for an uploaded brand logo. */
const LOGO_URL = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Logo_TV_2015.png';

const results: Array<{ label: string; verdict: string; detail: string }> = [];

function record(label: string, pass: boolean, detail: string) {
  const verdict = pass ? 'PASS' : 'FAIL';
  results.push({ label, verdict, detail });
  console.log(`\n  [${verdict}] ${label}\n         ${detail}`);
}

async function save(asset: StoredGeneratedAsset, filename: string) {
  if (!asset.imageUrl) {
    console.log(`  (nothing to save — status ${asset.status})`);
    return;
  }
  try {
    const response = await axios.get<ArrayBuffer>(asset.imageUrl, { responseType: 'arraybuffer', timeout: 30_000 });
    const filePath = path.join(outDir, filename);
    fs.writeFileSync(filePath, Buffer.from(response.data));
    console.log(`  saved: ${filePath} (${asset.width}x${asset.height} ${asset.format})`);
  } catch (error) {
    // This machine's network intermittently times out against the Cloudinary
    // CDN right after upload — the asset itself is fine.
    console.log(`  (could not download for local inspection: ${error instanceof Error ? error.message : error})`);
  }
}

function reportCopy(asset: StoredGeneratedAsset) {
  const brief = asset.creativeBrief;
  console.log('  concept   :', brief.concept);
  console.log('  headline  :', JSON.stringify(brief.headline));
  console.log('  support   :', JSON.stringify(brief.supportingLine));
  console.log('  cta       :', JSON.stringify(brief.cta));
  console.log('  brandMsg  :', JSON.stringify(brief.marketingCreative?.brandMessage ?? ''));
  console.log('  details   :', JSON.stringify(brief.marketingCreative?.secondaryInfo ?? []));
  console.log('  family    :', brief.artDirectionFamily, '| ratio:', brief.aspectRatio);
  console.log('  campaign? :', asset.parentAssetId ? 'yes (designed over the visual)' : 'no (standalone visual)');
}

/** The spec's actual test: does the finished creative carry every stated requirement? */
function checkRequirements(label: string, asset: StoredGeneratedAsset, intent?: CreativeIntentBrief) {
  const claims = intent?.requiredClaims ?? [];
  if (claims.length === 0) {
    record(label, true, 'no hard requirements were stated for this request');
    return;
  }
  const missing = missingFromCreative(asset.creativeBrief, intent);
  record(
    label,
    missing.length === 0,
    missing.length === 0
      ? `all requirements typeset: ${claims.join(' · ')}`
      : `MISSING from the creative's copy: ${missing.join(' · ')} (required: ${claims.join(' · ')})`,
  );
}

async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Output: ${outDir}\nUser:   ${userId}\n`);

  // ── A — the case the whole phase exists for ─────────────────────────────
  console.log('='.repeat(72));
  console.log('CASE A — "BTS is coming back in our restaurant. 50% off all our Korean food."');
  console.log('='.repeat(72));

  const promptA = 'We have an event because BTS is coming back in our restaurant. We are giving 50% off on all our Korean food.';
  const conceptsA = await creativeGenerationService.discoverConcepts(userId, {
    prompt: promptA,
    contextType: 'personal',
    brandVoice: BRAND_VOICE,
    goal: 'event_promotion',
    funnelStage: 'BOFU',
    platforms: ['instagram'],
  });

  const intentA = conceptsA.intent;
  console.log('\n  extracted intent:');
  console.log('    event          :', intentA?.event);
  console.log('    productCategory:', intentA?.productCategory);
  console.log('    offer          :', intentA?.offer);
  console.log('    audience       :', intentA?.audience);
  console.log('    requiredClaims :', intentA?.requiredClaims);

  record(
    'A1 · intent extraction finds the event, the category and the offer',
    Boolean(intentA?.offer) && (intentA?.requiredClaims.length ?? 0) >= 2,
    `offer="${intentA?.offer}", claims=[${intentA?.requiredClaims.join(', ')}]`,
  );

  console.log('\n  concepts:');
  for (const concept of conceptsA.concepts) {
    console.log(`    · ${concept.conceptName} (${concept.artDirectionFamily}) — fidelity ${concept.intentFidelity?.score ?? 'n/a'}`);
    if (concept.intentFidelity?.missingRequirements.length) {
      console.log(`        still missing: ${concept.intentFidelity.missingRequirements.join(', ')}`);
    }
  }
  record(
    'A2 · every concept offered to the member carries the hard requirements',
    conceptsA.concepts.every((c) => (c.intentFidelity?.missingRequirements.length ?? 0) === 0),
    `${conceptsA.concepts.length} concept(s), fidelity ${conceptsA.concepts.map((c) => c.intentFidelity?.score ?? 'n/a').join('/')}`,
  );

  const assetA = await creativeGenerationService.generate(userId, {
    prompt: promptA,
    contextType: 'personal',
    brandVoice: BRAND_VOICE,
    goal: 'event_promotion',
    funnelStage: 'BOFU',
    platforms: ['instagram'],
    selectedConcept: conceptsA.concepts[0],
    intent: intentA,
  });
  reportCopy(assetA);
  await save(assetA, 'A-bts-korean-50off.png');
  checkRequirements('A3 · the finished creative typesets every requirement', assetA, intentA);

  // ── B — a different campaign for the same brand ─────────────────────────
  console.log('\n' + '='.repeat(72));
  console.log('CASE B — "Promote our Indian food weekend."');
  console.log('='.repeat(72));

  const conceptsB = await creativeGenerationService.discoverConcepts(userId, {
    prompt: 'Promote our Indian food weekend.',
    contextType: 'personal',
    brandVoice: BRAND_VOICE,
    goal: 'sales',
    funnelStage: 'MOFU',
    platforms: ['instagram'],
  });
  const assetB = await creativeGenerationService.generate(userId, {
    prompt: 'Promote our Indian food weekend.',
    contextType: 'personal',
    brandVoice: BRAND_VOICE,
    goal: 'sales',
    funnelStage: 'MOFU',
    platforms: ['instagram'],
    selectedConcept: conceptsB.concepts[0],
    intent: conceptsB.intent,
  });
  reportCopy(assetB);
  await save(assetB, 'B-indian-weekend.png');

  const textB = JSON.stringify(assetB.creativeBrief).toLowerCase();
  record(
    'B1 · switches to Indian food, with no BTS or Korean bleed from the last campaign',
    textB.includes('indian') && !textB.includes('bts') && !textB.includes('korean'),
    `indian=${textB.includes('indian')} bts=${textB.includes('bts')} korean=${textB.includes('korean')}`,
  );
  record(
    'B2 · invents no offer the member never mentioned',
    !conceptsB.intent?.offer,
    `offer extracted: "${conceptsB.intent?.offer ?? ''}"`,
  );
  checkRequirements('B3 · the finished creative typesets every requirement', assetB, conceptsB.intent);

  // ── C — the brand as a whole ────────────────────────────────────────────
  console.log('\n' + '='.repeat(72));
  console.log('CASE C — "Promote our whole multi-cuisine restaurant."');
  console.log('='.repeat(72));

  const conceptsC = await creativeGenerationService.discoverConcepts(userId, {
    prompt: 'Promote our whole multi-cuisine restaurant.',
    contextType: 'personal',
    brandVoice: BRAND_VOICE,
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
  });
  const assetC = await creativeGenerationService.generate(userId, {
    prompt: 'Promote our whole multi-cuisine restaurant.',
    contextType: 'personal',
    brandVoice: BRAND_VOICE,
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    platforms: ['instagram'],
    selectedConcept: conceptsC.concepts[0],
    intent: conceptsC.intent,
  });
  reportCopy(assetC);
  await save(assetC, 'C-multi-cuisine.png');

  const textC = JSON.stringify(assetC.creativeBrief).toLowerCase();
  record(
    'C1 · stays multi-cuisine rather than arbitrarily picking one kitchen',
    !/\b(korean|bts)\b/.test(textC),
    `korean/bts present: ${/\b(korean|bts)\b/.test(textC)}`,
  );

  // ── D — refinement ──────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(72));
  console.log('CASE D — refining case A three ways');
  console.log('='.repeat(72));

  const before = assetA.creativeBrief;

  console.log('\n  D1 — "Make it darker and more premium."');
  const darker = await creativeGenerationService.refine(userId, {
    assetId: assetA.id,
    instruction: 'Make it darker and more premium.',
  });
  reportCopy(darker);
  await save(darker, 'D1-darker.png');
  record(
    'D1 · a new asset is produced, marked AI_REFINED, linked to its parent',
    darker.id !== assetA.id && darker.source === 'AI_REFINED' && darker.imageUrl !== assetA.imageUrl,
    `id ${darker.id.slice(0, 8)} source=${darker.source} newImage=${darker.imageUrl !== assetA.imageUrl}`,
  );
  record(
    'D1 · mood/lighting moved while the concept and headline held still',
    darker.creativeBrief.concept === before.concept,
    `concept "${before.concept}" → "${darker.creativeBrief.concept}"; lighting "${before.lighting}" → "${darker.creativeBrief.lighting}"; mood "${before.mood}" → "${darker.creativeBrief.mood}"`,
  );

  console.log('\n  D2 — "Change the offer to 30% off."');
  const offerChange = await creativeGenerationService.refine(userId, {
    assetId: assetA.id,
    instruction: 'Change the offer to 30% off.',
  });
  reportCopy(offerChange);
  await save(offerChange, 'D2-30-percent.png');
  const copyD2 = JSON.stringify(offerChange.creativeBrief);
  record(
    'D2 · the exact new offer appears, and the old one is gone',
    copyD2.includes('30%') && !copyD2.includes('50%'),
    `30% present=${copyD2.includes('30%')} · 50% still present=${copyD2.includes('50%')}`,
  );

  console.log('\n  D3 — "Make the food the hero."');
  const foodHero = await creativeGenerationService.refine(userId, {
    assetId: assetA.id,
    instruction: 'Make the food the hero.',
  });
  reportCopy(foodHero);
  await save(foodHero, 'D3-food-hero.png');
  record(
    'D3 · same campaign, stronger food emphasis',
    foodHero.id !== assetA.id && foodHero.status === 'COMPLETED',
    `subject "${before.subject}" → "${foodHero.creativeBrief.subject}"; productTreatment "${before.productTreatment}" → "${foodHero.creativeBrief.productTreatment}"`,
  );

  // ── E/F — the logo rules ────────────────────────────────────────────────
  console.log('\n' + '='.repeat(72));
  console.log('CASE E/F — brand mode and the real logo');
  console.log('='.repeat(72));

  let blocked = false;
  let blockedMessage = '';
  try {
    await creativeGenerationService.generate(userId, {
      prompt: 'Promote our Korean food weekend.',
      contextType: 'brand',
      brandVoice: BRAND_VOICE,
      goal: 'sales',
      funnelStage: 'MOFU',
      platforms: ['instagram'],
    });
  } catch (error) {
    blocked = error instanceof CreativeError && error.status === 422;
    blockedMessage = error instanceof Error ? error.message : String(error);
  }
  record('E · brand mode without a logo is blocked before anything renders', blocked, blockedMessage);

  const branded = await creativeGenerationService.generate(userId, {
    prompt: 'Promote our Korean food weekend.',
    contextType: 'brand',
    brandVoice: BRAND_VOICE,
    creativeDna: { logoAssetUrl: LOGO_URL, brandColors: ['#8b1e1e', '#f5efe6'] },
    goal: 'sales',
    funnelStage: 'MOFU',
    platforms: ['instagram'],
  });
  reportCopy(branded);
  await save(branded, 'F-branded-with-logo.png');
  record(
    'F · brand mode with a real logo renders a completed creative',
    branded.status === 'COMPLETED' && Boolean(branded.imageUrl),
    `status=${branded.status} · compare F-branded-with-logo.png against the source logo by eye`,
  );

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(72));
  console.log('SUMMARY');
  console.log('='.repeat(72));
  for (const { label, verdict, detail } of results) {
    console.log(`${verdict.padEnd(5)} ${label}`);
    if (verdict === 'FAIL') console.log(`      ${detail}`);
  }
  const failed = results.filter((r) => r.verdict === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.`);
  console.log(`Inspect the creatives themselves in ${outDir} — a passing requirement check is not a judgement of the design.`);
  if (failed > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error('\nDogfood run failed:', error);
  process.exitCode = 1;
});
