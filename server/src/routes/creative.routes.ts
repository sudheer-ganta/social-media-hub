import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { UserFacingError } from '../utils/user-facing-error';
import { ContextError } from '../services/account-context';
import { AiProviderError } from '../ai';
import { creativeGenerationService, CreativeError } from '../services/creative-generation.service';
import { CloudinaryUploadError } from '../services/cloudinary.service';
import { publicStyleLibrary } from '../ai/style-dna/style-dna';
import { brandIntelligenceService } from '../services/creative-brand-intelligence.service';
import { creativeIdempotencyService, IdempotencyInProgressError } from '../services/creative-idempotency.service';
import { getJob, startJob, TooManyJobsError, type JobFailure } from '../services/creative-jobs.service';
import { billingService } from '../services/billing.service';

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
 *   POST /jobs          starts any of the slow calls above in the background and
 *                        answers at once with a job id: the browser polls rather
 *                        than holding one request open for minutes
 *   GET  /jobs/:id      that job's state, and its result when it is done
 *   GET  /text/:id      the lines on a finished creative that can be reworded in place
 *   POST /retype        reword those lines WITHOUT regenerating the picture
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

/**
 * What the member is told for an error, and the HTTP status that goes with it.
 * Known failures carry their own member-facing message; anything else is
 * answered generically, because an unexpected error can quote a query, a vendor
 * response or a connection string. The detail belongs in the log.
 */
function describeError(error: any): JobFailure & { known: boolean } {
  const isKnown = error instanceof CreativeError
    || error instanceof AiProviderError
    || error instanceof CloudinaryUploadError
    || error?.name === 'CreativeError'
    || error?.name === 'AiProviderError'
    || error?.name === 'CloudinaryUploadError'
    || error instanceof UserFacingError
    || error instanceof ContextError;
  if (isKnown) {
    return { known: true, status: typeof error?.status === 'number' ? error.status : 502, message: error?.message ?? 'Request failed' };
  }
  if (error instanceof IdempotencyInProgressError) return { known: true, status: 409, message: error.message };
  if (error instanceof TooManyJobsError) return { known: true, status: error.status, message: error.message };
  return { known: false, status: 500, message: 'Something went wrong. Please try again.' };
}

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
      const described = describeError(error);
      if (described.known) {
        console.error('[creative] request failed', {
          requestId,
          durationMs: Date.now() - startedAt,
          errorType: error?.name ?? 'Error',
          status: described.status,
          message: error?.message,
          detail: error?.detail,
        });
        res.status(described.status).json({ error: described.message });
        return;
      }

      console.error('[creative] request failed (unexpected)', {
        requestId,
        durationMs: Date.now() - startedAt,
        method: req.method,
        path: req.path,
        error: error instanceof Error ? `${error.name}: ${error.message}` : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(described.status).json({ error: described.message });
    }
  };
}

router.post(
  '/concepts',
  requireAuth,
  handle(async (req, res) => {
    const result = await creativeIdempotencyService.runIdempotent(req.user.id, 'concepts', req.header('Idempotency-Key'), () => billingService.metered(req.user.id, 'concepts', res.locals.creativeRequestId, () => creativeGenerationService.discoverConcepts(req.user.id, req.body)));
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
    const result = await creativeIdempotencyService.runIdempotent(req.user.id, 'generate', req.header('Idempotency-Key'), () => billingService.metered(req.user.id, 'generate', res.locals.creativeRequestId, () => creativeGenerationService.generate(req.user.id, req.body, res.locals.creativeRequestId)));
    res.setHeader('X-Idempotency-Cache', result.cacheHit ? 'hit' : 'miss'); res.json(result.value);
  }),
);

router.post(
  '/campaign',
  requireAuth,
  handle(async (req, res) => {
    const labels = (req.body as { variationLabels?: unknown } | undefined)?.variationLabels;
    const variations = Array.isArray(labels) ? labels.length : 2;
    const assets = await billingService.metered(
      req.user.id, 'campaignVariation', res.locals.creativeRequestId,
      () => creativeGenerationService.generateCampaign(req.user.id, req.body, res.locals.creativeRequestId),
      variations,
    );
    res.json({ assets });
  }),
);

router.post(
  '/refine',
  requireAuth,
  handle(async (req, res) => {
    const result = await creativeIdempotencyService.runIdempotent(req.user.id, 'refine', req.header('Idempotency-Key'), () => billingService.metered(req.user.id, 'refine', res.locals.creativeRequestId, () => creativeGenerationService.refine(req.user.id, req.body, res.locals.creativeRequestId)));
    res.setHeader('X-Idempotency-Cache', result.cacheHit ? 'hit' : 'miss'); res.json(result.value);
  }),
);

