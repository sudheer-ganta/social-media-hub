CREATE TABLE "brand_intelligence_signals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "brand_id" UUID NOT NULL,
  "dimension" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "polarity" TEXT NOT NULL DEFAULT 'positive',
  "source" TEXT NOT NULL,
  "occurrence_count" INTEGER NOT NULL DEFAULT 1,
  "last_observed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "brand_intelligence_signals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "brand_intelligence_signals_brand_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "brand_intelligence_signals_polarity_check" CHECK ("polarity" IN ('positive', 'negative')),
  CONSTRAINT "brand_intelligence_signals_source_check" CHECK ("source" IN ('explicit', 'selected', 'rejected', 'saved', 'reused', 'regenerated')),
  CONSTRAINT "brand_intelligence_signals_count_check" CHECK ("occurrence_count" > 0)
);

CREATE UNIQUE INDEX "brand_intelligence_signal_identity" ON "brand_intelligence_signals"("user_id", "brand_id", "dimension", "value", "polarity", "source");
CREATE INDEX "brand_intelligence_signals_scope_idx" ON "brand_intelligence_signals"("user_id", "brand_id");

ALTER TABLE "brand_intelligence_signals" ENABLE ROW LEVEL SECURITY;
-- Backend-only intelligence. Like generated_assets, no PostgREST policies:
-- authenticated API routes verify ownership and Prisma performs all access.
