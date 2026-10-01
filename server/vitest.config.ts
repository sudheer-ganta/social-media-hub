import { defineConfig } from "vitest/config";

// Mirrors the `test` block in ../vite.config.ts for `cd server && npm test`:
// tests never reach a real database. See that file for the reasoning.
export default defineConfig({
  test: {
    env: {
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
      DIRECT_URL: "postgresql://test:test@127.0.0.1:1/test",
    },
  },
});
