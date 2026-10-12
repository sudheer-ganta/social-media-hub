/**
 * Leak guard for prerendered HTML (used by scripts/prerender.mjs).
 *
 * Every VITE_* value is compiled into the public browser bundle anyway, but the
 * static HTML must still never carry configuration it has no reason to show, so
 * any VITE_* value that appears in the markup fails the build.
 *
 * The one exception is Vercel's own system variables, which Vercel injects as
 * VITE_VERCEL_* when "Automatically expose System Environment Variables" is on.
 * Their values are public deployment metadata (the site's own hostname, the
 * environment name, branch and commit), not credentials: the production hostname
 * legitimately appears in the canonical URL. The list is exact on purpose; a
 * new VITE_* variable, or a typo-squat like VITE_VERCEL_TOKEN, is still scanned.
 *
 * Deliberately NOT exempt: VERCEL_AUTOMATION_BYPASS_SECRET (a real secret), and
 * the free-text commit message / author fields, which can hold anything.
 */
export const PUBLIC_BY_DESIGN = new Set([
  "VITE_VERCEL",
  "VITE_VERCEL_ENV",
  "VITE_VERCEL_TARGET_ENV",
  "VITE_VERCEL_URL",
  "VITE_VERCEL_BRANCH_URL",
  "VITE_VERCEL_PROJECT_PRODUCTION_URL",
  "VITE_VERCEL_REGION",
  "VITE_VERCEL_DEPLOYMENT_ID",
  "VITE_VERCEL_GIT_PROVIDER",
  "VITE_VERCEL_GIT_REPO_SLUG",
  "VITE_VERCEL_GIT_REPO_OWNER",
  "VITE_VERCEL_GIT_REPO_ID",
  "VITE_VERCEL_GIT_COMMIT_REF",
  "VITE_VERCEL_GIT_COMMIT_SHA",
  "VITE_VERCEL_GIT_PULL_REQUEST_ID",
]);

/** Returns human-readable problems; values are never included in them. */
export function findLeaks(html, env = process.env) {
  const problems = [];
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("VITE_") || PUBLIC_BY_DESIGN.has(key)) continue;
    if (value && value.length >= 8 && html.includes(value)) problems.push(`value of ${key}`);
  }
  if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(html)) problems.push("a JWT-shaped string");
  if (/service_role|sk_live|rzp_live/i.test(html)) problems.push("a credential marker");
  return problems;
}

export function assertNoSecrets(html, file, env = process.env) {
  const problems = findLeaks(html, env);
  if (problems.length) throw new Error(`prerender: ${file} contains ${problems.join(", ")}`);
}
