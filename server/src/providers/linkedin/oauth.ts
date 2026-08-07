import crypto from 'crypto';
import type { Request, Response } from 'express';
import {
  notImplemented,
  ProviderError,
  type Provider,
} from '../provider.interface';
import { assertLinkedInConfigured, linkedinConfig } from './config';
import { fetchProfile } from './profile';
import { exchangeAuthorizationCode } from './token';
import { verify } from './verify';
import { getCatalogEntry } from '../catalog';
import { socialConnectionService } from '../../services/social-connection.service';
import { buildIntegrationsRedirect } from '../../services/oauth-redirect';
import { clearOAuthSessionCookie } from '../../middleware/auth.middleware';
import type { LinkedInAuthorizationParams, LinkedInPendingState } from './types';

/**
 * LinkedIn OAuth — both legs of the authorization-code flow.
 *
 * `connect()` mints a state bound to the FlowPost user, remembers it, and
 * redirects to LinkedIn. `callback()` validates that state, exchanges the code,
 * reads the member's profile and hands the result to the service layer.
 *
 * This module never imports Prisma and never writes to the database. It talks
 * to LinkedIn, and it delegates persistence to
 * `services/social-connection.service.ts`, which owns the repository call.
 */

/**
 * Pending OAuth states, keyed by the state value itself.
 *
 * Still in-memory: a restart or a second instance drops in-flight connects,
 * which the member recovers from by pressing Connect again. Moving this to a
 * signed cookie or Redis is the change that makes the flow survive both, and it
 * is a swap of these three functions with no caller changes.
 */
const pendingStates = new Map<string, LinkedInPendingState>();

/** Drops entries past their TTL. Cheap enough to run on every mint. */
function evictExpiredStates(now: number): void {
  for (const [state, entry] of pendingStates) {
    if (entry.expiresAt <= now) pendingStates.delete(state);
  }
}

/**
 * A 32-byte CSPRNG value, base64url so it survives a query string untouched.
 * This is the CSRF defence for the whole flow — the callback rejects any
 * `state` it did not mint here — and it doubles as the only carrier of *which
 * FlowPost user* is connecting, since LinkedIn's redirect tells us nothing
 * about our own session.
 */
function createState(userId: string): string {
  const now = Date.now();
  evictExpiredStates(now);

  const state = crypto.randomBytes(32).toString('base64url');
  pendingStates.set(state, {
    expiresAt: now + linkedinConfig.stateTtlMs,
    userId,
  });

  return state;
}

/**
 * Looks up an incoming state and deletes it in the same step.
 *
 * Single-use by construction: consuming on lookup is what stops a replayed
 * callback URL from writing the account a second time, and it satisfies the
 * "delete state after successful validation" rule without a second call the
 * error paths could skip. Returns null for unknown, expired or already-used
 * values — the caller cannot tell those apart, and neither should an attacker.
 */
function consumeState(state: string): LinkedInPendingState | null {
  const entry = pendingStates.get(state);
  if (!entry) return null;

  pendingStates.delete(state);

  return entry.expiresAt <= Date.now() ? null : entry;
}

/**
 * Builds the full authorization URL. Kept exported and pure so it can be
 * asserted on directly without driving an HTTP request.
 */
