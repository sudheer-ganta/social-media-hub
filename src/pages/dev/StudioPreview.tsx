/**
 * Dev-only preview of the AI Marketing Studio output panels.
 *
 * The studio's optional sections (SEO, campaign, competitor) are not produced
 * by the caption generator yet, so they can't be seen against a real database.
 * This renders MarketingStudio against a fully-populated mock post instead, so
 * the output panels stay checkable. Mounted only when import.meta.env.DEV —
 * see src/App.tsx.
 *
 * Route: /dev/studio-preview
 */

import { MarketingStudio } from "@/components/marketing/MarketingStudio";
import { AiStrategyPanel } from "@/components/posts/AiStrategyPanel";
import { CreatePostForm } from "@/components/posts/CreatePostForm";
import { useMarketingStudio } from "@/features/marketing-studio/useMarketingStudio";
import { PERSONAL_CONTEXT, brandContext } from "@/constants/integrations";
import { STUDIO_SCHEMA_VERSION } from "@/ai/types";
import type { Post } from "@/types";

const MOCK_POST: Post = {
  id: "00000000-0000-0000-0000-000000000000",
  title: "Aurora Serum — launch",
  caption: "",
  image_url: "https://placehold.co/600x600/1A1A2E/E94560?text=Aurora",
  platforms: ["instagram", "linkedin", "x"],
  status: "draft",
  publish_date: "2026-08-06",
  publish_time: "09:00",
  context_type: "personal",
  brand_id: null,
  music: null,
  cta: null,
  link_url: null,
  created_by: "00000000-0000-0000-0000-000000000000",
  created_at: "2026-08-06T09:00:00.000Z",
  updated_at: "2026-08-06T09:15:03.882Z",

  ai_status: "ready",
  approved: false,
  platform_results: {},
  published_at: null,
  ai_caption: null,
  ai_hashtags: null,
  ai_platform_content: null,

  ai_studio_input: {
    schemaVersion: STUDIO_SCHEMA_VERSION,
    goal: "product_launch",
    funnelStage: "MOFU",
    brandVoice: {
      name: "Aurora",
      description: "Clinical skincare with a calm, editorial voice.",
      mission: "Make evidence-led skincare feel effortless.",
      tone: "Professional",
      writingStyle: "Conversational",
      wordsToUse: ["crafted", "clinical", "ritual"],
      wordsToAvoid: ["cheap", "miracle"],
      emojiStyle: "Light",
      ctaStyle: "Soft",
      targetAudience: "Women 25–40, skincare-literate",
      personality: "Premium",
    },
    brandVoiceProfileId: null,
    competitor: { brandName: "Lumen Labs", website: "lumenlabs.example", socialHandle: "@lumenlabs" },
    features: { seo: true, campaign: true, competitorAnalysis: true, platformVariations: true },
    language: "English",
    captionLength: "Medium",
    modules: {
      persona: null,
      goalModule: null,
      funnelModule: null,
      brandVoiceModule: null,
      competitorModule: null,
    },
    builtAt: "2026-08-06T09:14:22.114Z",
  },

  ai_studio_output: {
    schemaVersion: STUDIO_SCHEMA_VERSION,
    meta: {
      status: "complete",
      generatedAt: "2026-08-06T09:15:03.882Z",
      model: "gemini-2.0-flash",
      durationMs: 41768,
      error: null,
      produced: [
        "imageAnalysis",
        "contentVariations",
        "ctaOptions",
        "hashtagGroups",
        "seo",
        "campaign",
        "competitor",
        "platformVariations",
      ],
    },

    imageAnalysis: {
      productCategory: "Skincare",
      industry: "Beauty",
      targetAudience: "Women 25–40 who read ingredient lists",
      mood: "Calm, clinical",
      colorPalette: ["#1A1A2E", "#E94560", "#F5F0E8"],
      brandStyle: "Minimal luxury",
      primarySubject: "Amber glass serum bottle",
      secondarySubjects: ["Linen cloth", "Morning shadow"],
      objects: ["bottle", "dropper", "ceramic dish"],
      sceneDescription:
        "A single amber bottle on unbleached linen, lit by hard morning light from the left.",
      suggestedCampaignType: "Product launch",
      suggestedMarketingObjective: "Lead generation",
      suggestedBuyerPersona:
        "Reads ingredient lists before buying. Distrusts hype, responds to evidence and restraint.",
      confidenceScore: 87,

      // The block the vision pipeline added. Present here so this preview
      // shows the card as it now renders for a real generation.
      setting: "Interior windowsill, early morning",
      composition: "Centred, hard shadow running to the right, deep negative space",
      lighting: "Hard low-angle daylight, single source",
      textInImage: [],
      emotions: ["calm", "trust", "restraint"],
      themes: ["evidence over hype", "quiet ritual", "clinical beauty"],
      symbolism: ["The single bottle as an argument against a ten-step routine."],
      storyAngles: [
        "One bottle, one claim — what a shorter shelf actually buys you.",
        "The morning light is doing what the packaging usually has to.",
      ],
    },

    contentVariations: {
      variations: [
        {
          tone: "Professional",
          caption:
            "Ten percent vitamin C, stabilised at pH 3.5. The concentration matters less than whether it survives the bottle.",
          hook: "The concentration matters less than you think.",
          wordCount: 62,
        },
        {
          tone: "Storytelling",
          caption:
            "We spent nine months on the bottle before we touched the formula. Amber glass, airless pump — because light is what kills vitamin C.",
          hook: "We spent nine months on the bottle.",
          wordCount: 74,
        },
        {
          tone: "Minimal",
          caption: "10% vitamin C. Amber glass. pH 3.5.",
          hook: "10% vitamin C.",
          wordCount: 18,
        },
      ],
    },

    ctaOptions: {
      options: [
        { type: "Soft", text: "See the full formula →", label: "Builds curiosity" },
        { type: "Luxury", text: "Reserve yours", label: "Implies scarcity" },
        { type: "Professional", text: "Read the clinical results", label: "Evidence-led" },
        { type: "Urgency", text: "Launch pricing ends Sunday", label: "Time-boxed" },
      ],
    },

    hashtagGroups: {
      groups: [
        {
          category: "trending",
          suggestedQuantity: 5,
          hashtags: [
            { tag: "skincare", difficultyScore: 88, popularityScore: 96 },
            { tag: "vitaminc", difficultyScore: 71, popularityScore: 84 },
          ],
        },
        {
          category: "niche",
          suggestedQuantity: 8,
          hashtags: [
            { tag: "ingredientfirst", difficultyScore: 22, popularityScore: 41 },
            { tag: "phbalanced", difficultyScore: 18, popularityScore: 33 },
          ],
        },
        {
          category: "branded",
          suggestedQuantity: 2,
          hashtags: [{ tag: "auroraritual", difficultyScore: 4, popularityScore: 12 }],
        },
      ],
    },

    seo: {
      primaryKeyword: "vitamin c serum",
      keywords: [
        { keyword: "vitamin c serum", searchVolume: 40500, difficultyScore: 78, intent: "commercial" },
        { keyword: "best vitamin c serum for sensitive skin", searchVolume: 2900, difficultyScore: 34, intent: "commercial" },
        { keyword: "what ph should vitamin c serum be", searchVolume: 720, difficultyScore: 12, intent: "informational" },
        { keyword: "buy aurora serum", searchVolume: null, difficultyScore: 6, intent: "transactional" },
      ],
      metaTitle: "Aurora Vitamin C Serum — 10%, stabilised at pH 3.5",
      metaDescription:
        "A 10% vitamin C serum in airless amber glass, stabilised at pH 3.5 so it stays potent from first pump to last. Clinical results, no hype.",
      altText: "Amber glass Aurora vitamin C serum bottle on unbleached linen in morning light",
      slug: "aurora-vitamin-c-serum",
      readabilityScore: 71,
    },

    campaign: {
      name: "Glow Week",
      bigIdea:
        "Lead with the bottle, not the formula — the engineering story is what competitors can't copy.",
      durationDays: 14,
      beats: [
        { day: 0, channel: "instagram", angle: "Teaser", contentIdea: "Bottle only, no product name. Caption asks what nine months of engineering buys you." },
        { day: 3, channel: "linkedin", angle: "Proof", contentIdea: "Stability testing chart — potency at day 1 vs day 90 vs a clear-glass control." },
        { day: 7, channel: "instagram", angle: "Launch", contentIdea: "Full reveal with launch pricing and the pH explainer carousel." },
        { day: 14, channel: "x", angle: "Social proof", contentIdea: "Quote-tweet the three most technical customer questions and answer them." },
      ],
      kpis: ["Email signups", "Add-to-cart rate", "Saves per post"],
      budgetTier: "low",
    },

    competitor: {
      brandName: "Lumen Labs",
      positioning: "Mass-premium actives sold on concentration numbers and speed of result.",
      toneObserved: "Confident, slightly clinical, heavy on percentages",
      contentThemes: ["Before/after", "Percentage claims", "Dermatologist cameos"],
      postingFrequency: "4–5×/week, weekday mornings",
      strengths: [
        "Instantly legible claims — the number is the whole message",
        "Consistent grid, strong visual recall",
      ],
      weaknesses: [
        "No formulation or stability story — concentration is treated as the only variable",
        "Almost no founder or process presence",
      ],
      gaps: [
        "Packaging engineering as a trust signal",
        "Honest discussion of what actives degrade and why",
        "Long-form ingredient education",
      ],
      differentiationAdvice:
        "Don't compete on concentration — they own that number. Own delivery and stability instead: the amber airless bottle is a claim they structurally cannot make.",
    },

    platformVariations: {
      instagram: {
        caption:
          "Nine months on the bottle before we touched the formula.\n\nLight is what kills vitamin C — so the bottle came first. Amber glass, airless pump, 10% at pH 3.5.",
        hashtags: ["skincare", "vitaminc", "ingredientfirst"],
        characterCount: 380,
        notes: "First 125 characters show before the 'more' cut — the hook lands inside that.",
      },
      linkedin: {
        caption:
          "We delayed launch by nine months to redesign the packaging.\n\nVitamin C degrades on exposure to light and air. Most serums ship in clear glass with a dropper, which is the worst possible case for both. Our stability testing at day 90 is below.",
        hashtags: ["productdevelopment", "skincare"],
        characterCount: 1120,
        notes: "Truncates at ~210 characters; front-load the business insight, not the product.",
      },
      x: {
        caption:
          "Most vitamin C serums ship in clear glass with a dropper.\n\nLight and air are exactly what degrade vitamin C.\n\nWe fixed the bottle first.",
        hashtags: ["skincare"],
        characterCount: 268,
        notes: "Under the 280 limit with room for a link card.",
      },
    },

    /**
     * A Marketing Intelligence verdict, as the second engine returns it.
     *
     * Deliberately not a flattering one. The point of this preview is to check
     * the panels against the output that is hard to render — a mid-range score
     * with a blocker in the checklist, a dimension the model was unsure about,
     * and one platform failing outright. A mock scoring 94 across the board
     * would show none of the states that actually need looking at.
     */
    analysis: {
      reachScore: 68,
      scores: {
        hook: {
          score: 8,
          confidence: "High",
          reason: "Opens on a decision the brand made, not on the product.",
        },
        visual: {
          score: 7,
          confidence: "Medium",
          reason: "Names the amber glass, but does nothing with the morning light.",
        },
        platformFit: {
          score: 4.5,
          confidence: "High",
          reason: "Runs well past X's limit and buries the hook on LinkedIn.",
        },
        audienceFit: {
          score: 9,
          confidence: "Medium",
          reason: "Evidence-first framing suits a reader who checks ingredient lists.",
        },
        cta: {
          score: 4,
          confidence: "High",
          reason: "Ends on a claim about stability with nothing to do next.",
        },
        readability: {
          score: 8,
          confidence: "High",
          reason: "Two short blocks, no sentence over twenty words.",
        },
        hashtags: {
          score: 5,
          confidence: "Low",
          reason: "#skincare is too broad to reach anyone specific.",
        },
      },
      weights: {
        hook: 0.22,
        visual: 0.16,
        platformFit: 0.16,
        audienceFit: 0.14,
        cta: 0.13,
        readability: 0.1,
        hashtags: 0.09,
      },
      explanation: {
        strengths: [
          "The nine-month delay is a specific, checkable claim — rare in skincare copy.",
          "Audience fit: evidence-first framing suits a reader who checks ingredient lists.",
        ],
        weaknesses: [
          "Nothing asks the reader to do anything.",
          "Call to action: ends on a claim about stability with nothing to do next.",
          "x: 380 characters against a 280 limit — X will reject or cut this.",
        ],
      },
      metrics: {
        characterCount: 380,
        wordCount: 64,
        sentenceCount: 4,
        paragraphCount: 2,
        lineCount: 3,
        emojiCount: 0,
        hashtagCount: 3,
        mentionCount: 0,
        linkCount: 0,
        readingTimeSeconds: 20,
        averageWordsPerSentence: 16,
        longestParagraphWords: 38,
        readingEase: 64,
        hookCharacterCount: 56,
        endsWithQuestion: false,
      },
      platforms: [
        {
          platform: "instagram",
          score: 8.5,
          checks: [
            {
              id: "hook-before-fold",
              label: "Hook lands before Instagram truncates",
              status: "pass",
              detail: "The opening line is 56 characters and Instagram shows 125.",
            },
            {
              id: "hashtag-count",
              label: "Hashtag count suits Instagram",
              status: "warn",
              detail:
                "3 hashtags. Instagram posts do better with at least 3 — and these are broad.",
            },
          ],
          recommendations: [
            "Put the 3 hashtags in the first comment rather than the caption — same reach, and the caption stays readable.",
          ],
        },
        {
          platform: "x",
          score: 4.5,
          checks: [
            {
              id: "length-limit",
              label: "Within the X limit",
              status: "fail",
              detail: "380 characters against a 280 limit — X will reject or cut this.",
            },
            {
              id: "cta-present",
              label: "Asks the reader to do something",
              status: "warn",
              detail:
                "No obvious call to action. Even a question at the end gives the reader somewhere to go.",
            },
          ],
          recommendations: ["Cut 100 characters to fit X."],
        },
      ],
      engagement: {
        saves: "High",
        shares: "Medium",
        comments: "Low",
        clicks: "Low",
        rationale:
          "A specific technical claim gets saved for later and rarely argued with, and there is nothing here to click.",
      },
      checklist: {
        readiness: 62,
        items: [
          {
            id: "within-platform-limits",
            label: "Fits every platform's character limit",
            passed: false,
            severity: "blocker",
            fix: "Too long for x. Trim it before publishing.",
          },
          {
            id: "clear-cta",
            label: "Asks the reader to do something",
            passed: false,
            severity: "important",
            fix: "Close with one clear next step — a question, a link, or an instruction.",
          },
          {
            id: "hashtag-count",
            label: "Hashtag count suits every platform",
            passed: false,
            severity: "important",
            fix: "3 hashtags. Instagram posts do better with at least 3 — and these are broad.",
          },
          {
            id: "strong-opening-line",
            label: "Opening line survives the feed cut-off",
            passed: true,
            severity: "important",
          },
          { id: "image-attached", label: "Has an image", passed: true, severity: "important" },
          {
            id: "readable-blocks",
            label: "Broken into readable blocks",
            passed: true,
            severity: "polish",
          },
          {
            id: "sentence-length",
            label: "Sentences are easy to scan",
            passed: true,
            severity: "polish",
          },
        ],
      },
      improvements: [
        {
          dimension: "cta",
          issue: "The caption ends on a stability claim and asks for nothing.",
          suggestion:
            "Add a final line pointing at the day-90 results — the evidence is the offer for this audience.",
          estimatedGain: 9,
        },
        {
          dimension: "platformFit",
          issue: "The same 380 characters go out to X, which cuts at 280.",
          suggestion:
            "Write the X version down to the bottle argument alone and drop the pH detail.",
          estimatedGain: 7,
        },
        {
          dimension: "hashtags",
          issue: "#skincare competes with millions of posts.",
          suggestion:
            "Swap it for two ingredient-level tags the target reader actually follows.",
          estimatedGain: 4,
        },
      ],
      brand: {
        name: "Aurora",
        description: "Clinical skincare with a calm, editorial voice.",
        mission: "Make evidence-led skincare feel effortless.",
        industry: "Beauty",
        audience: "Women 25–40, skincare-literate",
        tone: "Professional",
        writingStyle: "Conversational",
        personality: "Premium",
        products: ["Skincare"],
        usp: "",
        competitors: [],
        ctaStyle: "Soft",
        emojiStyle: "Light",
        wordsToUse: ["crafted", "clinical", "ritual"],
        wordsToAvoid: ["cheap", "miracle"],
        brandColors: ["#1A1A2E", "#E94560", "#F5F0E8"],
        completeness: 82,
        // `industry` and `products` were never typed by the user — the image
        // supplied both, and the panel should be able to say so.
        provenance: {
          name: "brand",
          description: "brand",
          mission: "brand",
          industry: "image",
          products: "image",
          audience: "brand",
          tone: "brand",
          writingStyle: "brand",
          personality: "brand",
          ctaStyle: "brand",
          emojiStyle: "brand",
          wordsToUse: "brand",
          wordsToAvoid: "brand",
          brandColors: "image",
        },
      },
      meta: {
        analysisVersion: "1.0.0",
        weightsVersion: "1.0.0",
        promptVersion: 1,
        provider: "gemini",
        model: "gemini-2.0-flash",
        durationMs: 3140,
        analysedAt: "2026-08-06T09:16:12.004Z",
      },
    },
  },
};

