import { ChevronRight } from "lucide-react";
import { getSeoAnalysis, getCampaignPlan, getCompetitorAnalysis } from "@/ai/selectors";
import { SeoPanel } from "@/components/marketing/SeoPanel";
import { CampaignPlanPanel } from "@/components/marketing/CampaignPlanPanel";
import { CompetitorAnalysisPanel } from "@/components/marketing/CompetitorAnalysisPanel";
import type { Post } from "@/types";

interface AdvancedInsightsProps {
  post?: Post;
}

export function AdvancedInsights({ post }: AdvancedInsightsProps) {
  const seo = post ? getSeoAnalysis(post) : null;
  const campaign = post ? getCampaignPlan(post) : null;
  const competitor = post ? getCompetitorAnalysis(post) : null;

  const hasData = Boolean(seo || campaign || competitor);

  return (
    <details className="group border-t border-border/60 pt-4" data-testid="advanced-insights-details">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[10px] font-mono uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-95" />
        <span>Advanced Insights</span>
      </summary>
      
      <div className="mt-4 space-y-6" data-testid="advanced-insights-content">
        {!post ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground italic bg-muted/20 rounded border border-dashed border-border/80 p-3">
            Please save this post as a draft first to enable advanced campaign and SEO insights.
          </p>
        ) : !hasData ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground italic bg-muted/20 rounded border border-dashed border-border/80 p-3">
            No advanced insights generated yet. Configure strategy settings and generate with AI.
          </p>
        ) : (
          <div className="space-y-6 divide-y divide-border/40">
            {seo && (
              <div className="pt-4 first:pt-0" data-testid="seo-panel-wrapper">
                <SeoPanel seo={seo} />
              </div>
            )}
            {campaign && (
              <div className="pt-4 first:pt-0" data-testid="campaign-panel-wrapper">
                <CampaignPlanPanel campaign={campaign} />
              </div>
            )}
            {competitor && (
              <div className="pt-4 first:pt-0" data-testid="competitor-panel-wrapper">
                <CompetitorAnalysisPanel competitor={competitor} />
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