export function buildAuthorizationUrl(state: string): string {
  const params: LinkedInAuthorizationParams = {
    response_type: 'code',
    client_id: linkedinConfig.clientId,
    redirect_uri: linkedinConfig.redirectUri,
    scope: linkedinConfig.scopeString,
    state,
  };

  const url = new URL(linkedinConfig.authorizationUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

/**
 * `GET /auth/linkedin/connect` — 302 to LinkedIn's consent screen.
 *
 * A plain top-level navigation in, a plain redirect out. That is what every
 * OAuth provider expects, and it is what keeps Instagram, Facebook, X and
 * YouTube identical to this: the frontend only ever needs
 * `window.location = {API}/auth/{provider}/connect`.
 *
 * The FlowPost user is resolved by `attachUserIfPresent` — from the handoff
 * cookie on a navigation, or an `Authorization` header if something calls this
 * with fetch — and bound into the state, because LinkedIn's redirect back
 * carries no identity of ours.
 */
async function connect(req: Request, res: Response): Promise<void> {
  assertLinkedInConfigured();

  const userId: string | undefined = req.user?.id;

  // The handoff cookie has done its job the moment we've read a user out of it.
  // Expiring it here means it does not sit in the browser for its full TTL.
  clearOAuthSessionCookie(res);

  if (!userId) {
    // No session to attach the connection to. Nothing the callback could
    // persist, so fail before the member authorizes anything at LinkedIn —
    // and fail the way the rest of the flow does, with a redirect.
    console.error('[linkedin] connect attempted without a FlowPost session');
    res.redirect(302, buildIntegrationsRedirect('linkedin', 'failed'));
    return;
  }

  const state = createState(userId);
  const authorizationUrl = buildAuthorizationUrl(state);

  // Scopes are safe to log; the state, the client secret and any token are not.
  console.log('[linkedin] OAuth started', {
    scopes: linkedinConfig.scopes,
    redirectUri: linkedinConfig.redirectUri,
  });

  res.redirect(302, authorizationUrl);
}

/**
 * `GET /auth/linkedin/callback` — LinkedIn sends the member back here with
 * `code` and `state`.
 *
 * Always finishes with a 302 to the Integrations page, success or failure. The
 * browser is mid-navigation from linkedin.com; a JSON error body would strand
 * the member on a blank page, so every branch below redirects and the reason
 * stays in the server log. Nothing LinkedIn told us is ever echoed to the URL.
 */
async function callback(req: Request, res: Response): Promise<void> {
  const state = firstQueryValue(req.query.state);
  const code = firstQueryValue(req.query.code);

  // Resolved before anything can throw, so the catch block can attribute the
  // failure to a user in the audit trail.
  const pending = state ? consumeState(state) : null;

  try {
    // The member pressed Cancel, or LinkedIn refused the request outright.
    const oauthError = firstQueryValue(req.query.error);
    if (oauthError) {
      throw new ProviderError(
        `LinkedIn returned an OAuth error: ${oauthError}`,
        400,
        'linkedin',
      );
    }

    // 401-class: an unknown, expired or already-used state means this callback
    // did not originate from a connect we started. Treated as CSRF, not as a
    // retryable hiccup.
    if (!state || !pending) {
      throw new ProviderError('OAuth state mismatch', 401, 'linkedin');
    }

    if (!code) {
      throw new ProviderError(
        'LinkedIn callback is missing the authorization code',
        400,
        'linkedin',
      );
    }

    assertLinkedInConfigured();

    const token = await exchangeAuthorizationCode(code);
    const profile = await fetchProfile(token.accessToken);

    // Plaintext token crosses this one call and no further: the repository
    // encrypts it before it reaches the database.
    const account = await socialConnectionService.connectAccount({
      userId: pending.userId,
      provider: 'linkedin',
      providerAccountId: profile.providerAccountId,
      displayName: profile.displayName,
      profileImage: profile.profileImage,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      scope: token.scope,
      // Recorded per connection so an account authorized under an older
      // LinkedIn API version stays identifiable after we move to a newer one.
      providerVersion: getCatalogEntry('linkedin')?.apiVersion ?? null,
    });

    console.log('[linkedin] account connected', {
      accountId: account.id,
      providerAccountId: account.providerAccountId,
    });

    res.redirect(302, buildIntegrationsRedirect('linkedin', 'connected'));
  } catch (error) {
    const status = error instanceof ProviderError ? error.status : 500;
    console.error('[linkedin] OAuth callback failed', {
      status,
      error: error instanceof Error ? error.message : error,
    });

    if (pending?.userId) {
      await socialConnectionService.recordConnectionFailure(
        pending.userId,
        'linkedin',
        error,
        { status },
      );
    }

    res.redirect(302, buildIntegrationsRedirect('linkedin', 'failed'));
  }
}

/** Sprint 3.3+ — revoke at LinkedIn, then the service layer clears our row. */
async function disconnect(_req: Request, _res: Response): Promise<void> {
  notImplemented('linkedin', 'disconnect');
}

/**
 * Express types a query value as string | string[] | ParsedQs. A repeated
 * `?code=a&code=b` is not something a legitimate LinkedIn redirect does, so
 * anything that is not a plain string is discarded rather than coerced.
 */
function firstQueryValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export const linkedinProvider: Provider = {
  id: 'linkedin',
  displayName: 'LinkedIn',
  connect,
  callback,
  disconnect,
  // Sprint 3.3 — Refresh Connection. Not part of the OAuth flow above: it is
  // called from the service layer with a decrypted token, never from a route.
  verify,
};
