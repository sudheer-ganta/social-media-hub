import { useEffect } from "react";
import { ChevronRight, Settings2, Sparkles } from "lucide-react";
import { MarketingGoalSelector } from "@/components/marketing/MarketingGoal";
import { FunnelStageSelector } from "@/components/marketing/FunnelStage";
import { BrandVoicePanel } from "@/components/marketing/BrandVoicePanel";
import { CompetitorInput } from "@/components/marketing/CompetitorInput";
import { StudioFeatures } from "@/components/marketing/StudioFeatures";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { useMarketingStudio } from "@/features/marketing-studio/useMarketingStudio";
import type { CaptionLength } from "@/ai/types";

interface AiStrategyPanelProps {
  /** Owned by the form — the one Generate button reads it at click time. */
  studio: ReturnType<typeof useMarketingStudio>;
  /** Drives the hint under the inputs: with an image the AI reads it first. */
  hasImage: boolean;
}

/**
 * The former AI Studio page, folded into Create Post as an optional mode.
 *
 * Settings only — there is no Generate button in here. The form's single AI
 * button is the one way to start a run, open panel or closed, so there is
 * never a question of which button does what.
 *
 * Closed by default: someone who already knows what they want writes a caption
 * and publishes, which is the whole reason this is a `<details>` and not a
 * second page. Opening it reveals the strategy inputs the pipeline uses —
 * goal, funnel stage, brand voice, competitor context — and generation writes
 * back onto the same Post, so there is nothing here that a quick post can't
 * pick up later.
 */
export function AiStrategyPanel({ studio, hasImage }: AiStrategyPanelProps) {
  const hasCompetitorDetails = Object.values(studio.competitor ?? {}).some((v) =>
    Boolean(v?.trim()),
  );

  // Clearing the competitor fields would otherwise leave the analysis toggle on
  // and send a request the generator can't fulfil.
  useEffect(() => {
    if (!hasCompetitorDetails && studio.features.competitorAnalysis) {
      studio.setFeature("competitorAnalysis", false);
    }
  }, [hasCompetitorDetails, studio.features.competitorAnalysis, studio.setFeature]);

  return (
    <details className="group rounded-lg border bg-card text-card-foreground shadow-soft">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-6 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none">AI Strategy</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Optional. Set a goal, an audience and a voice, and the Generate
              button writes hooks, platform versions and hashtags instead of
              just a caption.
            </p>
          </div>
        </summary>

        <div className="space-y-6 border-t p-6">
          <MarketingGoalSelector value={studio.goal} onChange={studio.setGoal} />

          <FunnelStageSelector
            value={studio.funnelStage}
            onChange={studio.setFunnelStage}
          />

          <BrandVoicePanel
            voice={studio.brandVoice}
            onChange={studio.setBrandVoice}
            profileNames={studio.profileNames}
            onSave={studio.saveCurrentProfile}
            onLoad={studio.loadProfile}
            onDelete={studio.deleteProfile}
          />

          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Output Settings
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Caption Length</p>
                <Select
                  value={studio.captionLength}
                  onValueChange={(v) => studio.setCaptionLength(v as CaptionLength)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Short", "Medium", "Long"].map((l) => (
                      <SelectItem key={l} value={l} className="text-xs">
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Language</p>
                <Select value={studio.language} onValueChange={studio.setLanguage}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "English",
                      "Spanish",
                      "French",
                      "German",
                      "Portuguese",
                      "Arabic",
                      "Hindi",
                      "Japanese",
                    ].map((l) => (
                      <SelectItem key={l} value={l} className="text-xs">
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <CompetitorInput
            value={studio.competitor}
            onChange={studio.setCompetitor}
          />

          <StudioFeatures
            features={studio.features}
            onToggle={studio.setFeature}
            hasCompetitor={hasCompetitorDetails}
          />

          <p className="border-t pt-4 text-center text-[11px] text-muted-foreground">
            {hasImage
              ? "Press Generate below. The post is saved first, then the full pipeline runs and the results appear here."
              : "Add an image above and the AI will read it before it writes."}
          </p>
        </div>
      </details>
  );
}
