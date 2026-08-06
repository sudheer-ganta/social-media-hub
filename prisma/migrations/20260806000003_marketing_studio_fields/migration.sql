-- AI Marketing Studio fields
-- Adds 5 nullable JSONB columns to the posts table.
-- All columns are nullable so no default values are needed and
-- existing rows / the existing Make.com scenario are unaffected.

-- Input: written by the React frontend before triggering Make
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "ai_marketing_settings" JSONB;

-- Outputs: written back by Make.com after Gemini generates content
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "ai_image_analysis"     JSONB;
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "ai_content_variations" JSONB;
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "ai_cta_options"        JSONB;
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "ai_hashtag_groups"     JSONB;
