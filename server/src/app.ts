import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { requireAuth } from './middleware/auth.middleware';
import { globalLimiter, aiLimiter, creativeLimiter } from './middleware/rate-limit.middleware';

const app = express();

// Render (and most hosts) terminate TLS at one proxy hop. Without this `req.ip` is
// the proxy's address and every client shares a single rate-limit bucket.
// Set TRUST_PROXY=0 when running without a proxy in front.
app.set('trust proxy', process.env.TRUST_PROXY === '0' ? false : 1);

// Security headers. This is a JSON API, so the page-oriented defaults (CSP,
// frame-ancestors, nosniff, no referrer, HSTS) are all free hardening: nothing
// here is ever meant to be rendered or framed. `cross-origin` resource policy
// because the SPA lives on a different origin and reads these responses.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

/**
 * CORS, with credentials.
 *
 * `cors()` with no options answers `Access-Control-Allow-Origin: *` and no
 * `Allow-Credentials`, under which the browser **discards** the `Set-Cookie` on
 * the `/connect` response — which is where the OAuth state now lives. A
 * wildcard origin and credentials are also mutually exclusive by spec, so the
 * allowed origins have to be named.
 *
 * The list comes from the environment: `CORS_ORIGINS` (comma-delimited) if set,
 * otherwise the deployed SPA (`FRONTEND_URL`) plus the Vite dev server. A
 * request with no `Origin` header — server-to-server, health checks, and the
 * provider redirects that land on `/callback` — is allowed through, because
 * there is no origin to police and no cookie for a browser to withhold.
 */
const isProduction = process.env.NODE_ENV === 'production';

/** https://userally.in or any subdomain of it. Parsed, not pattern-matched. */
function isOwnDomain(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'userally.in' || url.hostname.endsWith('.userally.in'))
    );
  } catch {
    return false;
  }
}

const defaultAllowed = [
  env.FRONTEND_URL,
  'https://userally.in',
  'https://www.userally.in',
  // Dev servers. In production a page on someone's own localhost has no business
  // making credentialed calls to the API.
  ...(isProduction ? [] : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5000']),
];

const envAllowed = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)
  : [];

const allowedOrigins = Array.from(new Set([...defaultAllowed, ...envAllowed]))
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) {
        callback(null, true);
        return;
      }
      
      const normalized = origin.trim().replace(/\/$/, '');
      // Deliberately no `*.vercel.app` wildcard: anyone can deploy a site to that
      // domain, and with `credentials: true` an attacker's page there could call
      // this API as the visitor. A Vercel deployment that needs access is listed
      // by exact origin in `FRONTEND_URL` or `CORS_ORIGINS`.
      const isAllowed =
        allowedOrigins.includes(normalized) ||
        isOwnDomain(normalized) ||
        (!isProduction && /^http:\/\/localhost(:\d+)?$/.test(normalized));

      if (isAllowed) {
        callback(null, true);
      } else {
        // Return false without throwing error so CORS fails gracefully without 500
        callback(null, false);
      }
    },
    credentials: true,
  }),
);
app.use(express.json());

// Ceiling on everything, before any route does work.
app.use(globalLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint so it doesn't show "Cannot GET /"
app.get('/', (req, res) => {
  res.json({ message: 'Flow Post API is running perfectly!' });
});

// Protected endpoint to test auth middleware
app.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// OAuth connect routes, one router per provider
import linkedinRoutes from './routes/linkedin.routes';
import instagramRoutes from './routes/instagram.routes';
import facebookRoutes from './routes/facebook.routes';
import xRoutes from './routes/x.routes';

app.use('/auth/linkedin', linkedinRoutes);
app.use('/auth/instagram', instagramRoutes);
app.use('/auth/facebook', facebookRoutes);
app.use('/auth/x', xRoutes);

// Provider-agnostic read API for the Integrations page
import integrationsRoutes from './routes/integrations.routes';

app.use('/api/integrations', integrationsRoutes);

// Native AI generation. Replaces the Make.com scenario that used to sit
// between the browser and Gemini — see routes/ai.routes.ts.
import aiRoutes from './routes/ai.routes';

// Authenticate first so the limiter can count per user rather than per IP.
// `requireAuth` is a no-op the second time a route names it.
app.use('/api/ai/creative', requireAuth, creativeLimiter);
app.use('/api/ai', requireAuth, aiLimiter);
app.use('/api/ai', aiRoutes);

// FlowPost's brand-native creative engine — natural language + brand identity
// + user assets in, an on-brand generated image out. See routes/creative.routes.ts.
import creativeRoutes from './routes/creative.routes';

app.use('/api/ai/creative', creativeRoutes);

import creativeHistoryRoutes from './routes/creative-history.routes';
app.use('/api/creative', creativeHistoryRoutes);

// Publishing. The browser never talks to LinkedIn — it asks this router to
// send a post it already owns, and the provider layer does the rest.
// See publish/routes/publish.routes.ts.
import publishRoutes from './publish/routes/publish.routes';

app.use('/api/posts', publishRoutes);

// Scheduled publishing. Arms a saved post; the worker in
// `scheduler/scheduler.worker.ts` fires it and calls the same publish service
// the router above does. See scheduler/scheduled-posts.routes.ts.
import scheduledPostsRoutes from './scheduler/scheduled-posts.routes';

app.use('/api/scheduled-posts', scheduledPostsRoutes);

// Real analytics. The browser never calls Instagram, Facebook, X or LinkedIn
// for metrics — it reads what the sync service already collected and stored,
// scoped to one publishing context that this router proves the caller owns.
// See routes/analytics.routes.ts.
import analyticsRoutes from './routes/analytics.routes';

app.use('/api/analytics', analyticsRoutes);

// Signed direct-to-Cloudinary uploads (replaces the public unsigned preset).
import uploadsRoutes from './routes/uploads.routes';

app.use('/api/uploads', uploadsRoutes);

// SMTP / Email service routes (test connection, notifications, digests, verification)
import emailRoutes from './routes/email.routes';

app.use('/api/email', emailRoutes);

export default app;

