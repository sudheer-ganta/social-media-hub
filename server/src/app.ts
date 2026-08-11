import express from 'express';
import cors from 'cors';
import { env } from './config/env';

const app = express();

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
const allowedOrigins = (
  process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : [env.FRONTEND_URL, 'http://localhost:5173']
)
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  }),
);
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint so it doesn't show "Cannot GET /"
app.get('/', (req, res) => {
  res.json({ message: 'Flow Post API is running perfectly!' });
});

import { requireAuth } from './middleware/auth.middleware';

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

app.use('/api/ai', aiRoutes);

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

export default app;
