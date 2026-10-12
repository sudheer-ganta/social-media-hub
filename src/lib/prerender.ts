/**
 * Build-time prerendering support.
 *
 * Public pages are rendered to static HTML at build time (see scripts/prerender.ts)
 * and hydrated in the browser. For the homepage to hydrate cleanly, the first
 * client render at "/" has to match that HTML even though Supabase has not yet
 * said whether anyone is signed in.
 */
let hydrating = false;

/** Called by main.tsx just before hydrating a prerendered page. */
export function markHydrating(): void {
  hydrating = true;
}

/** True on the server (prerender) and during the first hydration pass in the browser. */
export function showsPrerenderedLanding(): boolean {
  return typeof window === "undefined" || hydrating;
}
