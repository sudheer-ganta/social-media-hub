/**
 * PromptBuilder — assembles the structured AiStudioInput JSON that is saved
 * to the ai_studio_input column and consumed by Make.com.
 *
 * Responsibilities:
 *   - Validate inputs
 *   - Assemble modules into a single JSON payload
 *   - Produce the exact shape Make.com expects
 *
 * NOT responsible for:
 *   - Calling any AI API
 *   - Rendering UI
 *   - Saving to the database
 */

import {
  buildBrandVoiceModule,
  buildCompetitorModule,
  buildFunnelModule,
  buildGoalModule,
  MARKETING_ANALYST_PERSONA,
} from "./modules";
import {
  DEFAULT_FEATURE_FLAGS,
  STUDIO_SCHEMA_VERSION,
  type AiStudioInput,
  type BrandVoice,
  type CaptionLength,
  type CompetitorContext,
  type FunnelStage,
  type MarketingGoal,
  type StudioFeatureFlags,
} from "@/ai/types";

export interface PromptBuilderOptions {
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  brandVoice: BrandVoice;
  /** Which saved profile the voice came from, for provenance. */
  brandVoiceProfileId?: string | null;
  competitor?: CompetitorContext | null;
  /** Per-capability toggles; anything omitted falls back to the default. */
  features?: Partial<StudioFeatureFlags>;
  language?: string;
  captionLength?: CaptionLength;
}

export class PromptBuilder {
  private options: PromptBuilderOptions;

  constructor(options: PromptBuilderOptions) {
    this.options = options;
  }

  build(): AiStudioInput {
    const {
      goal,
      funnelStage,
      brandVoice,
      brandVoiceProfileId = null,
      competitor = null,
      features,
      language = "English",
      captionLength = "Medium",
    } = this.options;

    return {
      schemaVersion: STUDIO_SCHEMA_VERSION,
      goal,
      funnelStage,
      brandVoice,
      brandVoiceProfileId,
      competitor,
      features: { ...DEFAULT_FEATURE_FLAGS, ...features },
      language,
      captionLength,
      // Expanded module data for Make.com to read directly
      modules: {
        persona: MARKETING_ANALYST_PERSONA,
        goalModule: buildGoalModule(goal),
        funnelModule: buildFunnelModule(funnelStage),
        brandVoiceModule: buildBrandVoiceModule(brandVoice),
        competitorModule: buildCompetitorModule(competitor),
      },
      builtAt: new Date().toISOString(),
    };
  }

  /** Convenience static builder */
  static from(options: PromptBuilderOptions): AiStudioInput {
    return new PromptBuilder(options).build();
  }
}
