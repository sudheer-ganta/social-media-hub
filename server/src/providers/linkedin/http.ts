import axios, { type AxiosError } from 'axios';
import { ProviderError } from '../provider.interface';
import { linkedinConfig } from './config';

/**
 * The mechanics every LinkedIn call shares: headers, what counts as "wrong
 * door", and how a failure becomes a {@link ProviderError}.
 *
 * Extracted when `media.ts` arrived and needed all three. Two copies of the
 * error translation is how one of them quietly starts leaking a request body
 * into a log while the other does not — this is the sort of thing that has to
 * have exactly one home.
 *
 * Nothing here knows what is being published. It is transport, and it is the
 * lowest layer in `providers/linkedin/`.
 */

/** One call, one socket, one deadline. A hung request must not pin a member's. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Uploading bytes is not the same shape of wait as posting JSON — a phone photo
 * over a slow uplink legitimately takes longer than any API call should.
 */
export const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Statuses that mean "wrong door, try the other one" rather than "no".
 *
 * 403 is the ambiguous one — it is both "your app is not on the versioned API"
 * and "this token lacks w_member_social". Falling back on it is safe because
 * the legacy endpoint checks the same scope and will simply fail the same way,
 * costing one extra request on a post that was never going to publish.
 *
 * 426 (Upgrade Required) and 400 are what a rejected `LinkedIn-Version` header
 * comes back as.
 */
const FALLBACK_STATUSES = new Set([400, 403, 404, 426]);

/** Headers for the versioned surface (`/rest/*`). */
export function versionedHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': linkedinConfig.restliVersion,
    'LinkedIn-Version': linkedinConfig.apiVersion,
  };
}

/** Headers for the unversioned surface (`/v2/*`) — deliberately no version. */
export function legacyHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': linkedinConfig.restliVersion,
  };
}

/**
 * Whether a failure is worth one attempt on the other endpoint family.
 *
 * Only failures LinkedIn *answered*. A timeout or a dead socket is never
 * retried: we do not know whether the request took effect, and a duplicate post
 * on someone's professional feed is a worse outcome than a failure they can
 * retry deliberately.
 */
export function shouldFallBack(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status !== undefined && FALLBACK_STATUSES.has(status);
}

/**
 * Turns an axios failure into a {@link ProviderError}.
 *
 * The message is written for the *server log*. It carries LinkedIn's status
 * and its own `serviceErrorCode` / `message` fields — which are diagnostic and
 * often quote the request — and it must not be shown to a member. The publish
 * service is what maps `upstreamStatus` onto something a person should read.
 *
 * Note what is not included: the request body, the headers, and therefore the
 * bearer token. An error object that stringifies a whole axios request is one
 * of the easier ways to end up with credentials in a log aggregator.
 */
export function toProviderError(error: unknown, action: string): ProviderError {
  if (error instanceof ProviderError) return error;

  if (!axios.isAxiosError(error)) {
    return new ProviderError(
      `LinkedIn ${action} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      502,
      'linkedin',
    );
  }

  const axiosError = error as AxiosError<{
    message?: string;
    serviceErrorCode?: number;
    status?: number;
  }>;
  const upstreamStatus = axiosError.response?.status;
  const body = axiosError.response?.data;
  const detail =
    [body?.serviceErrorCode && `code ${body.serviceErrorCode}`, body?.message]
      .filter(Boolean)
      .join(' — ') ||
    axiosError.code ||
    axiosError.message;

  return new ProviderError(
    `LinkedIn ${action} failed (HTTP ${upstreamStatus ?? 'no response'}): ${detail}`,
    502,
    'linkedin',
    upstreamStatus,
  );
}
