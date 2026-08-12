import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { aiService, AiError, AiProviderError } from '../services/ai.service';

/**
 * The AI API. Mounted at `/api/ai`.
 *
 *   GET  /api/ai/status    is generation available on this server?
 *   POST /api/ai/caption   write captions for one post brief
 *   POST /api/ai/analyse   score a caption before it is published
 *   POST /api/ai/hashtags  choose hashtags for the caption as it stands
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

// POST /api/ai/analyse → reach score, checklist, forecast and improvements.
//
// Separate from /caption because it answers a different question about a
// different caption. /caption writes; this judges whatever is in the editor
// now, which after two minutes of editing is not what /caption returned.
//
// Nothing is stored. The result goes back to the browser, which folds it into
// the studio envelope and saves it with the post like every other section.
router.post(
  '/analyse',
  requireAuth,
  handle(async (req, res) => {
    const analysis = await aiService.analyseCaption(req.user.id, req.body);
    res.json(analysis);
  }),
);

// POST /api/ai/improve → one targeted fix for one check the analysis flagged.
//
// Separate from /caption because it answers a much narrower question: /caption
// writes a post, this repairs a named part of one and leaves the rest alone.
// Nothing is stored and nothing is applied — the browser shows the proposal and
// the member chooses whether their caption changes.
router.post(
  '/improve',
  requireAuth,
  handle(async (req, res) => {
    const improvement = await aiService.improveCaption(req.user.id, req.body);
    res.json(improvement);
  }),
);

// POST /api/ai/hashtags → hashtags chosen for the caption that will publish.
//
// Separate from /caption because it answers a different question about a
// different text. /caption writes copy and returns a set of tags with it; this
// chooses tags for whatever is in the editor now — which after two minutes of
// editing is not what /caption returned — and can be re-run without rewriting
// the post.
//
// An empty result is a success. Some posts read worse with hashtags, and the
// response says so in `note` rather than returning a filler set.
router.post(
  '/hashtags',
  requireAuth,
  handle(async (req, res) => {
    const result = await aiService.generateHashtags(req.user.id, req.body);
    res.json(result);
  }),
);

// POST /api/ai/caption/feedback → what the member did with the suggestions.
//
// Fire-and-forget, and answers 204 whatever happens. This records a hint about
// how somebody writes; there is no outcome the browser can act on, and a
// failure here must not turn a successful "use this caption" click into an
// error toast about a mechanism the member does not know exists.
//
// Only two events come through here — a selection, and a regenerate. Everything
// else style memory learns is derived from the post row itself, which is why
// this endpoint is as small as it is. See `ai/style/signals.ts`.
router.post(
  '/caption/feedback',
  requireAuth,
  handle(async (req, res) => {
    await aiService.recordCaptionFeedback(req.user.id, req.body);
    res.status(204).end();
  }),
);

// The American spelling, for the same handler. Every other identifier in this
// codebase is British ("analyse", "normalise"), and a client that guesses the
// other spelling should get an analysis rather than a 404.
router.post(
  '/analyze',
  requireAuth,
  handle(async (req, res) => {
    const analysis = await aiService.analyseCaption(req.user.id, req.body);
    res.json(analysis);
  }),
);

export default router;
