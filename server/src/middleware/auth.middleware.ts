import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
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
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: No token provided' });
    return;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      console.error('Supabase Auth Error:', error?.message);
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return;
    }

    req.user = data.user;
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
