/**
 * Database Resilience & Retry Utility for transient database connectivity and timeout errors.
 */

const TRANSIENT_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'P1001', // Can't reach database server
  'P1008', // Operations timed out
  'P1017', // Server closed the connection
  'P2024', // Timed out fetching a new connection from the connection pool
]);

export interface DbRetryOptions {
  maxRetries?: number;
  initialBackoffMs?: number;
  label?: string;
}

export function isTransientDbError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, unknown>;
  const code = String(err.code || err.name || '');
  const message = String(err.message || '');

  if (TRANSIENT_ERROR_CODES.has(code)) return true;
  if (message.includes('ETIMEDOUT') || message.includes('timed out') || message.includes('Connection pool timeout')) {
    return true;
  }
  return false;
}

export async function withDbRetry<T>(
  operation: () => Promise<T>,
  options: DbRetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, initialBackoffMs = 120, label = 'db_operation' } = options;
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxRetries) {
    attempt++;
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt >= maxRetries) {
        throw error;
      }
      const backoff = initialBackoffMs * Math.pow(2, attempt - 1) + Math.random() * 50;
      console.warn(`[db-resilience] transient error in ${label} (attempt ${attempt}/${maxRetries}), retrying in ${backoff.toFixed(0)}ms...`, {
        code: (error as any)?.code,
        message: (error as any)?.message,
      });
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  throw lastError;
}
