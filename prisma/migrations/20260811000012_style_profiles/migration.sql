-- Style memory.
--
-- One new table, and deliberately only one. Everything else this feature needs
-- already exists:
--
--   the caption corpus   `posts`. Every generation is written back to
--                        `posts.ai_studio_output.contentVariations`, and what
--                        the member actually kept is in `posts.caption`. That
--                        pairing is the whole feedback signal — comparing the
--                        two says which option was chosen, whether it was
--                        edited before publishing, and which were rejected.
--                        No separate captions table, no duplicated text.
--
--   the feedback events  `activity_logs`. Append-only, already written by the
--                        backend, already indexed on (user_id, created_at).
--                        The two signals `posts` cannot reconstruct — a
--                        selection the member never saved, and a regenerate —
--                        go in there as `caption.selected` / `caption.
--                        regenerated` rows.
--
-- What genuinely has nowhere to live is the derived profile itself: a compact,
-- expensive-to-build description of how one person writes, which is read on
-- every generation and rebuilt rarely.
--
-- ─── What this table must never contain ──────────────────────────────────────
-- Vocabulary. The payload holds measured rates (how long their captions run,
-- how often they punctuate, how often they mix scripts) and short behavioural
-- descriptions. It does not hold the words they use, and the profile builder
-- rejects any description that quotes one. A profile that remembered somebody's
-- favourite phrases would produce captions that reuse them — a template
-- generator wearing a style profile, which is the failure this whole design is
-- arranged to avoid.
--
-- ─── Access ──────────────────────────────────────────────────────────────────
-- Backend-only, the same way `social_accounts` and `activity_logs` are: RLS
-- enabled with no policies at all, which makes the table invisible to the anon
-- and authenticated PostgREST roles. The browser has no reason to read it —
-- nothing in the UI shows a style profile — and a member's inferred writing
-- style is not something another member should ever be able to query.

CREATE TABLE IF NOT EXISTS "public"."style_profiles" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"         UUID         NOT NULL,
    "context_type"    TEXT         NOT NULL DEFAULT 'personal',
    "brand_id"        UUID,
    "profile"         JSONB        NOT NULL,
    "sample_count"    INTEGER      NOT NULL DEFAULT 0,
    "source_post_ids" UUID[]       NOT NULL DEFAULT ARRAY[]::UUID[],
    "built_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "style_profiles_pkey" PRIMARY KEY ("id")
);

-- A brand profile carries its brand; a personal one never does. Mirrors the
-- CHECK on posts.brand_id / posts.context_type, so the same rule holds in both
-- places: a personal row pointing at a brand is not a state that can exist.
ALTER TABLE "public"."style_profiles"
    DROP CONSTRAINT IF EXISTS "style_profiles_context_brand_check";
ALTER TABLE "public"."style_profiles"
    ADD CONSTRAINT "style_profiles_context_brand_check"
    CHECK (
        ("context_type" = 'brand'    AND "brand_id" IS NOT NULL) OR
        ("context_type" = 'personal' AND "brand_id" IS NULL)
    );

ALTER TABLE "public"."style_profiles"
    DROP CONSTRAINT IF EXISTS "style_profiles_brand_id_fkey";
ALTER TABLE "public"."style_profiles"
    ADD CONSTRAINT "style_profiles_brand_id_fkey"
    FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE CASCADE;

-- One profile per scope. COALESCE because a NULL brand_id would otherwise make
-- every personal row distinct from every other — the same reason the
-- social_accounts uniqueness index is written this way.
CREATE UNIQUE INDEX IF NOT EXISTS "style_profiles_scope_key"
    ON "public"."style_profiles" (
        "user_id",
        "context_type",
        COALESCE("brand_id", '00000000-0000-0000-0000-000000000000'::uuid)
    );

CREATE INDEX IF NOT EXISTS "style_profiles_user_id_idx"
    ON "public"."style_profiles" ("user_id");

-- No policies. See the note above: this makes the table unreadable through
-- PostgREST for every role, while the backend connects as the owner and
-- bypasses RLS.
ALTER TABLE "public"."style_profiles" ENABLE ROW LEVEL SECURITY;
