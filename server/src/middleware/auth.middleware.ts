import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Initialize Supabase client with the Service Role key
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * The single way this API establishes who is calling: the Supabase access token
 * the SPA already holds, in an `Authorization: Bearer` header.
 *
 * The OAuth connect routes used to have a second way — a short-lived
 * `fp_oauth_session` cookie the SPA set just before a top-level navigation,
 * because a navigation cannot carry a header. That worked only while the API
 * shared a host with the app (`localhost`, where cookies ignore port). Once the
 * API moved to its own domain the cookie could never arrive: a cookie set by
 * the app host is not sent to the API host, and `onrender.com` is on the Public
 * Suffix List so no `Domain=` attribute can span the two. The connect routes
 * are now authenticated `fetch` calls that get the provider URL back as JSON,
 * so there is one credential path again and it is this one.
 *
 * ─── Fail closed ─────────────────────────────────────────────────────────────
 * A token is trusted in exactly two ways: its signature verifies against
 * `JWT_SECRET`, or Supabase Auth says it is valid. There is deliberately no
 * third path. An earlier version fell back to `jwt.decode` — which reads a
 * token without checking its signature — whenever Supabase was unreachable, so
 * anyone could forge a token for any user id by timing a Supabase outage. If
 * Supabase cannot be reached the answer is 503, never "come in".
 */
const SUPABASE_AUDIENCE = 'authenticated';

if (!env.JWT_SECRET) {
  console.warn(
    '[auth] JWT_SECRET is not set: every request will be validated remotely with Supabase Auth.',
  );
}

/** Reads the verified claims into the shape the rest of the API expects. */
function userFromClaims(decoded: jwt.JwtPayload) {
  return {
    ...decoded,
    id: decoded.sub,
    email: decoded.email,
    user_metadata: decoded.user_metadata,
    app_metadata: decoded.app_metadata,
    role: decoded.role,
  };
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Routers that mount this once for the whole router, and routes that also name
  // it themselves, must not pay for (or race) a second validation.
  if (req.user) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: No token provided' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: No token provided' });
    return;
  }

  // 1. Fast path: verify the signature locally if JWT_SECRET is available.
  if (env.JWT_SECRET) {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ['HS256'],
        audience: SUPABASE_AUDIENCE,
      });

      if (typeof decoded === 'object' && typeof decoded.sub === 'string' && decoded.sub) {
        req.user = userFromClaims(decoded);
        next();
        return;
      }
    } catch (err: any) {
      // An expired token stays expired; asking Supabase would not change that.
      if (err?.name === 'TokenExpiredError') {
        res.status(401).json({ error: 'Unauthorized: Token expired' });
        return;
      }
      // Anything else (wrong key, odd algorithm) falls through to Supabase,
      // which is the authority on whether the token is real.
    }
  }

  // 2. Remote validation with Supabase Auth.
  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      // `status` is set on genuine rejections from the auth server; its absence
      // means the request never got an answer (DNS, timeout, reset).
      const rejected = typeof (error as { status?: number } | null)?.status === 'number'
        && ((error as { status: number }).status >= 400 && (error as { status: number }).status < 500);

      if (error && !rejected) {
        console.error('[auth] Supabase Auth unreachable:', error.message);
        res.status(503).json({ error: 'Authentication service unavailable. Please try again.' });
        return;
      }

      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return;
    }

    req.user = data.user;
    next();
  } catch (error: any) {
    console.error('[auth] Supabase Auth call failed:', error?.message ?? error);
    res.status(503).json({ error: 'Authentication service unavailable. Please try again.' });
  }
};
