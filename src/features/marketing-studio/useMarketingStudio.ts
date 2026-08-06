/**
 * useMarketingStudio — master state hook for the AI Marketing Studio page.
 *
 * Composes:
 *   - Marketing goal selection
 *   - Funnel stage selection
 *   - Brand voice (delegated to useBrandVoice)
 *   - Competitor context
 *   - PromptBuilder invocation
 *   - Generation trigger (writes settings to DB + triggers Make webhook)
 */

import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { postsService } from "@/services";
import { postKeys } from "@/hooks/usePosts";
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
import type { Post } from "@/types";

export function useMarketingStudio() {
  const queryClient = useQueryClient();
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

  /** Build the structured JSON payload for Make.com */
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

  /** Trigger AI generation for a given post */
  const generateMutation = useMutation({
    mutationFn: async (postId: string) => {
      const settings = buildRequest();
      // 1. Save the marketing settings to the post
      await postsService.update(postId, { ai_studio_input: settings });
      // 2. Trigger the Make.com webhook by setting ai_status = "generating"
      return postsService.requestAiGeneration(postId);
    },
    onSuccess: (post: Post) => {
      queryClient.setQueryData(postKeys.detail(post.id), post);
      queryClient.invalidateQueries({ queryKey: postKeys.all });
      toast.success("AI generation started", {
        description:
          "Marketing assets are being generated. Results appear automatically.",
      });
    },
    onError: (error: Error) => {
      toast.error("Generation failed", { description: error.message });
    },
  });

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
    triggerGeneration: generateMutation.mutate,
    isGenerating: generateMutation.isPending,
  };
}