/** Same post, but a run that only half-succeeded — exercises the warning banner. */
const MOCK_PARTIAL_POST: Post = {
  ...MOCK_POST,
  id: "00000000-0000-0000-0000-000000000001",
  title: "Aurora Serum — partial run",
  ai_studio_output: {
    schemaVersion: STUDIO_SCHEMA_VERSION,
    meta: {
      status: "partial",
      generatedAt: "2026-08-06T09:15:03.882Z",
      model: "gemini-2.0-flash",
      durationMs: 38210,
      error: "SEO call returned malformed JSON after 2 retries",
      produced: ["imageAnalysis", "contentVariations"],
    },
    imageAnalysis: MOCK_POST.ai_studio_output!.imageAnalysis,
    contentVariations: MOCK_POST.ai_studio_output!.contentVariations,
  },
};

/** The generation failed and nothing usable came back. */
const MOCK_FAILED_POST: Post = {
  ...MOCK_POST,
  id: "00000000-0000-0000-0000-000000000002",
  title: "Aurora Serum — failed run",
  ai_status: "failed",
  ai_studio_output: {
    schemaVersion: STUDIO_SCHEMA_VERSION,
    meta: {
      status: "failed",
      generatedAt: "2026-08-06T09:15:03.882Z",
      model: "gemini-2.0-flash",
      durationMs: 1420,
      error:
        "Gemini rejected the request body: invalid JSON in module 5 (bad escaped character).",
      produced: [],
    },
  },
};

