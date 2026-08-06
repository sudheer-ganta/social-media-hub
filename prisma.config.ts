import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma is used as the migration tool only — the app itself talks to
// Supabase through supabase-js (PostgREST), so no Prisma Client is
// generated. Migrations must run against the session-mode pooler
// (DIRECT_URL); the transaction-mode pooler (DATABASE_URL) is reserved
// for future server-side runtimes.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
