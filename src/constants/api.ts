/**
 * Where the Express backend lives.
 *
 * Its own module because more than one feature needs it now: the integrations
 * API, and — since Sprint 4.1 — the AI API. `constants/integrations.ts`
 * re-exports it so nothing that already imported it from there had to change.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.PROD
    ? "https://social-media-hub-2pdl.onrender.com"
    : "http://localhost:5000");
