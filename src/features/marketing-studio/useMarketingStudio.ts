/**
 * useMarketingStudio — master state hook for the AI Marketing Studio page.
 *
 * Composes:
 *   - Marketing goal selection
 *   - Funnel stage selection
 *   - Brand voice (delegated to useBrandVoice)
 *   - Competitor context
 *   - PromptBuilder invocation
 *   - Generation, through the backend AI API
 */

import { useCallback, useState } from "react";
import { useGenerateWithSettings } from "@/hooks/usePosts";
import { PromptBuilder } from "@/ai/prompts/PromptBuilder";
import { useBrandVoice } from "./useBrandVoice";
import { DEFAULT_FEATURE_FLAGS } from "@/ai/types";
import type {
  AiStudioInput,
  CaptionLength,
  CompetitorContext,
  FunnelStage,
  MarketingGoal,
  StudioFeatureFlags,
} from "@/ai/types";

export function useMarketingStudio() {
  const generate = useGenerateWithSettings();
  const brandVoiceApi = useBrandVoice();

  const [goal, setGoal] = useState<MarketingGoal>("brand_awareness");
  const [funnelStage, setFunnelStage] = useState<FunnelStage>("TOFU");
  const [competitor, setCompetitor] = useState<CompetitorContext | null>(null);
  const [captionLength, setCaptionLength] = useState<CaptionLength>("Medium");
  const [language, setLanguage] = useState("English");
  const [features, setFeatures] = useState<StudioFeatureFlags>(DEFAULT_FEATURE_FLAGS);

  /** Toggle a single capability without clobbering the others. */
  const setFeature = useCallback(
    (key: keyof StudioFeatureFlags, enabled: boolean) =>
      setFeatures((prev) => ({ ...prev, [key]: enabled })),
    [],
  );

  /** Build the structured settings payload sent with the generation request. */
  const buildRequest = useCallback((): AiStudioInput => {
    return PromptBuilder.from({
      goal,
      funnelStage,
      brandVoice: brandVoiceApi.brandVoice,
      brandVoiceProfileId: brandVoiceApi.activeProfileId,
      competitor,
      features,
      language,
      captionLength,
    });
  }, [
    goal,
    funnelStage,
    brandVoiceApi.brandVoice,
    brandVoiceApi.activeProfileId,
    competitor,
    features,
    language,
    captionLength,
  ]);

  /**
   * Generate for a post with the settings currently on screen.
   *
   * One call now: the settings and the post id go to the backend together, and
   * the mutation resolves with the finished post. The previous version wrote
   * the settings, then wrote `ai_status = 'generating'` to nudge a Make.com
   * webhook, then left the page polling for a write-back that might never come.
   */
  const triggerGeneration = useCallback(
    (postId: string) => generate.mutate({ id: postId, settings: buildRequest() }),
    [generate, buildRequest],
  );

  return {
    // Settings state
    goal,
    setGoal,
    funnelStage,
    setFunnelStage,
    competitor,
    setCompetitor,
    captionLength,
    setCaptionLength,
    language,
    setLanguage,
    features,
    setFeatures,
    setFeature,

    // Brand voice (full API)
    ...brandVoiceApi,

    // Actions
    buildRequest,
    triggerGeneration,
    isGenerating: generate.isPending,
  };
}
