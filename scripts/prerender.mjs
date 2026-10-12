/**
 * Static prerender of Rally's public pages. Runs after `vite build` and
 * `vite build --ssr src/entry-server.tsx --outDir dist-ssr` (see `npm run build`).
 *
 * For each public route it renders the real React route tree to HTML and writes
 * it into dist/, using the built dist/index.html as the template so the hashed
 * asset tags stay correct. The browser then hydrates it (src/main.tsx).
 *
 * Also writes dist/app-shell.html: the untouched template with an empty root,
 * which vercel.json serves for every non-prerendered route (login, dashboard...)
 * so those never flash homepage markup.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertNoSecrets } from "./prerender-safety.mjs";

const SITE = "https://www.userally.in";
const NAME = "Rally";

/** @typedef {{ path: string, title: string, description: string, robots: string, jsonLd?: object[] }} PageSeo */

const HOME_DESCRIPTION =
  "Rally turns your brand identity into on-brand social content with AI. Plan, create and schedule posts across every platform. Start your free trial.";

/** @type {PageSeo[]} */
const PAGES = [
  {
    path: "/",
    title: "Rally — AI social media content that looks like your brand",
    description: HOME_DESCRIPTION,
    robots: "index, follow, max-image-preview:large",
    jsonLd: [
      { "@context": "https://schema.org", "@type": "Organization", name: NAME, url: `${SITE}/` },
      { "@context": "https://schema.org", "@type": "WebSite", name: NAME, url: `${SITE}/` },
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: NAME,
        url: `${SITE}/`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: HOME_DESCRIPTION,
      },
    ],
  },
  {
    path: "/privacy",
    title: "Privacy Policy — Rally",
    description: "How Rally collects, uses and handles your information.",
    robots: "index, follow",
  },
  {
    path: "/terms",
    title: "Terms of Service — Rally",
    description: "The terms that apply when you use Rally.",
    robots: "index, follow",
  },
  {
    path: "/data-deletion",
    title: "Data Deletion — Rally",
    description: "How to ask Rally to delete your account and the data connected to it.",
    robots: "index, follow",
  },
];

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Replace one occurrence, or fail the build rather than ship a half-patched page. */
function swap(html, find, replacement) {
  if (!html.includes(find)) throw new Error(`prerender: template is missing ${find}`);
  return html.replace(find, () => replacement);
}

function head(page) {
  const url = page.path === "/" ? `${SITE}/` : `${SITE}${page.path}`;
  const tags = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<meta name="robots" content="${page.robots}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:site_name" content="${NAME}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
  ];
  // JSON-LD is a data block, not executable script, so the CSP (script-src 'self') allows it.
  for (const ld of page.jsonLd ?? []) {
    tags.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`);
  }
  return tags.map((t) => `    ${t}`).join("\n");
}

async function main() {
  const dist = path.resolve("dist");
  const template = readFileSync(path.join(dist, "index.html"), "utf8");
  if (!template.includes('<div id="root"></div>')) {
    throw new Error("prerender: dist/index.html has no empty #root (already prerendered?)");
  }
  const ssrEntry = path.resolve("dist-ssr", "entry-server.js");
  if (!existsSync(ssrEntry)) throw new Error("prerender: dist-ssr/entry-server.js missing; build the SSR bundle first");
  const { render } = await import(pathToFileURL(ssrEntry).href);

  writeFileSync(path.join(dist, "app-shell.html"), template);

  for (const page of PAGES) {
    const body = await render(page.path);
    let html = template;
    html = swap(html, "    <title>Rally</title>\n", "");
    html = html.replace(/\s*<meta\s+name="description"[\s\S]*?\/>/, "");
    html = swap(
      html,
      '<link rel="preconnect" href="https://fonts.googleapis.com" />',
      `${head(page).trimStart()}\n    <link rel="preconnect" href="https://fonts.googleapis.com" />`,
    );
    html = swap(html, '<div id="root"></div>', `<div id="root" data-prerendered>${body}</div>`);
    assertNoSecrets(html, page.path);

    const out = page.path === "/" ? path.join(dist, "index.html") : path.join(dist, page.path, "index.html");
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, html);
    console.log(`prerendered ${page.path.padEnd(14)} ${(html.length / 1024).toFixed(1)} kB -> ${path.relative(process.cwd(), out)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
