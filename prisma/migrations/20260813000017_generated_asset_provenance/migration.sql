-- Explicit provenance and Cloudinary-measured dimensions on generated_assets.
--
-- `source` makes AI_GENERATED vs AI_REFINED a real column rather than
-- something a reader has to infer from parent_asset_id being set — the same
-- reasoning that put `status` in its own enum instead of a free-text column.
--
-- `width`/`height`/`format` are Cloudinary's own measurements of the upload,
-- carried through the same way the frontend's unsigned-upload path already
-- keeps Cloudinary's numbers over a locally-decoded guess (see
-- src/services/cloudinary.service.ts's CloudinaryUploadResult).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'generated_asset_source') THEN
    CREATE TYPE "public"."generated_asset_source" AS ENUM (
      'AI_GENERATED', 'AI_REFINED'
    );
  END IF;
END
$$;

ALTER TABLE "public"."generated_assets"
  ADD COLUMN IF NOT EXISTS "source" "public"."generated_asset_source" NOT NULL DEFAULT 'AI_GENERATED';

ALTER TABLE "public"."generated_assets"
  ADD COLUMN IF NOT EXISTS "width"  INTEGER;
ALTER TABLE "public"."generated_assets"
  ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "public"."generated_assets"
  ADD COLUMN IF NOT EXISTS "format" TEXT;
