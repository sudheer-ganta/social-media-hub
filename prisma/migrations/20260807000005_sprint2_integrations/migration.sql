-- Sprint 2 — integration infrastructure for OAuth social connections.
--
-- Hand-written rather than generated: `prisma migrate dev` needs a shadow
-- database, and replaying 20260806000001_init there fails because Supabase's
-- `auth` schema doesn't exist in a bare Postgres instance. Apply with
--   npx prisma migrate deploy
--
-- Adds:
--   • social_accounts  — one connected network per user, tokens encrypted
--   • activity_logs    — append-only audit trail
--   • post_platforms   — one publish attempt per post per network
--   • post_status enum — replaces the TEXT + CHECK constraint on posts.status,
--                        and adds 'queued'
--
-- All three new tables have RLS enabled with NO policies. That is deliberate:
-- it makes them invisible to PostgREST's anon/authenticated roles, so a browser
-- session can never read an OAuth token. The backend connects as the database
-- owner, which bypasses RLS.

-- ─── posts.status: TEXT + CHECK → post_status enum ───────────────────────────
--
-- Labels stay lowercase so the existing supabase-js frontend keeps reading and
-- writing 'draft' / 'scheduled' / 'published' as plain strings. PostgREST
-- serialises enums as strings, so nothing on the client changes.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'post_status') THEN
    CREATE TYPE "public"."post_status" AS ENUM (
      'draft', 'scheduled', 'queued', 'publishing', 'published', 'failed'
    );
  END IF;
END
$$;

-- The CHECK constraint and the DEFAULT both reference the column's old type,
-- so they have to come off before the type swap and go back on after.
ALTER TABLE "public"."posts" DROP CONSTRAINT IF EXISTS "posts_status_check";
ALTER TABLE "public"."posts" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "public"."posts"
  ALTER COLUMN "status" TYPE "public"."post_status"
  USING "status"::"public"."post_status";

ALTER TABLE "public"."posts"
  ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."post_status";

-- ─── social_accounts ─────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_account_status') THEN
    CREATE TYPE "public"."social_account_status" AS ENUM (
      'CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "public"."social_accounts" (
    "id"                      UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"                 UUID NOT NULL,
    "provider"                TEXT NOT NULL,
    "provider_account_id"     TEXT NOT NULL,
    "display_name"            TEXT,
    "username"                TEXT,
    "profile_image"           TEXT,
    "encrypted_access_token"  TEXT NOT NULL,
    "encrypted_refresh_token" TEXT,
    "expires_at"              TIMESTAMPTZ(6),
    "status"                  "public"."social_account_status" NOT NULL DEFAULT 'CONNECTED',
    "created_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- Reconnecting the same provider account upserts instead of stacking rows.
CREATE UNIQUE INDEX IF NOT EXISTS "social_accounts_user_provider_account_key"
  ON "public"."social_accounts"("user_id", "provider", "provider_account_id");

CREATE INDEX IF NOT EXISTS "social_accounts_user_id_idx"
  ON "public"."social_accounts"("user_id");
CREATE INDEX IF NOT EXISTS "social_accounts_provider_status_idx"
  ON "public"."social_accounts"("provider", "status");

ALTER TABLE "public"."social_accounts"
  DROP CONSTRAINT IF EXISTS "social_accounts_user_id_fkey";
ALTER TABLE "public"."social_accounts"
  ADD CONSTRAINT "social_accounts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

DROP TRIGGER IF EXISTS "social_accounts_updated_at" ON "public"."social_accounts";
CREATE TRIGGER "social_accounts_updated_at"
  BEFORE UPDATE ON "public"."social_accounts"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

-- Deny-all for PostgREST: RLS on, zero policies. Encrypted tokens never leave
-- the backend.
ALTER TABLE "public"."social_accounts" ENABLE ROW LEVEL SECURITY;

-- ─── activity_logs ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID NOT NULL,
    "action"     TEXT NOT NULL,
    "provider"   TEXT,
    "details"    JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "activity_logs_user_id_created_at_idx"
  ON "public"."activity_logs"("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "activity_logs_action_idx"
  ON "public"."activity_logs"("action");

ALTER TABLE "public"."activity_logs"
  DROP CONSTRAINT IF EXISTS "activity_logs_user_id_fkey";
ALTER TABLE "public"."activity_logs"
  ADD CONSTRAINT "activity_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

-- `details` can carry provider error payloads, so this stays backend-only too.
ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;

-- ─── post_platforms ──────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'publish_status') THEN
    CREATE TYPE "public"."publish_status" AS ENUM (
      'PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "public"."post_platforms" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id"       UUID NOT NULL,
    "provider"      TEXT NOT NULL,
    "status"        "public"."publish_status" NOT NULL DEFAULT 'PENDING',
    "published_id"  TEXT,
    "error_message" TEXT,
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_platforms_pkey" PRIMARY KEY ("id")
);

-- One attempt row per post per network; retries update it in place.
CREATE UNIQUE INDEX IF NOT EXISTS "post_platforms_post_id_provider_key"
  ON "public"."post_platforms"("post_id", "provider");

CREATE INDEX IF NOT EXISTS "post_platforms_post_id_idx"
  ON "public"."post_platforms"("post_id");
CREATE INDEX IF NOT EXISTS "post_platforms_status_idx"
  ON "public"."post_platforms"("status");

ALTER TABLE "public"."post_platforms"
  DROP CONSTRAINT IF EXISTS "post_platforms_post_id_fkey";
ALTER TABLE "public"."post_platforms"
  ADD CONSTRAINT "post_platforms_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;

ALTER TABLE "public"."post_platforms" ENABLE ROW LEVEL SECURITY;

-- ─── Hardening ───────────────────────────────────────────────────────────────
--
-- RLS with no policies is already deny-all for these roles. Revoking the
-- table grants as well means PostgREST doesn't even advertise the tables in
-- its schema cache, so they never appear in the public API surface.

REVOKE ALL ON TABLE "public"."social_accounts" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."activity_logs"   FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."post_platforms"  FROM "anon", "authenticated";
