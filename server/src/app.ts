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

import { requireAuth } from './middleware/auth.middleware';

// Protected endpoint to test auth middleware
app.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});


export default app;
