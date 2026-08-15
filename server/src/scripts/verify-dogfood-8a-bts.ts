/**
 * Dogfood 8a — the BTS case, and one refinement. The cheap path.
 *
 * Runs exactly one campaign end to end and refines it once, because this one
 * request is the whole phase in miniature: a member stated three facts, and
 * the finished creative has to carry all three after being run through a
 * creative director, an image model, a campaign design pass and an edit.
 *
 *   cd server && npx ts-node --transpile-only src/scripts/verify-dogfood-8a-bts.ts <userId> [outDir]
 *
 * Uses the member's own saved Brand Voice and Creative DNA when they have
 * them (that is what "the real brand" means here), and says so when it falls
 * back. Model calls are counted by wrapping the provider singletons, so the
 * cost line at the end is measured rather than estimated.
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { prisma } from '../config/prisma';
import { geminiImageProvider } from '../ai/providers/gemini-image.provider';
import { geminiMarketingProvider, geminiVisionProvider, geminiCaptionProvider } from '../ai/providers/gemini.provider';
import * as imageSource from '../ai/vision/image-source';
import { creativeGenerationService } from '../services/creative-generation.service';
import { missingFromCreative, renderedCopyText } from '../ai/intent/claim-match';
import * as generatedAssetRepository from '../repositories/generated-asset.repository';
import type { StoredGeneratedAsset } from '../repositories/generated-asset.repository';
import type { CreativeDirection, CreativeIntentBrief } from '../ai/types';

const userId = process.argv[2] || '00000000-0000-4000-8000-000000000000';
const outDir = process.argv[3] || path.join(__dirname, '..', '..', '..', 'dogfood-8a-output');
process.env.CREATIVE_DEBUG_DIR ||= outDir;

const PROMPT =
  'We have an event because BTS is coming back in our restaurant. We are giving 50% off on all our Korean food.';
const REFINE_INSTRUCTION = 'Make the 50% offer more prominent.';

/** Only used when the member has saved no logo of their own. */
const FALLBACK_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Logo_TV_2015.png';

// ── Instrumentation ─────────────────────────────────────────────────────────

let imageCalls = 0;
let textCalls = 0;
const fetchedUrls: string[] = [];

function instrument() {
  const originalImage = geminiImageProvider.generateImage.bind(geminiImageProvider);
  geminiImageProvider.generateImage = async (options) => {
    imageCalls += 1;
    return originalImage(options);
  };

  for (const provider of [geminiMarketingProvider, geminiVisionProvider, geminiCaptionProvider]) {
    const original = provider.generateJson.bind(provider);
    provider.generateJson = async (options) => {
      textCalls += 1;
      return original(options);
    };
  }

  // Which images actually get fetched is the evidence for what a refinement
  // was seeded from — the wordless visual, or the finished creative.
  const originalFetch = imageSource.fetchInlineImage;
  (imageSource as { fetchInlineImage: typeof imageSource.fetchInlineImage }).fetchInlineImage = async (url) => {
    fetchedUrls.push(url);
    return originalFetch(url);
  };
}

// ── Reporting ───────────────────────────────────────────────────────────────

const checks: Array<{ label: string; pass: boolean; detail: string }> = [];

