import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App, { preloadPrerenderedRoute } from "./App.tsx";
import { markHydrating } from "@/lib/prerender";
import "./index.css";

// Handle chunk loading errors when new versions are deployed
window.addEventListener("vite:preloadError", (event) => {
  console.warn("New version detected or chunk load failure, reloading...", event);
  window.location.reload();
});

/**
 * Supabase keeps its session in localStorage under sb-<ref>-auth-token. This is
 * only a render-mode hint, never an auth decision (Supabase + ProtectedRoute
 * still own that): a returning member skips hydration so the prerendered
 * homepage is replaced rather than flashed before their dashboard.
 */
function looksSignedIn(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) return true;
    }
  } catch {
    // Storage blocked: treat as signed out.
  }
  return false;
}

const container = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

if (container.hasAttribute("data-prerendered") && !looksSignedIn()) {
  markHydrating();
  // Load this page's chunk first, or React discards the static HTML for a loader.
  preloadPrerenderedRoute(window.location.pathname)
    .catch(() => undefined)
    .finally(() => hydrateRoot(container, app));
} else {
  container.replaceChildren();
  createRoot(container).render(app);
}
