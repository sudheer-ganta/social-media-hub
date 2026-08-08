import type { AiTextProvider } from './provider.interface';
import {
  geminiProvider,
  geminiCaptionProvider,
  geminiVisionProvider,
  geminiMarketingProvider,
  geminiLightProvider,
} from './gemini.provider';

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
 */
export type AiRole = 'caption' | 'vision' | 'marketing' | 'light';

const geminiByRole: Record<AiRole, AiTextProvider> = {
  caption: geminiCaptionProvider,
  vision: geminiVisionProvider,
  marketing: geminiMarketingProvider,
  light: geminiLightProvider,
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
