import type { AiTextProvider } from './provider.interface';
import type { AiImageProvider } from './image-provider.interface';
import {
  geminiProvider,
  geminiCaptionProvider,
  geminiVisionProvider,
  geminiMarketingProvider,
  geminiLightProvider,
} from './gemini.provider';
import { geminiImageProvider } from './gemini-image.provider';

export {
  AiProviderError,
  type AiTextProvider,
  type GenerateJsonOptions,
} from './provider.interface';
export {
  GeminiProvider,
  geminiProvider,
  geminiCaptionProvider,
  geminiVisionProvider,
  geminiMarketingProvider,
  geminiLightProvider,
} from './gemini.provider';
export {
  type AiImageProvider,
  type GenerateImageOptions,
  type GeneratedImagePart,
} from './image-provider.interface';
export { GeminiImageProvider, geminiImageProvider } from './gemini-image.provider';

export type AiProviderId = 'gemini';

/**
 * The text-provider registry, resolved the same way social providers are.
 *
 * Adding OpenAI or Anthropic is a file next to `gemini.provider.ts` plus an
 * entry here — the generator asks for `activeProvider()` and never names a
 * vendor.
 */
export const aiProviders = {
  gemini: geminiProvider,
} satisfies Record<AiProviderId, AiTextProvider>;

/**
 * The provider used for generation, chosen by `AI_PROVIDER`.
 *
 * Falls back to Gemini for an unrecognised value rather than throwing at
 * import time: a typo in an environment variable should not stop the whole
 * API from booting, and the health check reports what actually got picked.
 */
export function activeProvider(id?: string): AiTextProvider {
  const key = (id ?? '').toLowerCase();
  return (aiProviders as Record<string, AiTextProvider>)[key] ?? geminiProvider;
}

/**
 * What kind of work a model call is, named after the module that makes it:
 *
 *   caption    Creative Intelligence — captions, hooks, CTAs, hashtags,
 *              platform variations. High volume, quality-sensitive, fast.
 *   vision     image analysis — what is actually in the picture.
 *   marketing  Marketing Intelligence — reach scoring, improvements, the
 *              deep-reasoning engine. The only role that earns Pro.
 *   light      chores — alt text and other small, frequent calls.
 *   creative   the creative-direction brief that precedes an image
 *              generation — structured reasoning about brand + request, not
 *              prose, so it shares Marketing's model rather than Caption's.
 */
export type AiRole = 'caption' | 'vision' | 'marketing' | 'light' | 'creative';

const geminiByRole: Record<AiRole, AiTextProvider> = {
  caption: geminiCaptionProvider,
  vision: geminiVisionProvider,
  marketing: geminiMarketingProvider,
  light: geminiLightProvider,
  creative: geminiMarketingProvider,
};

/**
 * The model-selection layer: workload in, provider out.
 *
 * Call sites name the job, never a model — which model serves a role is set in
 * `config/env.ts` (`GEMINI_<ROLE>_MODEL`) and nowhere else.
 *
 * Gemini is currently the only vendor, so this is one table; a second vendor
 * adds its own table here, keyed the same way `aiProviders` already is.
 */
export function providerForRole(role: AiRole): AiTextProvider {
  return geminiByRole[role];
}

/**
 * The image-generation provider, chosen by `AI_PROVIDER` the same way
 * {@link activeProvider} picks a text provider. One vendor today; a second
 * would get its own entry here.
 */
const aiImageProviders = {
  gemini: geminiImageProvider,
} satisfies Record<AiProviderId, AiImageProvider>;

export function activeImageProvider(id?: string): AiImageProvider {
  const key = (id ?? '').toLowerCase();
  return (aiImageProviders as Record<string, AiImageProvider>)[key] ?? geminiImageProvider;
}
