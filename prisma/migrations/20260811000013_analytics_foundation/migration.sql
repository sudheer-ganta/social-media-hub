-- Real analytics: the data foundation.
--
-- Three new tables and two new columns. Nothing here computes, projects or
-- estimates anything — every number that will ever land in these tables comes
-- from a network's own analytics API, and every metric a network does not
-- report stays NULL.
--
-- ─── Why snapshots rather than columns on post_platforms ─────────────────────
-- `post_platforms` is a publish ledger: one row per destination, written once
-- when a post goes out. Metrics are a time series — a post has 500 impressions
-- at T+1h and 5,200 at T+72h, and both are true. Adding `impressions` to the
-- ledger would mean overwriting the first with the second, which destroys the
-- only data a post-lifecycle or best-time analysis could ever be built from.
--
-- ─── The two columns that do belong on the ledger ────────────────────────────
--   social_account_id  which connection published it. `provider` stopped being
--                      enough when a member could hold a personal and a brand
--                      LinkedIn at once — a re-sync has to present the token
--                      that owns the post, and re-deriving that at read time is
--                      a guess. SET NULL on delete: disconnecting an account
--                      must not erase the record that a post was published.
--   media_type         what the publication actually is *on that network*. The
--                      same FlowPost content is a REEL on Instagram and an
--                      IMAGE on LinkedIn; filing both under one label makes
--                      "which format works best" unanswerable.
--                      `media_type_from_platform` records whether the network
--                      said so or we inferred it from the upload, so a later
--                      sync can correct an inference and nothing can downgrade
--                      a confirmed value back to a guess.
--
-- ─── Access ──────────────────────────────────────────────────────────────────
-- Backend-only, exactly like social_accounts, activity_logs and style_profiles:
-- RLS enabled with no policies at all, which makes these tables invisible to
-- the anon and authenticated PostgREST roles. The browser reads analytics
-- through /api/analytics, which enforces context and brand ownership in the
-- query. It must never be able to read another member's reach.

-- ─── enums ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_type') THEN
        CREATE TYPE "public"."media_type" AS ENUM (
            'TEXT', 'IMAGE', 'VIDEO', 'CAROUSEL', 'REEL', 'STORY', 'OTHER'
        );
    END IF;
END
$$;

-- No UNAVAILABLE member on purpose. A metric a network does not report is a
-- NULL column, not a differently-sourced row.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metric_source') THEN
        CREATE TYPE "public"."metric_source" AS ENUM ('PLATFORM_API', 'DERIVED');
    END IF;
END
$$;

-- ─── post_platforms: which connection, and what format ───────────────────────

ALTER TABLE "public"."post_platforms"
    ADD COLUMN IF NOT EXISTS "social_account_id"        UUID,
    ADD COLUMN IF NOT EXISTS "media_type"               "public"."media_type",
    ADD COLUMN IF NOT EXISTS "media_type_from_platform" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "public"."post_platforms"
    DROP CONSTRAINT IF EXISTS "post_platforms_social_account_id_fkey";
ALTER TABLE "public"."post_platforms"
    ADD CONSTRAINT "post_platforms_social_account_id_fkey"
    FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id")
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "post_platforms_social_account_id_idx"
    ON "public"."post_platforms" ("social_account_id");

-- The analytics read path, and the only query the intelligence window runs:
-- "the last N things this member actually published". Partial on PUBLISHED
-- because every other status is excluded by definition — a draft, a failure and
-- a cancellation are not performance data — and this keeps the index to the
-- rows that are.
CREATE INDEX IF NOT EXISTS "post_platforms_published_idx"
    ON "public"."post_platforms" ("published_at" DESC)
    WHERE "status" = 'PUBLISHED';

-- Existing rows are deliberately left with social_account_id NULL and
-- media_type NULL. Backfilling either would mean inventing it: the connection a
-- historical post went out through may since have been deleted and remade, and
-- nothing recorded what format the network filed it as. NULL reads as "cannot
-- be re-synced" / "format unknown", which is the truth. It never reads as "was
-- not published" — that is what `status` says.

-- ─── post_metric_snapshots ───────────────────────────────────────────────────
--
-- Append-only. Nothing in the codebase updates a row in this table.

