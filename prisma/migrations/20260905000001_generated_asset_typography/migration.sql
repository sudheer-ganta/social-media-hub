-- The automatic typography engine's choice for this creative — headline/body/
-- accent font, weights, and the reasoning behind them (see
-- server/src/ai/typography/font-selector.ts's TypographySelection).
--
-- Never a user input and never required for generation to work: nullable so
-- rows written before this column existed keep working, and a render whose
-- typography failed to persist still has a usable image. Read-only in the UI
-- (spec: the user never selects a font) — see GET /api/ai/creative response
-- shape in server/src/routes/creative.routes.ts.

ALTER TABLE "public"."generated_assets"
  ADD COLUMN IF NOT EXISTS "typography" JSONB;
