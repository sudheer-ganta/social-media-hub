/**
 * One-time (re-run when the manifest changes) fetch of FlowPost's curated
 * font subset into server/assets/fonts/ as real, renderer-ready TTFs.
 *
 * Why this exists instead of calling Google Fonts per generation (spec: never
 * call the Google Fonts API on every generation): `@resvg/resvg-js` — the
 * renderer that guarantees real typography instead of an AI image model's
 * fake glyphs — needs actual font FILES on disk, loaded once per render call
 * from `server/assets/fonts/`, never fetched over the network at request time.
 *
 * Source is fontsource (`@fontsource/<slug>` on npm/jsDelivr), not Google's own
 * CDN or the `google/fonts` GitHub repo: both of those now serve most families
 * as a single variable font, and resvg does not implement variable-font
 * instancing (every requested weight rendered identical in testing) — it
 * needs genuinely distinct static per-weight files, which fontsource still
 * builds. fontsource ships those as WOFF1/WOFF2; resvg's bundled fontdb loads
 * neither ("malformed font"), so each file is unwrapped to raw sfnt (TTF) with
 * `woff-to-sfnt.ts` before being written to disk. Run with:
 *
 *   npx tsx server/src/scripts/fetch-fonts.ts
 */
import fs from 'fs';
import path from 'path';
import { FONT_MANIFEST, familySlug } from '../ai/typography/font-manifest';
import { woffToSfnt } from '../ai/typography/woff-to-sfnt';

const FONTS_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');

async function fetchWoff(slug: string, subset: string, weight: number, style: 'normal' | 'italic'): Promise<Buffer> {
  const url = `https://cdn.jsdelivr.net/npm/@fontsource/${slug}@latest/files/${slug}-${subset}-${weight}-${style}.woff`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of FONT_MANIFEST) {
    const slug = familySlug(entry.family);
    const dir = path.join(FONTS_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });

    for (const style of entry.styles) {
      for (const weight of entry.weights) {
        const outPath = path.join(dir, `${weight}-${style}.ttf`);
        if (fs.existsSync(outPath)) {
          skipped++;
          continue;
        }
        try {
          const woff = await fetchWoff(entry.fontsourceSlug, entry.subset, weight, style);
          const ttf = woffToSfnt(woff);
          fs.writeFileSync(outPath, ttf);
          fetched++;
          console.log(`✓ ${entry.family} ${weight} ${style} (${ttf.length} bytes)`);
        } catch (error) {
          failed++;
          console.error(`✗ ${entry.family} ${weight} ${style}:`, error instanceof Error ? error.message : error);
        }
      }
    }
  }

  console.log(`\nDone. fetched=${fetched} skipped(existing)=${skipped} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main();
