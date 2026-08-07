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
 * The cookie the SPA drops just before handing the browser to an OAuth connect
 * route. See {@link attachUserIfPresent} for why it exists.
 */
export const OAUTH_SESSION_COOKIE = 'fp_oauth_session';

/**
 * Minimal `Cookie:` header parser.
 *
 * Hand-rolled rather than pulling in cookie-parser: one middleware reads one
 * cookie, and a dependency added for that is a dependency to keep patched.
 */
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index === -1) continue;
    if (pair.slice(0, index).trim() === name) {
      return decodeURIComponent(pair.slice(index + 1).trim());
    }
  }
  return undefined;
}

/**
 * Expires the handoff cookie. Called by connect handlers as soon as they have
 * read a user out of it, so a one-hop credential does not linger for its full
 * TTL. `Max-Age=0` on the same name and path is what a browser needs to drop it.
 */
export function clearOAuthSessionCookie(res: Response): void {
  res.append(
    'Set-Cookie',
    `${OAUTH_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`,
  );
}

/**
 * Attaches `req.user` when the request carries a valid Supabase session, and
 * simply continues when it does not.
 *
 * Exists for the OAuth connect routes, which are **top-level browser
 * navigations** — the browser, not our code, issues the request, so no
 * `Authorization` header can ride along. Two fallbacks cover that:
 *
 *  1. the `Authorization` header, for anything called with `fetch`;
 *  2. the {@link OAUTH_SESSION_COOKIE}, a short-lived cookie the SPA sets
 *     immediately before navigating.
 *
 * The cookie carries the same Supabase access token already held in the
 * browser's localStorage, so it is no new class of exposure — and unlike a
 * `?token=` query parameter it never reaches an access log, the browser's
 * history, or a `Referer` header on the hop to LinkedIn.
 *
 * A bad or absent token is not an error here; the handler decides what an
 * anonymous request means.
 */
export const attachUserIfPresent = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : readCookie(req, OAUTH_SESSION_COOKIE);

  if (!token) {
    next();
    return;
  }

  try {
    const { data } = await supabase.auth.getUser(token);
    if (data?.user) req.user = data.user;
  } catch (error) {
    // Deliberately non-fatal: the route falls through to its anonymous path.
    console.error('[auth] optional token resolution failed', {
      error: error instanceof Error ? error.message : error,
    });
  }

  next();
};

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
