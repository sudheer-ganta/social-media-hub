# Gemini prompt & response schema — AI Marketing Studio

Everything needed for the single-call design: one Gemini request returns the
complete `ai_studio_output` envelope, Make parses it and writes it to the
column. No per-field mapping.

Companion to [MAKE_SETUP.md](MAKE_SETUP.md) § *Scenario 1b*. The authoritative
shapes live in [`src/ai/types.ts`](src/ai/types.ts).

## Your existing scenario

Current modules, and what happens to each:

| # | Module | Action |
| --- | --- | --- |
| 2 | Webhooks — Custom webhook | **Keep** unchanged |
| 4 | HTTP — Download a file | **Keep** — fetches `record.image_url` for the inline image part |
| 5 | Gemini — POST `…gemini-2.5-flash:generateContent` | **Replace the request body** with [`make/gemini-request-body.json`](make/gemini-request-body.json) |
| 6 | JSON — Parse JSON | **Delete** (optional — see below) |
| 8 | JSON — Create JSON | **Delete** |
| 7 | HTTP — PATCH Make a request | **Replace the body** with the two-field payload below |

That leaves four modules: **2 → 4 → 5 → 7**.

### Why 6 and 8 can go

With `responseSchema` set, Gemini's returned text is *guaranteed* to be valid
JSON matching the envelope. So you can inject that text **raw** into the PATCH
body instead of parsing it into an object and rebuilding it:

```json
{
  "ai_studio_output": {{5.data.candidates[1].content.parts[1].text}},
  "ai_status": "ready"
}
```

No quotes around the mapping — the text *is* a JSON object, dropped in as a
value. Parsing it (module 6) only to reassemble it (module 8) is a round trip
that buys nothing and gives two more places for a mapping to break.

Make arrays are **1-indexed**, hence `candidates[1]` and `parts[1]`, not `[0]`.

The HTTP module exposes its parsed response as **`data`**, not `body` — matching
what module 6 already references (`5. Data.candidates[]: content.parts[]: text`).

**Keep module 6 if you want a safety net.** Parse JSON fails loudly on
malformed output, so the scenario stops at a module you can inspect rather than
sending a broken body to Supabase. Then reference `{{6.…}}` in module 7. Costs
one module; worth it while you're still tuning the prompt.

## Module 5 — the request body

The full body is in [`make/gemini-request-body.json`](make/gemini-request-body.json)
— paste it into the HTTP module's **Request content** field with body type
**Raw** and content type **JSON (application/json)**.

It contains:

| Part | Purpose |
| --- | --- |
| `systemInstruction` | The five-role persona and the brand-voice / no-invented-facts rules |
| `contents[0].parts[0].inline_data` | The downloaded image — `{{base64(4.data)}}` with the mime type from module 4's headers |
| `contents[0].parts[1].text` | The user message, including `{{toString(2.record.ai_studio_input)}}` |
| `generationConfig.responseMimeType` | `application/json` |
| `generationConfig.responseSchema` | The full envelope schema |

Module references assume the webhook is **2** and the download is **4**, matching
your scenario. The prompt text is pre-escaped, so the file pastes as valid JSON
without hand-fixing newlines.

Structured output is what makes the single call safe — with a response schema
set, Gemini cannot return prose, trailing commas or markdown fences, which is
the usual cause of a malformed run.

**Temperature** is `0.9` for copy variety. Drop to `0.4` if the output drifts
off-brief.

## Module 7 — the PATCH

Against Supabase REST, targeting the row the webhook fired for:

- **URL** — `{{SUPABASE_URL}}/rest/v1/posts?id=eq.{{2.record.id}}`
- **Method** — `PATCH`
- **Headers** — `apikey` and `Authorization: Bearer …` with the **service_role**
  key, plus `Content-Type: application/json` and `Prefer: return=minimal`
- **Body** — the two-field payload shown above

`return=minimal` stops Supabase echoing the whole row back, which keeps the
execution log readable.

## System instruction

