import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { aiService, AiError, AiProviderError } from '../services/ai.service';

/**
 * The AI API. Mounted at `/api/ai`.
 *
 *   GET  /api/ai/status    is generation available on this server?
 *   POST /api/ai/caption   write captions for one post brief
 *
 * This router replaces the Make.com scenario that used to sit between the
 * browser and Gemini. The browser no longer writes a row and waits for a
 * webhook to write one back — it asks for a caption and gets one in the
 * response. Nothing here touches the database: the post is saved by the
 * existing posts API once the user is happy with what they read.
 *
 * Handlers stay thin. Validation lives in `services/ai.service.ts`, prompt
 * assembly in `ai/prompts`, and the vendor call in `ai/providers` — the API
 * key never travels further up than that last folder.
 */
const router = Router();

/**
 * Wraps a handler so a thrown {@link AiError} or {@link AiProviderError}
 * becomes its own status and message, and anything else becomes a generic 500.
 *
 * The split is the same one the integrations router makes, and for the same
 * reason: those two carry messages written for a member, while an unexpected
 * error's message can quote a vendor response or a request body. That one
 * stays in the log.
 */
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof AiError || error instanceof AiProviderError) {
        res.status(error.status).json({ error: error.message });
        return;
      }

      console.error('[ai] request failed', {
        method: req.method,
        path: req.path,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  };
}

// GET /api/ai/status → whether the server can generate, and with which model.
router.get(
  '/status',
  requireAuth,
  handle(async (_req, res) => {
    res.json(aiService.status());
  }),
);

// POST /api/ai/caption → captions, hashtags and per-platform versions.
//
// Synchronous by design. The Make pipeline was asynchronous because a webhook
// has nowhere to reply to; a request that owns its own response does not need
// a status column, a poll loop or a stall timeout, and the three of them go
// away with it.
router.post(
  '/caption',
  requireAuth,
  handle(async (req, res) => {
    const result = await aiService.generateCaption(req.user.id, req.body);
    res.json(result);
  }),
);

export default router;
