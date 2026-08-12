-- What a member asked to publish, as opposed to what the network says it is.
--
-- One nullable column. That is the whole migration, and the nullability is the
-- feature rather than a concession.
--
-- ─── Why this is not the same column as media_type ───────────────────────────
-- `post_platforms.media_type` is an *observation*: what the network reports the
-- publication to be, corrected by the first analytics sync that hears back
-- (`media_type_from_platform`). `content_type` is a *request*: what the member
-- chose in the composer before anything was published. They disagree routinely
-- and both are worth keeping — Instagram files a Reel as a REEL whatever we
-- asked for, and a Story container reports as a STORY, but a member who chose
-- "Reel" and got something else is a bug we can only see if both are recorded.
-- Collapsing them would make that invisible.
--
-- ─── Why it reuses the media_type enum ───────────────────────────────────────
-- Because a second vocabulary for the same six words is how two halves of a
-- feature stop being comparable. TEXT, IMAGE, CAROUSEL, VIDEO, REEL and STORY
-- mean the same thing on both sides, so analytics can group "requested REEL"
-- against "observed REEL" without a translation table. OTHER exists on the enum
-- and is never written here — it is an answer a network can give, never
-- something a member can ask for.
--
-- ─── Why NULL, and why nothing is backfilled ─────────────────────────────────
-- NULL means "this post predates the composer asking". It is not missing data
-- and it is not a default waiting to be filled in: it is the instruction to
-- resolve the format the way it was resolved before this column existed —
-- no media is a text post, one item is an image, several are a carousel. See
-- `resolveContentType` in server/src/publish/services/content-type.ts.
--
-- Backfilling would be worse than useless. Every row already in this table has
-- been published; writing a format onto a finished publication invents a member
-- decision that was never made, and for a REEL or STORY it would be inventing
-- one that was not even offered at the time. Existing rows keep NULL forever.

ALTER TABLE "post_platforms"
  ADD COLUMN IF NOT EXISTS "content_type" "media_type";

COMMENT ON COLUMN "post_platforms"."content_type" IS
  'What the member asked to publish (requested). NULL for rows written before '
  'the composer offered a choice — resolved from media count at publish time. '
  'Distinct from media_type, which is what the network says it is (observed).';
