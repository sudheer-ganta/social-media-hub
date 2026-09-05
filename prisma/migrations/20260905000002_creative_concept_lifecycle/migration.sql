CREATE TYPE "creative_concept_status" AS ENUM ('DISCOVERED', 'GENERATING', 'GENERATED', 'FAILED');
ALTER TYPE "generated_asset_source" ADD VALUE IF NOT EXISTS 'AI_REGENERATED';

CREATE TABLE "creative_concepts" (
  "id" TEXT NOT NULL,
  "user_id" UUID NOT NULL,
  "context_type" TEXT NOT NULL,
  "brand_id" UUID,
  "prompt" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "style_id" TEXT,
  "style_version" TEXT NOT NULL,
  "context_version" TEXT NOT NULL,
  "generation_version" TEXT NOT NULL,
  "definition" JSONB NOT NULL,
  "selected_at" TIMESTAMPTZ(6),
  "selection_count" INTEGER NOT NULL DEFAULT 0,
  "saved_at" TIMESTAMPTZ(6),
  "reuse_count" INTEGER NOT NULL DEFAULT 0,
  "generated_asset_id" UUID,
  "status" "creative_concept_status" NOT NULL DEFAULT 'DISCOVERED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creative_concepts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "creative_concepts_context_brand_check" CHECK (
    (context_type = 'personal' AND brand_id IS NULL) OR
    (context_type = 'brand' AND brand_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "creative_concepts_generated_asset_id_key" ON "creative_concepts"("generated_asset_id");
CREATE INDEX "creative_concepts_user_id_context_type_brand_id_idx" ON "creative_concepts"("user_id", "context_type", "brand_id");
CREATE INDEX "creative_concepts_style_id_idx" ON "creative_concepts"("style_id");
ALTER TABLE "creative_concepts" ADD CONSTRAINT "creative_concepts_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "creative_concepts" ADD CONSTRAINT "creative_concepts_generated_asset_id_fkey" FOREIGN KEY ("generated_asset_id") REFERENCES "generated_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "creative_concepts" ENABLE ROW LEVEL SECURITY;
