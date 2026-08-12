import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { analyticsQueryService } from '../services/analytics-query.service';
import { analyticsSyncService } from '../services/analytics-sync.service';
import {
  assertContextOwned,
  readContext,
  ContextError,
} from '../services/account-context';
import {
  AnalyticsQueryError,
  readIntelligenceWindow,
  readReportingDimension,
  scopeFor,
  type AnalyticsScope,
} from '../analytics/window';
import { isKnownProvider } from '../providers';
import { bestTimeService } from '../services/best-time.service';
import { brandIntelligenceService } from '../services/brand-intelligence.service';
import { MediaType } from '../generated/prisma/enums';

/**
 * The analytics API. Mounted at `/api/analytics`.
 *
 *   GET  /overview        lifetime or reporting-period totals
 *   GET  /timeseries      one metric bucketed by publish date
 *   GET  /by-platform     per-network performance, never blended
 *   GET  /by-media-type   per-format performance, over the intelligence window
 *   GET  /posts           every publication in the window, with real numbers
 *   GET  /sync-status     whether analytics can be read at all, per connection
 *   GET  /best-time       when this account's own posts have performed best
 *   GET  /brand-intelligence        the learned voice, themes and what worked
 *   POST /brand-intelligence/reset  forget the learned voice
 *   POST /sync            collect now
 *
 * ─── Scope is enforced here, before anything reads ───────────────────────────
 * Every handler resolves the publishing context from the query string and
 * proves the caller owns it — `assertContextOwned` 404s a brand id that is not
 * theirs — *before* a scope is constructed. Nothing downstream accepts a query
 * without one, so there is no path to an unscoped read even by mistake.
 *
 * This is deliberately not a filter the frontend applies. A `?brandId=` a
 * member does not own must be refused by the server; hiding rows in the browser
 * would leave the data one devtools request away.
 *
 * ─── Nothing here computes a number ──────────────────────────────────────────
 * Handlers resolve, delegate and serialize. Every metric in every response
 * either came from a network or is null. Absent values are returned as null and
 * are never coerced to 0 on the way out.
 */
const router = Router();

/**
 * Maps the two expected failure classes onto their own statuses, and everything
 * else onto a generic 500.
 *
 * Same split as the integrations router: a ContextError or AnalyticsQueryError
 * message is written for a member and safe to return. An unexpected error's
 * message can carry an upstream body or a connection string, and stays in the
 * log.
 */
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof ContextError || error instanceof AnalyticsQueryError) {
        res.status(error.status).json({ error: error.message });
        return;
      }

      console.error('[analytics] request failed', {
        method: req.method,
        path: req.path,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  };
}

/**
 * The ownership-checked scope for this request.
 *
 * Both halves matter and both run before any query: `readContext` refuses a
 * malformed brand context rather than defaulting it to Personal, and
 * `assertContextOwned` refuses one belonging to somebody else.
 */
async function requireScope(req: Request): Promise<AnalyticsScope> {
  const context = readContext(req.query);
  await assertContextOwned(req.user.id, context);
  return scopeFor(req.user.id, context);
}

/**
 * `?platforms=instagram,linkedin`, validated against the catalogue.
 *
 * A list rather than the single `?platform=` above because timing is answered
 * *per network*: the same post going to Instagram and LinkedIn has two best
 * times, and the composer needs both in one round trip. Empty means "every
 * network this scope has published to", which is what the analytics page wants.
 */
