/**
 * Sprint 4.2 acceptance check — vision-grounded caption generation.
 *
 *   npm run verify:sprint42              (from server/)
 *   npm run verify:sprint42 -- --live    (adds one real image + Gemini call)
 *
 * Follows `verify-sprint41.ts`: the default run is entirely offline and swaps
 * a stub in for the provider, so it exercises the parts with the most ways to
 * be quietly wrong and no other test —
 *
 *   - that the image is sent as *pixels*, twice, and not as a URL in the text;
 *   - that stage one's read reaches stage two's prompt as fact;
 *   - that a failed analysis degrades to the old single-call behaviour rather
 *     than to an error;
 *   - that the URL fetcher refuses to dial anything internal.
 *
 * The SSRF checks are the ones worth running before a deploy. This backend now
 * fetches an address a user typed into a form, and "it only ever gets Supabase
 * URLs" is an assumption, not a control.
 *
 * `--live` adds one real analysis of a real public image, which is the only
 * way to confirm the model, the schema and the image part work together.
 */
import { buildCaptionPrompt } from '../ai/prompts/caption.prompt';
import { resolveBrandProfile } from '../ai/brand/brand-profile';
import { buildVisionPrompt } from '../ai/prompts/vision.prompt';
import { generateCaption } from '../ai/generators/creative-intelligence.generator';
import { analyseImage } from '../ai/generators/image-analysis.generator';
import { fetchInlineImage, ImageFetchError } from '../ai/vision/image-source';
import { activeProvider } from '../ai/providers';
import type { AiTextProvider, GenerateJsonOptions } from '../ai/providers';
import { parseCaptionRequest } from '../services/ai.service';
import type { CaptionRequest, ImageAnalysis } from '../ai/types';

/**
 * Builds a prompt the way the generator does — Brand Intelligence first.
 *
 * The prompt builder takes a resolved {@link BrandProfile} rather than the raw
 * request, so every call site has to run the same merge the generator runs.
 * Doing it through one helper here keeps these checks testing the prompt rather
 * than testing whether the script remembered to resolve a brand.
 */
