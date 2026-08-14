-- Creative DNA — the visual sibling of BrandVoice.
--
-- Two new tables:
--
--   creative_dna       PostgREST-visible, RLS-scoped to the owner, same shape
--                       as brand_voices: a reusable named profile a member
--                       saves and picks later. Holds the brand's visual
--                       identity (photography style, composition, lighting,
--                       mood, colour, logo/product treatment) the way
--                       brand_voices holds its writing identity.
--
--   generated_assets   Backend-only, RLS enabled with no policies (same
--                       pattern as style_profiles / social_accounts) — one
--                       row per AI image generation, written only by the
--                       Express backend, which is the only thing holding the
--                       Gemini and Cloudinary keys involved. Never
--                       overwritten: regenerate/refine insert a new row
--                       linked via parent_asset_id.

-- ─── creative_dna ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."creative_dna" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "name"       TEXT NOT NULL,
    "dna"        JSONB NOT NULL DEFAULT '{}',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL DEFAULT auth.uid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_dna_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "creative_dna_created_by_idx"
  ON "public"."creative_dna"("created_by");
CREATE INDEX IF NOT EXISTS "creative_dna_created_at_idx"
  ON "public"."creative_dna"("created_at" DESC);

-- Profile names are unique per user, not globally.
CREATE UNIQUE INDEX IF NOT EXISTS "creative_dna_owner_name_key"
  ON "public"."creative_dna"("created_by", "name");

-- At most one default profile per user.
CREATE UNIQUE INDEX IF NOT EXISTS "creative_dna_one_default_per_owner"
  ON "public"."creative_dna"("created_by")
  WHERE "is_default";

ALTER TABLE "public"."creative_dna"
  DROP CONSTRAINT IF EXISTS "creative_dna_created_by_fkey";
ALTER TABLE "public"."creative_dna"
  ADD CONSTRAINT "creative_dna_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

DROP TRIGGER IF EXISTS "creative_dna_updated_at" ON "public"."creative_dna";
CREATE TRIGGER "creative_dna_updated_at"
  BEFORE UPDATE ON "public"."creative_dna"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

ALTER TABLE "public"."creative_dna" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own creative dna"   ON "public"."creative_dna";
DROP POLICY IF EXISTS "Users insert own creative dna" ON "public"."creative_dna";
DROP POLICY IF EXISTS "Users update own creative dna" ON "public"."creative_dna";
DROP POLICY IF EXISTS "Users delete own creative dna" ON "public"."creative_dna";

CREATE POLICY "Users read own creative dna" ON "public"."creative_dna"
  FOR SELECT USING ("created_by" = auth.uid());

CREATE POLICY "Users insert own creative dna" ON "public"."creative_dna"
  FOR INSERT WITH CHECK ("created_by" = auth.uid());

CREATE POLICY "Users update own creative dna" ON "public"."creative_dna"
  FOR UPDATE USING ("created_by" = auth.uid());

CREATE POLICY "Users delete own creative dna" ON "public"."creative_dna"
  FOR DELETE USING ("created_by" = auth.uid());

-- ─── generated_assets ────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'generated_asset_status') THEN
    CREATE TYPE "public"."generated_asset_status" AS ENUM (
      'PENDING', 'COMPLETED', 'FAILED'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "public"."generated_assets" (
    "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"               UUID NOT NULL,
    "context_type"          TEXT NOT NULL DEFAULT 'personal',
    "brand_id"              UUID,
    "prompt"                TEXT NOT NULL,
    "creative_brief"        JSONB NOT NULL,
    "source_asset_urls"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "image_url"             TEXT,
    "cloudinary_public_id"  TEXT,
    "provider"              TEXT NOT NULL DEFAULT 'gemini',
    "model"                 TEXT NOT NULL,
    "status"                "public"."generated_asset_status" NOT NULL DEFAULT 'PENDING',
    "campaign_id"           UUID,
    "parent_asset_id"       UUID,
    "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_assets_pkey" PRIMARY KEY ("id")
);

-- A personal row never carries a brand, mirroring the same check on
-- style_profiles and posts.
ALTER TABLE "public"."generated_assets"
  DROP CONSTRAINT IF EXISTS "generated_assets_context_brand_check";
ALTER TABLE "public"."generated_assets"
  ADD CONSTRAINT "generated_assets_context_brand_check"
  CHECK (
      ("context_type" = 'brand'    AND "brand_id" IS NOT NULL) OR
      ("context_type" = 'personal' AND "brand_id" IS NULL)
  );

ALTER TABLE "public"."generated_assets"
  DROP CONSTRAINT IF EXISTS "generated_assets_user_id_fkey";
ALTER TABLE "public"."generated_assets"
  ADD CONSTRAINT "generated_assets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."generated_assets"
  DROP CONSTRAINT IF EXISTS "generated_assets_brand_id_fkey";
ALTER TABLE "public"."generated_assets"
  ADD CONSTRAINT "generated_assets_brand_id_fkey"
  FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE CASCADE;

ALTER TABLE "public"."generated_assets"
  DROP CONSTRAINT IF EXISTS "generated_assets_parent_asset_id_fkey";
ALTER TABLE "public"."generated_assets"
  ADD CONSTRAINT "generated_assets_parent_asset_id_fkey"
  FOREIGN KEY ("parent_asset_id") REFERENCES "public"."generated_assets"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "generated_assets_user_id_idx"
  ON "public"."generated_assets"("user_id");
CREATE INDEX IF NOT EXISTS "generated_assets_campaign_id_idx"
  ON "public"."generated_assets"("campaign_id");
CREATE INDEX IF NOT EXISTS "generated_assets_parent_asset_id_idx"
  ON "public"."generated_assets"("parent_asset_id");

-- No policies. Backend connects as the database owner and bypasses RLS;
-- PostgREST's anon/authenticated roles get nothing.
ALTER TABLE "public"."generated_assets" ENABLE ROW LEVEL SECURITY;
