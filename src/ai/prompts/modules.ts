/**
 * Reusable prompt modules for the AI Marketing Studio.
 *
 * These are NOT Gemini prompt strings — they are structured data
 * objects that the PromptBuilder assembles into the ai_studio_input
 * JSON payload. Make.com reads these and constructs the actual Gemini prompt.
 *
 * Keeping modules here means prompt logic stays out of UI components,
 * is testable, and can be evolved without touching React code.
 */

import type {
  BrandVoice,
  CompetitorContext,
  FunnelStage,
  MarketingGoal,
} from "@/ai/types";

// ─── Persona metadata ─────────────────────────────────────────────────────────

export const MARKETING_ANALYST_PERSONA = {
  roles: [
    "professional marketing strategist",
    "copywriter",
    "SEO specialist",
    "social media manager",
    "brand consultant",
  ],
  instruction:
    "Think as all five roles simultaneously. Generate complete marketing assets, not just captions.",
} as const;

// ─── Goal metadata ────────────────────────────────────────────────────────────

export const GOAL_META: Record<
  MarketingGoal,
  { label: string; writingIntent: string; primaryAction: string }
> = {
  brand_awareness: {
    label: "Brand Awareness",
    writingIntent: "Create memorable, shareable content that builds recognition",
    primaryAction: "Introduce and establish brand identity",
  },
  lead_generation: {
    label: "Lead Generation",
    writingIntent: "Capture attention and drive sign-ups or inquiries",
    primaryAction: "Collect contact information",
  },
  website_traffic: {
    label: "Website Traffic",
    writingIntent: "Create curiosity that drives clicks to your website",
    primaryAction: "Drive link clicks and page visits",
  },
  sales: {
    label: "Sales",
    writingIntent: "Persuade and convert with strong value propositions",
    primaryAction: "Drive immediate purchase decisions",
  },
  bookings: {
    label: "Bookings",
    writingIntent: "Build desire and urgency to book now",
    primaryAction: "Drive reservation or appointment bookings",
  },
  product_launch: {
    label: "Product Launch",
    writingIntent: "Generate excitement and anticipation for a new product",
    primaryAction: "Build hype and early adopter interest",
  },
  event_promotion: {
    label: "Event Promotion",
    writingIntent: "Create FOMO and excitement around an event",
    primaryAction: "Drive registrations and attendance",
  },
  newsletter: {
    label: "Newsletter",
    writingIntent: "Demonstrate value and encourage subscriptions",
    primaryAction: "Drive newsletter sign-ups",
  },
  community_building: {
    label: "Community Building",
    writingIntent: "Foster connection and belonging",
    primaryAction: "Drive comments, shares and community engagement",
  },
  customer_retention: {
    label: "Customer Retention",
    writingIntent: "Reward loyalty and deepen existing relationships",
    primaryAction: "Reinforce satisfaction and prevent churn",
  },
};

// ─── Funnel metadata ──────────────────────────────────────────────────────────

export const FUNNEL_META: Record<
  FunnelStage,
  { label: string; writingStyle: string; awareness: string; description: string }
> = {
  TOFU: {
    label: "Top of Funnel",
    writingStyle: "Educational, entertaining, and broadly appealing",
    awareness: "Cold audience — doesn't know you yet",
    description: "Focus on awareness, inspiration, and discovery",
  },
  MOFU: {
    label: "Middle of Funnel",
    writingStyle: "Informative, trust-building, and benefit-focused",
    awareness: "Warm audience — knows you, evaluating options",
    description: "Focus on consideration, comparison, and trust",
  },
  BOFU: {
    label: "Bottom of Funnel",
    writingStyle: "Direct, urgency-driven, and conversion-focused",
    awareness: "Hot audience — ready to decide",
    description: "Focus on conversion, offers, and closing",
  },
  Retention: {
    label: "Retention",
    writingStyle: "Relational, appreciative, and loyalty-focused",
    awareness: "Existing customers — keep them engaged",
    description: "Focus on loyalty, upsells, and advocacy",
  },
};

// ─── Module builders ──────────────────────────────────────────────────────────

export function buildGoalModule(goal: MarketingGoal) {
  return {
    goal,
    ...GOAL_META[goal],
  };
}

export function buildFunnelModule(stage: FunnelStage) {
  return {
    stage,
    ...FUNNEL_META[stage],
  };
}

export function buildBrandVoiceModule(voice: BrandVoice) {
  return {
    brandName: voice.name,
    description: voice.description,
    mission: voice.mission,
    tone: voice.tone,
    writingStyle: voice.writingStyle,
    personality: voice.personality,
    wordsToAlwaysUse: voice.wordsToUse,
    wordsToAvoid: voice.wordsToAvoid,
    emojiStyle: voice.emojiStyle,
    ctaStyle: voice.ctaStyle,
    targetAudience: voice.targetAudience,
  };
}

export function buildCompetitorModule(competitor: CompetitorContext | null) {
  if (!competitor) return null;
  return {
    instruction:
      "Draw tonal inspiration from this competitor. Do NOT copy their content.",
    website: competitor.website ?? null,
    brandName: competitor.brandName ?? null,
    socialHandle: competitor.socialHandle ?? null,
  };
}
