import type { Request, Response } from 'express';
import { notImplemented, ProviderError, type Provider } from '../provider.interface';
import { firstQueryValue } from '../oauth-state';
import { createXState, consumeXState } from './x-state';
import { assertXConfigured, xConfig } from './config';
import { createPkcePair } from './pkce';
import { fetchProfile } from './profile';
import { exchangeAuthorizationCode, refreshAccessToken } from './token';
import { verify } from './verify';
import { publish } from './publisher';
import { xAnalytics } from './analytics';
import {
  canPublish,
  X_IMAGE_MIME_TYPES,
  X_MAX_IMAGE_BYTES,
  X_MAX_MEDIA_ITEMS,
} from './validator';
import { socialConnectionService } from '../../services/social-connection.service';
import { readContext, assertContextOwned } from '../../services/account-context';
import { buildIntegrationsRedirect } from '../../services/oauth-redirect';
import type { XAuthorizationParams } from './types';

/**
 * X OAuth — both legs of OAuth 2.0 Authorization Code with PKCE.
 *
 * `connect()` mints a PKCE pair and a signed-cookie state bound to the FlowPost
 * user, and answers X's consent URL. `callback()` reads and verifies that cookie
 * (HMAC, expiry, state match), pulls the `code_verifier` back out of it,
 * exchanges the code, reads the profile and hands the result to the service
 * layer.
 *
 * This module never imports Prisma and never writes to the database. It talks to
 * X and delegates persistence to `services/social-connection.service.ts`, which
 * is the same service LinkedIn, Instagram and Facebook use, unchanged.
 *
 * The old in-memory state Map (`providers/oauth-state.ts`) is deliberately not
 * used: Render restarts the process between `/connect` and `/callback`, losing
 * every pending state. Only `firstQueryValue` — a query-string helper with no
 * state of its own — is imported from it.
 */

/**
 * Builds the full authorization URL. Kept exported and pure so it can be
 * asserted on directly without driving an HTTP request.
 *
 * `code_challenge_method=S256` is not negotiable — see `pkce.ts`.
 */
