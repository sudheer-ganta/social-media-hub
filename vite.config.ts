import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Read by Vitest, not Vite. Kept in a variable and spread below so the typings
 * of the two (which ship separate copies of Vite) do not have to agree.
 *
 * Tests must never reach a real database. The backend loads server/.env, which
 * holds live Supabase credentials, so without this a test that forgot to mock a
 * repository would quietly run against production data (and one was — see
 * token-recovery.test.ts). dotenv does not override variables that are already
 * set, so these win; anything that touches the DB now fails at once with
 * "connection refused" instead of passing slowly and mutating live rows.
 */
const vitestConfig = {
  test: {
    env: {
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
      DIRECT_URL: "postgresql://test:test@127.0.0.1:1/test",
    },
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          motion: ["framer-motion"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
  ...vitestConfig,
});
