import type { Request, Response } from 'express';
import {
  notImplemented,
  ProviderError,
  type Provider,
} from '../provider.interface';
import { createOAuthStateStore, firstQueryValue } from '../oauth-state';
import {
  readContext,
  assertContextOwned,
} from '../../services/account-context';
import { assertLinkedInConfigured, linkedinConfig } from './config';
import { linkedinAnalytics } from './analytics';
import { fetchProfile } from './profile';
import { exchangeAuthorizationCode } from './token';
import { verify } from './verify';
import { publish } from './publisher';
import { getCatalogEntry } from '../catalog';
import { socialConnectionService } from '../../services/social-connection.service';
import { buildIntegrationsRedirect } from '../../services/oauth-redirect';
import {
  LINKEDIN_IMAGE_MIME_TYPES,
  LINKEDIN_MAX_IMAGE_BYTES,
  LINKEDIN_MAX_MEDIA_ITEMS,
  canPublish,
} from './validator';
import type { LinkedInAuthorizationParams } from './types';

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
 * Pending OAuth states for LinkedIn.
 *
 * The store itself moved to `providers/oauth-state.ts` when Instagram arrived —
 * behaviour unchanged, but there is now one implementation of single-use,
 * expiry and entropy rather than one per network. This instance is LinkedIn's
 * alone, so a state minted for another provider can never satisfy a callback
 * here.
 */
const states = createOAuthStateStore(linkedinConfig.stateTtlMs);

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
 * `GET /auth/linkedin/connect` — answers `{ url }`, LinkedIn's consent screen,
 * for the SPA to navigate to.
 *
 * One authenticated `fetch` in, a URL out, and the browser navigates itself.
 * That is what keeps Instagram, Facebook, X and YouTube identical to this: the
 * frontend only ever needs `fetch({API}{connectPath})` with its bearer token.
 *
 * JSON rather than a 302 because this route must know *whose* account is being
 * connected: a top-level navigation cannot carry an `Authorization` header, and
 * the handoff cookie that used to stand in for one only ever worked while the
 * API shared a host with the app. See `middleware/auth.middleware.ts`.
 *
 * `requireAuth` on the route guarantees `req.user`, and that user is bound into
 * the state because LinkedIn's redirect back carries no identity of ours.
 */
async function connect(req: Request, res: Response): Promise<void> {
  assertLinkedInConfigured();

  // Which publishing context this connection is for. Read and ownership-checked
  // here — while the request is still authenticated — then bound into the
  // state, because LinkedIn's redirect back carries no identity of ours.
  const context = readContext(req.query);
  await assertContextOwned(req.user.id, context);

  const state = states.create(req.user.id, context);
  const authorizationUrl = buildAuthorizationUrl(state);

  // Scopes are safe to log; the state, the client secret and any token are not.
  console.log('[linkedin] OAuth started', {
    scopes: linkedinConfig.scopes,
    redirectUri: linkedinConfig.redirectUri,
    context: context.contextType,
  });

  res.json({ url: authorizationUrl });
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
  const pending = state ? states.consume(state) : null;

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
      contextType: pending.contextType,
      brandId: pending.brandId,
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

export const linkedinProvider: Provider = {
  id: 'linkedin',
  displayName: 'LinkedIn',
  connect,
  callback,
  disconnect,
  // Sprint 3.3 — Refresh Connection. Not part of the OAuth flow above: it is
  // called from the service layer with a decrypted token, never from a route.
  verify,
  // Sprint 4.2 — publishing; 4.3 — media. Same shape as `verify`: driven by the
  // publish service with a decrypted token, never wired to a route. Text and
  // image posts go through this one method; see publisher.ts.
  publish,
  // Moved here from `publish/services/media.service.ts`, which used to apply
  // these to every network because LinkedIn was the only one. Instagram takes
  // JPEG only, so the rules had to belong to whoever owns them.
  mediaRequirements: {
    imageMimeTypes: LINKEDIN_IMAGE_MIME_TYPES,
    maxImageBytes: LINKEDIN_MAX_IMAGE_BYTES,
    maxItems: LINKEDIN_MAX_MEDIA_ITEMS,
  },
  // Was a `providerId === 'linkedin'` branch in the publish service. Same
  // check, asked of the provider instead of hardcoded against it.
  canPublish,
  // Present, but gated on the connection's own scopes rather than on this
  // being here. `r_member_postAnalytics` is behind App Review and is only
  // requested where a deployment declares the app approved — so a connection
  // that never granted it reports `missing_scopes` and is asked to reconnect,
  // which is the honest answer and not a row of zeros.
  analytics: linkedinAnalytics,
};
