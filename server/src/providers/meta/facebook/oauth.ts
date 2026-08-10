import type { Request, Response } from 'express';
import {
  notImplemented,
  ProviderError,
  type Provider,
} from '../../provider.interface';
import { firstQueryValue } from '../../oauth-state';
import { createCookieStateStore } from '../../oauth-state-cookie';
import { assertFacebookConfigured, facebookConfig } from './config';
import { exchangeAuthorizationCode } from './token';
import {
  fetchPublishablePages,
  noPublishablePagesError,
  selectPage,
  toPageChoices,
} from './pages';
import { createPendingSelectionStore } from './pending-selection';
import { verify } from './verify';
import { publish } from './publisher';
import {
  canPublish,
  FACEBOOK_IMAGE_MIME_TYPES,
  FACEBOOK_MAX_IMAGE_BYTES,
} from './validator';
import { socialConnectionService } from '../../../services/social-connection.service';
import { socialAccountRepository } from '../../../repositories/social-account.repository';
import {
  readContext,
  assertContextOwned,
} from '../../../services/account-context';
import { buildIntegrationsRedirect } from '../../../services/oauth-redirect';
import type {
  FacebookAuthorizationParams,
  FacebookPage,
  FacebookPageChoice,
} from './types';

/**
 * Facebook OAuth — Facebook Login, then a Page choice.
 *
 * `connect()` mints a state bound to the FlowPost user and their publishing
 * context, and hands back Facebook's consent URL. `callback()` validates that
 * state, exchanges the code for a long-lived user token, lists the Pages the
 * member may publish to, and then does one of three things:
 *
 *   • exactly one eligible Page  → connects it and redirects `status=connected`
 *   • several eligible Pages     → parks the result and redirects `status=select`
 *   • none                       → redirects `status=failed`
 *
 * The middle branch is the only structural difference from every other provider
 * in this codebase, and it exists because Facebook is the only one where the
 * network cannot tell us *which* account this is. See `pending-selection.ts`.
 *
 * This module never imports Prisma directly for writes — persistence goes
 * through `services/social-connection.service.ts`, the same service LinkedIn
 * and Instagram use, unchanged. It reaches for the repository exactly once, to
 * retire a superseded Page (see {@link connectSelectedPage}), which is a
 * Facebook-specific invariant with no home in the shared service.
 *
 * The state store is the shared signed-cookie one from
 * `providers/oauth-state-cookie.ts`, with its own cookie name and path — a
 * state minted here can never satisfy an Instagram or LinkedIn callback.
 *
 * Cookie rather than the in-memory Map in `providers/oauth-state.ts`: Render
 * spins the process down between `/connect` and `/callback`, and the Map goes
 * with it, which is exactly the "OAuth state mismatch" this flow was returning
 * in production. Instagram moved for the same reason.
 */
const states = createCookieStateStore({
  cookieName: 'fb_oauth_state',
  callbackPath: '/auth/facebook/callback',
  redirectUri: facebookConfig.redirectUri,
  ttlMs: facebookConfig.stateTtlMs,
});
const selections = createPendingSelectionStore(facebookConfig.selectionTtlMs);

/**
 * Builds the full authorization URL. Kept exported and pure so it can be
 * asserted on directly without driving an HTTP request.
 *
 * Two dialogs, chosen by whether a Business Login Configuration id is
 * configured — see `config.FACEBOOK_CONFIG_ID` for which kind of app needs
 * which, and for why sending the wrong one produces an opaque HTTP 500 from
 * Meta rather than a usable error.
 *
 * `scope` is omitted entirely from the business URL rather than sent alongside
 * `config_id`. Meta's documentation recommends against sending both, and the
 * configuration is authoritative regardless — a scope list here would only
 * describe permissions that the dashboard, not this code, decides.
 */
