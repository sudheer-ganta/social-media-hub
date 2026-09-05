ALTER TABLE "brand_voices" ADD COLUMN "brand_id" UUID;

-- Safely associate legacy voices where owner + case-insensitive brand name is
-- unambiguous. Unmatched legacy profiles remain readable in Settings but are
-- never selected as a brand's voice by Core Creation Intelligence.
UPDATE "brand_voices" AS voice
SET "brand_id" = brand."id"
FROM "brands" AS brand
WHERE voice."created_by" = brand."created_by"
  AND lower(regexp_replace(voice."name", '\s+', '', 'g')) = lower(regexp_replace(brand."name", '\s+', '', 'g'));

CREATE INDEX "brand_voices_brand_id_idx" ON "brand_voices"("brand_id");
ALTER TABLE "brand_voices"
  ADD CONSTRAINT "brand_voices_brand_id_fkey"
  FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "creation_profiles" (
  "user_id" UUID NOT NULL,
  "default_context_type" TEXT NOT NULL DEFAULT 'personal',
  "default_brand_id" UUID,
  "personal_context" JSONB NOT NULL DEFAULT '{}',
  "onboarding_complete" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creation_profiles_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "creation_profiles_user_fkey" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE,
  CONSTRAINT "creation_profiles_brand_fkey" FOREIGN KEY ("default_brand_id") REFERENCES "brands"("id") ON DELETE SET NULL,
  CONSTRAINT "creation_profiles_context_check" CHECK (
    ("default_context_type" = 'personal' AND "default_brand_id" IS NULL) OR
    ("default_context_type" = 'brand' AND "default_brand_id" IS NOT NULL)
  )
);

ALTER TABLE "creation_profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "creation_profiles_select_own" ON "creation_profiles" FOR SELECT USING (auth.uid() = "user_id");
CREATE POLICY "creation_profiles_update_own" ON "creation_profiles" FOR UPDATE USING (auth.uid() = "user_id") WITH CHECK (
  auth.uid() = "user_id" AND
  ("default_brand_id" IS NULL OR EXISTS (
    SELECT 1 FROM "brands" WHERE "brands"."id" = "default_brand_id" AND "brands"."created_by" = auth.uid()
  ))
);

-- Existing accounts keep today's behaviour and are not forced through a new
-- onboarding screen. Only accounts created after this migration are gated.
INSERT INTO "creation_profiles" ("user_id", "onboarding_complete")
SELECT "id", true FROM auth.users ON CONFLICT ("user_id") DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_flowpost_creation_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.creation_profiles (user_id, onboarding_complete)
  VALUES (NEW.id, false) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_flowpost_profile
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_flowpost_creation_profile();
