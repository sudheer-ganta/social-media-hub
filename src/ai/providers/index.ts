/**
 * Active AI provider export.
 *
 * Current provider: Make.com (server-side, no API key in browser).
 *
 * To switch providers:
 *   1. Create a new provider file (e.g. openai.ts, gemini-direct.ts)
 *   2. Import and export it here
 *   3. No UI component changes needed
 *
 * Example future providers:
 *   - gemini-direct.ts  — calls Gemini from browser (user supplies own key)
 *   - openai.ts         — calls OpenAI from browser
 *   - edge-function.ts  — calls a Supabase Edge Function (adds a proxy layer)
 */

export type { AIProvider } from "./base";

// The Make.com provider is implicit — triggering generation means writing
// ai_studio_input + ai_status = "generating" to Supabase.
// Make.com's DB webhook fires and runs the Gemini pipeline.
// useAiGenerate.ts implements this directly via postsService.

export const ACTIVE_PROVIDER_NAME = "Make.com (Server-side Gemini)";
export const ACTIVE_PROVIDER_IS_CLIENT_SIDE = false;
