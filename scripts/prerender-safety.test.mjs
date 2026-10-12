import { describe, expect, it } from "vitest";
import { assertNoSecrets, findLeaks } from "./prerender-safety.mjs";

const page = (inner) => `<head><link rel="canonical" href="https://www.userally.in/" /></head><div id="root">${inner}</div>`;

describe("prerender leak guard", () => {
  it("does not flag Vercel's public production hostname that the canonical URL contains", () => {
    const env = {
      VITE_VERCEL_PROJECT_PRODUCTION_URL: "www.userally.in",
      VITE_VERCEL_URL: "www.userally.in",
      VITE_VERCEL_ENV: "production",
    };
    expect(findLeaks(page("Rally production"), env)).toEqual([]);
    expect(() => assertNoSecrets(page(""), "/", env)).not.toThrow();
  });

  it("still flags a genuine VITE_* secret value in the HTML, without printing it", () => {
    const secret = "super-secret-anon-key-123456";
    const env = { VITE_SUPABASE_ANON_KEY: secret, VITE_VERCEL_PROJECT_PRODUCTION_URL: "www.userally.in" };
    const problems = findLeaks(page(`<p>${secret}</p>`), env);
    expect(problems).toEqual(["value of VITE_SUPABASE_ANON_KEY"]);
    expect(() => assertNoSecrets(page(secret), "/", env)).toThrow(/VITE_SUPABASE_ANON_KEY/);
    expect(() => assertNoSecrets(page(secret), "/", env)).not.toThrow(new RegExp(secret));
  });

  it("does not exempt look-alike Vercel names, only the exact system variables", () => {
    const env = { VITE_VERCEL_TOKEN: "tok_live_abcdef123456" };
    expect(findLeaks(page("tok_live_abcdef123456"), env)).toEqual(["value of VITE_VERCEL_TOKEN"]);
  });

  it("keeps scanning Vercel's secret and free-text variables", () => {
    const env = {
      VITE_VERCEL_AUTOMATION_BYPASS_SECRET: "bypass-secret-abcdef123456",
      VITE_VERCEL_GIT_COMMIT_MESSAGE: "fix the thing in production",
    };
    expect(findLeaks(page("bypass-secret-abcdef123456"), env)).toEqual([
      "value of VITE_VERCEL_AUTOMATION_BYPASS_SECRET",
    ]);
    expect(findLeaks(page("fix the thing in production"), env)).toEqual([
      "value of VITE_VERCEL_GIT_COMMIT_MESSAGE",
    ]);
  });

  it("still catches JWTs and credential markers regardless of env", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0";
    expect(findLeaks(page(jwt), {})).toContain("a JWT-shaped string");
    expect(findLeaks(page("service_role"), {})).toContain("a credential marker");
  });
});
