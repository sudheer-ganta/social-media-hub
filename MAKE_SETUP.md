# Make.com Integration Guide

Publishing automation only. **AI generation is no longer part of this
document** — since Sprint 4.1 it runs natively on the Express backend
(`server/src/ai/`, `POST /api/ai/caption`) and Make has no role in it. See
[README.md](README.md) for that architecture.

What remains here is the scheduling and publishing pipeline, which is still
Make-driven. Nothing publishes without `approved = true`.

## The pipeline at a glance

```
Draft → AI Ready → Approved → Scheduled → Publishing → Published
                                                     ↘ Failed
```

The UI derives that stage from three columns:

| Column           | Values                                              | Written by |
| ---------------- | --------------------------------------------------- | ---------- |
| `status`         | draft, scheduled, publishing, published, failed     | app + Make |
| `ai_status`      | pending, ready, failed                              | app (the backend AI module, via the posts API) |
| `approved`       | boolean                                             | app (human approval) |

Columns Make writes into:

| Column                | Type       | Content |
| --------------------- | ---------- | ------- |
| `platform_results`    | jsonb      | `{"instagram": {"id": "…", "url": "…"}, "facebook": {"error": "…"}}` |
| `published_at`        | timestamptz| Set when publishing completes |

Columns Make **reads** but must never write:

| Column                | Type       | Content |
| --------------------- | ---------- | ------- |
| `ai_caption`          | text       | Generated base caption |
| `ai_hashtags`         | text[]     | e.g. `{marketing,startup,ai}` (no `#` — the UI adds it) |
| `ai_platform_content` | jsonb      | `{"linkedin": "…", "instagram": "…", …}` |
| `ai_studio_output`    | jsonb      | The full generation envelope — see `src/ai/types.ts` |

## Make ↔ Supabase connection

Make needs the **service_role** key (Supabase Dashboard → Project Settings →
API) so it can bypass RLS and update any user's posts. Treat it like a root
password: paste it only into Make's Supabase connection, never anywhere else.

## Retired: Scenario 1 and 1b — AI Generation

Deleted in Sprint 4.1. Captions, hashtags and per-platform versions are now
written by the backend AI module and saved through the app's own posts API.

**If you are upgrading an existing workspace, do this once:**

1. Supabase Dashboard → Database → Webhooks → **disable or delete** the
   `posts` webhook that pointed at Make. Nothing sets `ai_status` to
   `'generating'` any more, so the scenario would never fire — but an enabled
   webhook still costs an HTTP call on every post update.
2. Make → **deactivate** the AI generation scenario (and 1b if you built it).
3. Remove the Gemini API key from that Make connection. The key now lives in
   the backend's `GEMINI_API_KEY` and nowhere else.
4. Leave the Supabase service_role connection in place — Scenarios 3–5 below
   still need it.

Rows left at `ai_status = 'generating'` by a scenario that died mid-run are
harmless: the app now reads them as "never generated" and offers a fresh run.

## Scenario 2 — Approval (no Make needed)

Approval is human-only and lives in the app: **AI Content panel → Approve**
sets `approved = true`. Nothing to build in Make; the gate is just a column
every later scenario filters on.

## Scenario 3 — Scheduler (time-triggered)

1. **Schedule trigger:** every 5 minutes.
2. **Supabase — Search Rows** on `posts` with filters:
   - `approved = true`
   - `status = "scheduled"`
   - `publish_date ≤ today`
   - and (`publish_date < today` OR `publish_time ≤ now`)
   (Times are stored naive — decide one timezone for the Make server logic
   and stick to it.)
3. **Iterator** over results.
4. **Supabase — Update a Row:** `status = "publishing"` (claims the post so a
   second scheduler tick can't double-publish it).
5. Route into Scenario 4's flow (same scenario, after the update step).

## Scenario 4 — Publisher (router)

After the claim step, add a **Router** with one branch per platform. Gate each
branch with a filter: `record.platforms` contains `"instagram"` etc.

Per branch:
- **Instagram (Business):** `POST /{ig-user-id}/media` with
  `image_url` + caption → then `/{ig-user-id}/media_publish`.
  ⚠ Instagram only accepts **JPEG** URLs. Cloudinary converts on the fly —
  insert `f_jpg` into the URL:
  `https://res.cloudinary.com/<cloud>/image/upload/f_jpg/v123/abc.png`
- **Facebook Page:** `POST /{page-id}/photos` with `url` + `message`.
- **LinkedIn / X / Threads:** add later; same pattern.

Caption to send: `ai_platform_content[platform]` if present, else `caption`,
plus hashtags.

## Scenario 5 — Final Update

After the router branches complete (aggregate them):
- **Success:** Supabase Update Row:
  - `status = "published"`, `published_at = now`
  - `platform_results = {"instagram": {"id": "…", "url": "…"}, …}`
- **Any branch failed:** `status = "failed"`,
  `platform_results.<platform> = {"error": "<message>"}`
  The UI shows a red **Failed** badge; fixing and re-scheduling is manual by
  design.

## Test path (before touching real APIs)

1. Create a post in the app → click **Generate AI** → captions appear in the
   panel within a few seconds → **Save Draft**. No Make involvement at all.
2. Approve → Schedule for 2 minutes from now → watch the scheduler claim it
   (*Publishing*) and finish (*Published*), with `platform_results` filled.