/**
 * A row left at 'generating' by the retired Make.com pipeline, which could die
 * mid-run and never write back. Nothing produces this state any more — it is
 * kept so the panels can be checked against rows that predate Sprint 4.1,
 * which should now read as "never generated" and offer a fresh run.
 */
const MOCK_LEGACY_PENDING_POST: Post = {
  ...MOCK_POST,
  id: "00000000-0000-0000-0000-000000000003",
  title: "Aurora Serum — legacy pending row",
  ai_status: "generating",
  updated_at: "2026-08-06T09:15:03.882Z",
  ai_studio_output: null,
};

export default function StudioPreview() {
  const studio = useMarketingStudio();

  return (
    <div className="mx-auto max-w-5xl space-y-10 p-6">
      <div>
        <h1 className="text-xl font-bold">Studio Preview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dev-only. Renders MarketingStudio against mock envelopes so the output
          panels can be checked without spending a real generation.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Build with AI — the strategy inputs, collapsed by default
        </h2>
        <AiStrategyPanel studio={studio} hasImage />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Complete run — all eight sections</h2>
        <MarketingStudio post={MOCK_POST} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Partial run — degraded banner</h2>
        <MarketingStudio post={MOCK_PARTIAL_POST} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Failed run — error banner + retry</h2>
        <MarketingStudio post={MOCK_FAILED_POST} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Legacy pending row — reads as idle, offers a fresh run
        </h2>
        <MarketingStudio post={MOCK_LEGACY_PENDING_POST} />
      </section>

      {/* The two composer modes side by side — Personal must show no
          marketing controls, Brand must show all of them. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Personal composer — creator mode, no marketing controls
        </h2>
        <CreatePostForm context={PERSONAL_CONTEXT} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Brand composer — full marketing mode
        </h2>
        <CreatePostForm
          context={brandContext("mock-brand")}
          brand={{
            id: "mock-brand",
            name: "Glow Labs",
            description: "Minimal skincare",
            website: "",
            created_by: "mock-user",
            created_at: "2026-08-01T00:00:00Z",
            updated_at: "2026-08-01T00:00:00Z",
          }}
        />
      </section>

    </div>
  );
}
