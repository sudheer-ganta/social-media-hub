/**
 * Sprint 4.1 acceptance check.
 *
 *   npm run verify:sprint41              (from server/)
 *   npm run verify:sprint41 -- --live    (adds one real Gemini call)
 *
 * Drives the AI module exactly as the route does. The default run is entirely
 * offline: it swaps a stub in for the provider, so it exercises validation,
 * prompt assembly and — most importantly — the normalisation that treats model
 * output as untrusted. That last part is the logic with the most ways to be
 * subtly wrong and no other test.
 *
 * `--live` adds a single real generation, which is the only way to confirm the
 * key, the model name and the response schema actually work together. It costs
 * one request and needs GEMINI_API_KEY set.
 */
import { env } from '../config/env';
import { buildCaptionPrompt } from '../ai/prompts/caption.prompt';
import { resolveBrandProfile } from '../ai/brand/brand-profile';
import { generateCaption } from '../ai/generators/creative-intelligence.generator';
import { AiProviderError, activeProvider } from '../ai/providers';
import type { AiTextProvider, GenerateJsonOptions } from '../ai/providers';
import { aiService, AiError, parseCaptionRequest } from '../services/ai.service';
import type { CaptionRequest } from '../ai/types';

/**
 * Builds a prompt the way the generator does — Brand Intelligence first.
 *
 * The prompt builder takes a resolved brand profile rather than the raw
 * request, so every call site has to run the same merge the generator runs.
 */
function promptFor(request: CaptionRequest) {
  return buildCaptionPrompt(request, {
    brand: resolveBrandProfile({ brand: request.brandVoice }),
  });
}

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

async function expectThrows(
  label: string,
  fn: () => unknown | Promise<unknown>,
  predicate: (error: unknown) => boolean,
) {
  try {
    await fn();
    check(label, false, 'did not throw');
  } catch (error) {
    check(label, predicate(error), `threw ${(error as Error)?.name}`);
  }
}

/** A provider that returns whatever it is told to, without a network call. */
function stubProvider(payload: unknown): AiTextProvider & {
  lastCall?: GenerateJsonOptions;
} {
  const provider = {
    id: 'stub',
    model: 'stub-model',
    // This script never exercises the vision stage — a brief with no image is
    // the single-call flow, which is exactly what it is here to check.
    supportsVision: false,
    isConfigured: () => true,
    async generateJson(options: GenerateJsonOptions) {
      provider.lastCall = options;
      return payload;
    },
  } as AiTextProvider & { lastCall?: GenerateJsonOptions };
  return provider;
}

const BASE_BODY = {
  title: 'Aurora Serum launch',
  platforms: ['linkedin', 'instagram'],
  goal: 'product_launch',
  funnelStage: 'MOFU',
  captionLength: 'Medium',
  language: 'English',
  variationCount: 3,
  hashtagCount: 5,
};

