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

/** Everything. Generous for a person, hostile to a script. Always keyed by IP. */
export const globalLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? '')}`,
  skip: (req) => req.path === '/health',
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

/** Creative generation: multiple model calls and an image render per request. */
export const creativeLimiter = limiter({
  windowMs: 10 * MINUTE,
  limit: 20,
  message: 'You are generating creatives too quickly. Please wait a few minutes and try again.',
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
