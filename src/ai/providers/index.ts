/**
 * Active AI provider.
 *
 * Current provider: the FlowPost Express backend, which calls Gemini
 * server-side. See `server/src/ai/` for the module and
 * `services/ai.service.ts` for the browser's side of the call.
 *
 * Switching models is a backend change — `AI_PROVIDER` plus a file in
 * `server/src/ai/providers/`. Nothing in the browser needs to know, which is
 * the point: a provider the browser could choose is a provider whose key the
 * browser would have to hold.
 */

export type { AIProvider } from "./base";

export const ACTIVE_PROVIDER_NAME = "FlowPost AI (server-side Gemini)";
export const ACTIVE_PROVIDER_IS_CLIENT_SIDE = false;
