import express from 'express';
import cors from 'cors';
import { env } from './config/env';

const app = express();

app.use(cors());
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

app.use('/auth/linkedin', linkedinRoutes);

// Provider-agnostic read API for the Integrations page
import integrationsRoutes from './routes/integrations.routes';

app.use('/api/integrations', integrationsRoutes);

// Native AI generation. Replaces the Make.com scenario that used to sit
// between the browser and Gemini — see routes/ai.routes.ts.
import aiRoutes from './routes/ai.routes';

app.use('/api/ai', aiRoutes);

export default app;
