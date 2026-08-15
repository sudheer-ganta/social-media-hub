/**
 * Dogfood — latency BEFORE/AFTER for the §17 comparison.
 *
 * Runs exactly the interactive flow that measured 180.6s: the BTS/Korean/50%
 * request through /concepts, then /generate with the selected concept. Real
 * Gemini, real Cloudinary, real persistence. The service's own
 * `[creative] request timing` log prints the per-stage numbers and call
 * counts; this script only adds the wall-clock totals around each call.
 *
 *   cd server && npx ts-node --transpile-only src/scripts/verify-dogfood-8-latency.ts <userId> [outDir]
 *
 * Real test user ids live in the project memory; the placeholder UUID fails
 * the auth.users foreign key.
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { creativeGenerationService } from '../services/creative-generation.service';
import { missingFromCreative } from '../ai/intent/claim-match';

const userId = process.argv[2] || '00000000-0000-4000-8000-000000000000';
const outDir = process.argv[3] || path.join(__dirname, '..', '..', '..', 'dogfood-8-latency-output');

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

const PROMPT =
  'We have an event because BTS is coming back in our restaurant. We are giving 50% off on all our Korean food.';

async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Output: ${outDir}\nUser:   ${userId}\n`);

  const conceptsStart = Date.now();
  const concepts = await creativeGenerationService.discoverConcepts(userId, {
    prompt: PROMPT,
    contextType: 'personal',
    brandVoice: BRAND_VOICE,
    goal: 'event_promotion',
    funnelStage: 'BOFU',
    platforms: ['instagram'],
  });
  const conceptsMs = Date.now() - conceptsStart;

  console.log(`\n/concepts wall clock: ${conceptsMs}ms`);
  console.log('intent claims:', concepts.intent?.requiredClaims);
  for (const c of concepts.concepts) {
    console.log(`  · ${c.conceptName} (${c.artDirectionFamily}) — fidelity ${c.intentFidelity?.score ?? 'n/a'}`);
  }

  const generateStart = Date.now();
  const asset = await creativeGenerationService.generate(
    userId,
    {
      prompt: PROMPT,
      contextType: 'personal',
      brandVoice: BRAND_VOICE,
      goal: 'event_promotion',
      funnelStage: 'BOFU',
      platforms: ['instagram'],
      selectedConcept: concepts.concepts[0],
      intent: concepts.intent,
    },
    'latency-df',
  );
  const generateMs = Date.now() - generateStart;

  const brief = asset.creativeBrief;
  console.log(`\n/generate wall clock: ${generateMs}ms (BEFORE optimization: 180634ms)`);
  console.log('status    :', asset.status);
  console.log('concept   :', brief.concept);
  console.log('headline  :', JSON.stringify(brief.headline));
  console.log('offer/info:', JSON.stringify(brief.marketingCreative?.offerText ?? ''), JSON.stringify(brief.marketingCreative?.secondaryInfo ?? []));
  const missing = missingFromCreative(brief, concepts.intent);
  console.log('claims    :', missing.length === 0 ? 'ALL requirements typeset' : `MISSING: ${missing.join(' · ')}`);

  if (asset.imageUrl) {
    try {
      const response = await axios.get<ArrayBuffer>(asset.imageUrl, { responseType: 'arraybuffer', timeout: 30_000 });
      fs.writeFileSync(path.join(outDir, 'A-bts-korean-50off-after.png'), Buffer.from(response.data));
      console.log(`saved: ${path.join(outDir, 'A-bts-korean-50off-after.png')}`);
    } catch (error) {
      console.log(`(could not download for local inspection: ${error instanceof Error ? error.message : error})`);
    }
  }

  console.log(`\nTOTAL member-facing wait (concepts + generate): ${conceptsMs + generateMs}ms`);
}

run().catch((error) => {
  console.error('\nLatency dogfood failed:', error);
  process.exitCode = 1;
});
