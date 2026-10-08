import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request token meter. Providers report what Gemini billed; the service
 * that owns the request reads the total once, in its `finally`, and writes it to
 * `ai_usage_events`. AsyncLocalStorage keeps concurrent requests separate
 * without threading a meter through every generator signature.
 */
export interface UsageMeter {
  inputTokens: number;
  outputTokens: number;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
}

const storage = new AsyncLocalStorage<UsageMeter>();

/** Starts a meter for the rest of the current async execution and returns it. */
export function beginUsageMeter(): UsageMeter {
  const meter: UsageMeter = { inputTokens: 0, outputTokens: 0 };
  storage.enterWith(meter);
  return meter;
}

/** Adds one response's billed tokens. A no-op outside a metered request. */
export function recordUsage(usage?: GeminiUsageMetadata): void {
  const meter = storage.getStore();
  if (!meter || !usage) return;
  meter.inputTokens += usage.promptTokenCount ?? 0;
  // Thinking tokens are billed at the output rate but reported separately.
  meter.outputTokens += (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
}
