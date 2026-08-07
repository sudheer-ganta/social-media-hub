-- Sprint 3.3 — account management metadata.
--
-- Everything here is additive and nullable (or defaulted), so it applies to a
-- database with live connections without touching a single existing row's
-- meaning. An account connected before this migration simply has no sync
-- history yet; the API reports it as "never synced" and Refresh Connection
-- fills it in.
--
-- No RLS or grant changes: `social_accounts` is already deny-all for the anon
-- and authenticated roles (see 20260807000005_sprint2_integrations), and these
-- columns inherit that. The new `scopes` column in particular must never become
-- readable by the browser directly — it is served through /api/integrations.

ALTER TABLE "public"."social_accounts"
  ADD COLUMN IF NOT EXISTS "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "public"."social_accounts"
  ADD COLUMN IF NOT EXISTS "provider_version" TEXT;

ALTER TABLE "public"."social_accounts"
  ADD COLUMN IF NOT EXISTS "last_synced_at" TIMESTAMPTZ(6);

ALTER TABLE "public"."social_accounts"
  ADD COLUMN IF NOT EXISTS "last_health_check" TIMESTAMPTZ(6);

-- Backfill: a row that already exists was written by a successful OAuth
-- callback, so its profile was accurate as of the last write. Seeding
-- `last_synced_at` from `updated_at` avoids showing "Never synced" on
-- connections that are in fact fine.
UPDATE "public"."social_accounts"
   SET "last_synced_at" = "updated_at"
 WHERE "last_synced_at" IS NULL;

-- The health sweep in a later sprint will want the stalest connections first.
CREATE INDEX IF NOT EXISTS "social_accounts_last_health_check_idx"
  ON "public"."social_accounts"("last_health_check");
