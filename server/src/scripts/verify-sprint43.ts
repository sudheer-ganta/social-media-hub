/**
 * Sprint 4.3 acceptance check — Brand Intelligence and Marketing Intelligence.
 *
 *   npm run verify:sprint43              (from server/)
 *   npm run verify:sprint43 -- --live    (adds one real Gemini analysis)
 *
 * Follows `verify-sprint42.ts`: the default run is entirely offline and stubs
 * the provider, so it exercises the parts with the most ways to be quietly
 * wrong and no other test.
 *
 * For this sprint that is overwhelmingly the *deterministic* half. The whole
 * design rests on arithmetic the model never sees — metrics, platform budgets,
 * weight renormalisation, severity-weighted readiness — and every one of those
 * is a place where a wrong number produces a plausible-looking score rather
 * than an error. Specifically:
 *
 *   - that weights renormalise when a dimension does not apply, so a text-only
 *     post is not silently capped below 100;
 *   - that a tag counted twice (inline and in the list) is counted once;
 *   - that platform fit takes the *worst* network, not the average;
 *   - that readiness is severity-weighted, so polish items cannot outvote a
 *     blocker;
 *   - that Brand Intelligence prefers what the user said and labels what it
 *     inferred.
 */
import { resolveBrandProfile, renderBrandSection } from '../ai/brand/brand-profile';
import { measureCaption, looksLikeCta } from '../ai/analysis/metrics';
import { checkPlatforms, platformFitScore } from '../ai/analysis/platform-rules';
import { computeReachScore } from '../ai/analysis/scoring';
import { buildChecklist } from '../ai/analysis/checklist';
import { DEFAULT_WEIGHTS, normaliseWeights } from '../ai/analysis/weights';
import { analyseCaption } from '../ai/generators/marketing-intelligence.generator';
import { activeProvider } from '../ai/providers';
import type { AiTextProvider, GenerateJsonOptions } from '../ai/providers';
import { parseAnalysisRequest } from '../services/ai.service';
import type { DimensionScore, ImageAnalysis, ScoreDimension } from '../ai/types';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function stubProvider(payload: unknown): AiTextProvider & { calls: GenerateJsonOptions[] } {
  const calls: GenerateJsonOptions[] = [];
  return {
    id: 'stub',
    model: 'stub-model',
    supportsVision: true,
    isConfigured: () => true,
    calls,
    async generateJson(options: GenerateJsonOptions) {
      calls.push(options);
      return payload;
    },
  } as AiTextProvider & { calls: GenerateJsonOptions[] };
}

const CAPTION = [
  'Some rooms have heard a thousand promises.',
  '',
  'Yours is the one they will keep. Book a winter date before they go. #wedding',
].join('\n');

const VISION: Partial<ImageAnalysis> = {
  primarySubject: 'a candlelit stone hall',
  sceneDescription: 'A vast stone hall lit almost entirely by candles.',
  industry: 'weddings',
  targetAudience: 'couples who want atmosphere over spectacle',
  productCategory: 'destination weddings',
  colorPalette: ['#1a1a2e', '#c8a24a'],
  themes: ['legacy', 'ceremony'],
  emotions: ['awe'],
  textInImage: [],
  mood: 'reverent',
  lighting: 'low warm candlelight',
  setting: 'indoor great hall',
};

/** A believable analysis reply, with two values that must be cleaned. */
const ANALYSIS_PAYLOAD = {
  scores: {
    hook: { score: 9, confidence: 'High', reason: 'Opens on a claim about the room, not the brand.' },
    visual: { score: 8, confidence: 'Medium', reason: 'Uses the candlelight rather than naming it.' },
    platformFit: { score: 3, confidence: 'Low', reason: 'Reads as a caption, not a post.' },
    audienceFit: { score: 7, confidence: 'Medium', reason: 'Register suits an atmosphere-first buyer.' },
    cta: { score: 6, confidence: 'High', reason: 'Booking ask arrives late.' },
    readability: { score: 8, confidence: 'High', reason: 'Two short blocks.' },
    hashtags: { score: 4, confidence: 'Medium', reason: 'One generic tag.' },
    // A dimension nobody asked for — must be ignored entirely.
    vibes: { score: 10, confidence: 'High', reason: 'Immaculate.' },
  },
  strengths: ['The opening line makes the venue the subject.'],
  weaknesses: ['The call to action is buried in the last sentence.'],
  engagement: {
    saves: 'High',
    shares: 'Medium',
    comments: 'Low',
    clicks: 'Medium',
    rationale: 'Atmospheric copy is saved more than it is discussed.',
  },
  improvements: [
    {
      dimension: 'cta',
      issue: 'The booking ask is the last clause of a long line.',
      suggestion: 'Give it its own line under a break.',
      estimatedGain: 6,
    },
    // An inflated claim, and a dimension that does not exist — both must go.
    { dimension: 'hook', issue: 'x', suggestion: 'Rewrite it.', estimatedGain: 90 },
    { dimension: 'vibes', issue: 'x', suggestion: 'More vibes.', estimatedGain: 5 },
  ],
};

