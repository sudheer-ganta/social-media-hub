/**
 * The text-generation provider contract.
 *
 * Mirrors `providers/provider.interface.ts` on the social side: one interface,
 * one implementation per vendor, resolved through a registry. Swapping Gemini
 * for another model is a new file plus a registry entry — the generator, the
 * service and the route never learn a vendor's name.
 *
 * The interface is deliberately narrow. A provider takes a system instruction,
 * a user prompt and a JSON schema, and returns parsed JSON. Prompt assembly
 * lives in `ai/prompts`, and interpretation of the result lives in
 * `ai/generators`; a provider only speaks HTTP to its vendor.
 */

/** A provider failure a caller can turn into an HTTP answer of its own. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    /** What we should answer the browser with. */
    readonly status = 502,
    /** True when the same request might succeed if repeated. */
    readonly retryable = false,
    /** The vendor's own message, for the log — never for the browser. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/** An image to send alongside the prompt, base64 encoded. */
export interface InlineImagePart {
  mimeType: string;
  data: string;
}

export interface GenerateJsonOptions {
  /** Persona and rules — the part that does not change between requests. */
  systemInstruction: string;
  /** The request itself. */
  prompt: string;
  /**
   * Images the model should actually look at. Sent as image parts, so the
   * model reasons over pixels rather than over a URL it cannot open. Ignored
   * by a provider whose `supportsVision` is false.
   */
  images?: InlineImagePart[];
  /**
   * JSON Schema the response must conform to. Providers that support native
   * structured output enforce it; the rest are told to obey it in the prompt,
   * and the generator validates either way.
   */
  responseSchema: Record<string, unknown>;
  /** 0 = deterministic, 1 = loose. Higher for a regenerate. */
  temperature?: number;
  /** Hard ceiling on the reply, in tokens. */
  maxOutputTokens?: number;
}

export interface AiTextProvider {
  /** Registry key and the value reported in `meta.provider`. */
  readonly id: string;
  /** The model this instance calls, reported in `meta.model`. */
  readonly model: string;
  /** Whether `GenerateJsonOptions.images` means anything to this provider. */
  readonly supportsVision: boolean;
  /** False when the provider has no API key configured. */
  isConfigured(): boolean;
  /** Generates and parses a JSON object. Throws {@link AiProviderError}. */
  generateJson(options: GenerateJsonOptions): Promise<unknown>;
}
