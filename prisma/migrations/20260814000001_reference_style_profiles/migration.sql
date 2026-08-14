-- Reference Style Profiles — "Style Memory" for reference-led creative
-- generation. Same shape and RLS pattern as creative_dna (see
-- 20260813000016_creative_dna/migration.sql): a reusable named profile a
-- member saves and picks later, PostgREST-visible, RLS-scoped to the owner.
--
-- Deliberately a SIBLING table to creative_dna, not a column on it: a member
-- can hold several style profiles ("Diwali mood", "Everyday minimal") wholly
-- independent of which brand they're posting as, whereas creative_dna is one
-- brand's fixed visual identity. See server/src/ai/types.ts ReferenceStyleProfile.

CREATE TABLE IF NOT EXISTS "public"."reference_style_profiles" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "name"       TEXT NOT NULL,
    "profile"    JSONB NOT NULL DEFAULT '{}',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL DEFAULT auth.uid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_style_profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "reference_style_profiles_created_by_idx"
  ON "public"."reference_style_profiles"("created_by");
CREATE INDEX IF NOT EXISTS "reference_style_profiles_created_at_idx"
  ON "public"."reference_style_profiles"("created_at" DESC);

-- Profile names are unique per user, not globally.
CREATE UNIQUE INDEX IF NOT EXISTS "reference_style_profiles_owner_name_key"
  ON "public"."reference_style_profiles"("created_by", "name");

-- At most one default profile per user.
CREATE UNIQUE INDEX IF NOT EXISTS "reference_style_profiles_one_default_per_owner"
  ON "public"."reference_style_profiles"("created_by")
  WHERE "is_default";

ALTER TABLE "public"."reference_style_profiles"
  DROP CONSTRAINT IF EXISTS "reference_style_profiles_created_by_fkey";
ALTER TABLE "public"."reference_style_profiles"
  ADD CONSTRAINT "reference_style_profiles_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

DROP TRIGGER IF EXISTS "reference_style_profiles_updated_at" ON "public"."reference_style_profiles";
CREATE TRIGGER "reference_style_profiles_updated_at"
  BEFORE UPDATE ON "public"."reference_style_profiles"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

ALTER TABLE "public"."reference_style_profiles" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own reference style profiles"   ON "public"."reference_style_profiles";
DROP POLICY IF EXISTS "Users insert own reference style profiles" ON "public"."reference_style_profiles";
DROP POLICY IF EXISTS "Users update own reference style profiles" ON "public"."reference_style_profiles";
DROP POLICY IF EXISTS "Users delete own reference style profiles" ON "public"."reference_style_profiles";

CREATE POLICY "Users read own reference style profiles" ON "public"."reference_style_profiles"
  FOR SELECT USING ("created_by" = auth.uid());

CREATE POLICY "Users insert own reference style profiles" ON "public"."reference_style_profiles"
  FOR INSERT WITH CHECK ("created_by" = auth.uid());

CREATE POLICY "Users update own reference style profiles" ON "public"."reference_style_profiles"
  FOR UPDATE USING ("created_by" = auth.uid());

CREATE POLICY "Users delete own reference style profiles" ON "public"."reference_style_profiles"
  FOR DELETE USING ("created_by" = auth.uid());
