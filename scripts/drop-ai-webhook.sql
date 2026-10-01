-- Removes the legacy Make.com AI webhook.
--
-- `create-ai-webhook.sql` used to install a trigger that POSTed the *entire*
-- post row (`to_jsonb(new)` / `to_jsonb(old)`) to a hard-coded, unauthenticated
-- Make.com URL whenever `posts.ai_status` flipped to 'generating'. AI generation
-- is native now (`server/src/routes/ai.routes.ts`), so nothing needs it, and it
-- sent member content to a third party with no authentication on the receiving
-- end. That script has been deleted from the repo.
--
-- Run once against the live database to remove what it created:
--   npx prisma db execute --file scripts/drop-ai-webhook.sql
--
-- Also: the old Make webhook URL was committed to source control. Treat it as
-- public — delete or regenerate that webhook (and disable the scenario) in the
-- Make dashboard.

drop trigger if exists posts_ai_webhook on public.posts;
drop function if exists public.notify_make_ai_webhook();
