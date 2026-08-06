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

## Scenario 1b — AI Marketing Studio envelope

The Marketing Studio is Scenario 1 with a richer contract. Everything travels
through **two JSONB columns** rather than a column per feature, so adding a
capability later is a prompt change in Make plus a key in the JSON — never a
database migration.

| Column | Direction | Contents |
| --- | --- | --- |
| `ai_studio_input` | app → Make | Goal, funnel stage, brand voice snapshot, competitor, feature flags, prompt modules |
| `ai_studio_output` | Make → app | One envelope holding every generated section plus `meta` |

The authoritative shapes live in [`src/ai/types.ts`](src/ai/types.ts) — treat
that file as the spec and this section as the operator's copy.

**Building the scenario?** [MAKE_GEMINI_PROMPT.md](MAKE_GEMINI_PROMPT.md) has
the ready-to-paste prompt and response schema for the single-call design.

### Reading the input

`record.ai_studio_input` is already-parsed JSON. The fields the prompt cares
about:

```json
{
  "schemaVersion": 1,
  "goal": "lead_generation",
  "funnelStage": "MOFU",
  "brandVoice": {
    "name": "Aurora", "tone": "Professional", "writingStyle": "Conversational",
    "wordsToUse": ["crafted"], "wordsToAvoid": ["cheap"],
    "emojiStyle": "Light", "ctaStyle": "Soft",
    "targetAudience": "Founders, 28–45", "personality": "Premium",
    "description": "…", "mission": "…"
  },
  "brandVoiceProfileId": "uuid-or-null",
  "competitor": { "website": "…", "brandName": "…", "socialHandle": "…" },
  "features": {
    "seo": false, "campaign": false,
    "competitorAnalysis": false, "platformVariations": false
  },
  "language": "English",
  "captionLength": "Medium",
  "modules": { "persona": {…}, "goalModule": {…}, "funnelModule": {…},
               "brandVoiceModule": {…}, "competitorModule": {…} },
  "builtAt": "2026-08-06T09:14:22.114Z"
}
```

`modules` is pre-expanded prompt text — concatenate it straight into the Gemini
prompt instead of rebuilding those instructions in Make.

**Honour the flags.** Generate `seo`, `campaign`, `competitor` and
`platformVariations` only when the matching flag in `features` is `true`. Each
one is a separate Gemini call, so skipping them when off is most of the cost
control.

### Writing the output

One **Supabase — Update a Row** on `posts` (id = `record.id`) setting
`ai_studio_output` to the envelope below and `ai_status = "ready"`.

```json
{
  "schemaVersion": 1,
  "meta": {
    "status": "complete",
    "generatedAt": "2026-08-06T09:15:03.882Z",
    "model": "gemini-2.0-flash",
    "durationMs": 41768,
    "error": null,
    "produced": ["imageAnalysis", "contentVariations", "ctaOptions", "hashtagGroups"]
  },

  "imageAnalysis": {
    "productCategory": "Skincare", "industry": "Beauty",
    "targetAudience": "Women 25–40", "mood": "Calm, clinical",
    "colorPalette": ["#1A1A2E", "#E94560"], "brandStyle": "Minimal luxury",
    "primarySubject": "Amber serum bottle", "secondarySubjects": ["Linen cloth"],
    "objects": ["bottle", "dropper"], "sceneDescription": "…",
    "suggestedCampaignType": "Product launch",
    "suggestedMarketingObjective": "Lead generation",
    "suggestedBuyerPersona": "…", "confidenceScore": 87
  },

  "contentVariations": {
    "variations": [
      { "tone": "Professional", "caption": "…", "hook": "…", "wordCount": 62 }
    ]
  },

  "ctaOptions": {
    "options": [ { "type": "Soft", "text": "See the ritual →", "label": "Builds curiosity" } ]
  },

  "hashtagGroups": {
    "groups": [
      { "category": "trending", "suggestedQuantity": 5,
        "hashtags": [ { "tag": "skincare", "difficultyScore": 78, "popularityScore": 92 } ] }
    ]
  },

  "seo": {
    "primaryKeyword": "vitamin c serum",
    "keywords": [ { "keyword": "vitamin c serum", "searchVolume": 40500,
                    "difficultyScore": 64, "intent": "commercial" } ],
    "metaTitle": "…", "metaDescription": "…", "altText": "…",
    "slug": "vitamin-c-serum", "readabilityScore": 71
  },

  "campaign": {
    "name": "Glow Week", "bigIdea": "…", "durationDays": 14,
    "beats": [ { "day": 0, "channel": "instagram", "angle": "Teaser",
                 "contentIdea": "…" } ],
    "kpis": ["Email signups"], "budgetTier": "organic"
  },

  "competitor": {
    "brandName": "…", "positioning": "…", "toneObserved": "…",
    "contentThemes": ["…"], "postingFrequency": "4–5×/week",
    "strengths": ["…"], "weaknesses": ["…"], "gaps": ["…"],
    "differentiationAdvice": "…"
  },

  "platformVariations": {
    "instagram": { "caption": "…", "hashtags": ["skincare"],
                   "characterCount": 380, "notes": "First 125 chars show before 'more'" }
  }
}
```

Rules the app relies on:

- **Every section key is optional.** A run with `features.seo = false` simply
  omits `seo`. Never write `null` for a whole section — omit the key.
- **`meta` is mandatory.** Without it the UI cannot tell a failed run from a
  post that was never generated. `produced` should list exactly the section
  keys present in this envelope.
- **Enum values are exact strings.** `tone` must be one of the nine
  `ContentTone` values, `category` one of the five hashtag categories, `intent`
  one of the four SEO intents, `budgetTier` one of
  `organic|low|medium|high`. Anything else renders as an unstyled fallback.
- **Scores are 0–100 integers**, colours are hex strings with `#`, and
  hashtag `tag` values carry **no** leading `#`.
- **`schemaVersion` stays `1`** until `STUDIO_SCHEMA_VERSION` in
  `src/ai/types.ts` changes.

### Partial and failed runs

Don't discard a run because one Gemini call failed. Write what you have with a
degraded status — the UI shows a warning banner and still renders the sections
that came back:

```json
{
  "schemaVersion": 1,
  "meta": {
    "status": "partial",
    "generatedAt": "2026-08-06T09:15:03.882Z",
    "model": "gemini-2.0-flash",
    "durationMs": 38210,
    "error": "SEO call returned malformed JSON after 2 retries",
    "produced": ["imageAnalysis", "contentVariations"]
  },
  "imageAnalysis": { "…": "…" },
  "contentVariations": { "…": "…" }
}
```

Use `"status": "failed"` with `produced: []` when nothing usable came back, and
still set `ai_status = "failed"` on the row so the Retry button appears.

### Migrating an existing scenario

The old per-feature columns (`ai_marketing_settings`, `ai_image_analysis`,
`ai_content_variations`, `ai_cta_options`, `ai_hashtag_groups`) are dropped by
migration `20260806000003`. In the Supabase — Update a Row module:

1. Delete those five field mappings.
2. Read settings from `record.ai_studio_input` instead of
   `record.ai_marketing_settings`.
3. Add one `ai_studio_output` mapping built from the JSON above — the four old
   payloads become the `imageAnalysis`, `contentVariations`, `ctaOptions` and
   `hashtagGroups` keys, unchanged in shape.
4. Add the `meta` block. This is the only genuinely new required work.

`ai_caption`, `ai_hashtags` and `ai_platform_content` are untouched — the app
still renders them as legacy fallbacks, so Scenario 1 keeps working during the
switchover.

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