export function buildAuthorizationUrl(state: string): string {
  const params: FacebookAuthorizationParams = facebookConfig.configId
    ? {
        client_id: facebookConfig.appId,
        redirect_uri: facebookConfig.redirectUri,
        response_type: 'code',
        config_id: facebookConfig.configId,
        override_default_response_type: 'true',
        state,
      }
    : {
        client_id: facebookConfig.appId,
        redirect_uri: facebookConfig.redirectUri,
        response_type: 'code',
        scope: facebookConfig.scopeString,
        state,
      };

  const url = new URL(facebookConfig.authorizationUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

/**
 * `GET /auth/facebook/connect` — answers `{ url }`, Facebook's consent screen,
 * for the SPA to navigate to.
 *
 * JSON rather than a 302 for the same reason Instagram's is: this route must
 * know *whose* account is being connected, a top-level navigation cannot carry
 * an `Authorization` header, and the cookie that would stand in for one cannot
 * cross from the app's host to this API's.
 *
 * `requireAuth` on the route guarantees `req.user`, so the state is always
 * bound to a real member — Facebook's redirect back carries no identity of
 * ours, and that binding is the only thing the callback has to go on.
 */
async function connect(req: Request, res: Response): Promise<void> {
  assertFacebookConfigured();

  // Which publishing context this connection is for. Read and ownership-checked
  // here — while the request is still authenticated — then bound into the
  // state, because Meta's redirect back carries no identity of ours.
  const context = readContext(req.query);
  await assertContextOwned(req.user.id, context);

  // Signs the state payload into an HttpOnly SameSite=None cookie on `res` and
  // returns only the random token to embed in the Facebook URL. The payload
  // (userId, context, expiry) never leaves the signed cookie.
  const state = states.create(res, req.user.id, context);

  // Safe to log: which dialog we are invoking, what we are asking for and where
  // Meta will send the member back. Not safe, and deliberately absent: the
  // state, the app secret, and later the code and every token.
  //
  // `loginMode` is here because the failure it distinguishes is otherwise
  // undiagnosable from our side — Meta answers a business-dialog-without-config
  // with a bare HTTP 500 and no error body at all.
  console.log('[facebook] OAuth started', {
    loginMode: facebookConfig.configId ? 'business (config_id)' : 'consumer (scope)',
    scopes: facebookConfig.configId
      ? '(from the dashboard configuration)'
      : facebookConfig.scopes,
    redirectUri: facebookConfig.redirectUri,
    context: context.contextType,
  });

  res.json({ url: buildAuthorizationUrl(state) });
}

/**
 * `GET /auth/facebook/callback` — Meta sends the member back here with `code`
 * and `state`.
 *
 * Always finishes with a 302 to the Integrations page. The browser is
 * mid-navigation from facebook.com; a JSON error body would strand the member
 * on a blank page, so every branch below redirects and the reason stays in the
 * server log. Nothing Meta told us is ever echoed to the URL.
 */
async function callback(req: Request, res: Response): Promise<void> {
  const state = firstQueryValue(req.query.state);
  const code = firstQueryValue(req.query.code);

  // Resolved before anything can throw, so the catch block can attribute the
  // failure to a user in the audit trail. Clears the state cookie on every
  // exit path, success and failure alike, so a captured redirect URL cannot be
  // replayed.
  const pending = states.consume(req, res, state);

  try {
    // The member pressed Cancel, or Meta refused the request outright.
    const oauthError =
      firstQueryValue(req.query.error) ??
      firstQueryValue(req.query.error_reason);
    if (oauthError) {
      throw new ProviderError(
        `Facebook returned an OAuth error: ${oauthError}`,
        400,
        'facebook',
      );
    }

    // 401-class: an unknown, expired or already-used state means this callback
    // did not originate from a connect we started. Treated as CSRF.
    if (!state || !pending) {
      throw new ProviderError('OAuth state mismatch', 401, 'facebook');
    }

    if (!code) {
      throw new ProviderError(
        'Facebook callback is missing the authorization code',
        400,
        'facebook',
      );
    }

    assertFacebookConfigured();

    const userToken = await exchangeAuthorizationCode(code);

    // Only ever called with the *long-lived* user token: the Page tokens it
    // returns inherit that lifetime, and inheriting the short-lived one would
    // produce a connection that dies within hours. See `token.ts`.
    const pages = await fetchPublishablePages(userToken.accessToken);

    if (pages.length === 0) {
      throw noPublishablePagesError();
    }

    console.log('[facebook] pages discovered', {
      userId: pending.userId,
      context: pending.contextType,
      eligiblePages: pages.length,
    });

    // One eligible Page is the common case and asking about it would be a
    // dialog with a single button. Connect it and be done.
    if (pages.length === 1) {
      const account = await connectSelectedPage({
        userId: pending.userId,
        contextType: pending.contextType,
        brandId: pending.brandId,
        page: pages[0],
        userAccessToken: userToken.accessToken,
        scope: userToken.scope,
      });

      console.log('[facebook] account connected', {
        accountId: account.id,
        providerAccountId: account.providerAccountId,
        autoSelected: true,
        publishingGranted: canPublish(account.scopes),
      });

      res.redirect(
        302,
        buildIntegrationsRedirect(
          'facebook',
          'connected',
          contextParams(pending.contextType, pending.brandId),
        ),
      );
      return;
    }

    // Several. Park everything — including the user token, which never reaches
    // the browser — and let the member choose.
    const selection = selections.create({
      userId: pending.userId,
      contextType: pending.contextType,
      brandId: pending.brandId,
      userAccessToken: userToken.accessToken,
      userTokenExpiresAt: userToken.expiresAt,
      scope: userToken.scope,
      pages,
    });

    res.redirect(
      302,
      buildIntegrationsRedirect('facebook', 'select', {
        selection,
        ...contextParams(pending.contextType, pending.brandId),
      }),
    );
  } catch (error) {
    const status = error instanceof ProviderError ? error.status : 500;
    console.error('[facebook] OAuth callback failed', {
      status,
      error: error instanceof Error ? error.message : error,
    });

    if (pending?.userId) {
      await socialConnectionService.recordConnectionFailure(
        pending.userId,
        'facebook',
        error,
        { status },
      );
    }

    res.redirect(302, buildIntegrationsRedirect('facebook', 'failed'));
  }
}

/**
 * The publishing context, as query params for the return redirect.
 *
 * So the Integrations page can re-select the pill the member started from. A
 * brand connect that dumps them back on the Personal tab looks like it did
 * nothing — and with the Page picker in the way, it would also leave the dialog
 * unable to say which context it is asking about.
 *
 * Safe to put in a URL: a brand id is already a value the browser holds and
 * sends on every list request, and the page re-validates ownership by asking
 * the API. Nothing here is a credential.
 *
 * Facebook-only for now. Wiring the same params into the LinkedIn and Instagram
 * redirects would fix the same wrinkle for them, but that is a change to their
 * behaviour and out of scope for this work.
 */
function contextParams(
  contextType: string,
  brandId: string | null,
): Record<string, string> {
  return contextType === 'brand' && brandId
    ? { context: 'brand', brandId }
    : {};
}

/**
 * The Pages a parked selection is offering, for the picker to render.
 *
 * Non-consuming — the member has to be able to see the list and then post a
 * choice. Returns only {@link FacebookPageChoice}s: name, username, picture and
 * id. The Page access tokens stay in the store.
 */
export function listPendingPages(
  userId: string,
  selection: string,
): FacebookPageChoice[] {
  const entry = selections.peek(selection, userId);
  if (!entry) {
    throw new ProviderError(
      'That Facebook connection has expired. Press Connect to start again.',
      410,
      'facebook',
    );
  }
  return toPageChoices(entry.pages);
}

/**
 * Finishes a parked connection with the member's chosen Page.
 *
 * Three things this deliberately does **not** take from the request: the user
 * id (it comes from the authenticated session and must match the parked entry),
 * the publishing context (it comes from the parked entry, which got it from the
 * server-minted OAuth state), and the Page token (it comes from the parked
 * entry, keyed by an id that must appear in the list Facebook actually
 * returned). A member cannot start a Personal connect and finish it into a
 * Brand, and cannot name a Page this exchange never offered.
 */
export async function completePageSelection(
  userId: string,
  selection: string,
  pageId: string,
) {
  const entry = selections.consume(selection, userId);
  if (!entry) {
    throw new ProviderError(
      'That Facebook connection has expired. Press Connect to start again.',
      410,
      'facebook',
    );
  }

  const page = selectPage(entry.pages, pageId);
  if (!page) {
    // The id was not in the list this exchange produced. Deliberately the same
    // 400 a malformed id gets — an attacker learns nothing about which Pages
    // exist.
    throw new ProviderError(
      'That Facebook Page is not one this connection can use. Press Connect to start again.',
      400,
      'facebook',
    );
  }

  const account = await connectSelectedPage({
    userId: entry.userId,
    contextType: entry.contextType,
    brandId: entry.brandId,
    page,
    userAccessToken: entry.userAccessToken,
    scope: entry.scope,
  });

  console.log('[facebook] account connected', {
    accountId: account.id,
    providerAccountId: account.providerAccountId,
    autoSelected: false,
    publishingGranted: canPublish(account.scopes),
  });

  return account;
}

/**
 * Stores one Page as this context's Facebook connection.
 *
 * ─── What goes in which token column ─────────────────────────────────────────
 *
 *   • `encryptedAccessToken`  ← the **Page** access token. This is what every
 *     publish uses, and it is scoped to exactly one Page — which is the last
 *     line of the cross-context defence: even if every other check failed, a
 *     Brand's stored token physically cannot post to a Personal Page.
 *
 *   • `encryptedRefreshToken` ← the long-lived **user** access token.
 *
 *     **This is NOT an OAuth refresh token.** Facebook has no refresh grant and
 *     this value cannot be exchanged for a new access token by any OAuth flow.
 *     It is the encrypted long-lived user credential, kept for exactly one
 *     purpose: re-minting the Page credential through `/me/accounts` without
 *     sending the member back through consent. It is stored in this column
 *     because that column already carries the right guarantees — encrypted at
 *     rest, never serialised to the browser, deleted with the row on
 *     disconnect — and adding a fourth token column to a shared table for one
 *     provider would be worse. Nothing in the codebase treats it as an OAuth
 *     refresh token; no refresh exchange reads it.
 *
 *   • `expiresAt` ← **null**, on purpose. A Page token minted from a long-lived
 *     user token has no expiry. Writing the *user* token's ~60-day expiry here
 *     would make the publish service's stored-expiry pre-flight refuse a
 *     perfectly working Page token after two months. Facebook connections are
 *     policed by `verify()` instead — see `verify.ts`.
 */
async function connectSelectedPage(args: {
  userId: string;
  contextType: string;
  brandId: string | null;
  page: FacebookPage;
  userAccessToken: string;
  scope: string | null;
}) {
  const account = await socialConnectionService.connectAccount({
    userId: args.userId,
    provider: 'facebook',
    contextType: args.contextType,
    brandId: args.brandId,
    // The Page id, never the user id. Everything the publisher does is built
    // from this value.
    providerAccountId: args.page.id,
    displayName: args.page.name,
    username: args.page.username,
    profileImage: args.page.profileImage,
    accessToken: args.page.accessToken,
    refreshToken: args.userAccessToken,
    expiresAt: null,
    scope: args.scope,
    providerVersion: facebookConfig.apiVersion,
  });

  // One Facebook Page per context. Reconnecting the same Page updated the row
  // above; connecting a *different* one retires the old row here, so
  // `findByUserAndProvider` never has to choose between two Pages by date.
  // Ordered after the upsert deliberately — see the repository's note.
  const retired = await socialAccountRepository.deleteOthersInContext(
    args.userId,
    'facebook',
    { contextType: args.contextType, brandId: args.brandId },
    account.id,
  );

  if (retired > 0) {
    console.log('[facebook] replaced the page connected to this context', {
      context: args.contextType,
      retired,
    });
  }

  return account;
}

/** Not implemented — see the note in `providers/index.ts` on disconnect. */
async function disconnect(_req: Request, _res: Response): Promise<void> {
  notImplemented('facebook', 'disconnect');
}

export const facebookProvider: Provider = {
  id: 'facebook',
  displayName: 'Facebook',
  connect,
  callback,
  disconnect,
  verify,
  publish,
  // JPEG/PNG/GIF, 4MB — enforced by the media service *before* the image is
  // downloaded, which is why it lives on the provider rather than in the
  // publisher. Wider than Instagram's format rule and stricter than LinkedIn's
  // size one; both are now honoured independently.
  mediaRequirements: {
    imageMimeTypes: FACEBOOK_IMAGE_MIME_TYPES,
    maxImageBytes: FACEBOOK_MAX_IMAGE_BYTES,
  },
  canPublish,
};
