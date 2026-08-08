import axios from 'axios';
import { ProviderError } from '../../provider.interface';
import type { MetaErrorBody } from '../config';

/**
 * The one place Instagram's HTTP failures become {@link ProviderError}s.
 *
 * Two rules, both the same as LinkedIn's:
 *
 *  1. **The access token never reaches a log.** It travels as a query parameter
 *     on Graph requests — Meta's own convention — which means a URL logged
 *     verbatim is a leaked credential. Nothing here logs a URL.
 *  2. **`upstreamStatus` is carried separately from `status`.** A 401 from Meta
 *     is a 502 from us; the publish service reads the upstream value to tell a
 *     dead token from a bad minute at Meta, and it can only do that if the two
 *     are not collapsed.
 */

/** Meta is usually fast, but a container fetch pulls an image over the network. */
export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Meta's OAuth error codes that mean "this token is finished", as opposed to
 * "that request was wrong". 190 is the general invalid-token code; the 102 and
 * 463 family cover session expiry.
 */
const TOKEN_ERROR_CODES = new Set([102, 190, 463, 467]);

/**
 * Turns an axios failure into a ProviderError with a log-safe message.
 *
 * Meta's `error.message` is a diagnostic written for a developer and can quote
 * the request back — including, on some failures, parameters we sent. It goes
 * to the server log via this message and never to the browser: the publish
 * service translates every ProviderError before a member sees anything.
 */
export function toProviderError(error: unknown, step: string): ProviderError {
  if (!axios.isAxiosError(error)) {
    return new ProviderError(
      `Instagram ${step} failed: ${error instanceof Error ? error.message : String(error)}`,
      502,
      'instagram',
    );
  }

  const upstreamStatus = error.response?.status;
  const body = error.response?.data as MetaErrorBody | undefined;
  const metaError = body?.error;

  const detail =
    [
      metaError?.message,
      metaError?.error_user_msg,
      metaError?.code !== undefined ? `code ${metaError.code}` : undefined,
      metaError?.error_subcode !== undefined
        ? `subcode ${metaError.error_subcode}`
        : undefined,
    ]
      .filter(Boolean)
      .join(' — ') ||
    error.code ||
    error.message;

  // A token Meta has stopped honouring arrives as a 400 with an OAuth code, not
  // as a 401. Reported as 401 upstream so the publish service's existing
  // "reconnect your account" branch catches it — the alternative is every
  // caller learning Meta's error taxonomy.
  const normalisedStatus =
    metaError?.code !== undefined && TOKEN_ERROR_CODES.has(metaError.code)
      ? 401
      : upstreamStatus;

  return new ProviderError(
    `Instagram ${step} failed (HTTP ${upstreamStatus ?? 'no response'}: ${detail})`,
    502,
    'instagram',
    normalisedStatus,
  );
}