```
You are a marketing team in one: a strategist, a copywriter, an SEO specialist,
a social media manager and a brand consultant. You analyse a product image and
produce a complete, ready-to-publish marketing package.

Rules:
- Obey the brand voice exactly. Use the words in wordsToUse where they fit
  naturally; never use any word in wordsToAvoid.
- Write for the stated target audience, in the stated language, at the stated
  caption length.
- Match the funnel stage: TOFU educates and attracts, MOFU builds
  consideration, BOFU drives the decision, Retention deepens an existing
  relationship.
- Never invent product facts that are not visible in the image or stated in
  the input. Describe what you can see; do not claim ingredients,
  certifications, prices or results you have not been given.
- Return only the fields the schema defines. Populate an optional section only
  when its feature flag is true; omit the key entirely otherwise. Never emit a
  section filled with placeholder or empty values.
- Set meta.generatedAt, meta.model and meta.durationMs to null. The automation
  layer fills those in, not you.
```

## User message

Pass the whole input object as one string rather than wiring twenty separate
references — fewer mappings to break when the shape changes:

```
Generate the marketing package for this image.

STUDIO INPUT:
{{toString(2.record.ai_studio_input)}}

POST CONTEXT:
title: {{2.record.title}}
existing caption: {{2.record.caption}}

Read `features` in the studio input and honour it strictly:
- features.seo → include "seo", otherwise omit the key
- features.campaign → include "campaign", otherwise omit the key
- features.competitorAnalysis → include "competitor", otherwise omit the key
- features.platformVariations → include "platformVariations", otherwise omit the key

Always include: imageAnalysis, contentVariations, ctaOptions, hashtagGroups.

For contentVariations produce between 3 and 9 variations, each in a distinct
tone drawn from the allowed tone values, each with a hook that works as a
standalone opening line.

For hashtagGroups produce at least the trending, niche and branded groups.
difficultyScore and popularityScore are your best estimates on a 0-100 scale.
Emit tags without a leading "#".

Set meta.status to "complete" and meta.produced to the exact list of section
keys present in your response.
```

These are already numbered for your scenario (webhook = module 2). The
pre-escaped version lives in [`make/gemini-request-body.json`](make/gemini-request-body.json)
— that file is what you paste; the text here is for reading and editing.

## Response schema

Already embedded at `generationConfig.responseSchema` in
[`make/gemini-request-body.json`](make/gemini-request-body.json) — reproduced
here for reading. Optional sections are absent from `required`, which is what
lets the model legitimately omit them.