async function main() {
  console.log('\nSprint 4.3 — brand intelligence, and a second engine that judges\n');

  // ── Brand Intelligence ─────────────────────────────────────────────────────
  console.log('Brand Intelligence');

  const merged = resolveBrandProfile({
    brand: { name: 'Aurelia', tone: 'Warm', wordsToAvoid: ['cheap'] },
    imageAnalysis: VISION as ImageAnalysis,
  });

  check('fills an unstated industry from the image', merged.industry === 'weddings');
  check('marks the inferred field as inferred', merged.provenance.industry === 'image');
  check('marks a stated field as stated', merged.provenance.name === 'brand');
  check(
    'seeds products from the image product category',
    merged.products.includes('destination weddings'),
  );

  const stated = resolveBrandProfile({
    brand: { industry: 'private members clubs', name: 'Aurelia' },
    imageAnalysis: VISION as ImageAnalysis,
  });
  check(
    'what the user typed always beats what the image showed',
    stated.industry === 'private members clubs' && stated.provenance.industry === 'brand',
  );

  const empty = resolveBrandProfile({});
  check('an absent brand resolves rather than throwing', empty.completeness === 0);
  check('and renders to nothing', renderBrandSection(empty) === null);

  const rendered = renderBrandSection(merged) ?? '';
  check(
    'the rendered block flags an inferred fact to the model',
    rendered.includes('read from the image'),
  );
  // `merged` above is over half filled, so it gets no caveat — the caveat is
  // for a profile with almost nothing in it, which is the state that makes a
  // model start inventing a brand to write about.
  const sparse = renderBrandSection(resolveBrandProfile({ brand: { name: 'Aurelia' } })) ?? '';
  check(
    'a sparse profile tells the model not to invent positioning',
    sparse.includes('Do not invent positioning'),
  );
  check(
    'and a filled-in one does not',
    !rendered.includes('Do not invent positioning'),
  );

  // ── Deterministic metrics ──────────────────────────────────────────────────
  console.log('\nMeasured, not asked');

  const metrics = measureCaption(CAPTION);
  check('counts characters', metrics.characterCount === CAPTION.length);
  check('counts paragraphs by blank line', metrics.paragraphCount === 2);
  check('counts the inline hashtag', metrics.hashtagCount === 1);
  check(
    'takes the hook as the first line, not the first sentence',
    metrics.hookCharacterCount === 'Some rooms have heard a thousand promises.'.length,
  );
  check('never divides by zero on punctuation-free copy', measureCaption('no full stop here').sentenceCount === 1);
  check('an empty caption measures rather than throwing', measureCaption('').wordCount === 0);

  check('spots an explicit call to action', looksLikeCta(CAPTION, metrics));
  check(
    'does not invent one in the middle of a sentence',
    !looksLikeCta('We share a lot of stories about this room and its history.', metrics),
  );

  const family = measureCaption('One emoji 👩‍👩‍👧‍👦 here');
  check('counts a ZWJ emoji sequence as one emoji', family.emojiCount === 1);

  // ── Weights ────────────────────────────────────────────────────────────────
  console.log('\nWeights');

  const full = Object.keys(DEFAULT_WEIGHTS) as ScoreDimension[];
  const sum = full.reduce((total, key) => total + DEFAULT_WEIGHTS[key], 0);
  check('the default weights sum to 1', Math.abs(sum - 1) < 1e-9, `got ${sum}`);

  const withoutVisual = normaliseWeights(full.filter((key) => key !== 'visual'));
  const renormalised = Object.values(withoutVisual).reduce((t, w) => t + (w ?? 0), 0);
  check(
    'renormalise to 1 when a dimension does not apply',
    Math.abs(renormalised - 1) < 1e-9,
    `got ${renormalised}`,
  );

  const perfectTextOnly: Partial<Record<ScoreDimension, DimensionScore>> = Object.fromEntries(
    full
      .filter((key) => key !== 'visual')
      .map((key) => [key, { score: 10, confidence: 'High', reason: 'x' }]),
  );
  check(
    'a perfect text-only post can still score 100',
    computeReachScore({ scores: perfectTextOnly }).reachScore === 100,
    'a post is being marked down for an image nobody asked it to have',
  );

  check(
    'nothing scored yields 0 rather than a divide by zero',
    computeReachScore({ scores: {} }).reachScore === 0,
  );

  // ── Platform rules ─────────────────────────────────────────────────────────
  console.log('\nPlatform Intelligence');

  const longLine = 'x'.repeat(400);
  const fits = checkPlatforms(['linkedin', 'x'], {
    caption: longLine,
    metrics: measureCaption(longLine),
    hashtagCount: 11,
    hasImage: true,
    hasCta: false,
  });

  const xFit = fits.find((fit) => fit.platform === 'x');
  check(
    'fails a caption over the hard limit',
    xFit?.checks.some((c) => c.id === 'length-limit' && c.status === 'fail') ?? false,
  );
  check(
    'warns when the hook is cut off by the fold',
    fits.every((fit) =>
      fit.checks.some((c) => c.id === 'hook-before-fold' && c.status === 'warn'),
    ),
  );
  check(
    'warns on a hashtag wall',
    fits.every((fit) =>
      fit.checks.some((c) => c.id === 'hashtag-count' && c.status === 'warn'),
    ),
  );

  const mixed = checkPlatforms(['linkedin', 'x'], {
    caption: CAPTION,
    metrics,
    hashtagCount: 2,
    hasImage: true,
    hasCta: true,
  });
  const scores = mixed.map((fit) => fit.score);
  check(
    'platform fit takes the worst network, not the average',
    platformFitScore(mixed) === Math.min(...scores),
    'a strong LinkedIn score would hide a caption that breaks on X',
  );
  check('no platform selected means no platform verdict', platformFitScore([]) === null);

  const instagram = checkPlatforms(['instagram'], {
    caption: CAPTION,
    metrics,
    hashtagCount: 9,
    hasImage: true,
    hasCta: true,
  })[0];
  check(
    'recommends the first comment for an Instagram tag block',
    instagram.recommendations.some((advice) => advice.includes('first comment')),
  );

  const unknown = checkPlatforms(['mastodon'], {
    caption: CAPTION,
    metrics,
    hashtagCount: 2,
    hasImage: true,
    hasCta: true,
  })[0];
  check('an unrecognised network degrades rather than throwing', unknown.score > 0);

  // ── Checklist ──────────────────────────────────────────────────────────────
  console.log('\nPre-publish checklist');

  const brandWithBan = resolveBrandProfile({ brand: { wordsToAvoid: ['promises'] } });
  const banned = buildChecklist({
    caption: CAPTION,
    metrics,
    hashtagCount: 1,
    hasImage: true,
    platforms: mixed,
    scores: {},
    brand: brandWithBan,
  });
  const bannedItem = banned.items.find((item) => item.id === 'no-banned-words');
  check('catches a word the brand banned', bannedItem?.passed === false);
  check('and treats it as a blocker', bannedItem?.severity === 'blocker');
  check('an unticked item carries its fix', Boolean(bannedItem?.fix));

  const clean = buildChecklist({
    caption: CAPTION,
    metrics,
    hashtagCount: 1,
    hasImage: true,
    platforms: mixed,
    scores: {},
  });
  check(
    'a ticked item carries no fix',
    clean.items.filter((item) => item.passed).every((item) => item.fix === undefined),
  );
  check(
    'readiness is severity weighted, not a pass count',
    banned.readiness < clean.readiness,
    'a blocker is not costing more than a polish item',
  );

  // ── Request validation ─────────────────────────────────────────────────────
  console.log('\nRequest validation');

  const parsed = parseAnalysisRequest({
    caption: CAPTION,
    hashtags: ['#Wedding', 'venue'],
    platforms: ['LinkedIn', 'linkedin', '../etc'],
    goal: 'nonsense',
    hasImage: true,
  });
  check('strips the # from supplied hashtags', parsed.hashtags[0] === 'Wedding');
  check('de-duplicates and lowercases platforms', parsed.platforms.length === 1);
  check('falls back for an unknown goal', parsed.goal === 'brand_awareness');
  check(
    'takes hasImage from the caller, not from the analysis',
    parsed.hasImage === true && parsed.imageAnalysis === undefined,
  );

  let rejected = false;
  try {
    parseAnalysisRequest({ caption: 'too short' });
  } catch {
    rejected = true;
  }
  check('refuses a caption too short to judge', rejected);

  // ── The generator end to end ───────────────────────────────────────────────
  console.log('\nMarketing Intelligence');

  const provider = stubProvider(ANALYSIS_PAYLOAD);
  const analysis = await analyseCaption(
    {
      caption: CAPTION,
      hashtags: ['wedding', 'venue'],
      platforms: ['linkedin'],
      goal: 'bookings',
      funnelStage: 'MOFU',
      audience: 'gen_z_millennial',
      language: 'English',
      brand: { name: 'Aurelia' },
      imageAnalysis: VISION as ImageAnalysis,
      hasImage: true,
    },
    { provider },
  );

  check('makes exactly one model call', provider.calls.length === 1);
  check('sends no image part — analysis reads text', !provider.calls[0].images);
  check(
    'hands the counted facts to the model as fact',
    provider.calls[0].prompt.includes('Measured facts'),
  );
  check(
    'tells the model not to recount them',
    provider.calls[0].prompt.includes('do not repeat these'),
  );
  check(
    'keeps judgement stable with a low temperature',
    (provider.calls[0].temperature ?? 1) <= 0.3,
  );

  check('produces a 0–100 reach score', analysis.reachScore > 0 && analysis.reachScore <= 100);
  check('ignores a dimension nobody asked for', !('vibes' in analysis.scores));
  check(
    'the weights it reports sum to 1',
    Math.abs(Object.values(analysis.weights).reduce((t, w) => t + (w ?? 0), 0) - 1) < 1e-9,
  );
  check(
    'the measured platform verdict overrides the model’s',
    analysis.scores.platformFit?.score === platformFitScore(analysis.platforms),
    'the model scored platform fit 3; the rules measured something else',
  );
  check(
    'and keeps High confidence on the measured value',
    analysis.scores.platformFit?.confidence === 'High',
  );

  check(
    'counts a tag appearing both inline and in the list once',
    analysis.metrics.hashtagCount === 1 && analysis.platforms.length === 1,
  );

  check('caps an inflated improvement claim', analysis.improvements.every((i) => i.estimatedGain <= 25));
  check(
    'drops an improvement for a dimension that does not exist',
    analysis.improvements.every((i) => i.dimension !== ('vibes' as ScoreDimension)),
  );
  check('sorts improvements by impact', analysis.improvements[0].estimatedGain >= (analysis.improvements[1]?.estimatedGain ?? 0));

  check('explains the score in both directions', analysis.explanation.strengths.length > 0 && analysis.explanation.weaknesses.length > 0);
  check('returns a checklist with a readiness figure', analysis.checklist.items.length > 0);
  check('stamps the analyser version', analysis.meta.analysisVersion.length > 0);
  check('stamps the weights version separately', analysis.meta.weightsVersion.length > 0);
  check('reports the resolved brand', analysis.brand?.industry === 'weddings');

  // A text-only post must drop the visual dimension entirely.
  const textOnly = await analyseCaption(
    {
      caption: CAPTION,
      hashtags: [],
      platforms: [],
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      audience: 'broad',
      language: 'English',
      hasImage: false,
    },
    { provider: stubProvider(ANALYSIS_PAYLOAD) },
  );
  check('never scores the visual of a post with no image', textOnly.scores.visual === undefined);
  check(
    'still scores hashtags when the only tag is inline in the caption',
    textOnly.scores.hashtags !== undefined,
    'an inline #tag is a hashtag to the network even with an empty tag list',
  );

  const untagged = await analyseCaption(
    {
      caption: 'Some rooms have heard a thousand promises. Yours is the one they keep.',
      hashtags: [],
      platforms: [],
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      audience: 'broad',
      language: 'English',
      hasImage: false,
    },
    { provider: stubProvider(ANALYSIS_PAYLOAD) },
  );
  check(
    'drops the hashtag dimension when there are genuinely no tags',
    untagged.scores.hashtags === undefined,
  );

  let refused = false;
  try {
    await analyseCaption(
      {
        caption: CAPTION,
        hashtags: [],
        platforms: [],
        goal: 'brand_awareness',
        funnelStage: 'TOFU',
        audience: 'broad',
        language: 'English',
        hasImage: false,
      },
      { provider: stubProvider({ scores: {} }) },
    );
  } catch {
    refused = true;
  }
  check(
    'fails rather than publishing a score built on nothing',
    refused,
    'a reach score computed from no dimensions looks like a verdict and is not one',
  );

  // ── Live ───────────────────────────────────────────────────────────────────
  if (process.argv.includes('--live')) {
    console.log('\nLive analysis');
    const real = activeProvider();
    if (!real.isConfigured()) {
      console.log('  SKIP  no GEMINI_API_KEY set');
    } else {
      const live = await analyseCaption(
        {
          caption: CAPTION,
          hashtags: ['wedding'],
          platforms: ['linkedin'],
          goal: 'bookings',
          funnelStage: 'MOFU',
          audience: 'gen_z_millennial',
          language: 'English',
          hasImage: false,
        },
        { provider: real },
      );
      check('a real model returns a usable score', live.reachScore > 0);
      check('with a reason for every dimension', Object.values(live.scores).every((s) => s.reason.length > 0));
      console.log(`        reach ${live.reachScore}, readiness ${live.checklist.readiness}%`);
    }
  } else {
    console.log('\n  (skipped the live Gemini call — re-run with --live)');
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nverify-sprint43 crashed:', error);
  process.exit(1);
});
