import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  PORT: process.env.PORT || 5000,
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  DATABASE_URL: process.env.DATABASE_URL || '',
  // Where OAuth callbacks send the browser when the dance finishes. Kept in
  // the environment so a deployed backend redirects to the deployed SPA.
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID || '',
  LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET || '',
  LINKEDIN_REDIRECT_URI: process.env.LINKEDIN_REDIRECT_URI || '',
  // The versioned REST surface LinkedIn's publishing API lives on, YYYYMM.
  //
  // In the environment because it *expires*: LinkedIn supports each monthly
  // version for a minimum of one year and then sunsets it, at which point
  // every publish starts failing with a deprecated-version error. Bumping a
  // deployed backend must not require a code change and a redeploy.
  LINKEDIN_API_VERSION: process.env.LINKEDIN_API_VERSION || '202607',
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY || '',

  // AI generation (Sprint 4.1). The Gemini key is read here and used only by
  // `src/ai/providers/gemini.provider.ts` — it is never returned by an
  // endpoint and never reaches the browser, which is the whole point of the
  // backend AI module replacing the Make.com scenario.
  AI_PROVIDER: process.env.AI_PROVIDER || 'gemini',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  // Thinking tokens for Gemini 2.5+. Default 0 — captions are a writing task,
  // and the reasoning pass triples latency for no gain. -1 lets the model
  // decide. Ignored by models that don't support it.
  GEMINI_THINKING_BUDGET: process.env.GEMINI_THINKING_BUDGET || '0',
};