CREATE TABLE IF NOT EXISTS "public"."post_metric_snapshots" (
    "id"               UUID           NOT NULL DEFAULT gen_random_uuid(),
    "post_platform_id" UUID           NOT NULL,
    "captured_at"      TIMESTAMPTZ(6) NOT NULL,
    "source"           "public"."metric_source" NOT NULL DEFAULT 'PLATFORM_API',

    -- Every one nullable, and every one means the same thing when null: this
    -- network does not report it. Readers propagate the null; nothing defaults
    -- it to zero.
    "impressions"   INTEGER,
    "reach"         INTEGER,
    "views"         INTEGER,
    "likes"         INTEGER,
    "comments"      INTEGER,
    "shares"        INTEGER,
    "reposts"       INTEGER,
    "saves"         INTEGER,
    "clicks"        INTEGER,
    "video_views"   INTEGER,
    "watch_time_ms" INTEGER,

    -- The network's response, unmodified. Meta has already replaced
    -- `impressions` with `views` and removes more Page Insights metrics in June
    -- 2026; keeping the original payload is what lets history be re-normalised
    -- after a shape change rather than thrown away.
    "raw" JSONB,

    CONSTRAINT "post_metric_snapshots_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."post_metric_snapshots"
    DROP CONSTRAINT IF EXISTS "post_metric_snapshots_post_platform_id_fkey";
ALTER TABLE "public"."post_metric_snapshots"
    ADD CONSTRAINT "post_metric_snapshots_post_platform_id_fkey"
    FOREIGN KEY ("post_platform_id") REFERENCES "public"."post_platforms"("id")
    ON DELETE CASCADE;

-- Idempotency. The sync service floors captured_at to the hour, so a re-run
-- inside the same hour collides here and is skipped rather than double-counted.
-- Distinct hours are distinct observations and both are kept.
CREATE UNIQUE INDEX IF NOT EXISTS "post_metric_snapshots_observation_key"
    ON "public"."post_metric_snapshots" ("post_platform_id", "captured_at");

CREATE INDEX IF NOT EXISTS "post_metric_snapshots_latest_idx"
    ON "public"."post_metric_snapshots" ("post_platform_id", "captured_at" DESC);

ALTER TABLE "public"."post_metric_snapshots" ENABLE ROW LEVEL SECURITY;

-- ─── account_metric_snapshots ────────────────────────────────────────────────
--
-- Also append-only. The scope columns are duplicated from social_accounts on
-- purpose: a member who disconnects and reconnects Instagram gets a *new*
-- social_accounts row, and without these the follower history from before the
-- reconnect would become unattributable — which is the same as losing it. They
-- are also what lets the context filter run as a column predicate rather than a
-- join, so a Personal query can never read a brand's audience.

CREATE TABLE IF NOT EXISTS "public"."account_metric_snapshots" (
    "id"                  UUID           NOT NULL DEFAULT gen_random_uuid(),
    "social_account_id"   UUID,
    "user_id"             UUID           NOT NULL,
    "context_type"        TEXT           NOT NULL DEFAULT 'personal',
    "brand_id"            UUID,
    "provider"            TEXT           NOT NULL,
    "provider_account_id" TEXT           NOT NULL,
    "captured_at"         TIMESTAMPTZ(6) NOT NULL,
    "source"              "public"."metric_source" NOT NULL DEFAULT 'PLATFORM_API',

    "followers"     INTEGER,
    "following"     INTEGER,
    "post_count"    INTEGER,
    "impressions"   INTEGER,
    "reach"         INTEGER,
    "profile_views" INTEGER,

    "raw" JSONB,

    CONSTRAINT "account_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- SET NULL, never CASCADE. The whole point of this table is that it outlives
-- the connection: "how has my audience grown since I started with FlowPost" has
-- to survive a reconnect.
ALTER TABLE "public"."account_metric_snapshots"
    DROP CONSTRAINT IF EXISTS "account_metric_snapshots_social_account_id_fkey";
ALTER TABLE "public"."account_metric_snapshots"
    ADD CONSTRAINT "account_metric_snapshots_social_account_id_fkey"
    FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id")
    ON DELETE SET NULL;

-- Mirrors the CHECK on posts and style_profiles: a personal row never carries a
-- brand, a brand row always does. This is the constraint that makes "never
-- blend Personal and Brand" a property of the database rather than of a query
-- somebody remembered to write.
ALTER TABLE "public"."account_metric_snapshots"
    DROP CONSTRAINT IF EXISTS "account_metric_snapshots_context_brand_check";
ALTER TABLE "public"."account_metric_snapshots"
    ADD CONSTRAINT "account_metric_snapshots_context_brand_check"
    CHECK (
        ("context_type" = 'brand'    AND "brand_id" IS NOT NULL) OR
        ("context_type" = 'personal' AND "brand_id" IS NULL)
    );

-- Keyed on the *account*, not the connection row, so a reconnect continues the
-- same series instead of starting a second one beside it.
CREATE UNIQUE INDEX IF NOT EXISTS "account_metric_snapshots_observation_key"
    ON "public"."account_metric_snapshots"
       ("user_id", "provider", "provider_account_id", "captured_at");

CREATE INDEX IF NOT EXISTS "account_metric_snapshots_scope_idx"
    ON "public"."account_metric_snapshots"
       ("user_id", "context_type", "brand_id", "captured_at" DESC);

ALTER TABLE "public"."account_metric_snapshots" ENABLE ROW LEVEL SECURITY;

-- ─── metric_sync_state ───────────────────────────────────────────────────────
--
-- The one table here that is not append-only: this is a cursor, not history.
-- CASCADE is right — a sync cursor for a connection that no longer exists is
-- not worth keeping, and the snapshots it produced are stored elsewhere.

CREATE TABLE IF NOT EXISTS "public"."metric_sync_state" (
    "social_account_id"    UUID           NOT NULL,
    "last_sync_at"         TIMESTAMPTZ(6),
    "last_success_at"      TIMESTAMPTZ(6),
    "consecutive_failures" INTEGER        NOT NULL DEFAULT 0,
    "last_error"           TEXT,
    "rate_limited_until"   TIMESTAMPTZ(6),
    "updated_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "metric_sync_state_pkey" PRIMARY KEY ("social_account_id")
);

ALTER TABLE "public"."metric_sync_state"
    DROP CONSTRAINT IF EXISTS "metric_sync_state_social_account_id_fkey";
ALTER TABLE "public"."metric_sync_state"
    ADD CONSTRAINT "metric_sync_state_social_account_id_fkey"
    FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id")
    ON DELETE CASCADE;

ALTER TABLE "public"."metric_sync_state" ENABLE ROW LEVEL SECURITY;
