import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Request ceilings.
 *
 * Nothing used to stop a caller hammering the API, and the AI routes are the
 * expensive ones: every generation is a paid model call, so an unthrottled
 * member (or a stolen token) converts directly into a bill. Limits are per
 * authenticated user where there is one, and per IP otherwise.
 *
 * Counters are in memory, so each instance counts on its own. That is the right
 * trade for one Render dyno; a second instance would multiply the ceiling and
 * wants a shared store (Redis) behind `store:`.
 */

const MINUTE = 60 * 1000;

/** The user the request belongs to if auth already ran, else the client IP. */
function keyFor(req: Request): string {
  const userId = req.user?.id;
  if (typeof userId === 'string' && userId) return `user:${userId}`;
  return `ip:${ipKeyGenerator(req.ip ?? '')}`;
}

function limiter(options: {
  windowMs: number;
  limit: number;
  message: string;
  skip?: (req: Request) => boolean;
}) {
  return rateLimit({
    skip: options.skip,
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: keyFor,
    handler: (_req, res) => {
      res.status(429).json({ error: options.message });
    },
  });
}

/**
 * A creative job's status check. The browser polls every few seconds for as long
 * as a generation runs, so counting each poll would let one slow generation
 * exhaust a ceiling meant for people. It needs auth and only ever reveals the
 * caller's own job, so there is nothing here to farm.
 */
function isJobPoll(req: Request): boolean {
  return req.method === 'GET' && /^\/api\/ai\/creative\/jobs\/[\w-]+\/?$/.test(req.path);
}

/** Static, open-licence font files the editor previews: one fetch per file per browser, nothing to protect. */
function isFontFile(req: Request): boolean {
  return req.method === 'GET' && req.path.startsWith('/api/fonts/');
}

/** Everything. Generous for a person, hostile to a script. Always keyed by IP. */
export const globalLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? '')}`,
  skip: (req) => req.path === '/health' || isJobPoll(req) || isFontFile(req),
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests. Please slow down.' });
  },
});

/** Captions, hashtags, analysis. One model call each. */
export const aiLimiter = limiter({
  windowMs: 10 * MINUTE,
  limit: 40,
  // `/api/ai/creative` is mounted under `/api/ai` but has its own, tighter bucket.
  skip: (req) => req.originalUrl.startsWith('/api/ai/creative'),
  message: 'You are generating too quickly. Please wait a few minutes and try again.',
});

/**
 * The creative requests that START a generation, and so spend model calls: the
 * direct endpoints and `POST /jobs`. Everything else under `/api/ai/creative` is
 * deliberately not counted. A job's status poll, the history and style reads, a
 * "not for us" signal and a text edit cost no model call, and counting them is
 * what made one ordinary generation use up the whole allowance.
 */
const GENERATION_STARTS = /^\/api\/ai\/creative\/(jobs|concepts|direction|generate|campaign|refine|regenerate)\/?$/;

export function startsCreativeGeneration(req: Request): boolean {
  return req.method === 'POST' && GENERATION_STARTS.test(req.originalUrl.split('?')[0]);
}

/** Creative generation: multiple model calls and an image render per request. */
export const creativeLimiter = limiter({
  windowMs: 10 * MINUTE,
  limit: 20,
  skip: (req) => !startsCreativeGeneration(req),
  message: 'You are generating creatives too quickly. Please wait a few minutes and try again.',
});

/**
 * Text edits on a finished creative. They re-typeset an existing picture (no
 * model call), but still render and store an image, and a member trying fonts
 * and sizes legitimately sends many in a row.
 */
export const creativeEditLimiter = limiter({
  windowMs: 10 * MINUTE,
  limit: 120,
  message: 'You are editing too quickly. Please wait a minute and try again.',
});

/** Upload signatures. A busy composer asks once per file; this still stops farming. */
export const uploadSignLimiter = limiter({
  windowMs: 60 * MINUTE,
  limit: 120,
  message: 'Too many uploads. Please try again later.',
});

/** Anything that sends mail. */
export const emailLimiter = limiter({
  windowMs: 60 * MINUTE,
  limit: 10,
  message: 'Too many emails requested. Please try again later.',
});
