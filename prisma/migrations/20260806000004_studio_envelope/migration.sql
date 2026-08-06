-- AI Marketing Studio — versioned envelope
--
-- Supersedes the per-feature columns added in 20260806000003 with two JSONB
-- columns on `posts`:
--   ai_studio_input   — written by the React frontend before triggering Make
--   ai_studio_output  — written back by Make.com, a single versioned envelope
--
-- Adding a future capability (SEO, campaign plan, competitor analysis, A/B
-- tests) means adding a key inside ai_studio_output — no further migration.
--
-- Plus the `brand_voices` table, so voice profiles live server-side and are
-- shared across devices instead of sitting in localStorage.
--
-- Every statement is guarded, so this applies cleanly whether or not
-- 20260806000003 actually reached this database.

-- ─── posts: new studio columns ───────────────────────────────────────────────

ALTER TABLE "public"."posts" ADD COLUMN IF NOT EXISTS "ai_studio_input"  JSONB;
ALTER TABLE "public"."posts" ADD COLUMN IF NOT EXISTS "ai_studio_output" JSONB;

-- Carry over anything written by the earlier per-feature column layout.
-- No-ops on a database where those columns were never created.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'ai_marketing_settings'
  ) THEN
    EXECUTE $migrate$
      UPDATE "public"."posts"
      SET "ai_studio_input" = COALESCE(
            "ai_studio_input",
            "ai_marketing_settings" || jsonb_build_object('schemaVersion', 1)
          )
      WHERE "ai_marketing_settings" IS NOT NULL
    $migrate$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'ai_image_analysis'
  ) THEN
    EXECUTE $migrate$
      UPDATE "public"."posts"
      SET "ai_studio_output" = COALESCE("ai_studio_output", '{}'::jsonb)
        || jsonb_build_object('schemaVersion', 1)
        || jsonb_strip_nulls(jsonb_build_object(
             'imageAnalysis',     "ai_image_analysis",
             'contentVariations', "ai_content_variations",
             'ctaOptions',        "ai_cta_options",
             'hashtagGroups',     "ai_hashtag_groups"
           ))
        || jsonb_build_object('meta', jsonb_build_object(
             'status',      'complete',
             'generatedAt', to_char("updated_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'model',       NULL,
             'durationMs',  NULL,
             'error',       NULL,
             'produced',    '[]'::jsonb
           ))
      WHERE "ai_image_analysis"     IS NOT NULL
         OR "ai_content_variations" IS NOT NULL
         OR "ai_cta_options"        IS NOT NULL
         OR "ai_hashtag_groups"     IS NOT NULL
    $migrate$;
  END IF;
END
$$;

-- Retire the per-feature columns.
ALTER TABLE "public"."posts" DROP COLUMN IF EXISTS "ai_marketing_settings";
ALTER TABLE "public"."posts" DROP COLUMN IF EXISTS "ai_image_analysis";
ALTER TABLE "public"."posts" DROP COLUMN IF EXISTS "ai_content_variations";
ALTER TABLE "public"."posts" DROP COLUMN IF EXISTS "ai_cta_options";
ALTER TABLE "public"."posts" DROP COLUMN IF EXISTS "ai_hashtag_groups";

-- Lets the UI filter to generated posts without deserialising the payload.
CREATE INDEX IF NOT EXISTS "posts_ai_studio_status_idx"
  ON "public"."posts" (("ai_studio_output" -> 'meta' ->> 'status'));

-- ─── brand_voices ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."brand_voices" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "name"       TEXT NOT NULL,
    "voice"      JSONB NOT NULL DEFAULT '{}',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL DEFAULT auth.uid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_voices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "brand_voices_created_by_idx"
  ON "public"."brand_voices"("created_by");
CREATE INDEX IF NOT EXISTS "brand_voices_created_at_idx"
  ON "public"."brand_voices"("created_at" DESC);

-- Profile names are unique per user, not globally.
CREATE UNIQUE INDEX IF NOT EXISTS "brand_voices_owner_name_key"
  ON "public"."brand_voices"("created_by", "name");

-- At most one default profile per user.
CREATE UNIQUE INDEX IF NOT EXISTS "brand_voices_one_default_per_owner"
  ON "public"."brand_voices"("created_by")
  WHERE "is_default";

ALTER TABLE "public"."brand_voices"
  DROP CONSTRAINT IF EXISTS "brand_voices_created_by_fkey";
ALTER TABLE "public"."brand_voices"
  ADD CONSTRAINT "brand_voices_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

DROP TRIGGER IF EXISTS "brand_voices_updated_at" ON "public"."brand_voices";
CREATE TRIGGER "brand_voices_updated_at"
  BEFORE UPDATE ON "public"."brand_voices"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

-- Row Level Security: each user only sees their own voice profiles
ALTER TABLE "public"."brand_voices" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own brand voices"   ON "public"."brand_voices";
DROP POLICY IF EXISTS "Users insert own brand voices" ON "public"."brand_voices";
DROP POLICY IF EXISTS "Users update own brand voices" ON "public"."brand_voices";
DROP POLICY IF EXISTS "Users delete own brand voices" ON "public"."brand_voices";

CREATE POLICY "Users read own brand voices" ON "public"."brand_voices"
  FOR SELECT USING ("created_by" = auth.uid());

CREATE POLICY "Users insert own brand voices" ON "public"."brand_voices"
  FOR INSERT WITH CHECK ("created_by" = auth.uid());

CREATE POLICY "Users update own brand voices" ON "public"."brand_voices"
  FOR UPDATE USING ("created_by" = auth.uid());

CREATE POLICY "Users delete own brand voices" ON "public"."brand_voices"
  FOR DELETE USING ("created_by" = auth.uid());
