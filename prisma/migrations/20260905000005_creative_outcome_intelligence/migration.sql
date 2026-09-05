-- Phase 4: relational creative attribution, append-only event history,
-- cost observability, and idempotency. Additive and backward-compatible.

CREATE TABLE "public"."post_creative_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_id" UUID NOT NULL,
  "context_type" TEXT NOT NULL,
  "brand_id" UUID,
  "generated_asset_id" UUID NOT NULL,
  "post_id" UUID NOT NULL,
  "media_item_id" TEXT NOT NULL,
  "attachment_state" TEXT NOT NULL DEFAULT 'attached',
  "attached_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removed_at" TIMESTAMPTZ(6),
  "final_published" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_creative_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "post_creative_assets_context_check" CHECK (
    ("context_type" = 'personal' AND "brand_id" IS NULL) OR
    ("context_type" = 'brand' AND "brand_id" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "post_creative_assets_generated_asset_id_post_id_media_item_id_key"
  ON "public"."post_creative_assets"("generated_asset_id", "post_id", "media_item_id");
CREATE INDEX "post_creative_assets_owner_id_context_type_brand_id_idx"
  ON "public"."post_creative_assets"("owner_id", "context_type", "brand_id");
CREATE INDEX "post_creative_assets_post_id_attachment_state_idx"
  ON "public"."post_creative_assets"("post_id", "attachment_state");
CREATE INDEX "post_creative_assets_generated_asset_id_idx"
  ON "public"."post_creative_assets"("generated_asset_id");
ALTER TABLE "public"."post_creative_assets"
  ADD CONSTRAINT "post_creative_assets_generated_asset_id_fkey" FOREIGN KEY ("generated_asset_id") REFERENCES "public"."generated_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "post_creative_assets_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."creative_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_id" UUID NOT NULL,
  "brand_id" UUID,
  "context_type" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "concept_id" TEXT,
  "generated_asset_id" UUID,
  "post_id" UUID,
  "platform" TEXT,
  "metadata" JSONB,
  "event_id" TEXT,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creative_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_events_context_check" CHECK (
    ("context_type" = 'personal' AND "brand_id" IS NULL) OR
    ("context_type" = 'brand' AND "brand_id" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "creative_events_event_id_key" ON "public"."creative_events"("event_id");
CREATE INDEX "creative_events_owner_id_context_type_brand_id_occurred_at_idx" ON "public"."creative_events"("owner_id", "context_type", "brand_id", "occurred_at" DESC);
CREATE INDEX "creative_events_generated_asset_id_occurred_at_idx" ON "public"."creative_events"("generated_asset_id", "occurred_at" DESC);
CREATE INDEX "creative_events_post_id_occurred_at_idx" ON "public"."creative_events"("post_id", "occurred_at" DESC);
ALTER TABLE "public"."creative_events"
  ADD CONSTRAINT "creative_events_generated_asset_id_fkey" FOREIGN KEY ("generated_asset_id") REFERENCES "public"."generated_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "creative_events_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "public"."ai_usage_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_id" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "context_type" TEXT,
  "brand_id" UUID,
  "request_id" TEXT,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "image_calls" INTEGER NOT NULL DEFAULT 0,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "cache_hit" BOOLEAN NOT NULL DEFAULT false,
  "success" BOOLEAN NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  "error_code" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_usage_events_owner_id_created_at_idx" ON "public"."ai_usage_events"("owner_id", "created_at" DESC);
CREATE INDEX "ai_usage_events_request_id_idx" ON "public"."ai_usage_events"("request_id");

CREATE TABLE "public"."creative_idempotency_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_id" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "response" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creative_idempotency_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "creative_idempotency_records_owner_id_action_idempotency_key_key" ON "public"."creative_idempotency_records"("owner_id", "action", "idempotency_key");
CREATE INDEX "creative_idempotency_records_created_at_idx" ON "public"."creative_idempotency_records"("created_at");

-- Backend-only tables. The server's database-owner connection bypasses RLS;
-- browser roles receive no policy and therefore no direct access.
ALTER TABLE "public"."post_creative_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."creative_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ai_usage_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."creative_idempotency_records" ENABLE ROW LEVEL SECURITY;

-- The ledger is append-only even for privileged application roles. The owner
-- role may still administer it during migrations; ordinary UPDATE/DELETE is
-- rejected by this trigger.
CREATE FUNCTION "public"."prevent_creative_event_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  -- Permit referential SET NULL performed by a nested FK trigger while
  -- rejecting direct application UPDATE/DELETE operations.
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'creative_events is append-only';
END; $$;
CREATE TRIGGER "creative_events_no_update_delete"
BEFORE UPDATE OR DELETE ON "public"."creative_events"
FOR EACH ROW EXECUTE FUNCTION "public"."prevent_creative_event_mutation"();

-- Safe legacy backfill: only JSON array entries whose explicit `id` parses as
-- a UUID and exactly matches an owned GeneratedAsset are attributed. URLs are
-- deliberately ignored. Duplicate media entries collapse through ON CONFLICT.
INSERT INTO "public"."post_creative_assets"
  ("owner_id", "context_type", "brand_id", "generated_asset_id", "post_id", "media_item_id", "attachment_state", "attached_at", "created_at", "updated_at")
SELECT p."created_by", p."context_type", p."brand_id", ga."id", p."id", item->>'id', 'attached', p."updated_at", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "public"."posts" p
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p."media") = 'array' THEN p."media" ELSE '[]'::jsonb END) item
JOIN "public"."generated_assets" ga
  ON item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 AND ga."id" = (item->>'id')::uuid
 AND ga."user_id" = p."created_by"
 AND ga."context_type" = p."context_type"
 AND ga."brand_id" IS NOT DISTINCT FROM p."brand_id"
ON CONFLICT DO NOTHING;
