import { Router, type Request, type Response } from 'express';
import { instagramProvider } from '../providers';
import { requireAuth } from '../middleware/auth.middleware';
import { buildIntegrationsRedirect } from '../services/oauth-redirect';
import { ContextError } from '../services/account-context';

/**
 * Instagram OAuth routes.
 *
 * Mounted at `/auth/instagram`. Deliberately identical in shape to
 * `linkedin.routes.ts`: handlers wire middleware to a provider method and
 * translate a thrown error into the right kind of answer. All OAuth logic lives
 * in `providers/meta/instagram/`.
 */
const router = Router();

/**
 * `/callback` is a *browser navigation*, so it must end in a redirect.
 *
 * The handler already redirects on every branch it knows about; this is the
 * backstop for anything it does not — a member mid-navigation from
 * instagram.com can never end up staring at a JSON error body or Express's
 * default 500 page. The reason stays in the server log, where a
 * misconfiguration message naming missing credentials is safe.
 */
function handleRedirect(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      console.error('[instagram] OAuth route failed', {
        path: req.path,
        error: error instanceof Error ? error.message : error,
      });
      if (!res.headersSent) {
        res.redirect(302, buildIntegrationsRedirect('instagram', 'failed'));
      }
    }
  };
}

/**
 * `/connect` is a `fetch` from the SPA, so its failures must be JSON too — a
 * redirect here would be followed cross-origin and collapse into an opaque CORS
 * error in the browser, telling the member nothing. The reason stays in the
 * server log; what crosses the wire is a line they can act on.
 */
function handleJson(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      console.error('[instagram] connect failed', {
        error: error instanceof Error ? error.message : error,
      });
      if (!res.headersSent) {
        // A bad context (unknown brand, malformed brandId) is the member's to
        // fix and its message is written for them; anything else stays generic.
        if (error instanceof ContextError) {
          res.status(error.status).json({ error: error.message });
          return;
        }
        res
          .status(500)
          .json({ error: 'Instagram connections are unavailable right now.' });
      }
    }
  };
}

// GET /auth/instagram/connect → { url } for the SPA to navigate to.
// `requireAuth`, not an optional check: this is a fetch carrying the member's
// Supabase token, and a request without one has no account to connect to, so a
// 401 is the honest answer rather than an anonymous path to handle downstream.
router.get(
  '/connect',
  requireAuth,
  handleJson((req, res) => instagramProvider.connect(req, res)),
);

// GET /auth/instagram/callback → 302 back to the Integrations page.
// Unauthenticated by necessity: Meta sends the browser here directly and no
// header of ours survives that hop. The OAuth `state` is what identifies the
// user, and validating it is the first thing the handler does.
router.get(
  '/callback',
  handleRedirect((req, res) => instagramProvider.callback(req, res)),
);

export default router;
