/**
 * Verifies the model-per-workload routing, live.
 *
 *   caption    → GEMINI_CAPTION_MODEL   (writes, incl. platform variations)
 *   vision     → GEMINI_VISION_MODEL    (looks at the image)
 *   marketing  → GEMINI_MARKETING_MODEL (reach analysis, thinkingLevel not budget)
 *   light      → GEMINI_LIGHT_MODEL     (alt text)
 *
 * Watches the wire rather than trusting the config: an axios interceptor
 * records which model each request actually went to and what thinkingConfig
 * rode along. Requires a real GEMINI_API_KEY and network access.
 *
 *   npm run verify:models
 */
import axios from 'axios';
import { env } from '../config/env';
import { aiService } from '../services/ai.service';
import { providerForRole } from '../ai/providers';
import { generateAltText } from '../ai/generators/alt-text.generator';
import { fetchInlineImage } from '../ai/vision/image-source';

// Stable public test image; redirects once to a CDN, which the fetcher allows.
const IMAGE_URL = 'https://picsum.photos/seed/flowpost/640/480.jpg';

interface WireCall {
  model: string;
  thinkingConfig: Record<string, unknown> | undefined;
}

const wire: WireCall[] = [];

axios.interceptors.request.use((config) => {
  const match = (config.url ?? '').match(/\/models\/([^:/]+):generateContent/);
  if (match) {
    const generationConfig =
      (config.data as { generationConfig?: Record<string, unknown> })
        ?.generationConfig ?? {};
    wire.push({
      model: match[1],
      thinkingConfig: generationConfig.thinkingConfig as
        | Record<string, unknown>
        | undefined,
    });
  }
  return config;
});

let failures = 0;

function check(condition: boolean, label: string): void {
  console.log(`${condition ? '  ✓' : '  ✗'} ${label}`);
  if (!condition) failures += 1;
}

/** The wire calls made by one step, and the routing table they should obey. */
function drain(): WireCall[] {
  return wire.splice(0);
}

async function main(): Promise<void> {
  console.log('routing table:', {
    caption: env.GEMINI_CAPTION_MODEL,
    vision: env.GEMINI_VISION_MODEL,
    marketing: env.GEMINI_MARKETING_MODEL,
    light: env.GEMINI_LIGHT_MODEL,
  });

  // ── A + C: caption generation with platform variations ────────────────────
  console.log('\nA/C. caption generation (text-only, three platforms)');
  const platforms = ['linkedin', 'instagram', 'twitter'];
  const captions = await aiService.generateCaption('verify-model-routing', {
    topic: 'A productivity app that blocks distracting websites during focus sessions',
    platforms,
  });
  let calls = drain();
  check(calls.length === 1, `one model call (got ${calls.length})`);
  check(
    calls[0]?.model === env.GEMINI_CAPTION_MODEL,
    `wrote with ${env.GEMINI_CAPTION_MODEL} (got ${calls[0]?.model})`,
  );
  check(captions.variations.length > 0, 'returned variations');
  check(
    platforms.every((p) => (captions.platformCaptions[p] ?? '').length > 0),
    'returned a caption per platform',
  );

  // ── B: image analysis feeding caption generation ──────────────────────────
  console.log('\nB. caption generation with an image');
  const withImage = await aiService.generateCaption('verify-model-routing', {
    topic: 'Spring has arrived — new floral collection',
    imageUrl: IMAGE_URL,
    platforms: ['instagram'],
  });
  calls = drain();
  check(calls.length === 2, `two model calls, vision then write (got ${calls.length})`);
  check(
    calls[0]?.model === env.GEMINI_VISION_MODEL,
    `analysed image with ${env.GEMINI_VISION_MODEL} (got ${calls[0]?.model})`,
  );
  check(
    calls[1]?.model === env.GEMINI_CAPTION_MODEL,
    `wrote with ${env.GEMINI_CAPTION_MODEL} (got ${calls[1]?.model})`,
  );
  check(
    Boolean(withImage.imageAnalysis?.primarySubject),
    `image actually analysed (subject: ${withImage.imageAnalysis?.primarySubject ?? 'NONE'})`,
  );

  // ── D: Marketing Intelligence ─────────────────────────────────────────────
  console.log('\nD. marketing analysis');
  const analysis = await aiService.analyseCaption('verify-model-routing', {
    caption: withImage.caption,
    hashtags: withImage.hashtags,
    platforms: ['instagram'],
    hasImage: true,
    imageAnalysis: withImage.imageAnalysis,
  });
  calls = drain();
  const pro = calls[0];
  check(
    pro?.model === env.GEMINI_MARKETING_MODEL,
    `analysed with ${env.GEMINI_MARKETING_MODEL} (got ${pro?.model})`,
  );
  check(
    pro?.thinkingConfig?.thinkingLevel === 'low',
    `thinkingLevel "low" sent (got ${JSON.stringify(pro?.thinkingConfig)})`,
  );
  check(
    pro !== undefined && !('thinkingBudget' in (pro.thinkingConfig ?? {})),
    'no thinkingBudget sent',
  );
  check(
    Number.isFinite(analysis.reachScore) &&
      analysis.reachScore >= 0 &&
      analysis.reachScore <= 100,
    `deterministic reach score in range (got ${analysis.reachScore})`,
  );

  // ── E: re-analysis of an edited caption ───────────────────────────────────
  console.log('\nE. edited-caption re-analysis');
  const reanalysis = await aiService.analyseCaption('verify-model-routing', {
    caption: `${withImage.caption}\n\nDrop a 🌸 below if spring is your season — and tell us your favourite bloom.`,
    hashtags: withImage.hashtags,
    platforms: ['instagram'],
    hasImage: true,
  });
  calls = drain();
  check(
    calls[0]?.model === env.GEMINI_MARKETING_MODEL,
    `re-analysed with ${env.GEMINI_MARKETING_MODEL} (got ${calls[0]?.model})`,
  );
  check(Number.isFinite(reanalysis.reachScore), 'returned a fresh score');

  // ── Light: alt text ───────────────────────────────────────────────────────
  console.log('\nF. alt text (light role)');
  const image = await fetchInlineImage(IMAGE_URL);
  const altText = await generateAltText({
    image,
    provider: providerForRole('light'),
    caption: withImage.caption,
  });
  calls = drain();
  check(
    calls[0]?.model === env.GEMINI_LIGHT_MODEL,
    `described with ${env.GEMINI_LIGHT_MODEL} (got ${calls[0]?.model})`,
  );
  check(Boolean(altText), `alt text produced ("${altText ?? ''}")`);

  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('verify-model-routing crashed:', error);
  process.exit(1);
});
