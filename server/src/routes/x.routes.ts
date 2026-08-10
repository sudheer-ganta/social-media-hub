import { Router, type Request, type Response } from 'express';
import { xProvider } from '../providers';
import { requireAuth } from '../middleware/auth.middleware';
import { buildIntegrationsRedirect } from '../services/oauth-redirect';
import { ContextError } from '../services/account-context';

/**
 * X OAuth routes.
 *
 * Mounted at `/auth/x`. Deliberately identical in shape to
 * `instagram.routes.ts`: handlers wire middleware to a provider method and
 * translate a thrown error into the right kind of answer. All OAuth logic —
 * including PKCE — lives in `providers/x/`.
 */
const router = Router();

/**
 * `/callback` is a *browser navigation*, so it must end in a redirect.
 *
 * The handler already redirects on every branch it knows about; this is the
 * backstop for anything it does not — a member mid-navigation from x.com can
 * never end up staring at a JSON error body or Express's default 500 page. The
 * reason stays in the server log, where a misconfiguration message naming
 * missing credentials is safe.
 */
function handleRedirect(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      console.error('[x] OAuth route failed', {
        path: req.path,
        error: error instanceof Error ? error.message : error,
      });
      if (!res.headersSent) {
        res.redirect(302, buildIntegrationsRedirect('x', 'failed'));
      }
    }
  };
}

/**
 * `/connect` is a `fetch` from the SPA, so its failures must be JSON too — a
 * redirect here would be followed cross-origin and collapse into an opaque CORS
 * error in the browser, telling the member nothing.
 */
function handleJson(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      console.error('[x] connect failed', {
        error: error instanceof Error ? error.message : error,
      });
      if (!res.headersSent) {
        // A bad context (unknown brand, malformed brandId) is the member's to
        // fix and its message is written for them; anything else stays generic.
        if (error instanceof ContextError) {
          res.status(error.status).json({ error: error.message });
          return;
        }
        res.status(500).json({ error: 'X connections are unavailable right now.' });
      }
    }
  };
}

// GET /auth/x/connect → { url } for the SPA to navigate to.
// `requireAuth`, not an optional check: this is a fetch carrying the member's
// Supabase token, and a request without one has no account to connect to.
router.get(
  '/connect',
  requireAuth,
  handleJson((req, res) => xProvider.connect(req, res)),
);

// GET /auth/x/callback → 302 back to the Integrations page.
// Unauthenticated by necessity: X sends the browser here directly and no header
// of ours survives that hop. The OAuth `state` is what identifies the user, and
// validating it — along with the PKCE verifier it carries — is the first thing
// the handler does.
router.get(
  '/callback',
  handleRedirect((req, res) => xProvider.callback(req, res)),
);

export default router;
