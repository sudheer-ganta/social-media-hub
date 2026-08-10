-- Multiple images per post.
--
-- One post, N uploaded assets, one ordered JSON array saying which they are and
-- how each one is framed:
--
--   [{"id":"…","url":"…","type":"image","width":1600,"height":900,
--     "crop":{"ratio":"4:5","x":0.1,"y":0,"w":0.8,"h":1,"zoom":1}}, …]
--
-- Array position *is* the publish order — an Instagram carousel, a Facebook
-- multi-photo story and a LinkedIn multi-image post all render in this order,
-- so reordering in the composer is a rewrite of this column and nothing else.
--
-- Additive and nullable on purpose. `image_url` is untouched and is still
-- written on every save as a mirror of the first item, so every existing post,
-- every existing read path and the whole AI pipeline keep working against one
-- image. A null here reads as "the single image in image_url", which is exactly
-- what those posts are.
--
-- RLS is untouched: a new column on a table whose policies already scope every
-- row to its author. The publish path re-validates the contents before building
-- any delivery URL — the browser writes this column, so it is untrusted input
-- like every other. See server/src/publish/services/media.service.ts.

ALTER TABLE "public"."posts"
  ADD COLUMN IF NOT EXISTS "media" JSONB;
