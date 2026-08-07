import type { AiTextProvider } from './provider.interface';
import { geminiProvider } from './gemini.provider';

export {
  AiProviderError,
  type AiTextProvider,
  type GenerateJsonOptions,
} from './provider.interface';
export { GeminiProvider, geminiProvider } from './gemini.provider';

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
