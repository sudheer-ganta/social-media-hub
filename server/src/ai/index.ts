/**
 * The AI module.
 *
 * Layered the same way the integrations module is:
 *
 *   routes/ai.routes.ts        HTTP: validate, call, serialize
 *     └─ services/ai.service.ts   application layer, defaults and policy
 *          └─ ai/generators        the flow: prompt → provider → clean result
 *               ├─ ai/prompts      every word the model is told
 *               ├─ ai/vision       fetches the image the model looks at
 *               └─ ai/providers    one file per vendor, behind one interface
 *
 * Nothing above `ai/providers` knows a vendor's name, and nothing outside
 * `ai/providers/gemini.provider.ts` can see the API key.
 *
 * Generation is two staged model calls when a post has an image — see the
 * header of `generators/caption.generator.ts` for the flow.
 */

export * from './types';
export {
  AiProviderError,
  activeProvider,
  aiProviders,
  type AiProviderId,
  type AiTextProvider,
} from './providers';
export {
  buildCaptionPrompt,
  CAPTION_PROMPT_VERSION,
} from './prompts/caption.prompt';
export {
  buildVisionPrompt,
  VISION_PROMPT_VERSION,
} from './prompts/vision.prompt';
export {
  buildAltTextPrompt,
  ALT_TEXT_PROMPT_VERSION,
} from './prompts/alt-text.prompt';
export { generateCaption } from './generators/caption.generator';
export { analyseImage } from './generators/image-analysis.generator';
export { generateAltText } from './generators/alt-text.generator';
export {
  fetchImageBytes,
  fetchInlineImage,
  ImageFetchError,
  type FetchedImage,
  type FetchImageOptions,
} from './vision/image-source';