function readProviders(req: Request): string[] {
  const raw = req.query.platforms ?? req.query.providers;
  if (typeof raw !== 'string' || raw === '') return [];

  const requested = [
    ...new Set(
      raw
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  for (const provider of requested) {
    if (!isKnownProvider(provider)) {
      throw new AnalyticsQueryError(`Unknown platform: ${provider}`);
    }
  }

  if (requested.length > MAX_TIMING_PLATFORMS) {
    throw new AnalyticsQueryError(
      `No more than ${MAX_TIMING_PLATFORMS} platforms at a time.`,
    );
  }

  return requested;
}

/** The same ceiling the composer's platform list has. */
const MAX_TIMING_PLATFORMS = 8;

/**
 * `?format=REEL`, validated against the media-type vocabulary.
 *
 * `OTHER` is refused rather than accepted-and-ignored: it is an answer a network
 * gives about a published post, never a format a member plans to publish, so a
 * request naming it is a mistake worth reporting.
 */
function readFormat(req: Request): MediaType | null {
  const raw = req.query.format;
  if (typeof raw !== 'string' || raw === '') return null;

  const upper = raw.toUpperCase();
  if (upper === MediaType.OTHER || !(upper in MediaType)) {
    throw new AnalyticsQueryError(`Unknown format: ${raw}`);
  }
  return upper as MediaType;
}

/** `?platform=x`, validated against the catalogue. Absent means every network. */
function readProvider(req: Request): string | undefined {
  const raw = req.query.platform ?? req.query.provider;
  if (typeof raw !== 'string' || raw === '') return undefined;
  if (!isKnownProvider(raw)) {
    throw new AnalyticsQueryError(`Unknown platform: ${raw}`);
  }
  return raw;
}

// GET /api/analytics/overview → lifetime by default; ?days= or ?from=&to= for a
// reporting period. Never narrowed by the intelligence window — see
// `analytics/window.ts` on why the two must not share a parameter.
router.get(
  '/overview',
  requireAuth,
  handle(async (req, res) => {
    const scope = await requireScope(req);
    const dimension = readReportingDimension(req.query);
    const provider = readProvider(req);

    res.json(
      await analyticsQueryService.overview(scope, dimension, provider),
    );
  }),
);

// GET /api/analytics/timeseries?metric=impressions&days=90
router.get(
  '/timeseries',
  requireAuth,
  handle(async (req, res) => {
    const scope = await requireScope(req);
    const dimension = readReportingDimension(req.query);
    const provider = readProvider(req);

    const metric = String(req.query.metric ?? 'engagement');
    const allowed = [
      'impressions',
      'reach',
      'views',
      'likes',
      'comments',
      'shares',
      'reposts',
      'saves',
      'clicks',
      'videoViews',
      'watchTimeMs',
      'engagement',
    ] as const;

    const match = allowed.find((candidate) => candidate === metric);
    if (!match) {
      throw new AnalyticsQueryError(
        `metric must be one of ${allowed.join(', ')}.`,
      );
    }

    res.json({
      metric: match,
      points: await analyticsQueryService.timeseries(
        scope,
        dimension,
        match,
        provider,
      ),
    });
  }),
);

// GET /api/analytics/by-platform → reporting dimension, because comparing
// networks is a reporting question rather than a "what is working lately" one.
router.get(
  '/by-platform',
  requireAuth,
  handle(async (req, res) => {
    const scope = await requireScope(req);
    const dimension = readReportingDimension(req.query);

    res.json({ platforms: await analyticsQueryService.byPlatform(scope, dimension) });
  }),
);

// GET /api/analytics/by-media-type?window=20 → the intelligence window, because
// "which format works" is a question about now.
router.get(
  '/by-media-type',
  requireAuth,
  handle(async (req, res) => {
    const scope = await requireScope(req);
    const window = readIntelligenceWindow(req.query);
    const provider = readProvider(req);

    res.json({
      window: window.size,
      mediaTypes: await analyticsQueryService.byMediaType(scope, window, provider),
    });
  }),
);

// GET /api/analytics/posts?window=20 → the row-level feed.
router.get(
  '/posts',
  requireAuth,
  handle(async (req, res) => {
    const scope = await requireScope(req);
    const window = readIntelligenceWindow(req.query);
    const provider = readProvider(req);

    res.json({
      window: window.size,
      posts: await analyticsQueryService.posts(scope, window, provider),
    });
  }),
);

// GET /api/analytics/posts/:postId → one post, everywhere it went.
//
// Deliberately one endpoint rather than the four the brief sketches
// (`/platforms`, `/media`, `/timeseries`). They would all read the same post
// through the same ownership check and return slices of one object; four round
// trips to draw one screen is a cost with no reader. The payload carries the
// platform rows, each publication's full snapshot history, the media assets and
// the media-level capability note.
//
// Lifetime by construction: a single post's history is never narrowed by the
// intelligence window. See `analytics/window.ts` on why the two dimensions do
// not share a parameter.
router.get(
  '/posts/:postId',
  requireAuth,
  handle(async (req, res) => {
    const scope = await requireScope(req);
    const postId = String(req.params.postId ?? '');

    const detail = await analyticsQueryService.postDetail(scope, postId);

    // One answer for "no such post" and "not yours" — deliberately
    // indistinguishable, so this cannot be used to probe for post ids.
    if (!detail) {
      res.status(404).json({ error: 'That post could not be found.' });
      return;
    }

    res.json(detail);
  }),
);

// GET /api/analytics/sync-status → what can be read, and what needs reconnecting.
router.get(
  '/sync-status',
  requireAuth,
  handle(async (req, res) => {
    const scope = await requireScope(req);
    res.json({ connections: await analyticsQueryService.syncStatus(scope) });
  }),
);

// GET /api/analytics/best-time → when this account's own posts performed best.
//
// A GET, and cheap: one lifetime read of publications already stored plus pure
// arithmetic. It spends no third-party call and writes nothing, which is what
// separates it from /sync above.
//
// `?platforms=` names the networks (each answered independently — the same post
// has a different best time on Instagram and LinkedIn), `?format=` the content
// type being planned, and `?timezone=` the zone the member is scheduling in
// right now. That last one is a *hint*: the server validates it and falls back
// to the zone the member's own posts recorded, because a recommendation
// expressed in the wrong clock is worse than none.
//
// Nothing here can fail a composer. A scope with no history answers 200 with
// `confidence: 'none'` and a sentence saying so.
router.get(
  '/best-time',
  requireAuth,
  handle(async (req, res) => {
    const scope = await requireScope(req);
    const timezone = typeof req.query.timezone === 'string' ? req.query.timezone : null;

    res.json(
      await bestTimeService.bestTimes(scope, {
        providers: readProviders(req),
        format: readFormat(req),
        timezone,
      }),
    );
  }),
);

// GET /api/analytics/brand-intelligence → what FlowPost has worked out about
// how this context writes, and what has performed.
//
// On this router rather than beside the other AI endpoints for one reason:
// `requireScope` lives here, and this endpoint must refuse a brand the caller
// does not own. `/api/ai/*` has no context ownership check because nothing there
// needs one — every read it makes is already filtered by user id.
//
// Informational. Nothing here is an input to generation; the generator reads the
// same profile directly, so a member who never opens this screen loses nothing.
router.get(
  '/brand-intelligence',
  requireAuth,
  handle(async (req, res) => {
    const scope = await requireScope(req);
    res.json(await brandIntelligenceService.brandIntelligenceView(scope));
  }),
);

// POST /api/analytics/brand-intelligence/reset → forget the learned voice.
//
// A POST because it deletes. Only the *derived* profile goes: the posts it was
// built from stay, so the next generation rebuilds from the same history. That is
// what a reset should do — clear a reading the member thinks is wrong, not erase
// their back catalogue.
router.post(
  '/brand-intelligence/reset',
  requireAuth,
  handle(async (req, res) => {
    const scope = await requireScope(req);
    res.json(await brandIntelligenceService.resetLearning(scope));
  }),
);

// POST /api/analytics/sync → collect now, for this context only.
//
// A POST because it writes, and because it spends metered third-party API
// calls — X charges per post read. It must never be cached, prefetched or
// issued by a GET a browser might repeat.
router.post(
  '/sync',
  requireAuth,
  handle(async (req, res) => {
    const scope = await requireScope(req);
    const provider = readProvider(req);

    // `force` skips the pacing and failure-backoff gates, because a member is
    // waiting for an answer. It does not skip the network's rate-limit
    // stand-down, and it does not skip the per-post cadence — re-reading a post
    // observed twenty minutes ago spends a metered request to produce a
    // snapshot that collides with the one already stored.
    res.json(
      await analyticsSyncService.syncContext(scope, {
        ...(provider ? { provider } : {}),
        force: true,
      }),
    );
  }),
);

export default router;