export function buildAuthorizationUrl(state: string, codeChallenge: string): string {
  const params: XAuthorizationParams = {
    response_type: 'code',
    client_id: xConfig.clientId,
    redirect_uri: xConfig.redirectUri,
    scope: xConfig.scopeString,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  };

  const url = new URL(xConfig.authorizationUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

/**
 * `GET /auth/x/connect` — answers `{ url }`, X's consent screen, for the SPA to
 * navigate to.
 *
 * JSON rather than a 302 for the same reason Instagram's is: this route must
 * know *whose* account is being connected, and a top-level navigation cannot
 * carry an `Authorization` header. `requireAuth` on the route guarantees
 * `req.user`, so the state is always bound to a real member — X's redirect back
 * carries no identity of ours, and that binding is the only thing the callback
 * has to go on.
 */
async function connect(req: Request, res: Response): Promise<void> {
  assertXConfigured();

  // Which publishing context this connection is for. Read and ownership-checked
  // here — while the request is still authenticated — then bound into the state
  // cookie, because X's redirect back carries no identity of ours.
  const context = readContext(req.query);
  await assertContextOwned(req.user.id, context);

  // The verifier goes into the signed HttpOnly cookie; only its SHA-256 hash
  // travels in the URL. Neither value is ever logged.
  const { verifier, challenge } = createPkcePair();
  const state = createXState(res, req.user.id, context, verifier);

  // Scopes and redirectUri are safe to log; the state, the verifier, the
  // challenge and the client secret are not, and none appear here.
  console.log('[x] OAuth started', {
    scopes: xConfig.scopes,
    redirectUri: xConfig.redirectUri,
    context: context.contextType,
    codeChallengeMethod: 'S256',
  });

  res.json({ url: buildAuthorizationUrl(state, challenge) });
}

/**
 * `GET /auth/x/callback` — X sends the member back here with `code` and `state`.
 *
 * Always finishes with a 302 to the Integrations page, success or failure. The
 * browser is mid-navigation from x.com; a JSON error body would strand the
 * member on a blank page, so every branch below redirects and the reason stays
 * in the server log. Nothing X told us is ever echoed to the URL.
 */
async function callback(req: Request, res: Response): Promise<void> {
  const stateParam = firstQueryValue(req.query.state);
  const code = firstQueryValue(req.query.code);

  // Reads, verifies (HMAC + expiry + state-param match) and clears the signed
  // state cookie, returning the PKCE verifier it carried. Null for any failure —
  // tampered, expired, missing or mismatched. The cookie is cleared on EVERY
  // exit path, success and failure alike, before this function returns.
  const pending = consumeXState(req, res, stateParam);

  try {
    // The member pressed Cancel, or X refused the request outright.
    const oauthError = firstQueryValue(req.query.error);
    if (oauthError) {
      throw new ProviderError(`X returned an OAuth error: ${oauthError}`, 400, 'x');
    }

    // 401-class: missing, expired, tampered or already-consumed state cookie
    // means this callback did not originate from a connect we started. CSRF.
    // Checked *before* the code is exchanged, which is the whole point of it.
    if (!stateParam || !pending) {
      throw new ProviderError('OAuth state mismatch', 401, 'x');
    }

    // A verified cookie with no verifier in it cannot have been minted by this
    // provider's connect(). Refused rather than retried without PKCE: falling
    // back to a plain exchange would make the protection optional, which is the
    // same as not having it.
    if (!pending.codeVerifier) {
      throw new ProviderError('X callback state carried no PKCE verifier', 401, 'x');
    }

    if (!code) {
      throw new ProviderError('X callback is missing the authorization code', 400, 'x');
    }

    assertXConfigured();

    const token = await exchangeAuthorizationCode(code, pending.codeVerifier);
    const profile = await fetchProfile(token.accessToken);

    // Plaintext tokens cross this one call and no further: the repository
    // encrypts both before they reach the database.
    const account = await socialConnectionService.connectAccount({
      userId: pending.userId,
      provider: 'x',
      contextType: pending.contextType,
      brandId: pending.brandId,
      // The profile is authoritative over anything the token exchange
      // volunteered — `/2/users/me` is what the connection is displayed from.
      providerAccountId: profile.providerAccountId,
      displayName: profile.displayName,
      username: profile.username,
      profileImage: profile.profileImage,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      scope: token.scope,
      providerVersion: xConfig.apiVersion,
    });

    console.log('[x] account connected', {
      accountId: account.id,
      providerAccountId: account.providerAccountId,
      // Both worth logging and neither is a secret. A member who declines
      // tweet.write gets a connection that cannot post, and a member whose
      // offline.access was declined gets one that dies in two hours — this is
      // the only record of either.
      publishingGranted: canPublish(account.scopes),
      refreshable: token.refreshToken !== null,
    });

    res.redirect(302, buildIntegrationsRedirect('x', 'connected'));
  } catch (error) {
    const status = error instanceof ProviderError ? error.status : 500;
    console.error('[x] OAuth callback failed', {
      status,
      error: error instanceof Error ? error.message : error,
    });

    if (pending?.userId) {
      await socialConnectionService.recordConnectionFailure(pending.userId, 'x', error, {
        status,
      });
    }

    res.redirect(302, buildIntegrationsRedirect('x', 'failed'));
  }
}

/** Not implemented — see the note in `providers/index.ts` on disconnect. */
async function disconnect(_req: Request, _res: Response): Promise<void> {
  notImplemented('x', 'disconnect');
}

export const xProvider: Provider = {
  id: 'x',
  displayName: 'X',
  connect,
  callback,
  disconnect,
  verify,
  publish,
  // X access tokens last two hours, so this is what makes a connection usable
  // the day after it was made. No other provider implements it yet: LinkedIn's
  // tokens last sixty days and Meta's are extended by presenting themselves.
  refreshTokens: refreshAccessToken,
  mediaRequirements: {
    imageMimeTypes: X_IMAGE_MIME_TYPES,
    maxImageBytes: X_MAX_IMAGE_BYTES,
    maxItems: X_MAX_MEDIA_ITEMS,
  },
  canPublish,
  // The one network whose analytics work without a reconnect: `tweet.read` and
  // `users.read` have been asked for since before analytics existed and are
  // exactly what X's metrics endpoints need. The other three providers now have
  // adapters too, each gated on a permission behind App Review — see
  // `providers/analytics-scopes.ts`.
  analytics: xAnalytics,
};
