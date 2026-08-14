import type { InlineImagePart } from './provider.interface';

/**
 * The image-generation provider contract.
 *
 * Mirrors `provider.interface.ts` on the text side: one interface, one
 * implementation per vendor. Deliberately narrow — a provider takes a prompt
 * and optional reference images and returns image bytes. Prompt assembly
 * lives in the creative-direction generator and the service that calls this;
 * a provider only speaks HTTP to its vendor.
 */

export { AiProviderError, type InlineImagePart } from './provider.interface';

export interface GenerateImageOptions {
  /** The fully-assembled image prompt — subject, scene, style, constraints. */
  prompt: string;
  /**
   * Reference images the model should preserve/incorporate — a product
   * photo, a logo. Sent as image parts so the model works from pixels, not a
   * URL it cannot open.
   */
  referenceImages?: InlineImagePart[];
  /** e.g. "1:1", "4:5", "9:16". Left to the provider's default when absent. */
  aspectRatio?: string;
  /** How many candidate images to return. Providers may cap this lower. */
  count?: number;
}

/** One generated image, base64 encoded. */
export interface GeneratedImagePart {
  mimeType: string;
  data: string;
}

export interface AiImageProvider {
  /** Registry key and the value reported in generation metadata. */
  readonly id: string;
  /** The model this instance calls. */
  readonly model: string;
  /** False when the provider has no API key configured. */
  isConfigured(): boolean;
  /** Generates one or more images. Throws {@link AiProviderError}. */
  generateImage(options: GenerateImageOptions): Promise<GeneratedImagePart[]>;
}