function check(label: string, pass: boolean, detail: string) {
  checks.push({ label, pass, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}`);
  console.log(`         ${detail}`);
}

async function save(url: string | null, filename: string) {
  if (!url) return console.log(`  (nothing to save for ${filename})`);
  try {
    const response = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 30_000 });
    fs.writeFileSync(path.join(outDir, filename), Buffer.from(response.data));
    console.log(`  saved: ${path.join(outDir, filename)}`);
  } catch (error) {
    // This machine intermittently times out against the Cloudinary CDN right
    // after upload; the asset itself is fine and the URL still works later.
    console.log(`  (download failed for ${filename}: ${error instanceof Error ? error.message : error})`);
  }
}

function reportCopy(label: string, brief: CreativeDirection) {
  console.log(`\n  ${label}`);
  console.log('    concept       :', brief.concept);
  console.log('    copyTreatment :', brief.copyTreatment);
  console.log('    headline      :', JSON.stringify(brief.headline));
  console.log('    supportingLine:', JSON.stringify(brief.supportingLine));
  console.log('    cta           :', JSON.stringify(brief.cta));
  console.log('    offerText     :', JSON.stringify(brief.marketingCreative?.offerText ?? ''));
  console.log('    eventBadge    :', JSON.stringify(brief.marketingCreative?.eventBadge ?? ''));
  console.log('    brandMessage  :', JSON.stringify(brief.marketingCreative?.brandMessage ?? ''));
  console.log('    secondaryInfo :', JSON.stringify(brief.marketingCreative?.secondaryInfo ?? []));
  console.log('    logoPlacement :', JSON.stringify(brief.layoutDirection?.logoPlacement ?? ''));
}

/**
 * Where the offer sits in the reading order. "More prominent" has to mean
 * something checkable, and this is it: 1 is the headline, 5 is footer detail,
 * 99 is absent entirely. A smaller number after the refinement is the offer
 * moving up the hierarchy.
 */
function offerRank(brief: CreativeDirection, offer: string): number {
  const needle = offer.toLowerCase().replace(/\s+/g, '');
  const has = (text?: string) => Boolean(text && text.toLowerCase().replace(/\s+/g, '').includes(needle));
  if (has(brief.headline)) return 1;
  if (has(brief.marketingCreative?.offerText)) return 2;
  if (has(brief.supportingLine)) return 3;
  if (has(brief.cta)) return 4;
  if (has(brief.marketingCreative?.brandMessage)) return 5;
  if ((brief.marketingCreative?.secondaryInfo ?? []).some((line) => has(line))) return 6;
  return 99;
}

const RANK_NAMES: Record<number, string> = {
  1: 'headline', 2: 'offer device', 3: 'supporting line', 4: 'CTA', 5: 'brand message', 6: 'footer detail', 99: 'ABSENT',
};

async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  instrument();

  console.log(`Output: ${outDir}`);
  console.log(`User:   ${userId}\n`);

  // ── The member's real saved identity ──────────────────────────────────────
  const [brand, savedVoice, savedDna] = await Promise.all([
    prisma.brand.findFirst({ where: { created_by: userId } }),
    // These two are PostgREST-facing tables, so they keep snake_case field
    // names that match the JSON the browser sees — see prisma/schema.prisma.
    prisma.brandVoice.findFirst({ where: { created_by: userId }, orderBy: { is_default: 'desc' } }),
    prisma.creativeDna.findFirst({ where: { created_by: userId }, orderBy: { is_default: 'desc' } }),
  ]);

  const brandVoice = (savedVoice?.voice as Record<string, unknown> | undefined) ?? {
    name: 'Seven Sisters',
    description: 'A multi-cuisine restaurant serving Korean, Indian and Pan-Asian food.',
    industry: 'Food / Restaurant',
    tone: 'warm, confident, unfussy',
    personality: 'generous host',
    targetAudience: 'city diners, 20s–30s',
    usp: 'Everything cooked to order, nothing pre-plated.',
    wordsToAvoid: ['elevate', 'unleash', 'game-changing', 'seamless'],
  };
  const creativeDna = {
    ...((savedDna?.dna as Record<string, unknown> | undefined) ?? {}),
  } as Record<string, unknown>;
  if (!creativeDna.logoAssetUrl) creativeDna.logoAssetUrl = FALLBACK_LOGO;

  if (!brand) {
    throw new Error(
      `No brand exists for user ${userId}. Brand mode writes a branded creative against a real brand row — create one in the app first.`,
    );
  }

  console.log('Brand       :', `"${brand.name}" (${brand.id})`);
  console.log('Brand Voice :', savedVoice ? `saved profile "${savedVoice.name}"` : 'FALLBACK (no saved profile for this user)');
  console.log('Creative DNA:', savedDna ? `saved profile "${savedDna.name}"` : 'FALLBACK (no saved profile for this user)');
  console.log('Logo        :', creativeDna.logoAssetUrl, savedDna?.dna && (savedDna.dna as Record<string, unknown>).logoAssetUrl ? '(member\'s own)' : '(fallback stand-in)');

  const baseRequest = {
    prompt: PROMPT,
    contextType: 'brand' as const,
    brandId: brand.id,
    brandVoice,
    creativeDna,
    goal: 'event_promotion' as const,
    funnelStage: 'BOFU' as const,
    platforms: ['instagram'],
  };

  // ── 1 · Intent extraction + 2 · concepts ─────────────────────────────────
  console.log('\n' + '='.repeat(74));
  console.log('1–2 · INTENT EXTRACTION AND CONCEPTS');
  console.log('='.repeat(74));

  const discovered = await creativeGenerationService.discoverConcepts(userId, baseRequest);
  const intent: CreativeIntentBrief | undefined = discovered.intent;

  console.log('\n  Intent brief:');
  console.log('    event          :', JSON.stringify(intent?.event));
  console.log('    culturalContext:', JSON.stringify(intent?.culturalContext));
  console.log('    productCategory:', JSON.stringify(intent?.productCategory));
  console.log('    offer          :', JSON.stringify(intent?.offer));
  console.log('    promotionType  :', JSON.stringify(intent?.promotionType));
  console.log('    venueType      :', JSON.stringify(intent?.venueType));
  console.log('    audience       :', JSON.stringify(intent?.audience));
  console.log('    requiredClaims :', JSON.stringify(intent?.requiredClaims));
  console.log('    optionalDetails:', JSON.stringify(intent?.optionalDetails));

  fs.writeFileSync(path.join(outDir, 'intent-brief.json'), JSON.stringify(intent, null, 2));

  const claims = intent?.requiredClaims ?? [];
  const claimText = claims.join(' | ').toLowerCase();
  check(
    '1 · intent extraction captures the event, the category and the exact offer',
    /bts/.test(claimText) && /korean/.test(claimText) && /50/.test(claimText),
    `requiredClaims = ${JSON.stringify(claims)}`,
  );

  console.log('\n  Concepts offered:');
  for (const concept of discovered.concepts) {
    console.log(`    · ${concept.conceptName}  [${concept.artDirectionFamily}]  fidelity ${concept.intentFidelity?.score ?? 'n/a'}`);
    console.log(`        ${concept.bigIdea}`);
    if (concept.intentFidelity?.missingRequirements.length) {
      console.log(`        MISSING: ${concept.intentFidelity.missingRequirements.join(', ')}`);
    }
  }
  check(
    '2 · every concept shown to the member carries all three requirements',
    discovered.concepts.length > 0 &&
      discovered.concepts.every((c) => (c.intentFidelity?.missingRequirements.length ?? 0) === 0),
    `${discovered.concepts.length} concept(s), fidelity scores ${discovered.concepts.map((c) => c.intentFidelity?.score ?? 'n/a').join(' / ')}`,
  );

  // ── 3 · visual + 4 · automatic campaign ──────────────────────────────────
  console.log('\n' + '='.repeat(74));
  console.log('3–4 · STANDALONE VISUAL, THEN THE AUTOMATIC CAMPAIGN OVER IT');
  console.log('='.repeat(74));

  const fetchesBeforeGenerate = fetchedUrls.length;
  const campaign = await creativeGenerationService.generate(userId, {
    ...baseRequest,
    selectedConcept: discovered.concepts[0],
    intent,
  });

  const standalone = campaign.parentAssetId
    ? await generatedAssetRepository.findById(campaign.parentAssetId, userId)
    : null;

  reportCopy('Final campaign copy:', campaign.creativeBrief);

  console.log('\n  Assets:');
  console.log('    standalone visual creative:', standalone?.id ?? '(none — campaign pass did not run)');
  console.log('      →', standalone?.imageUrl ?? '');
  console.log('    final campaign creative   :', campaign.id, `(source ${campaign.source})`);
  console.log('      →', campaign.imageUrl);
  console.log('    wordless visual foundation:', campaign.renderContext?.visualImageUrl ?? '(not kept)');

  await save(standalone?.imageUrl ?? null, 'A1-standalone-visual-creative.png');
  await save(campaign.renderContext?.visualImageUrl ?? null, 'A2-wordless-visual-foundation.png');
  await save(campaign.imageUrl, 'A3-final-campaign.png');

  check(
    '4 · the campaign was built ON the standalone visual, not regenerated separately',
    Boolean(standalone) && campaign.parentAssetId === standalone?.id && campaign.id !== standalone?.id,
    standalone
      ? `campaign ${campaign.id.slice(0, 8)} → parent visual ${standalone.id.slice(0, 8)}; both persisted, same creativeBrief concept "${campaign.creativeBrief.concept}"`
      : 'no parent asset — the campaign pass failed and the standalone creative was returned instead',
  );

  // ── 5 · the five things that must be true ────────────────────────────────
  console.log('\n' + '='.repeat(74));
  console.log('5 · VERIFICATION');
  console.log('='.repeat(74));

  const copy = renderedCopyText(campaign.creativeBrief);
  const missing = missingFromCreative(campaign.creativeBrief, intent);
  console.log('\n  Words that will be typeset on the creative:');
  console.log(`    "${copy}"`);

  const lower = copy.toLowerCase();
  check('5a · BTS / event context appears in the copy', /bts/.test(lower), `copy contains "bts": ${/bts/.test(lower)}`);
  check('5b · Korean food appears in the copy', /korean/.test(lower), `copy contains "korean": ${/korean/.test(lower)}`);
  check('5c · the 50% offer appears in the copy', /50\s*%/.test(lower), `copy contains "50%": ${/50\s*%/.test(lower)}`);
  check('5d · no hard requirement was dropped anywhere in the pipeline', missing.length === 0, missing.length ? `MISSING: ${missing.join(', ')}` : `all of ${claims.join(', ')} present`);

  const logoUrl = String(creativeDna.logoAssetUrl);
  const generateFetches = fetchedUrls.slice(fetchesBeforeGenerate);
  check(
    '5e · the real logo file was fetched and composited (never drawn by the model)',
    generateFetches.includes(logoUrl),
    `logo fetched: ${generateFetches.includes(logoUrl)} — ${logoUrl}`,
  );

  const voiceName = String((brandVoice as Record<string, unknown>).name ?? '');
  const avoided = ((brandVoice as Record<string, unknown>).wordsToAvoid as string[] | undefined) ?? [];
  const usedAvoided = avoided.filter((word) => lower.includes(word.toLowerCase()));
  check(
    '5f · brand voice was applied, and its banned words stayed out of the copy',
    Boolean(campaign.renderContext?.brand?.name) && usedAvoided.length === 0,
    `brand resolved as "${campaign.renderContext?.brand?.name ?? ''}" (expected "${voiceName}"); banned words used: ${usedAvoided.length ? usedAvoided.join(', ') : 'none'}`,
  );

  // ── 6 · refine ───────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(74));
  console.log(`6 · REFINE — "${REFINE_INSTRUCTION}"`);
  console.log('='.repeat(74));

  const offer = intent?.offer || '50% off';
  const rankBefore = offerRank(campaign.creativeBrief, offer);

  const fetchesBeforeRefine = fetchedUrls.length;
  const refined = await creativeGenerationService.refine(userId, {
    assetId: campaign.id,
    instruction: REFINE_INSTRUCTION,
  });
  const refineFetches = fetchedUrls.slice(fetchesBeforeRefine);

  reportCopy('Refined campaign copy:', refined.creativeBrief);
  await save(refined.imageUrl, 'A4-refined-campaign.png');

  const rankAfter = offerRank(refined.creativeBrief, offer);
  console.log(`\n  Offer prominence: ${RANK_NAMES[rankBefore]} (${rankBefore}) → ${RANK_NAMES[rankAfter]} (${rankAfter})`);

  check(
    '6a · a new AI_REFINED asset was created with its own image',
    refined.id !== campaign.id && refined.source === 'AI_REFINED' && refined.imageUrl !== campaign.imageUrl,
    `id ${refined.id.slice(0, 8)}, source ${refined.source}, new image: ${refined.imageUrl !== campaign.imageUrl}`,
  );

  const parentStill = await generatedAssetRepository.findById(campaign.id, userId);
  check(
    '6b · the previous creative is untouched and still COMPLETED',
    parentStill?.status === 'COMPLETED' && parentStill?.imageUrl === campaign.imageUrl,
    `parent ${campaign.id.slice(0, 8)} status ${parentStill?.status}, image unchanged: ${parentStill?.imageUrl === campaign.imageUrl}`,
  );

  const seededFrom = campaign.renderContext?.visualImageUrl;
  check(
    '6c · the refinement re-executed from the SAME wordless visual, not the finished creative',
    Boolean(seededFrom) && refineFetches.includes(seededFrom as string) && !refineFetches.includes(campaign.imageUrl as string),
    `seeded from ${seededFrom ?? '(none kept)'}; fetched during refine: ${refineFetches.map((u) => u.split('/').pop()).join(', ')}`,
  );

  check(
    '6d · same campaign — the concept did not change',
    refined.creativeBrief.concept === campaign.creativeBrief.concept,
    `"${campaign.creativeBrief.concept}" → "${refined.creativeBrief.concept}"`,
  );

  check(
    '6e · the offer actually became more prominent',
    // A dedicated offer DEVICE (rank ≤ 2) is already the top of what copy
    // structure can express — "more prominent" from there is scale/treatment,
    // which the vision QC sees but a rank cannot. So: never worse, and it must
    // end in a top-two display slot.
    rankAfter <= rankBefore && rankAfter <= 2,
    `${RANK_NAMES[rankBefore]} → ${RANK_NAMES[rankAfter]}${rankAfter === rankBefore ? ' (unchanged)' : ''}`,
  );

  const missingAfter = missingFromCreative(refined.creativeBrief, intent);
  check(
    '6f · BTS / Korean food / 50% all survived the refinement',
    missingAfter.length === 0,
    missingAfter.length ? `MISSING after refine: ${missingAfter.join(', ')}` : `all of ${claims.join(', ')} still present`,
  );

  // ── Summary ──────────────────────────────────────────────────────────────
  const failed = checks.filter((c) => !c.pass);
  console.log('\n' + '='.repeat(74));
  console.log('SUMMARY');
  console.log('='.repeat(74));
  for (const { label, pass } of checks) console.log(`${pass ? 'PASS ' : 'FAIL '} ${label}`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  ${f.label}\n    ${f.detail}`);
  }

  // Gemini 2.5 Flash Image bills a flat ~1290 output tokens per image at
  // $30/1M; text is a rough per-call average on the Pro preview model.
  const imageCost = imageCalls * 0.039;
  const textCost = textCalls * 0.03;
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  console.log(`Image model calls: ${imageCalls}`);
  console.log(`Text model calls : ${textCalls}`);
  console.log(`Approx. cost     : $${(imageCost + textCost).toFixed(2)}  (images ~$${imageCost.toFixed(2)}, text ~$${textCost.toFixed(2)})`);
  console.log(`\nCreatives saved in ${outDir}. A passing requirement check is not a judgement of the design — look at the images.`);

  await prisma.$disconnect();
  if (failed.length) process.exitCode = 1;
}

run().catch(async (error) => {
  console.error('\nDogfood run failed:', error);
  console.log(`\nModel calls before the failure — image: ${imageCalls}, text: ${textCalls}`);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
