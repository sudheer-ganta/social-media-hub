-- Scheduled publishing.
--
-- No new table. A scheduled post *is* a post, and a scheduled destination *is*
-- a `post_platforms` row — the same two tables the manual publisher already
-- writes, with the same unique (post_id, provider) index that already stops a
-- post going out twice. A parallel `scheduled_posts` table would have meant a
-- second copy of the caption, the media and the context, and a second publish
-- path to keep in step with the first.
--
-- What is genuinely new is the *when* and the *bookkeeping*:
--
--   posts.scheduled_at    the canonical UTC instant the worker fires on. Kept
--                         beside publish_date/publish_time rather than
--                         replacing them: those two are wall-clock fields the
--                         browser writes through PostgREST and every existing
--                         list, filter and calendar reads. This column is the
--                         only thing the worker looks at, so a browser in the
--                         wrong timezone can never move a publish.
--   posts.timezone        the IANA zone the member picked, so editing a
--                         schedule reopens on the wall clock they chose rather
--                         than on a UTC instant translated into the browser's
--                         current zone. DST is resolved when scheduled_at is
--                         computed, on the server.
--
--   post_platforms.attempts / last_attempt_at / next_attempt_at
--                         the retry state of one destination. `next_attempt_at`
--                         is what the worker's due query orders on, so the
--                         first attempt and the third are the same query — a
--                         freshly scheduled destination simply has
--                         next_attempt_at = the post's scheduled_at.
--   post_platforms.published_at
--                         when that destination actually went out. `posts`
--                         already has one, but it cannot say "Instagram at
--                         09:30, LinkedIn at 09:31 after a retry".
--
-- Two new post_status values. PARTIALLY_PUBLISHED is the honest answer for a
-- post that reached Instagram and not X — FAILED would hide a live post and
-- PUBLISHED would hide a failure. CANCELLED is a terminal state the worker
-- refuses to execute.
--
-- RLS is untouched. `posts` policies already scope every row to its author, and
-- `post_platforms` remains invisible to PostgREST entirely — the scheduling API
-- is the backend, which connects as the owner and checks ownership in the query.

-- ─── enum values ─────────────────────────────────────────────────────────────
--
-- ADD VALUE IF NOT EXISTS is transaction-safe on PostgreSQL 12+ so long as the
-- new label is not *used* in the same transaction. Nothing below writes one.

ALTER TYPE "public"."post_status" ADD VALUE IF NOT EXISTS 'partially_published';
ALTER TYPE "public"."post_status" ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TYPE "public"."publish_status" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ─── posts: the canonical scheduled instant ──────────────────────────────────

ALTER TABLE "public"."posts"
  ADD COLUMN IF NOT EXISTS "scheduled_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "timezone" TEXT;

-- The worker's due query. Partial on scheduled_at rather than on status,
-- because the status values that may fire change (SCHEDULED for a first run,
-- PUBLISHING while a sibling destination retries) while "has a scheduled
-- instant at all" does not.
CREATE INDEX IF NOT EXISTS "posts_scheduled_at_idx"
  ON "public"."posts"("scheduled_at")
  WHERE "scheduled_at" IS NOT NULL;

-- ─── post_platforms: per-destination retry state ─────────────────────────────

ALTER TABLE "public"."post_platforms"
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_attempt_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMPTZ(6);

-- What every scheduler tick runs: "which destinations are due?". Partial, so
-- the index holds only rows that are actually waiting to fire — a table that
-- accumulates PUBLISHED rows forever does not make this scan slower.
CREATE INDEX IF NOT EXISTS "post_platforms_due_idx"
  ON "public"."post_platforms"("next_attempt_at")
  WHERE "next_attempt_at" IS NOT NULL;

-- Backfill: rows that predate this migration have never been scheduled and must
-- never be picked up. next_attempt_at NULL is exactly that, which is what the
-- ADD COLUMN already gave them — stated here so the intent is on the record.
