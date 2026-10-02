import { API_BASE_URL } from "@/constants/api";

/**
 * Previews fonts in the editor with the very files the creative is rendered
 * with, served by the backend (`/api/fonts/...`). Nothing is loaded until a
 * font is shown, each file is fetched once per browser (the server marks them
 * immutable) and a font that fails to load simply shows in the fallback face.
 *
 * Loaded under a private family name, so a preview can never change how any
 * other text on the page is set.
 */

const loading = new Map<string, Promise<void>>();

const FALLBACK: Record<string, string> = {
  serif: "Georgia, serif",
  monospace: "ui-monospace, monospace",
  handwritten: "cursive",
};

/** The CSS font-family stack that shows `family` once it has loaded. */
export function previewFontStack(family: string, category?: string): string {
  return `"rally-preview ${family}", ${(category && FALLBACK[category]) || "system-ui, sans-serif"}`;
}

/** The weight to show a family's name in: its Regular, or the nearest it has. */
export function previewWeight(weights: number[]): number {
  return weights.reduce((best, w) => (Math.abs(w - 400) < Math.abs(best - 400) ? w : best), weights[0] ?? 400);
}

/** Loads one face. Resolves either way: a failed font is a fallback face, never an error. */
export function loadFontPreview(family: string, weight: number, url: string): Promise<void> {
  if (typeof FontFace === "undefined" || typeof document === "undefined") return Promise.resolve();
  const key = `${family}:${weight}`;
  const existing = loading.get(key);
  if (existing) return existing;

  const face = new FontFace(`rally-preview ${family}`, `url(${API_BASE_URL}${url})`, {
    weight: String(weight),
    display: "swap",
  });
  const pending = face
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
    })
    .catch(() => {
      loading.delete(key); // allow a retry the next time it is shown
    });
  loading.set(key, pending);
  return pending;
}

/** Loads many faces a few at a time, so opening a long font menu does not fire dozens of requests at once. */
export async function loadFontPreviews(
  faces: Array<{ family: string; weight: number; url: string }>,
  concurrency = 6,
): Promise<void> {
  const queue = [...faces];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      await loadFontPreview(next.family, next.weight, next.url);
    }
  });
  await Promise.all(workers);
}