```json
{
  "type": "object",
  "properties": {
    "schemaVersion": { "type": "integer" },
    "meta": {
      "type": "object",
      "properties": {
        "status": { "type": "string", "enum": ["complete", "partial", "failed"] },
        "generatedAt": { "type": "string", "nullable": true },
        "model": { "type": "string", "nullable": true },
        "durationMs": { "type": "integer", "nullable": true },
        "error": { "type": "string", "nullable": true },
        "produced": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["status", "produced"]
    },

    "imageAnalysis": {
      "type": "object",
      "properties": {
        "productCategory": { "type": "string" },
        "industry": { "type": "string" },
        "targetAudience": { "type": "string" },
        "mood": { "type": "string" },
        "colorPalette": {
          "type": "array",
          "items": { "type": "string", "description": "Hex colour including the leading #" }
        },
        "brandStyle": { "type": "string" },
        "primarySubject": { "type": "string" },
        "secondarySubjects": { "type": "array", "items": { "type": "string" } },
        "objects": { "type": "array", "items": { "type": "string" } },
        "sceneDescription": { "type": "string" },
        "suggestedCampaignType": { "type": "string" },
        "suggestedMarketingObjective": { "type": "string" },
        "suggestedBuyerPersona": { "type": "string" },
        "confidenceScore": { "type": "integer", "description": "0-100" }
      },
      "required": [
        "productCategory", "industry", "targetAudience", "mood", "colorPalette",
        "brandStyle", "primarySubject", "secondarySubjects", "objects",
        "sceneDescription", "suggestedCampaignType", "suggestedMarketingObjective",
        "suggestedBuyerPersona", "confidenceScore"
      ]
    },

    "contentVariations": {
      "type": "object",
      "properties": {
        "variations": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "tone": {
                "type": "string",
                "enum": ["Professional", "Minimal", "Luxury", "Storytelling",
                         "Emotional", "Sales", "Corporate", "Creative", "Technical"]
              },
              "caption": { "type": "string" },
              "hook": { "type": "string" },
              "wordCount": { "type": "integer" }
            },
            "required": ["tone", "caption", "hook", "wordCount"]
          }
        }
      },
      "required": ["variations"]
    },

    "ctaOptions": {
      "type": "object",
      "properties": {
        "options": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": ["Soft", "Hard", "Luxury", "Professional", "Urgency", "Minimal"]
              },
              "text": { "type": "string" },
              "label": { "type": "string", "description": "Short rationale, e.g. 'Builds curiosity'" }
            },
            "required": ["type", "text", "label"]
          }
        }
      },
      "required": ["options"]
    },

    "hashtagGroups": {
      "type": "object",
      "properties": {
        "groups": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "category": {
                "type": "string",
                "enum": ["trending", "niche", "location", "branded", "competitor"]
              },
              "hashtags": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "tag": { "type": "string", "description": "No leading #" },
                    "difficultyScore": { "type": "integer", "description": "0-100" },
                    "popularityScore": { "type": "integer", "description": "0-100" }
                  },
                  "required": ["tag", "difficultyScore", "popularityScore"]
                }
              },
              "suggestedQuantity": { "type": "integer" }
            },
            "required": ["category", "hashtags", "suggestedQuantity"]
          }
        }
      },
      "required": ["groups"]
    },

    "seo": {
      "type": "object",
      "properties": {
        "primaryKeyword": { "type": "string" },
        "keywords": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "keyword": { "type": "string" },
              "searchVolume": { "type": "integer", "nullable": true },
              "difficultyScore": { "type": "integer", "description": "0-100" },
              "intent": {
                "type": "string",
                "enum": ["informational", "commercial", "transactional", "navigational"]
              }
            },
            "required": ["keyword", "difficultyScore", "intent"]
          }
        },
        "metaTitle": { "type": "string", "description": "Max 60 characters" },
        "metaDescription": { "type": "string", "description": "Max 160 characters" },
        "altText": { "type": "string", "description": "Max 125 characters" },
        "slug": { "type": "string", "description": "lowercase-hyphenated" },
        "readabilityScore": { "type": "integer", "description": "0-100" }
      },
      "required": ["primaryKeyword", "keywords", "metaTitle", "metaDescription",
                   "altText", "slug", "readabilityScore"]
    },

    "campaign": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "bigIdea": { "type": "string" },
        "durationDays": { "type": "integer" },
        "beats": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "day": { "type": "integer", "description": "Offset from campaign start; first beat is 0" },
              "channel": { "type": "string" },
              "angle": { "type": "string" },
              "contentIdea": { "type": "string" }
            },
            "required": ["day", "channel", "angle", "contentIdea"]
          }
        },
        "kpis": { "type": "array", "items": { "type": "string" } },
        "budgetTier": { "type": "string", "enum": ["organic", "low", "medium", "high"] }
      },
      "required": ["name", "bigIdea", "durationDays", "beats", "kpis", "budgetTier"]
    },

    "competitor": {
      "type": "object",
      "properties": {
        "brandName": { "type": "string" },
        "positioning": { "type": "string" },
        "toneObserved": { "type": "string" },
        "contentThemes": { "type": "array", "items": { "type": "string" } },
        "postingFrequency": { "type": "string" },
        "strengths": { "type": "array", "items": { "type": "string" } },
        "weaknesses": { "type": "array", "items": { "type": "string" } },
        "gaps": { "type": "array", "items": { "type": "string" },
                  "description": "Angles the competitor is not claiming" },
        "differentiationAdvice": { "type": "string" }
      },
      "required": ["brandName", "positioning", "toneObserved", "contentThemes",
                   "postingFrequency", "strengths", "weaknesses", "gaps",
                   "differentiationAdvice"]
    },

    "platformVariations": {
      "type": "object",
      "properties": {
        "linkedin":  { "$ref": "#/$defs/platformVariation" },
        "instagram": { "$ref": "#/$defs/platformVariation" },
        "facebook":  { "$ref": "#/$defs/platformVariation" },
        "x":         { "$ref": "#/$defs/platformVariation" },
        "threads":   { "$ref": "#/$defs/platformVariation" }
      }
    }
  },

  "required": ["schemaVersion", "meta", "imageAnalysis", "contentVariations",
               "ctaOptions", "hashtagGroups"],

  "$defs": {
    "platformVariation": {
      "type": "object",
      "properties": {
        "caption": { "type": "string" },
        "hashtags": { "type": "array", "items": { "type": "string" },
                      "description": "No leading #" },
        "characterCount": { "type": "integer" },
        "notes": { "type": "string", "description": "Platform-specific guidance" }
      },
      "required": ["caption", "hashtags", "characterCount", "notes"]
    }
  }
}
```

