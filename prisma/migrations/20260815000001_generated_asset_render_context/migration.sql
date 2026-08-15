-- The context a refinement needs to re-execute its parent faithfully.
--
-- `creative_brief` alone was never enough: it describes the picture, not the
-- brand, the real logo asset, the analysed reference design recipe, or the
-- requirements the member stated. `refine()` therefore rebuilt all of those
-- from empty, which silently dropped the logo and the design system and made
-- "make it darker" come back looking like a different creative.
--
-- Nullable on purpose — rows written before this column existed keep working,
-- and the service falls back to the old empty-resolve behaviour for them.
-- See server/src/ai/types.ts CreativeRenderContext.

ALTER TABLE "public"."generated_assets"
  ADD COLUMN IF NOT EXISTS "render_context" JSONB;