function promptFor(
  request: CaptionRequest,
  options: { imageAnalysis?: ImageAnalysis | null } = {},
) {
  return buildCaptionPrompt(request, {
    ...options,
    brand: resolveBrandProfile({
      brand: request.brandVoice,
      imageAnalysis: options.imageAnalysis,
    }),
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

/**
 * A provider that answers each call from a queue and records what it was sent.
 * The queue is what makes the two-stage flow inspectable: call one is the
 * analysis, call two is the copy.
 */
function stubProvider(
  payloads: unknown[],
  supportsVision = true,
): AiTextProvider & { calls: GenerateJsonOptions[] } {
  const calls: GenerateJsonOptions[] = [];
  let index = 0;

  return {
    id: 'stub',
    model: 'stub-model',
    supportsVision,
    isConfigured: () => true,
    calls,
    async generateJson(options: GenerateJsonOptions) {
      calls.push(options);
      return payloads[Math.min(index++, payloads.length - 1)];
    },
  } as AiTextProvider & { calls: GenerateJsonOptions[] };
}

/** A believable stage-one reply, including two values that must be cleaned. */
const ANALYSIS_PAYLOAD = {
  primarySubject: 'a candlelit stone hall',
  secondarySubjects: ['long banquet table', 'two figures at the far end'],
  objects: ['candles', 'stone arches', 'heavy drapes'],
  sceneDescription:
    'A vast stone hall lit almost entirely by candles, with a long table running into deep shadow.',
  setting: 'indoor medieval great hall',
  composition: 'symmetrical, deep one-point perspective, heavy negative space',
  lighting: 'low warm candlelight, deep falloff',
  mood: 'reverent and cinematic',
  colorPalette: ['#1A1A2E', '#C8A24A', 'gold', '#3B2F2F'],
  brandStyle: 'cinematic gothic',
  textInImage: [],
  emotions: ['awe', 'intimacy', 'anticipation'],
  themes: ['legacy', 'ceremony', 'quiet grandeur'],
  symbolism: ['candles as vows kept alight'],
  storyAngles: ['The room remembers every promise made in it.'],
  productCategory: 'destination weddings',
  industry: 'weddings',
  targetAudience: 'couples who want atmosphere over spectacle',
  suggestedCampaignType: 'aspirational brand film',
  suggestedMarketingObjective: 'brand awareness',
  suggestedBuyerPersona: 'a couple planning a small, cinematic winter wedding',
  confidenceScore: 88,
};

const CAPTION_PAYLOAD = {
  angles: [
    {
      name: 'The room remembers',
      premise: 'The venue as witness to every vow it has held.',
      imageHook: 'the candlelit stone hall receding into shadow',
    },
    {
      name: 'Small light, large room',
      premise: 'Intimacy is what survives scale.',
      imageHook: 'candles as the only light in a vast space',
    },
  ],
  variations: [
    {
      angle: 'The room remembers',
      tone: 'Storytelling',
      caption:
        'Some rooms have heard a thousand promises.\n\nYours is the one they will keep.',
      hook: 'Some rooms have heard a thousand promises.',
      whyItWorks: 'Leads with the venue as a character rather than a location.',
    },
    {
      angle: 'Small light, large room',
      tone: 'Emotional',
      caption:
        'A hall this big, and still the only thing you notice is the two of you.',
      hook: 'A hall this big',
      whyItWorks: 'Contrast does the emotional work without an adjective pile.',
    },
    {
      tone: 'Minimal',
      caption: 'x', // too short — must be dropped by normalisation
      hook: 'x',
    },
  ],
  hashtags: ['#DestinationWedding', 'candle lit venue', 'a'.repeat(60)],
  platformCaptions: { instagram: 'Some rooms have heard a thousand promises.' },
};

/**
 * A parsed request. Overrides are deliberately untyped: half the point of
 * these checks is what validation does with a value the type system would
 * never let through, like `audience: 'boomer'`.
 */
function baseRequest(overrides: Record<string, unknown> = {}): CaptionRequest {
  // The user id is an argument rather than a body field — it decides whose
  // writing history the generator may read, so a request cannot name its own.
  return parseCaptionRequest(
    {
      title: 'Winter wedding at a stone hall',
      platforms: ['instagram'],
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      captionLength: 'Medium',
      language: 'English',
      variationCount: 2,
      hashtagCount: 5,
      ...overrides,
    },
    { userId: 'verify-script' },
  );
}

const ANALYSIS: ImageAnalysis = {
  ...ANALYSIS_PAYLOAD,
  colorPalette: ['#1a1a2e', '#c8a24a', '#3b2f2f'],
};

async function main() {
  console.log('\nSprint 4.2 — the model actually looks at the image\n');

  // ── Request validation ─────────────────────────────────────────────────────
  console.log('Audience register');

  check(
    'defaults to the Gen Z + millennial blend',
    baseRequest().audience === 'gen_z_millennial',
  );
  check(
    'accepts an explicit register',
    baseRequest({ audience: 'professional' }).audience === 'professional',
  );
  check(
    'falls back for an unknown register',
    baseRequest({ audience: 'boomer' }).audience === 'gen_z_millennial',
  );

  // ── Prompt assembly ────────────────────────────────────────────────────────
  console.log('\nPrompt assembly');

  const withImage = promptFor(
    baseRequest({ imageUrl: 'https://example.com/hall.jpg' }),
    { imageAnalysis: ANALYSIS },
  );

  check(
    'states what the image shows as fact',
    withImage.prompt.includes('What the image actually shows (fact)') &&
      withImage.prompt.includes('candlelit stone hall'),
  );
  check(
    'passes the themes stage one found',
    withImage.prompt.includes('quiet grandeur'),
  );
  check(
    'drops the "never claim to know what the image shows" instruction',
    !withImage.prompt.includes('never claim to know'),
    'the v1 sentence that caused this sprint is still in the prompt',
  );
  check(
    'asks for angles built on the image',
    withImage.prompt.includes('where the image and the brand overlap'),
  );
  check(
    'writes in the Gen Z + millennial register by default',
    withImage.prompt.includes('would a real person send this to a friend'),
  );
  check(
    'names the banned openings',
    withImage.systemInstruction.includes('Elevate'),
  );

  const analysedButUncertain = promptFor(
baseRequest(), {
    imageAnalysis: { ...ANALYSIS, confidenceScore: 30 },
  });
  check(
    'tells the model to lean on the brand when the read is shaky',
    analysedButUncertain.prompt.includes('This reading is uncertain'),
  );

  const imageUnreadable = promptFor(
    baseRequest({ imageUrl: 'https://example.com/hall.jpg' }),
    { imageAnalysis: null },
  );
  check(
    'keeps the honest fallback when the image could not be analysed',
    imageUnreadable.prompt.includes('never claim to know what the image shows'),
  );

  const textOnly = promptFor(
baseRequest());
  check(
    'says nothing about an image when there is none',
    !textOnly.prompt.includes('image'),
  );

  const professional = promptFor(
    baseRequest({ audience: 'professional' }),
  );
  check(
    'switches register on request',
    professional.prompt.includes('reading at work') &&
      !professional.prompt.includes('like Gen Z'),
  );

  const vision = buildVisionPrompt({ topic: 'Winter wedding', brandName: 'Aurelia' });
  check(
    'the vision prompt separates seeing from expecting',
    vision.prompt.includes('not the image you would expect from this brand'),
  );
  check(
    'the vision prompt refuses to profile people',
    vision.systemInstruction.includes("never guess anyone's age"),
  );

  // ── Stage one ──────────────────────────────────────────────────────────────
  console.log('\nImage analysis');

  const blindProvider = stubProvider([ANALYSIS_PAYLOAD], false);
  check(
    'skips analysis for a provider that cannot see',
    (await analyseImage({
      imageUrl: 'https://example.com/hall.jpg',
      provider: blindProvider,
    })) === null && blindProvider.calls.length === 0,
  );

  check(
    'returns null rather than throwing when the image cannot be fetched',
    (await analyseImage({
      imageUrl: 'https://127.0.0.1/hall.jpg',
      provider: stubProvider([ANALYSIS_PAYLOAD]),
    })) === null,
  );

  // ── The fetcher's guard rails ──────────────────────────────────────────────
  console.log('\nImage fetching');

  /**
   * `expectedDetail` is what stops these checks passing for the wrong reason.
   * An internal address usually also refuses the connection, so "it threw" is
   * not evidence the guard did anything — on a host where something *is*
   * listening on that port, a guard that never ran would fetch it. The detail
   * string is the proof that the address was refused rather than unreachable.
   */
  const rejects = async (label: string, url: string, expectedDetail?: string) => {
    try {
      await fetchInlineImage(url);
      check(label, false, 'the fetch succeeded');
    } catch (error) {
      const blocked =
        error instanceof ImageFetchError &&
        (!expectedDetail || (error.detail ?? '').includes(expectedDetail));
      check(
        label,
        blocked,
        error instanceof ImageFetchError ? error.detail : String(error),
      );
    }
  };

  await rejects('refuses a data: URL', 'data:image/png;base64,iVBORw0KGgo=', 'data:');
  await rejects('refuses a file: URL', 'file:///etc/passwd', 'file:');
  await rejects('refuses loopback', 'http://127.0.0.1:5432/x.jpg', 'refused literal');
  await rejects('refuses a private range', 'http://10.0.0.5/x.jpg', 'refused literal');
  await rejects(
    'refuses the cloud metadata address',
    'http://169.254.169.254/latest/meta-data/',
    'refused literal',
  );
  await rejects('refuses IPv6 loopback', 'http://[::1]/x.jpg', 'refused literal');
  await rejects(
    'refuses an IPv4-mapped IPv6 address',
    'http://[::ffff:10.0.0.5]/x.jpg',
    'refused literal',
  );
  // Resolved rather than literal, so this one goes through the DNS guard.
  await rejects('refuses localhost by name', 'http://localhost:3000/x.jpg', 'EACCES');
  await rejects('refuses nonsense', 'not-a-url');

  // ── The two-stage flow ─────────────────────────────────────────────────────
  console.log('\nTwo-stage generation');

  // A tiny valid PNG served from memory would need a listening socket, so the
  // fetch is stubbed at the module boundary instead: this checks the wiring
  // above it, and the checks above cover the fetch itself.
  const visionModule = require('../ai/vision/image-source');
  const realFetch = visionModule.fetchInlineImage;
  visionModule.fetchInlineImage = async () => ({
    mimeType: 'image/jpeg',
    data: 'AAAA',
    sizeBytes: 3,
  });

  try {
    const provider = stubProvider([ANALYSIS_PAYLOAD, CAPTION_PAYLOAD]);
    const result = await generateCaption(
      baseRequest({ imageUrl: 'https://example.com/hall.jpg' }),
      { provider },
    );

    check('makes two model calls for a post with an image', provider.calls.length === 2);
    check(
      'sends the image as pixels to stage one',
      provider.calls[0]?.images?.[0]?.mimeType === 'image/jpeg',
    );
    check(
      'sends the image again to stage two',
      provider.calls[1]?.images?.[0]?.data === 'AAAA',
    );
    check(
      'never puts the image URL in a prompt',
      !provider.calls.some((call) => call.prompt.includes('example.com')),
    );
    check(
      "stage two's prompt is built from stage one's answer",
      Boolean(provider.calls[1]?.prompt.includes('candlelit stone hall')),
    );
    check('returns the analysis to the caller', Boolean(result.imageAnalysis));
    check(
      'cleans non-hex colours out of the palette',
      result.imageAnalysis?.colorPalette.every((hex) => hex.startsWith('#')) === true,
      JSON.stringify(result.imageAnalysis?.colorPalette),
    );
    check('returns the angles it committed to', (result.angles?.length ?? 0) === 2);
    check(
      'labels each option with its angle',
      result.variations[0]?.angle === 'The room remembers',
    );
    check(
      'keeps whyItWorks when the model supplies it',
      Boolean(result.variations[0]?.whyItWorks),
    );
    check(
      'still drops a caption that is too short to use',
      result.variations.length === 2,
      `${result.variations.length} variations`,
    );
    check(
      'still cleans hashtags',
      result.hashtags.includes('DestinationWedding') &&
        result.hashtags.includes('candlelitvenue') &&
        !result.hashtags.some((tag) => tag.length > 40),
      JSON.stringify(result.hashtags),
    );

    // The degradation path — the whole point of stage one never throwing.
    const failing = stubProvider([CAPTION_PAYLOAD]);
    visionModule.fetchInlineImage = async () => {
      throw new ImageFetchError('nope', 'test');
    };

    const degraded = await generateCaption(
      baseRequest({ imageUrl: 'https://example.com/gone.jpg' }),
      { provider: failing },
    );

    check(
      'writes captions anyway when the image cannot be read',
      degraded.variations.length === 2,
    );
    check('makes only one call in that case', failing.calls.length === 1);
    check('reports no analysis', degraded.imageAnalysis === undefined);
    check(
      'falls back to the honest wording',
      failing.calls[0].prompt.includes('could not be analysed'),
    );

    // And the unchanged path: no image, no vision stage, one call.
    const textProvider = stubProvider([CAPTION_PAYLOAD]);
    await generateCaption(baseRequest(), { provider: textProvider });
    check('a text-only post still costs one call', textProvider.calls.length === 1);
    check(
      'and sends no image part',
      textProvider.calls[0].images === undefined,
    );
  } finally {
    visionModule.fetchInlineImage = realFetch;
  }

  // ── Live ───────────────────────────────────────────────────────────────────
  if (process.argv.includes('--live')) {
    console.log('\nLive generation (one real image, two real model calls)');

    const provider = activeProvider(process.env.AI_PROVIDER);

    if (!provider.isConfigured()) {
      check('GEMINI_API_KEY is set', false, 'no key configured');
    } else {
      // A stable public photograph on a host with no user-agent policy of its
      // own. `/id/<n>/` is a fixed image, not a random one, so two runs are
      // comparable. Point VERIFY_IMAGE_URL at one of your own Supabase images
      // to check the path your users actually take.
      const imageUrl =
        process.env.VERIFY_IMAGE_URL ??
        'https://picsum.photos/id/1043/900/600';

      const result = await generateCaption(
        baseRequest({
          title: 'Where we are headed this season',
          imageUrl,
          variationCount: 3,
        }),
        { provider },
      );

      const analysis = result.imageAnalysis;

      check('the live image was analysed', Boolean(analysis));
      check(
        'it reported a specific subject, not a generic one',
        (analysis?.primarySubject.length ?? 0) > 3 &&
          (analysis?.sceneDescription.length ?? 0) > 20,
        analysis?.primarySubject,
      );
      check(
        'it read colours off the image',
        (analysis?.colorPalette.length ?? 0) >= 3,
        JSON.stringify(analysis?.colorPalette),
      );
      check(
        'it produced marketing material to write from',
        (analysis?.themes.length ?? 0) > 0 && (analysis?.storyAngles.length ?? 0) > 0,
      );
      check('it wrote options', result.variations.length > 1);
      check(
        'the options take different angles',
        new Set(result.variations.map((v) => v.angle)).size > 1,
      );
      check(
        'each angle is traceable to something in the image',
        (result.angles ?? []).every((angle) => angle.imageHook.length > 0),
      );
      // The assertion that cannot be automated is whether the copy is *about*
      // the picture. Everything is printed below so a person can judge it —
      // that is what the --live flag is for.

      console.log(`\n  model:  ${result.meta.model}  ${result.meta.durationMs}ms`);
      console.log(`  saw:    ${analysis?.sceneDescription ?? '—'}`);
      console.log(`  mood:   ${analysis?.mood ?? '—'}`);
      console.log(`  themes: ${analysis?.themes.join(', ') ?? '—'}`);
      for (const angle of result.angles ?? []) {
        console.log(`\n  angle "${angle.name}" ← ${angle.imageHook}`);
      }
      for (const variation of result.variations) {
        console.log(`\n  [${variation.angle ?? variation.tone}] ${variation.caption}`);
      }
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nverification crashed:', error);
  process.exit(1);
});