router.post(
  '/regenerate',
  requireAuth,
  handle(async (req, res) => {
    const result = await creativeIdempotencyService.runIdempotent(req.user.id, 'regenerate', req.header('Idempotency-Key'), () => billingService.metered(req.user.id, 'regenerate', res.locals.creativeRequestId, () => creativeGenerationService.regenerate(req.user.id, req.body, res.locals.creativeRequestId)));
    res.setHeader('X-Idempotency-Cache', result.cacheHit ? 'hit' : 'miss'); res.json(result.value);
  }),
);

router.get(
  '/text/:assetId',
  requireAuth,
  handle(async (req, res) => {
    res.json(await creativeGenerationService.editableText(req.user.id, String(req.params.assetId)));
  }),
);

router.post(
  '/retype',
  requireAuth,
  handle(async (req, res) => {
    const result = await creativeIdempotencyService.runIdempotent(req.user.id, 'retype', req.header('Idempotency-Key'), () => creativeGenerationService.retype(req.user.id, req.body, res.locals.creativeRequestId));
    res.setHeader('X-Idempotency-Cache', result.cacheHit ? 'hit' : 'miss'); res.json(result.value);
  }),
);

/**
 * The slow calls, runnable as background jobs. Each runs the SAME service call
 * (and the same idempotency wrapper) as its direct endpoint, so a job and a
 * direct request can never disagree about what a call does.
 */
const JOB_KINDS: Record<string, (userId: string, payload: unknown, requestId: string, idempotencyKey?: string) => Promise<unknown>> = {
  concepts: async (userId, payload, requestId, key) =>
    (await creativeIdempotencyService.runIdempotent(userId, 'concepts', key, () => billingService.metered(userId, 'concepts', requestId, () => creativeGenerationService.discoverConcepts(userId, payload)))).value,
  generate: async (userId, payload, requestId, key) =>
    (await creativeIdempotencyService.runIdempotent(userId, 'generate', key, () => billingService.metered(userId, 'generate', requestId, () => creativeGenerationService.generate(userId, payload, requestId)))).value,
  refine: async (userId, payload, requestId, key) =>
    (await creativeIdempotencyService.runIdempotent(userId, 'refine', key, () => billingService.metered(userId, 'refine', requestId, () => creativeGenerationService.refine(userId, payload, requestId)))).value,
  regenerate: async (userId, payload, requestId, key) =>
    (await creativeIdempotencyService.runIdempotent(userId, 'regenerate', key, () => billingService.metered(userId, 'regenerate', requestId, () => creativeGenerationService.regenerate(userId, payload, requestId)))).value,
  retype: async (userId, payload, requestId, key) =>
    (await creativeIdempotencyService.runIdempotent(userId, 'retype', key, () => creativeGenerationService.retype(userId, payload, requestId))).value,
};

router.post(
  '/jobs',
  requireAuth,
  handle(async (req, res) => {
    const { kind, payload } = (req.body ?? {}) as { kind?: unknown; payload?: unknown };
    const run = typeof kind === 'string' ? JOB_KINDS[kind] : undefined;
    if (!run || typeof kind !== 'string') {
      res.status(400).json({ error: 'That kind of request cannot run in the background.' });
      return;
    }
    const userId = req.user.id;
    const requestId = res.locals.creativeRequestId as string;
    const idempotencyKey = req.header('Idempotency-Key') || undefined;
    const startedAt = Date.now();

    const jobId = startJob(
      userId,
      kind,
      async () => {
        const result = await run(userId, payload, requestId, idempotencyKey);
        console.info('[creative] job completed', { requestId, kind, durationMs: Date.now() - startedAt });
        return result;
      },
      (error: any) => {
        const described = describeError(error);
        console.error('[creative] job failed', {
          requestId,
          kind,
          durationMs: Date.now() - startedAt,
          status: described.status,
          known: described.known,
          message: error?.message,
          detail: error?.detail,
          ...(described.known ? {} : { stack: error instanceof Error ? error.stack : undefined }),
        });
        return { status: described.status, message: described.message };
      },
      idempotencyKey,
    );
    res.status(202).json({ jobId });
  }),
);

router.get(
  '/jobs/:jobId',
  requireAuth,
  handle(async (req, res) => {
    const job = getJob(req.user.id, String(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: 'This request is no longer available. Please try again.' });
      return;
    }
    res.json(job);
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