### Two things about this schema

**`platformVariations` uses fixed platform keys, not a free-form map.** Gemini's
structured output has no `additionalProperties`, so an arbitrary
`Record<string, …>` can't be expressed. The five keys match the app's `Platform`
union. The TypeScript side is already a `Record<string, PlatformVariation>`, so
it accepts whatever subset comes back — generate only the platforms in
`record.platforms`.

**`$ref`/`$defs` are shown here for readability only.** Gemini's `responseSchema`
is an OpenAPI 3.0 subset and does not resolve references, so the shipped file
has `platformVariation` inlined into all five platform keys — same object,
repeated. Copy from the file, not from this block.

## Populate meta properly (optional)

The model returns `generatedAt`, `model` and `durationMs` as `null`, which the
app handles — the row's own `updated_at` already records when Make last wrote,
so this is usually not worth extra modules.

If you do want real values, keep module 6 (Parse JSON) and patch the three keys
before the write:

```
{{ setKey(setKey(setKey(6.meta; "generatedAt"; formatDate(now; "YYYY-MM-DDTHH:mm:ss[Z]"; "UTC")); "model"; "gemini-2.5-flash"); "durationMs"; null) }}
```

## Error route

Right-click **module 5** → *Add error handler* → **HTTP — Make a request**, same
PATCH setup as module 7:

- **URL** — `{{SUPABASE_URL}}/rest/v1/posts?id=eq.{{2.record.id}}`
- **Method** — `PATCH`
- **Body**:

```json
{
  "ai_status": "failed",
  "ai_studio_output": {
    "schemaVersion": 1,
    "meta": {
      "status": "failed",
      "generatedAt": null,
      "model": null,
      "durationMs": null,
      "error": "{{5.error.message}}",
      "produced": []
    }
  }
}
```

The app renders this as an amber banner with the error text and a Retry button.
Without it, a failed run leaves `ai_status = "generating"` and the post shows a
spinner forever.

Add the same handler to module 7 — a Supabase write can fail on its own (bad
key, RLS, network), and that failure is just as invisible without it.

## Before wiring the AI

Paste a known-good envelope straight into a row and confirm the UI renders it:

```sql
UPDATE posts
SET ai_studio_output = '{"schemaVersion":1,"meta":{"status":"complete","generatedAt":null,"model":null,"durationMs":null,"error":null,"produced":["imageAnalysis"]},"imageAnalysis":{"productCategory":"Skincare","industry":"Beauty","targetAudience":"Women 25-40","mood":"Calm","colorPalette":["#1A1A2E"],"brandStyle":"Minimal","primarySubject":"Serum bottle","secondarySubjects":[],"objects":["bottle"],"sceneDescription":"A bottle on linen.","suggestedCampaignType":"Product launch","suggestedMarketingObjective":"Lead generation","suggestedBuyerPersona":"Reads ingredient lists.","confidenceScore":87}}'::jsonb,
    ai_status = 'ready'
WHERE id = '<your-post-id>';
```

That separates "the UI is wrong" from "the prompt is wrong" before you spend
Gemini calls. The full eight-section version is in
[`src/pages/dev/StudioPreview.tsx`](src/pages/dev/StudioPreview.tsx), viewable
at `/dev/studio-preview` in dev.
