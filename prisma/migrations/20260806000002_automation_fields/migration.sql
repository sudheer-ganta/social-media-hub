-- Automation-ready fields for the Make.com / AI pipeline.
-- ai_* columns are written by the AI generation scenario; platform_results
-- and published_at by the publishing scenarios.

-- AlterTable
ALTER TABLE "public"."posts"
  ADD COLUMN "ai_status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "platform_results" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "published_at" TIMESTAMPTZ(6),
  ADD COLUMN "ai_caption" TEXT,
  ADD COLUMN "ai_hashtags" TEXT[],
  ADD COLUMN "ai_platform_content" JSONB;

-- CreateIndex
CREATE INDEX "posts_approved_idx" ON "public"."posts"("approved");

-- Widen the status lifecycle: draft → scheduled → publishing → published,
-- with failed as the error terminal state.
ALTER TABLE "public"."posts" DROP CONSTRAINT "posts_status_check";
ALTER TABLE "public"."posts"
  ADD CONSTRAINT "posts_status_check"
  CHECK ("status" IN ('draft', 'scheduled', 'publishing', 'published', 'failed'));

-- Constrain AI pipeline states
ALTER TABLE "public"."posts"
  ADD CONSTRAINT "posts_ai_status_check"
  CHECK ("ai_status" IN ('pending', 'generating', 'ready', 'failed'));
