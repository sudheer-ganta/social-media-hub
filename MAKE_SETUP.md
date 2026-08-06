# Make.com Integration Guide

The app is automation-ready. This document maps the 5 Make.com scenarios onto
the actual database schema. Nothing publishes without `approved = true`.

## The pipeline at a glance

```
Draft → AI Generating → AI Ready → Approved → Scheduled → Publishing → Published
                                                                    ↘ Failed
```

The UI derives that stage from three columns:

| Column           | Values                                              | Written by |
| ---------------- | --------------------------------------------------- | ---------- |
| `status`         | draft, scheduled, publishing, published, failed     | app + Make |
| `ai_status`      | pending, generating, ready, failed                  | app ("Generate AI" sets `generating`) + Make |
| `approved`       | boolean                                             | app (human approval) |

Columns Make writes into:

| Column                | Type       | Content |
| --------------------- | ---------- | ------- |
| `ai_caption`          | text       | Generated base caption |
| `ai_hashtags`         | text[]     | e.g. `{marketing,startup,ai}` (no `#` needed — UI adds it) |
| `ai_platform_content` | jsonb      | `{"linkedin": "…", "instagram": "…", "facebook": "…", "x": "…", "threads": "…"}` |
| `platform_results`    | jsonb      | `{"instagram": {"id": "…", "url": "…"}, "facebook": {"error": "…"}}` |
| `published_at`        | timestamptz| Set when publishing completes |

## Make ↔ Supabase connection

Make needs the **service_role** key (Supabase Dashboard → Project Settings →
API) so it can bypass RLS and update any user's posts. Treat it like a root
password: paste it only into Make's Supabase connection, never anywhere else.

## Scenario 1 — AI Generation (webhook-triggered)

**Supabase side:** Dashboard → Database → Webhooks → Create:
- Table: `posts`, Events: `UPDATE` (and `INSERT` if you want auto-AI on create)
- Type: HTTP request → paste the Make webhook URL from the step below

**Make side:**
1. **Custom Webhook** (instant trigger)
2. **Filter:** `record.ai_status = "generating"` AND `old_record.ai_status ≠ "generating"`
   — the app's **Generate AI** button is what sets `generating`; the
   old/new comparison stops the scenario from re-triggering on its own
   write-back.
3. **OpenAI (or Anthropic) — Analyze image / Vision chat:** pass
   `record.image_url` + `record.title` + `record.caption` (may be empty).
   Ask for strict JSON:
   ```json
   {
     "caption": "…",
     "hashtags": ["…", "…"],
     "platform_content": {
       "linkedin": "…", "instagram": "…", "facebook": "…",
       "x": "…", "threads": "…"
     }
   }
   ```
   (One call returning JSON beats five separate calls — cheaper and atomic.)
4. **JSON Parse** module on the response.
5. **Supabase — Update a Row** (`posts`, id = `record.id`):
   - `ai_caption`, `ai_hashtags`, `ai_platform_content` from parsed JSON
   - `ai_status = "ready"`
6. **Error route:** update `ai_status = "failed"` so the UI shows a Retry button.

The app polls the post every 5s while `ai_status = "generating"`, so results
appear in the editor automatically.

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

1. Create a post in the app → click **Generate AI** → badge flips to
   *AI Generating* → confirm the webhook fired in Make.
2. Mock step 3 with a static JSON first; confirm the editor shows the AI
   panel content and the badge flips to *AI Ready*.
3. Approve → Schedule for 2 minutes from now → watch the scheduler claim it
   (*Publishing*) and finish (*Published*), with `platform_results` filled.
