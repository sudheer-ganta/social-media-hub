import { Router, type Request, type Response } from 'express';
import { linkedinProvider } from '../providers';
import { attachUserIfPresent } from '../middleware/auth.middleware';
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
 * Both routes here are *browser navigations*, so both must end in a redirect.
 *
 * The handlers already redirect on every branch they know about; this is the
 * backstop for anything they do not — a member mid-navigation can never end up
 * staring at a JSON error body or Express's default 500 page. The reason stays
 * in the server log, where a misconfiguration message naming missing
 * credentials is safe.
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

// GET /auth/linkedin/connect → 302 to LinkedIn's consent screen.
// A top-level browser navigation, so auth is optional at the middleware level:
// the user is resolved from the handoff cookie and the handler redirects to
// `status=failed` when there is no session to bind.
router.get(
  '/connect',
  attachUserIfPresent,
  handleRedirect((req, res) => linkedinProvider.connect(req, res)),
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
