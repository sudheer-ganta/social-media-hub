import { Router, type Request, type Response } from 'express';
import {
  facebookProvider,
  completePageSelection,
  listPendingPages,
} from '../providers/meta/facebook/oauth';
import { ProviderError } from '../providers';
import { requireAuth } from '../middleware/auth.middleware';
import { buildIntegrationsRedirect } from '../services/oauth-redirect';
import { ContextError } from '../services/account-context';

/**
 * Facebook OAuth routes.
 *
 * Mounted at `/auth/facebook`. The first two are deliberately identical in
 * shape to `instagram.routes.ts` and `linkedin.routes.ts`: handlers wire
 * middleware to a provider method and translate a thrown error into the right
 * kind of answer. All OAuth logic lives in `providers/meta/facebook/`.
 *
 *   GET  /connect        → { url } for the SPA to navigate to
 *   GET  /callback       → 302 back to the Integrations page
 *   GET  /pages          → the Pages a parked selection is offering
 *   POST /pages/select   → finish the connection with the chosen Page
 *
 * The last two have no equivalent on the other providers, because Facebook is
 * the only network where OAuth alone does not identify the account — see
 * `providers/meta/facebook/pending-selection.ts`. Both require a real session:
 * the pending-selection id is a lookup key, never a credential.
 */
const router = Router();

/**
 * `/callback` is a *browser navigation*, so it must end in a redirect.
 *
 * The handler already redirects on every branch it knows about; this is the
 * backstop for anything it does not — a member mid-navigation from
 * facebook.com can never end up staring at a JSON error body or Express's
 * default 500 page. The reason stays in the server log, where a
 * misconfiguration message naming missing credentials is safe.
 */
function handleRedirect(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      console.error('[facebook] OAuth route failed', {
        path: req.path,
        error: error instanceof Error ? error.message : error,
      });
      if (!res.headersSent) {
        res.redirect(302, buildIntegrationsRedirect('facebook', 'failed'));
      }
    }
  };
}

/**
 * The JSON routes' failures must be JSON too — a redirect would be followed
 * cross-origin and collapse into an opaque CORS error in the browser, telling
 * the member nothing.
 *
 * A {@link ProviderError} raised by the Page-selection paths carries a message
 * written for a member ("that connection has expired…") and a status chosen for
 * them, so it is returned. Anything else stays generic and the detail goes to
 * the log — Meta's own error text can quote our request back at us.
 */
function handleJson(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      console.error('[facebook] request failed', {
        path: req.path,
        error: error instanceof Error ? error.message : error,
      });
      if (res.headersSent) return;

      // A bad context (unknown brand, malformed brandId) is the member's to fix
      // and its message is written for them.
      if (error instanceof ContextError) {
        res.status(error.status).json({ error: error.message });
        return;
      }

      // Only the deliberate, member-facing refusals from the selection flow.
      // Anything with an `upstreamStatus` came from Meta and is not ours to
      // repeat.
      if (
        error instanceof ProviderError &&
        error.upstreamStatus === undefined &&
        error.status < 500
      ) {
        res.status(error.status).json({ error: error.message });
        return;
      }

      res
        .status(500)
        .json({ error: 'Facebook connections are unavailable right now.' });
    }
  };
}

/** Express types a query value as string | string[] | ParsedQs. */
function requireStringParam(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ProviderError(`Missing ${name}.`, 400, 'facebook');
  }
  return value;
}

// GET /auth/facebook/connect → { url } for the SPA to navigate to.
// `requireAuth`, not an optional check: this is a fetch carrying the member's
// Supabase token, and a request without one has no account to connect to.
router.get(
  '/connect',
  requireAuth,
  handleJson((req, res) => facebookProvider.connect(req, res)),
);

// GET /auth/facebook/callback → 302 back to the Integrations page.
// Unauthenticated by necessity: Meta sends the browser here directly and no
// header of ours survives that hop. The OAuth `state` is what identifies the
// user, and validating it is the first thing the handler does.
router.get(
  '/callback',
  handleRedirect((req, res) => facebookProvider.callback(req, res)),
);

// GET /auth/facebook/pages?selection=… → the Pages to choose between.
// Authenticated, and the store additionally checks the selection belongs to
// this user — holding the id is not enough.
router.get(
  '/pages',
  requireAuth,
  handleJson(async (req, res) => {
    const selection = requireStringParam(req.query.selection, 'selection');
    res.json({ pages: listPendingPages(req.user.id, selection) });
  }),
);

// POST /auth/facebook/pages/select → finish the connection.
// A POST because it writes: it creates the connection, stores tokens and
// retires any Page previously connected to this context.
router.post(
  '/pages/select',
  requireAuth,
  handleJson(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const selection = requireStringParam(body.selection, 'selection');
    const pageId = requireStringParam(body.pageId, 'pageId');

    const account = await completePageSelection(
      req.user.id,
      selection,
      pageId,
    );

    // Profile fields only. `SafeSocialAccount` has no token columns to begin
    // with, and this narrows further to what the toast needs.
    res.json({
      account: {
        id: account.id,
        providerAccountId: account.providerAccountId,
        displayName: account.displayName,
        username: account.username,
        profileImage: account.profileImage,
      },
    });
  }),
);

export default router;
