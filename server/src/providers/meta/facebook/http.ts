import axios from 'axios';
import { ProviderError } from '../../provider.interface';
import type { MetaErrorBody } from '../config';

/**
 * The one place Facebook's HTTP failures become {@link ProviderError}s.
 *
 * Same two rules as the Instagram client, for the same reasons:
 *
 *  1. **The access token never reaches a log.** It travels as a query parameter
 *     on Graph requests — Meta's own convention — so a URL logged verbatim is a
 *     leaked credential. Nothing here logs a URL, and nothing here puts a token
 *     into an error message.
 *  2. **`upstreamStatus` is carried separately from `status`.** A 401 from Meta
 *     is a 502 from us; the publish service reads the upstream value to tell a
 *     dead token from a bad minute at Meta, and it can only do that if the two
 *     are not collapsed.
 *
 * A near-twin of `../instagram/http.ts` and deliberately not shared with it.
 * The two differ in the one thing this file is for — which provider id an error
 * is attributed to and how it is worded — and a "MetaHttp" helper taking a
 * provider id as an argument would save nine lines while making every future
 * per-surface divergence a branch inside shared code. What *is* genuinely
 * common (the error envelope) is imported from `../config`.
 */

/** Generous: a Page publish makes Meta fetch an image over the network. */
export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Meta's OAuth error codes that mean "this token is finished", as opposed to
 * "that request was wrong". 190 is the general invalid-token code; 102 and the
 * 463/467 pair cover session expiry. Same set as Instagram's — this part of the
 * taxonomy really is shared across Graph.
 */
const TOKEN_ERROR_CODES = new Set([102, 190, 463, 467]);

/**
 * Meta's error codes that mean "the app is not allowed to do this", which for
 * Facebook Pages is overwhelmingly a missing permission rather than a dead
 * token. 200 is the permission error; 10 is "application does not have
 * permission for this action"; 3 is an unsupported method on a node the token
 * cannot reach. Normalised to 403 so the publish service asks the member to
 * reconnect and approve, rather than reporting a generic outage.
 */
const PERMISSION_ERROR_CODES = new Set([3, 10, 200]);

/**
 * Turns an axios failure into a ProviderError with a log-safe message.
 *
 * Meta's `error.message` is written for a developer and can quote the request
 * back at us. It goes to the server log through this message and never to the
 * browser — the publish service translates every ProviderError before a member
 * sees anything.
 */
export function toProviderError(error: unknown, step: string): ProviderError {
  if (!axios.isAxiosError(error)) {
    return new ProviderError(
      `Facebook ${step} failed: ${error instanceof Error ? error.message : String(error)}`,
      502,
      'facebook',
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
  // as a 401, and a missing Page permission arrives as a 403 *or* a 400 with
  // code 200. Both are normalised here so the publish service's existing
  // "reconnect your account" branch catches them, rather than every caller
  // learning Meta's error taxonomy.
  const normalisedStatus =
    metaError?.code !== undefined && TOKEN_ERROR_CODES.has(metaError.code)
      ? 401
      : metaError?.code !== undefined && PERMISSION_ERROR_CODES.has(metaError.code)
        ? 403
        : upstreamStatus;

  return new ProviderError(
    `Facebook ${step} failed (HTTP ${upstreamStatus ?? 'no response'}: ${detail})`,
    502,
    'facebook',
    normalisedStatus,
  );
}
