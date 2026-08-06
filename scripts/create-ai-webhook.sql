-- Database webhook → Make.com AI-generation scenario.
-- Fires ONLY when a post is flagged for AI enrichment (ai_status flips to
-- 'generating'), so ordinary edits never consume Make operations.
--
-- Built directly on pg_net (async HTTP from Postgres). The payload matches
-- Supabase's standard database-webhook shape: {type, table, schema, record,
-- old_record}.
--
-- Run with: npx prisma db execute --file scripts/create-ai-webhook.sql
-- (One-off infra config, deliberately not a Prisma migration — the target
-- URL is environment-specific.)

create extension if not exists pg_net;

create or replace function public.notify_make_ai_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://hook.eu2.make.com/hwcfmm6i8hsuel76dro7ki83xw3cprd0',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'posts',
      'schema', 'public',
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    )
  );
  return new;
end;
$$;

drop trigger if exists posts_ai_webhook on public.posts;

create trigger posts_ai_webhook
  after update on public.posts
  for each row
  when (new.ai_status = 'generating' and old.ai_status is distinct from new.ai_status)
  execute function public.notify_make_ai_webhook();
