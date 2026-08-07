/**
 * PromptBuilder — assembles the structured AiStudioInput JSON saved to the
 * ai_studio_input column, which is the record of *what a generation was asked
 * for*: goal, funnel stage, brand voice, language, length.
 *
 * Since Sprint 4.1 the prompt itself is built on the backend, next to the
 * model, in `server/src/ai/prompts/caption.prompt.ts`. What this builder
 * produces is the settings payload that gets sent with the request and stored
 * with the result, so a caption stays reproducible.
 *
 * Responsibilities:
 *   - Assemble settings into a single versioned JSON payload
 *
 * NOT responsible for:
 *   - Calling any AI API
 *   - Writing prompt text
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
      // Expanded module data, stored as the record of the brief used
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
