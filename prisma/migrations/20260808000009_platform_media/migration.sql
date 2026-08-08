-- Per-platform framing for a Personal post.
--
-- One upload, one stored asset, one row — and a small JSON map saying how each
-- selected network frames it:
--
--   {"instagram":{"ratio":"4:5","x":0.1,"y":0,"w":0.8,"h":1,"zoom":1}, …}
--
-- Fractions of the original, not pixels, so the value is independent of the
-- asset's dimensions and is turned into a Cloudinary delivery transformation at
-- publish time. The uploaded image is never rewritten — see src/utils/crop.ts.
--
-- Additive and nullable on purpose. Every existing post reads as "no crop",
-- which is exactly what they were: delivered whole. Nothing needs backfilling
-- and no existing publish behaviour changes.
--
-- RLS is untouched: this is a new column on a table whose policies already
-- scope every row to its author.

ALTER TABLE "public"."posts"
  ADD COLUMN IF NOT EXISTS "platform_media" JSONB;
