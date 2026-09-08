import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { AiProviderError } from '../ai';
import { creativeGenerationService, CreativeError } from '../services/creative-generation.service';
import { CloudinaryUploadError } from '../services/cloudinary.service';
import { publicStyleLibrary } from '../ai/style-dna/style-dna';
import { brandIntelligenceService } from '../services/creative-brand-intelligence.service';
import { creativeIdempotencyService, IdempotencyInProgressError } from '../services/creative-idempotency.service';

/**
 * FlowPost's brand-native creative engine. Mounted at `/api/ai/creative`.
 *
 *   POST /concepts     3–5 quality-gated advertising ideas — no art direction, no image
 *   POST /direction   the "FlowPost understood" summary — no image generated
 *   POST /generate     runs the full pipeline (pass `selectedConcept` from /concepts to
 *                        execute a specific idea; omitted, auto-discovers and picks the strongest)
 *   POST /campaign      the same request fanned out into linked variations
 *                        (variationLabels, e.g. ["Hero","Product"]) sharing one campaignId
 *   POST /refine        natural-language edit of a previous asset
 *   GET  /history       this member's generation history for one scope
 *
 * Same thin-handler shape as `ai.routes.ts`: validation and orchestration
 * live in the service, the vendor call lives under `ai/providers`, and this
 * file only turns a request into a call and a result into JSON.
 */

const router = Router();

router.get('/styles', requireAuth, (_req, res) => {
  res.json({ styles: publicStyleLibrary() });
});

function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    // Correlation id: one per HTTP request, threaded through the service so
    // every stage log line can be tied back to the click that caused it —
    // and so two lines with different ids expose a duplicate frontend call.
    const requestId = randomUUID().slice(0, 8);
    res.locals.creativeRequestId = requestId;
    const startedAt = Date.now();
    console.info('[creative] request started', { requestId, method: req.method, path: req.path });
    try {
      await fn(req, res);
      console.info('[creative] request completed', { requestId, durationMs: Date.now() - startedAt });
    } catch (error: any) {
      const isKnown = error instanceof CreativeError
        || error instanceof AiProviderError
        || error instanceof CloudinaryUploadError
        || error?.name === 'CreativeError'
        || error?.name === 'AiProviderError'
        || error?.name === 'CloudinaryUploadError'
        || (typeof error?.status === 'number' && error?.message);

      if (isKnown) {
        const status = typeof error?.status === 'number' ? error.status : 502;
        console.error('[creative] request failed', {
          requestId,
          durationMs: Date.now() - startedAt,
          errorType: error?.name ?? 'Error',
          status,
          message: error?.message,
          detail: error?.detail,
        });
        res.status(status).json({ error: error?.message ?? 'Request failed' });
        return;
      }
      if (error instanceof IdempotencyInProgressError) { res.status(409).json({ error: error.message }); return; }

      console.error('[creative] request failed (unexpected)', {
        requestId,
        durationMs: Date.now() - startedAt,
        method: req.method,
        path: req.path,
        error: error instanceof Error ? `${error.name}: ${error.message}` : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ error: error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.' });
    }
  };
}

router.post(
  '/concepts',
  requireAuth,
  handle(async (req, res) => {
    const result = await creativeIdempotencyService.runIdempotent(req.user.id, 'concepts', req.header('Idempotency-Key'), () => creativeGenerationService.discoverConcepts(req.user.id, req.body));
    res.setHeader('X-Idempotency-Cache', result.cacheHit ? 'hit' : 'miss'); res.json(result.value);
  }),
);

router.post(
  '/direction',
  requireAuth,
  handle(async (req, res) => {
    const result = await creativeGenerationService.understand(req.user.id, req.body);
    res.json(result);
  }),
);

router.post(
  '/generate',
  requireAuth,
  handle(async (req, res) => {
    const result = await creativeIdempotencyService.runIdempotent(req.user.id, 'generate', req.header('Idempotency-Key'), () => creativeGenerationService.generate(req.user.id, req.body, res.locals.creativeRequestId));
    res.setHeader('X-Idempotency-Cache', result.cacheHit ? 'hit' : 'miss'); res.json(result.value);
  }),
);

router.post(
  '/campaign',
  requireAuth,
  handle(async (req, res) => {
    const assets = await creativeGenerationService.generateCampaign(req.user.id, req.body, res.locals.creativeRequestId);
    res.json({ assets });
  }),
);

router.post(
  '/refine',
  requireAuth,
  handle(async (req, res) => {
    const result = await creativeIdempotencyService.runIdempotent(req.user.id, 'refine', req.header('Idempotency-Key'), () => creativeGenerationService.refine(req.user.id, req.body, res.locals.creativeRequestId));
    res.setHeader('X-Idempotency-Cache', result.cacheHit ? 'hit' : 'miss'); res.json(result.value);
  }),
);

router.post(
  '/regenerate',
  requireAuth,
  handle(async (req, res) => {
    const result = await creativeIdempotencyService.runIdempotent(req.user.id, 'regenerate', req.header('Idempotency-Key'), () => creativeGenerationService.regenerate(req.user.id, req.body, res.locals.creativeRequestId));
    res.setHeader('X-Idempotency-Cache', result.cacheHit ? 'hit' : 'miss'); res.json(result.value);
  }),
);

router.post('/signal', requireAuth, handle(async (req, res) => {
  res.json(await creativeGenerationService.recordSignal(req.user.id, req.body));
}));

router.get('/brand-intelligence/:brandId', requireAuth, handle(async (req, res) => {
  res.json(await brandIntelligenceService.resolveBrandIntelligence(req.user.id, String(req.params.brandId)));
}));

router.post('/brand-intelligence/:brandId/preferences', requireAuth, handle(async (req, res) => {
  res.json(await brandIntelligenceService.setExplicitPreference(req.user.id, String(req.params.brandId), req.body ?? {}));
}));

router.get(
  '/history',
  requireAuth,
  handle(async (req, res) => {
    const assets = await creativeGenerationService.history(req.user.id, {
      contextType: typeof req.query.contextType === 'string' ? req.query.contextType : undefined,
      brandId: typeof req.query.brandId === 'string' ? req.query.brandId : undefined,
    });
    res.json({ assets });
  }),
);

export default router;