async function main() {
  console.log('\nSprint 4.1 — native AI caption generation\n');

  // ── Validation ─────────────────────────────────────────────────────────────
  console.log('Request validation');

  const parsed = parseCaptionRequest(BASE_BODY);
  check('accepts a well-formed body', parsed.topic === 'Aurora Serum launch');
  check('falls back to title for topic', parsed.title === parsed.topic);
  check('keeps requested platforms', parsed.platforms.length === 2);

  await expectThrows(
    'rejects a body with no topic or title',
    () => parseCaptionRequest({ platforms: ['linkedin'] }),
    (error) => error instanceof AiError && error.status === 422,
  );

  await expectThrows(
    'rejects a non-object body',
    () => parseCaptionRequest('give me a caption'),
    (error) => error instanceof AiError,
  );

  const clamped = parseCaptionRequest({
    ...BASE_BODY,
    variationCount: 99,
    hashtagCount: -4,
  });
  check('clamps variationCount to the maximum', clamped.variationCount === 5);
  check('clamps hashtagCount to the minimum', clamped.hashtagCount === 0);

  const defaulted = parseCaptionRequest({ title: 'A post' });
  check(
    'defaults an unknown goal rather than failing',
    parseCaptionRequest({ title: 'A post', goal: 'world_domination' }).goal ===
      'brand_awareness',
  );
  check('defaults funnelStage to TOFU', defaulted.funnelStage === 'TOFU');
  check('defaults language to English', defaulted.language === 'English');

  const sanitised = parseCaptionRequest({
    ...BASE_BODY,
    platforms: ['LinkedIn', 'linkedin', 'threads', '../../etc/passwd', 'x'],
  });
  check(
    'lowercases and de-duplicates platforms',
    sanitised.platforms.filter((p) => p === 'linkedin').length === 1,
  );
  check(
    'keeps a platform with no OAuth provider yet',
    sanitised.platforms.includes('threads'),
  );
  check(
    'drops a platform id that is not a slug',
    !sanitised.platforms.some((p) => p.includes('/')),
  );

  check(
    'drops a javascript: image url',
    parseCaptionRequest({
      ...BASE_BODY,
      imageUrl: 'javascript:alert(1)',
    }).imageUrl === undefined,
  );
  check(
    'keeps an https image url',
    parseCaptionRequest({
      ...BASE_BODY,
      imageUrl: 'https://example.com/a.jpg',
    }).imageUrl === 'https://example.com/a.jpg',
  );

  check(
    'ignores a brand voice with nothing in it',
    parseCaptionRequest({ ...BASE_BODY, brandVoice: {} }).brandVoice ===
      undefined,
  );
  check(
    'keeps a brand voice with content',
    parseCaptionRequest({
      ...BASE_BODY,
      brandVoice: { name: 'Aurora', wordsToAvoid: ['miracle'] },
    })?.brandVoice?.name === 'Aurora',
  );

  // ── Prompt assembly ────────────────────────────────────────────────────────
  console.log('\nPrompt assembly');

  const built = promptFor(parsed);
  check('carries the persona in the system instruction',
    built.systemInstruction.includes('senior social media copywriter'));
  check('names the subject', built.prompt.includes('Aurora Serum launch'));
  check(
    'includes the platform rules for each requested platform',
    built.prompt.includes('LinkedIn:') && built.prompt.includes('Instagram:'),
  );
  check(
    'omits the brand section when there is no brand',
    !built.prompt.includes('## Brand'),
  );

  const regenerate = promptFor(
    parseCaptionRequest({ ...BASE_BODY, previousCaption: 'A first attempt.' }),
  );
  check(
    'a regenerate shows the previous caption',
    regenerate.prompt.includes('A first attempt.'),
  );
  check(
    'a regenerate raises the temperature',
    regenerate.temperature > built.temperature,
  );

  const schema = built.responseSchema as {
    properties: { platformCaptions?: { required: string[] } };
  };
  check(
    'the response schema requires a caption per platform',
    schema.properties.platformCaptions?.required.join(',') ===
      'linkedin,instagram',
  );

  // ── Normalisation of untrusted model output ────────────────────────────────
  console.log('\nResult normalisation');

  const good = await generateCaption(parsed, {
    provider: stubProvider({
      variations: [
        { tone: 'Professional', caption: 'A perfectly good caption here.', hook: 'A hook.' },
        { tone: 'Storytelling', caption: 'Another perfectly good caption.', hook: '' },
        { tone: 'Emotional', caption: 'x' },
        { tone: 'Extra', caption: 'One more than we asked for, honestly.', hook: 'h' },
      ],
      hashtags: ['#skincare', 'clean beauty', '  ', 'skincare', 'a'.repeat(60)],
      platformCaptions: {
        linkedin: 'The LinkedIn version.',
        twitter: 'A platform nobody asked for.',
      },
    }),
  });

  check('drops a caption too short to be one', good.variations.length === 3);
  check(
    'derives a missing hook from the first line',
    good.variations[1].hook === 'Another perfectly good caption.',
  );
  check('counts words', good.variations[0].wordCount === 5);
  check('promotes the first variation', good.caption === good.variations[0].caption);
  check(
    'strips the # the model was told not to send',
    good.hashtags.includes('skincare'),
  );
  check(
    'de-duplicates hashtags after normalising',
    good.hashtags.filter((t) => t === 'skincare').length === 1,
  );
  check(
    'removes the space from a multi-word hashtag',
    good.hashtags.includes('cleanbeauty'),
  );
  check(
    'drops a hashtag that is really a sentence',
    !good.hashtags.some((t) => t.length > 40),
  );
  check(
    'keys platform captions by what was requested, not what was returned',
    Object.keys(good.platformCaptions).join(',') === 'linkedin,instagram',
  );
  check(
    'falls back to the main caption for a platform the model skipped',
    good.platformCaptions.instagram === good.caption,
  );
  check('reports the model that wrote it', good.meta.model === 'stub-model');

  await expectThrows(
    'rejects a response with nothing usable in it',
    () =>
      generateCaption(parsed, {
        provider: stubProvider({ variations: [{ caption: '' }], hashtags: [] }),
      }),
    (error) => error instanceof AiProviderError,
  );

  await expectThrows(
    'rejects a response of the wrong shape entirely',
    () => generateCaption(parsed, { provider: stubProvider({ text: 'hello' }) }),
    (error) => error instanceof AiProviderError,
  );

  // ── Configuration ──────────────────────────────────────────────────────────
  console.log('\nConfiguration');

  const status = aiService.status();
  check('reports the active provider', status.provider === 'gemini');
  check('reports the model', status.model === env.GEMINI_MODEL);
  check(
    'never reports the key itself',
    !JSON.stringify(status).includes(env.GEMINI_API_KEY || ' '),
  );
  check(
    `GEMINI_API_KEY is set (${status.configured ? 'yes' : 'NO — generation will 503'})`,
    status.configured,
    'set GEMINI_API_KEY in server/.env',
  );

  // ── Optional live call ─────────────────────────────────────────────────────
  if (process.argv.includes('--live')) {
    console.log('\nLive Gemini call');
    if (!status.configured) {
      check('live generation', false, 'no GEMINI_API_KEY');
    } else {
      const request: CaptionRequest = parseCaptionRequest({
        ...BASE_BODY,
        topic:
          'A hydrating vitamin C serum launching next week for a small skincare brand',
        variationCount: 2,
        hashtagCount: 4,
      });
      const live = await generateCaption(request, {
        provider: activeProvider(env.AI_PROVIDER),
      });
      check('returns the requested number of variations', live.variations.length === 2);
      check('every variation has text', live.variations.every((v) => v.caption.length > 20));
      check('returns hashtags', live.hashtags.length > 0);
      check(
        'returns a caption per requested platform',
        request.platforms.every((p) => Boolean(live.platformCaptions[p])),
      );
      console.log(
        `\n        ${live.meta.model} · ${live.meta.durationMs}ms\n` +
          `        "${live.variations[0].caption.slice(0, 120)}…"\n`,
      );
    }
  } else {
    console.log('\n  (skipped the live Gemini call — re-run with --live)');
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('\nverify-sprint41 threw:', error);
  process.exitCode = 1;
});
