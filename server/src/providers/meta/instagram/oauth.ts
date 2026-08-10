import type { Request, Response } from 'express';
import {
  notImplemented,
  ProviderError,
  type Provider,
} from '../../provider.interface';
import { firstQueryValue } from '../../oauth-state';
import { createInstagramState, consumeInstagramState } from './instagram-state';
import { assertInstagramConfigured, instagramConfig } from './config';
import { fetchProfile } from './profile';
import { exchangeAuthorizationCode } from './token';
import { verify } from './verify';
import { publish } from './publisher';
import {
  canPublish,
  INSTAGRAM_IMAGE_MIME_TYPES,
  INSTAGRAM_MAX_IMAGE_BYTES,
  INSTAGRAM_MAX_MEDIA_ITEMS,
  INSTAGRAM_PUBLISHABLE_ACCOUNT_TYPES,
} from './validator';
import { socialConnectionService } from '../../../services/social-connection.service';
import {
  readContext,
  assertContextOwned,
} from '../../../services/account-context';
import { buildIntegrationsRedirect } from '../../../services/oauth-redirect';
import type { InstagramAuthorizationParams } from './types';

/**
 * Instagram OAuth — both legs of Business Login for Instagram.
 *
 * `connect()` mints a signed-cookie state bound to the FlowPost user and
 * redirects to Instagram. `callback()` reads and verifies that cookie state,
 * exchanges the code (twice — see `token.ts`), reads the profile and hands
 * the result to the service layer.
 *
 * This module never imports Prisma and never writes to the database. It talks
 * to Meta and delegates persistence to `services/social-connection.service.ts`,
 * which is the same service LinkedIn uses, unchanged.
 *
 * State is carried in a signed HttpOnly cookie (see `instagram-state.ts`).
 * The in-memory Map used previously was dropped because Render restarts the
 * process between `/connect` and `/callback`, losing every pending state and
 * producing "OAuth state mismatch" on every production attempt.
 */

/**
 * Builds the full authorization URL. Kept exported and pure so it can be
 * asserted on directly without driving an HTTP request.
 */
