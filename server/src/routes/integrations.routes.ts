import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  integrationService,
  IntegrationError,
} from '../services/integration.service';
import {
  assertContextOwned,
  readContext,
  ContextError,
  type AccountContext,
} from '../services/account-context';
import { isKnownProvider } from '../providers';
import type { ProviderId } from '../providers';

/**
 * The integrations API. Mounted at `/api/integrations`.
 *
 * Provider-agnostic on purpose: the frontend asks one question — "what is
 * connected?" — and gets one answer covering every network in the catalogue,
 * including the ones that are not built yet. Bringing Instagram online is a
 * catalogue entry plus a provider implementation; neither this router nor the
 * UI that reads it changes.
 *
 *   GET    /api/integrations                    every network and its state
 *   GET    /api/integrations/activity           the activity timeline
 *   GET    /api/integrations/:provider          one network
 *   POST   /api/integrations/:provider/refresh  verify the connection
 *   DELETE /api/integrations/:provider          disconnect
 *
 * Connecting is still a browser navigation to `/auth/{provider}/connect` —
 * that is what OAuth requires, and it is unchanged from Sprint 3.2.
 *
 * Handlers stay thin: resolve the provider, call the service, serialize. All
 * judgement lives in `services/integration.service.ts`.
 */
const router = Router();

/**
 * Wraps a handler so a thrown {@link IntegrationError} becomes its own status
 * and message, and anything else becomes a generic 500.
 *
 * The split matters: an IntegrationError message is written for a member and is
 * safe to return, while an unexpected error's message is not — it can carry a
 * provider's response or a connection string. That one stays in the log.
 */
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof IntegrationError || error instanceof ContextError) {
        res.status(error.status).json({ error: error.message });
        return;
      }

      console.error('[integrations] request failed', {
        method: req.method,
        path: req.path,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  };
}

/**
 * Validates `:provider` against the catalogue before it reaches the service.
 *
 * A 404 for an unknown network rather than a 400: the member asked for a
 * resource that does not exist. It also means an arbitrary path segment can
 * never reach a repository query.
 */
function requireProvider(req: Request): ProviderId {
  // Express types a route param as string | string[]. A single `:provider`
  // segment is always a string at runtime; the guard is for the type system,
  // and an array would fail the catalogue check below regardless.
  const provider = String(req.params.provider ?? '');
  if (!isKnownProvider(provider)) {
    throw new IntegrationError(`Unknown provider: ${provider}`, 404);
  }
  return provider;
}

/**
 * The publishing context this request is scoped to, ownership-checked.
 *
 * Every account-shaped endpoint takes it from the query string
 * (`?context=brand&brandId=…`; absent means Personal), because with contexts
 * a provider name alone no longer identifies a connection — the same user can
 * hold a personal and a brand LinkedIn at once.
 */
async function requireContext(req: Request): Promise<AccountContext> {
  const context = readContext(req.query);
  await assertContextOwned(req.user.id, context);
  return context;
}

// GET /api/integrations → every catalogued network plus its connection,
// scoped to one publishing context.
router.get(
  '/',
  requireAuth,
  handle(async (req, res) => {
    const integrations = await integrationService.listIntegrations(
      req.user.id,
      await requireContext(req),
    );
    res.json({ integrations });
  }),
);

// GET /api/integrations/activity → the timeline, newest first.
// Registered before `/:provider` so "activity" is never read as a network name.
router.get(
  '/activity',
  requireAuth,
  handle(async (req, res) => {
    const providerParam = req.query.provider;
    const provider =
      typeof providerParam === 'string' && isKnownProvider(providerParam)
        ? providerParam
        : undefined;

    const limit = Number.parseInt(String(req.query.limit ?? ''), 10);

    const events = await integrationService.listActivity(req.user.id, {
      ...(provider && { provider }),
      ...(Number.isFinite(limit) && { limit }),
    });
    res.json({ events });
  }),
);

// GET /api/integrations/:provider → one network's card.
router.get(
  '/:provider',
  requireAuth,
  handle(async (req, res) => {
    const integration = await integrationService.getIntegration(
      req.user.id,
      requireProvider(req),
      await requireContext(req),
    );
    res.json({ integration });
  }),
);

// POST /api/integrations/:provider/refresh → check the connection's health.
// A POST, not a GET: it writes — status, timestamps and an audit row — and must
// never be cached or prefetched.
router.post(
  '/:provider/refresh',
  requireAuth,
  handle(async (req, res) => {
    const result = await integrationService.refreshConnection(
      req.user.id,
      requireProvider(req),
      await requireContext(req),
    );
    res.json(result);
  }),
);

// DELETE /api/integrations/:provider → disconnect and delete the tokens,
// for one context only — a brand disconnect never touches the personal row.
router.delete(
  '/:provider',
  requireAuth,
  handle(async (req, res) => {
    const result = await integrationService.disconnectIntegration(
      req.user.id,
      requireProvider(req),
      await requireContext(req),
    );
    res.json(result);
  }),
);

export default router;
