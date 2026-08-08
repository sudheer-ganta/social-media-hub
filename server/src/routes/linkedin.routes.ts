import { Router, type Request, type Response } from 'express';
import { linkedinProvider } from '../providers';
import { requireAuth } from '../middleware/auth.middleware';
import { buildIntegrationsRedirect } from '../services/oauth-redirect';

/**
 * LinkedIn OAuth routes.
 *
 * Mounted at `/auth/linkedin`. Handlers stay thin on purpose: they wire
 * middleware to a provider method and translate a thrown error into the right
 * kind of answer. All OAuth logic lives in `providers/linkedin/`.
 */
const router = Router();

/**
 * `/callback` is a *browser navigation*, so it must end in a redirect.
 *
 * The handler already redirects on every branch it knows about; this is the
 * backstop for anything it does not — a member mid-navigation from
 * linkedin.com can never end up staring at a JSON error body or Express's
 * default 500 page. The reason stays in the server log, where a
 * misconfiguration message naming missing credentials is safe.
 */
function handleRedirect(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      console.error('[linkedin] OAuth callback route failed', {
        path: req.path,
        error: error instanceof Error ? error.message : error,
      });
      if (!res.headersSent) {
        res.redirect(302, buildIntegrationsRedirect('linkedin', 'failed'));
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
      console.error('[linkedin] connect failed', {
        error: error instanceof Error ? error.message : error,
      });
      if (!res.headersSent) {
        res
          .status(500)
          .json({ error: 'LinkedIn connections are unavailable right now.' });
      }
    }
  };
}

// GET /auth/linkedin/connect → { url } for the SPA to navigate to.
// `requireAuth`, not an optional check: this is a fetch carrying the member's
// Supabase token, and a request without one has no account to connect to, so a
// 401 is the honest answer rather than an anonymous path to handle downstream.
router.get(
  '/connect',
  requireAuth,
  handleJson((req, res) => linkedinProvider.connect(req, res)),
);

// GET /auth/linkedin/callback → 302 back to the Integrations page.
// Unauthenticated by necessity: LinkedIn sends the browser here directly and
// no header of ours survives that hop. The OAuth `state` is what identifies
// the user, and validating it is the first thing the handler does.
router.get(
  '/callback',
  handleRedirect((req, res) => linkedinProvider.callback(req, res)),
);

export default router;
