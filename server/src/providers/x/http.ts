import axios from 'axios';
import { ProviderError } from '../provider.interface';
import type { XErrorBody } from './types';

/**
 * The one place X's HTTP failures become {@link ProviderError}s.
 *
 * Same two rules as the Meta and LinkedIn helpers:
 *
 *  1. **No credential reaches a log.** X takes the access token in an
 *     `Authorization` header rather than a query parameter, so a URL here is
 *     safe — but the request body of a token exchange holds the authorization
 *     code and the verifier, and nothing in this module ever formats one.
 *  2. **`upstreamStatus` is carried separately from `status`.** A 401 from X is
 *     a 502 from us; the publish service reads the upstream value to tell a
 *     dead token from a bad minute at X, and it can only do that if the two are
 *     not collapsed.
 */

/** X is usually fast; a hung socket must not hold the member's browser open. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Turns an axios failure into a ProviderError with a log-safe message.
 *
 * X answers with two different error envelopes — `{ error, error_description }`
 * from the OAuth endpoints and `{ title, detail, errors[] }` from the v2 API —
 * and both are read here so the caller never has to.
 *
 * The assembled detail goes to the server log and never to the browser: the
 * publish service translates every ProviderError before a member sees anything.
 */
export function toProviderError(error: unknown, step: string): ProviderError {
  if (!axios.isAxiosError(error)) {
    return new ProviderError(
      `X ${step} failed: ${error instanceof Error ? error.message : String(error)}`,
      502,
      'x',
    );
  }

  const upstreamStatus = error.response?.status;
  const body = error.response?.data as XErrorBody | undefined;

  const detail =
    [
      body?.error,
      body?.error_description,
      body?.title,
      body?.detail,
      body?.reason,
      ...(body?.errors ?? []).map((e) => e?.detail ?? e?.message),
    ]
      .filter(Boolean)
      .join(' — ') ||
    error.code ||
    error.message;

  return new ProviderError(
    `X ${step} failed (HTTP ${upstreamStatus ?? 'no response'}: ${detail})`,
    502,
    'x',
    upstreamStatus,
  );
}

/**
 * The `Authorization: Basic …` header a confidential client authenticates the
 * token endpoint with.
 *
 * X documents client_secret_basic for confidential clients and answers a
 * secret-in-the-body with a bare 401 that names nothing — which is a genuinely
 * hard misconfiguration to diagnose, hence one helper rather than the string
 * built at each call site.
 */
export function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}
