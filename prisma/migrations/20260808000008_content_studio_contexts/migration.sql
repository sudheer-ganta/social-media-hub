-- Content Studio V2 — Personal vs Brand publishing contexts.
--
--   • brands: first-class Brand entities (browser-facing, per-user RLS).
--   • social_accounts.context_type/brand_id: which context a connection
--     serves. The (user, provider, account) unique widens with the context so
--     the same provider account can be connected once for Personal and once
--     per Brand without the OAuth upsert overwriting the other row.
--   • posts.context_type/brand_id (+ music/cta/link_url composer fields),
--     with RLS tightened so a browser insert cannot attach a post to a brand
--     the user does not own.
--
-- Deleting a brand CASCADEs to its connections (tokens must not outlive the
-- brand) and to its posts — brand data lives and dies with the brand, which
-- is what context isolation promises.

-- ─── brands ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."brands" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "name"        TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "website"     TEXT NOT NULL DEFAULT '',
    "created_by"  UUID NOT NULL DEFAULT auth.uid(),
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "brands_created_by_idx"
  ON "public"."brands"("created_by");

-- Brand names are unique per user, not globally.
CREATE UNIQUE INDEX IF NOT EXISTS "brands_created_by_name_key"
  ON "public"."brands"("created_by", "name");

ALTER TABLE "public"."brands"
  DROP CONSTRAINT IF EXISTS "brands_created_by_fkey";
ALTER TABLE "public"."brands"
  ADD CONSTRAINT "brands_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

DROP TRIGGER IF EXISTS "brands_updated_at" ON "public"."brands";
CREATE TRIGGER "brands_updated_at"
  BEFORE UPDATE ON "public"."brands"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

-- Row Level Security: each user only sees their own brands
ALTER TABLE "public"."brands" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own brands"   ON "public"."brands";
DROP POLICY IF EXISTS "Users insert own brands" ON "public"."brands";
DROP POLICY IF EXISTS "Users update own brands" ON "public"."brands";
DROP POLICY IF EXISTS "Users delete own brands" ON "public"."brands";

CREATE POLICY "Users read own brands" ON "public"."brands"
  FOR SELECT USING ("created_by" = auth.uid());

CREATE POLICY "Users insert own brands" ON "public"."brands"
  FOR INSERT WITH CHECK ("created_by" = auth.uid());

CREATE POLICY "Users update own brands" ON "public"."brands"
  FOR UPDATE USING ("created_by" = auth.uid());

CREATE POLICY "Users delete own brands" ON "public"."brands"
  FOR DELETE USING ("created_by" = auth.uid());

-- ─── social_accounts: publishing context ─────────────────────────────────────

ALTER TABLE "public"."social_accounts"
  ADD COLUMN IF NOT EXISTS "context_type" TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE "public"."social_accounts"
  ADD COLUMN IF NOT EXISTS "brand_id" UUID;

ALTER TABLE "public"."social_accounts"
  DROP CONSTRAINT IF EXISTS "social_accounts_brand_id_fkey";
ALTER TABLE "public"."social_accounts"
  ADD CONSTRAINT "social_accounts_brand_id_fkey"
  FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE CASCADE;

ALTER TABLE "public"."social_accounts"
  DROP CONSTRAINT IF EXISTS "social_accounts_context_type_check";
ALTER TABLE "public"."social_accounts"
  ADD CONSTRAINT "social_accounts_context_type_check"
  CHECK ("context_type" IN ('personal', 'brand'));

-- A brand connection always names its brand; a personal one never does.
ALTER TABLE "public"."social_accounts"
  DROP CONSTRAINT IF EXISTS "social_accounts_context_brand_check";
ALTER TABLE "public"."social_accounts"
  ADD CONSTRAINT "social_accounts_context_brand_check"
  CHECK (("context_type" = 'brand') = ("brand_id" IS NOT NULL));

-- The reconnect-idempotency key now includes the context, so the same
-- provider account can be connected for Personal and for a Brand as separate
-- rows. NULL brand_id is folded to a sentinel because Postgres treats NULLs
-- as distinct in unique indexes — without it, duplicate personal rows.
DROP INDEX IF EXISTS "public"."social_accounts_user_provider_account_key";
CREATE UNIQUE INDEX IF NOT EXISTS "social_accounts_identity_context_key"
  ON "public"."social_accounts"(
    "user_id", "provider", "provider_account_id", "context_type",
    COALESCE("brand_id", '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS "social_accounts_user_id_provider_idx"
  ON "public"."social_accounts"("user_id", "provider");
CREATE INDEX IF NOT EXISTS "social_accounts_brand_id_idx"
  ON "public"."social_accounts"("brand_id");

-- ─── posts: publishing context + composer fields ─────────────────────────────

ALTER TABLE "public"."posts"
  ADD COLUMN IF NOT EXISTS "context_type" TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE "public"."posts"
  ADD COLUMN IF NOT EXISTS "brand_id" UUID;
ALTER TABLE "public"."posts"
  ADD COLUMN IF NOT EXISTS "music" TEXT;
ALTER TABLE "public"."posts"
  ADD COLUMN IF NOT EXISTS "cta" TEXT;
ALTER TABLE "public"."posts"
  ADD COLUMN IF NOT EXISTS "link_url" TEXT;

ALTER TABLE "public"."posts"
  DROP CONSTRAINT IF EXISTS "posts_brand_id_fkey";
ALTER TABLE "public"."posts"
  ADD CONSTRAINT "posts_brand_id_fkey"
  FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE CASCADE;

ALTER TABLE "public"."posts"
  DROP CONSTRAINT IF EXISTS "posts_context_type_check";
ALTER TABLE "public"."posts"
  ADD CONSTRAINT "posts_context_type_check"
  CHECK ("context_type" IN ('personal', 'brand'));

ALTER TABLE "public"."posts"
  DROP CONSTRAINT IF EXISTS "posts_context_brand_check";
ALTER TABLE "public"."posts"
  ADD CONSTRAINT "posts_context_brand_check"
  CHECK (("context_type" = 'brand') = ("brand_id" IS NOT NULL));

CREATE INDEX IF NOT EXISTS "posts_brand_id_idx"
  ON "public"."posts"("brand_id");

-- Posts are written by the browser under RLS, so brand ownership must be
-- proven here — an app-layer check would be spoofable. The write policies are
-- recreated with the brand clause; reads stay per-user as before.
DROP POLICY IF EXISTS "Users insert own posts" ON "public"."posts";
CREATE POLICY "Users insert own posts" ON "public"."posts"
  FOR INSERT WITH CHECK (
    "created_by" = auth.uid()
    AND (
      "brand_id" IS NULL
      OR EXISTS (
        SELECT 1 FROM "public"."brands" b
        WHERE b."id" = "brand_id" AND b."created_by" = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users update own posts" ON "public"."posts";
CREATE POLICY "Users update own posts" ON "public"."posts"
  FOR UPDATE USING ("created_by" = auth.uid())
  WITH CHECK (
    "created_by" = auth.uid()
    AND (
      "brand_id" IS NULL
      OR EXISTS (
        SELECT 1 FROM "public"."brands" b
        WHERE b."id" = "brand_id" AND b."created_by" = auth.uid()
      )
    )
  );
