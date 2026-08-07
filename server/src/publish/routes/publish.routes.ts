import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { publishController } from '../controllers/publish.controller';
import { PublishError } from '../services/publish.service';

/**
 * The publish API. Mounted at `/api/posts`.
 *
 *   POST /api/posts/:postId/publish   send a draft to a network
 *   GET  /api/posts/:postId/publish   where it stands on each network
 *
 * Both require a real session. Unlike the OAuth routes — which are browser
 * navigations and therefore have to redirect — these are `fetch` calls from the
 * SPA, so they answer with JSON and a status code.
 *
 * Note what is *not* here: no route that takes a caption. The server publishes
 * what is stored on the post, which means the browser cannot ask us to post
 * arbitrary text to someone's LinkedIn feed with a post id it happens to own.
 */
const router = Router();

/**
 * Wraps a handler so a thrown {@link PublishError} becomes its own status and
 * message, and anything else becomes a generic 500.
 *
 * The same split the integrations and AI routers make: a PublishError message
 * is written for a member and is safe to return, while an unexpected error's
 * message can quote a provider response or a connection string. That one stays
 * in the log — which is the whole point of the mapping in the publish service.
 */
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof PublishError) {
        res.status(error.status).json({ error: error.message });
        return;
      }

      console.error('[publish] request failed', {
        method: req.method,
        path: req.path,
        error: error instanceof Error ? error.message : error,
      });
      res
        .status(500)
        .json({ error: 'Something went wrong. Please try again.' });
    }
  };
}

router.post(
  '/:postId/publish',
  requireAuth,
  handle(publishController.publish),
);

router.get(
  '/:postId/publish',
  requireAuth,
  handle(publishController.status),
);

export default router;
