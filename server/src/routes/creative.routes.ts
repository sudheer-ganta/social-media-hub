import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { AiProviderError } from '../ai';
import { creativeGenerationService, CreativeError } from '../services/creative-generation.service';
import { CloudinaryUploadError } from '../services/cloudinary.service';

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

function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof CreativeError || error instanceof AiProviderError || error instanceof CloudinaryUploadError) {
        const status = 'status' in error ? error.status : 502;
        res.status(status).json({ error: error.message });
        return;
      }

      console.error('[creative] request failed', {
        method: req.method,
        path: req.path,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  };
}

router.post(
  '/concepts',
  requireAuth,
  handle(async (req, res) => {
    const result = await creativeGenerationService.discoverConcepts(req.user.id, req.body);
    res.json(result);
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
    const asset = await creativeGenerationService.generate(req.user.id, req.body);
    res.json(asset);
  }),
);

router.post(
  '/campaign',
  requireAuth,
  handle(async (req, res) => {
    const assets = await creativeGenerationService.generateCampaign(req.user.id, req.body);
    res.json({ assets });
  }),
);

router.post(
  '/refine',
  requireAuth,
  handle(async (req, res) => {
    const asset = await creativeGenerationService.refine(req.user.id, req.body);
    res.json(asset);
  }),
);

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