export function buildAuthorizationUrl(state: string): string {
  const params: InstagramAuthorizationParams = {
    client_id: instagramConfig.appId,
    redirect_uri: instagramConfig.redirectUri,
    response_type: 'code',
    scope: instagramConfig.scopeString,
    state,
  };

  const url = new URL(instagramConfig.authorizationUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

/**
 * `GET /auth/instagram/connect` — answers `{ url }`, Instagram's consent
 * screen, for the SPA to navigate to.
 *
 * Identical in shape to LinkedIn's, which is the point: the frontend only ever
 * needs one authenticated `fetch` to `{API}{connectPath}`, and the catalogue
 * entry's `connectPath` is what tells it which.
 *
 * JSON rather than a 302 because the caller is a `fetch`, and it has to be:
 * this route must know *whose* account is being connected, a top-level
 * navigation cannot carry an `Authorization` header, and the cookie that used
 * to stand in for one cannot cross from the app's host to this API's. See
 * `middleware/auth.middleware.ts`.
 *
 * `requireAuth` on the route guarantees `req.user`, so the state is always
 * bound to a real member — Instagram's redirect back carries no identity of
 * ours, and that binding is the only thing the callback has to go on.
 */
async function connect(req: Request, res: Response): Promise<void> {
  assertInstagramConfigured();

  // Which publishing context this connection is for. Read and ownership-checked
  // here — while the request is still authenticated — then bound into the
  // state cookie, because Meta's redirect back carries no identity of ours.
  const context = readContext(req.query);
  await assertContextOwned(req.user.id, context);

  // Signs the state payload into an HttpOnly SameSite=None cookie on `res`.
  // Returns only the random state token to embed in the Instagram URL —
  // the full payload (userId, context, expiry) lives only in the signed cookie.
  const state = createInstagramState(res, req.user.id, context);

  // Scopes and redirectUri are safe to log; the state value, the app secret
  // and any token are not, and none appear here.
  console.log('[instagram] OAuth started', {
    scopes: instagramConfig.scopes,
    redirectUri: instagramConfig.redirectUri,
    context: context.contextType,
  });

  res.json({ url: buildAuthorizationUrl(state) });
}

/**
 * `GET /auth/instagram/callback` — Meta sends the member back here with `code`
 * and `state`.
 *
 * Always finishes with a 302 to the Integrations page, success or failure. The
 * browser is mid-navigation from instagram.com; a JSON error body would strand
 * the member on a blank page, so every branch below redirects and the reason
 * stays in the server log. Nothing Meta told us is ever echoed to the URL.
 */
async function callback(req: Request, res: Response): Promise<void> {
  const stateParam = firstQueryValue(req.query.state);
  const code = firstQueryValue(req.query.code);

  // Reads, verifies (HMAC + expiry + state-param match) and clears the
  // signed state cookie. Returns null for any failure — tampered, expired,
  // missing or mismatched. The cookie is cleared on EVERY exit path (success
  // and failure) inside consumeInstagramState, before this function returns.
  const pending = consumeInstagramState(req, res, stateParam);

  try {
    // The member pressed Cancel, or Meta refused the request outright.
    const oauthError =
      firstQueryValue(req.query.error) ??
      firstQueryValue(req.query.error_reason);
    if (oauthError) {
      throw new ProviderError(
        `Instagram returned an OAuth error: ${oauthError}`,
        400,
        'instagram',
      );
    }

    // 401-class: missing, expired, tampered or already-consumed state cookie
    // means this callback did not originate from a connect we started. CSRF.
    if (!stateParam || !pending) {
      throw new ProviderError('OAuth state mismatch', 401, 'instagram');
    }

    if (!code) {
      throw new ProviderError(
        'Instagram callback is missing the authorization code',
        400,
        'instagram',
      );
    }

    assertInstagramConfigured();

    const token = await exchangeAuthorizationCode(code);
    const profile = await fetchProfile(token.accessToken);

    // A personal Instagram account can complete this whole flow and then fail
    // every publish, because the Content Publishing API is professional-only.
    // Better to refuse the connection than to store one that looks healthy on
    // the Integrations page and cannot do the one thing it is there for.
    assertPublishableAccountType(profile.accountType);

    // Plaintext token crosses this one call and no further: the repository
    // encrypts it before it reaches the database.
    const account = await socialConnectionService.connectAccount({
      userId: pending.userId,
      provider: 'instagram',
      contextType: pending.contextType,
      brandId: pending.brandId,
      // The profile is authoritative over the id the token exchange
      // volunteered — `/me` is what the publishing paths are built from.
      providerAccountId: profile.providerAccountId,
      displayName: profile.displayName,
      username: profile.username,
      profileImage: profile.profileImage,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      scope: token.scope,
      providerVersion: instagramConfig.apiVersion,
    });

    console.log('[instagram] account connected', {
      accountId: account.id,
      providerAccountId: account.providerAccountId,
      accountType: profile.accountType,
      // Worth logging: a member who declines content publishing on the consent
      // screen gets a connection that cannot post, and this is the only record
      // of why.
      publishingGranted: canPublish(account.scopes),
    });

    res.redirect(302, buildIntegrationsRedirect('instagram', 'connected'));
  } catch (error) {
    const status = error instanceof ProviderError ? error.status : 500;
    console.error('[instagram] OAuth callback failed', {
      status,
      error: error instanceof Error ? error.message : error,
    });

    if (pending?.userId) {
      await socialConnectionService.recordConnectionFailure(
        pending.userId,
        'instagram',
        error,
        { status },
      );
    }

    res.redirect(302, buildIntegrationsRedirect('instagram', 'failed'));
  }
}

/**
 * Refuses a personal account before it is stored.
 *
 * Null is allowed through: an absent `account_type` means Meta did not tell us,
 * not that the account is personal, and refusing on missing information would
 * block a legitimate connection over a field we merely failed to read.
 */
function assertPublishableAccountType(accountType: string | null): void {
  if (!accountType) return;

  if (!INSTAGRAM_PUBLISHABLE_ACCOUNT_TYPES.has(accountType.toUpperCase())) {
    throw new ProviderError(
      `Instagram account type ${accountType} cannot publish through the API — ` +
        'a Business or Creator account is required',
      400,
      'instagram',
    );
  }
}

/** Not implemented — see the note in `providers/index.ts` on disconnect. */
async function disconnect(_req: Request, _res: Response): Promise<void> {
  notImplemented('instagram', 'disconnect');
}

export const instagramProvider: Provider = {
  id: 'instagram',
  displayName: 'Instagram',
  connect,
  callback,
  disconnect,
  verify,
  publish,
  // JPEG only, 8MB — enforced by the media service *before* the image is
  // downloaded, which is why it lives on the provider rather than in the
  // publisher. LinkedIn's rules are different and both are now honoured.
  mediaRequirements: {
    imageMimeTypes: INSTAGRAM_IMAGE_MIME_TYPES,
    maxImageBytes: INSTAGRAM_MAX_IMAGE_BYTES,
    maxItems: INSTAGRAM_MAX_MEDIA_ITEMS,
  },
  canPublish,
};
