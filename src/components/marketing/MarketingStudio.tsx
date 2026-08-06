import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScanEye,
  FileText,
  Mic2,
  RefreshCw,
  Sparkles,
  Check,
  Undo2,
  Wand2,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ImageAnalysisCard } from "./ImageAnalysis";
import { ContentVariationsPanel } from "./ContentVariations";
import { CtaIntelligence } from "./CtaIntelligence";
import { HashtagIntelligence } from "./HashtagIntelligence";
import { SeoPanel } from "./SeoPanel";
import { CampaignPlanPanel } from "./CampaignPlanPanel";
import { CompetitorAnalysisPanel } from "./CompetitorAnalysisPanel";
import { PlatformVariationsPanel } from "./PlatformVariationsPanel";
import type { Post } from "@/types";
import {
  getCampaignPlan,
  getCompetitorAnalysis,
  getContentVariations,
  getCtaOptions,
  getHashtagGroups,
  getImageAnalysis,
  getPlatformVariations,
  getSeoAnalysis,
  getStudioInput,
  hasStudioOutput,
} from "@/ai/selectors";
import { AiErrorBanner } from "@/components/shared/AiErrorBanner";
import { useApprovePost, useRequestAiGeneration } from "@/hooks/usePosts";
import { getAiRunStatus, hasAiContent } from "@/utils/workflow";

type Tab = "analysis" | "content" | "growth" | "brand";

interface TabItem {
  id: Tab;
  label: string;
  icon: typeof ScanEye;
}

const TABS: TabItem[] = [
  { id: "analysis", label: "Analysis", icon: ScanEye },
  { id: "content",  label: "Content",  icon: FileText },
  { id: "growth",   label: "Growth",   icon: TrendingUp },
  { id: "brand",    label: "Brand",    icon: Mic2 },
];

interface MarketingStudioProps {
  post: Post;
  onUseCaption?: (caption: string) => void;
}

export function MarketingStudio({ post, onUseCaption }: MarketingStudioProps) {
  const requestAi = useRequestAiGeneration();
  const approvePost = useApprovePost();

  const run = getAiRunStatus(post);
  const generating = run.state === "generating";
  const ready = post.ai_status === "ready" && hasAiContent(post);

  // New rich marketing fields (Make.com writes these after upgrade)
  const imageAnalysis = getImageAnalysis(post);
  const contentVariations = getContentVariations(post);
  const ctaOptions = getCtaOptions(post);
  const hashtagGroups = getHashtagGroups(post);
  const seo = getSeoAnalysis(post);
  const campaign = getCampaignPlan(post);
  const competitorAnalysis = getCompetitorAnalysis(post);
  const platformVariations = getPlatformVariations(post);
  const studioInput = getStudioInput(post);
  const hasRichMarketing = hasStudioOutput(post);
  const hasGrowth = !!(seo || campaign || competitorAnalysis);

  // Legacy content from original Make.com pipeline (always show these)
  const hasLegacyCaption = !!post.ai_caption;
  const hasLegacyHashtags = !!(post.ai_hashtags && post.ai_hashtags.length > 0);
  const hasLegacyPlatforms = !!(
    post.ai_platform_content &&
    Object.values(post.ai_platform_content).some(Boolean)
  );
  const hasLegacyContent = hasLegacyCaption || hasLegacyHashtags || hasLegacyPlatforms;

  // Content tab is available if there's ANY AI content — new OR legacy
  const hasAnyContent = ready && (hasRichMarketing || hasLegacyContent);

  // Default to Content tab if it has data but Analysis doesn't yet
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (hasLegacyContent && !imageAnalysis) return "content";
    return "analysis";
  });

  // Tab dot indicators
  const analysisHasDot = !!imageAnalysis;
  const contentHasDot = hasAnyContent;

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-sm font-bold">AI Marketing Studio</h3>
            {post.approved && (
              <Badge className="bg-success/15 text-success border-success/25 text-[10px]">
                <Check className="h-2.5 w-2.5" /> Approved
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {generating
              ? "Generating marketing assets — updating live…"
              : run.error
              ? "Something went wrong on the last run — see below."
              : hasRichMarketing
              ? "Full marketing assets ready. Review and approve."
              : hasLegacyContent
              ? "AI caption & hashtags ready. Click Content → to view."
              : "Generate AI-powered marketing assets for this post."}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {/* On a failed run the banner below owns the retry — don't offer it twice. */}
          {!generating && !ready && !run.error && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={requestAi.isPending}
              onClick={() => requestAi.mutate(post.id)}
              className="h-8 text-xs"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate
            </Button>
          )}
          {ready && !post.approved && (
            <>
              <Button
                type="button"
                size="sm"
                loading={approvePost.isPending}
                onClick={() => approvePost.mutate({ id: post.id, approved: true })}
                className="h-8 text-xs shadow-glow"
              >
                <Check className="h-3.5 w-3.5" />
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                loading={requestAi.isPending}
                onClick={() => requestAi.mutate(post.id)}
                className="h-8 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regen
              </Button>
            </>
          )}
          {post.approved && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              loading={approvePost.isPending}
              onClick={() => approvePost.mutate({ id: post.id, approved: false })}
              className="h-8 text-xs"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Unapprove
            </Button>
          )}
        </div>
      </div>

      {/* Generating banner */}
      {generating && (
        <div className="flex items-center gap-3 border-b bg-accent/30 px-5 py-3">
          <RefreshCw className="h-4 w-4 animate-spin text-primary shrink-0" />
          <p className="text-xs text-muted-foreground">
            Make.com is generating your marketing package — usually under 60 seconds.
            This page updates automatically.
          </p>
        </div>
      )}

      {/* Timed out, failed outright, or came back missing sections */}
      <AiErrorBanner
        state={run.state}
        error={run.error}
        retrying={requestAi.isPending}
        onRetry={() => requestAi.mutate(post.id)}
        className="border-x-0 border-t-0 px-5"
      />

      {/* Upgrade nudge — shown when only legacy content exists */}
      {hasLegacyContent && !hasRichMarketing && !generating && (
        <div className="flex items-center gap-3 border-b bg-primary/5 px-5 py-2.5">
          <Wand2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground flex-1">
            <span className="font-medium text-foreground">Upgrade available:</span>{" "}
            Configure brand voice on the{" "}
            <a href="/ai-studio" className="text-primary underline underline-offset-2">
              AI Studio page
            </a>{" "}
            and regenerate for 9 tone variations, CTAs, hashtag groups and image analysis.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b px-5 gap-1 overflow-x-auto scrollbar-none shrink-0">
        {TABS.map(({ id, label, icon: Icon }) => {
          // Analysis: only available when rich marketing data exists
          // Content: available if ANY AI content exists (legacy OR rich)
          // Brand: always available
          const disabled =
            id === "analysis"
              ? !hasRichMarketing
              : id === "content"
              ? !hasAnyContent
              : false;

          const active = activeTab === id;

          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => setActiveTab(id)}
              className={cn(
                "relative flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
                disabled && "cursor-not-allowed opacity-40"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {id === "analysis" && analysisHasDot && (
                <span className="ml-0.5 flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              )}
              {id === "content" && contentHasDot && (
                <span className="ml-0.5 flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              )}
              {id === "growth" && hasGrowth && (
                <span className="ml-0.5 flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="p-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {/* ── Analysis tab ──────────────────────────────────────── */}
            {activeTab === "analysis" && (
              <div>
                {imageAnalysis ? (
                  <ImageAnalysisCard analysis={imageAnalysis} />
                ) : (
                  <EmptyTabState
                    icon={ScanEye}
                    title="No analysis yet"
                    description="Generate with brand voice settings to see image analysis, mood, color palette, buyer persona and more."
                  />
                )}
              </div>
            )}

            {/* ── Content tab ───────────────────────────────────────── */}
            {activeTab === "content" && (
              <div className="space-y-8">
                {/* New rich content variations */}
                {contentVariations ? (
                  <ContentVariationsPanel
                    variations={contentVariations.variations}
                    onUseCaption={onUseCaption}
                  />
                ) : hasLegacyCaption ? (
                  /* Legacy caption from original Make pipeline */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">AI Caption</p>
                        <p className="text-xs text-muted-foreground">
                          Generated by your Make.com scenario
                        </p>
                      </div>
                      {onUseCaption && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => onUseCaption(post.ai_caption ?? "")}
                        >
                          Use as Caption
                        </Button>
                      )}
                    </div>
                    <div className="rounded-xl border bg-accent/30 p-4">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {post.ai_caption}
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* New rich CTAs */}
                {ctaOptions && (
                  <CtaIntelligence options={ctaOptions.options} />
                )}

                {/* New rich hashtag groups */}
                {hashtagGroups ? (
                  <HashtagIntelligence groups={hashtagGroups.groups} />
                ) : hasLegacyHashtags ? (
                  /* Legacy flat hashtag array from original Make pipeline */
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold">Hashtags</p>
                      <p className="text-xs text-muted-foreground">
                        Generated by your Make.com scenario
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(post.ai_hashtags ?? [])
                        .flatMap((t) => t.split(/[,\s#]+/))
                        .filter(Boolean)
                        .map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-xs cursor-pointer"
                            onClick={() =>
                              navigator.clipboard.writeText(`#${tag}`)
                            }
                          >
                            #{tag}
                          </Badge>
                        ))}
                    </div>
                  </div>
                ) : null}

                {/* Per-platform rewrites */}
                {platformVariations && (
                  <PlatformVariationsPanel
                    variations={platformVariations}
                    onUseCaption={onUseCaption}
                  />
                )}

                {/* Legacy per-platform versions */}
                {hasLegacyPlatforms && !contentVariations && !platformVariations && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Platform Versions</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Object.entries(post.ai_platform_content ?? {})
                        .filter(([, content]) => Boolean(content))
                        .map(([platform, content]) => (
                          <div
                            key={platform}
                            className="rounded-xl border bg-accent/30 p-4 space-y-2"
                          >
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {platform}
                            </p>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">
                              {content as string}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Growth tab ────────────────────────────────────────── */}
            {activeTab === "growth" && (
              <div className="space-y-8">
                {seo && <SeoPanel seo={seo} />}
                {seo && (campaign || competitorAnalysis) && <div className="border-t" />}

                {campaign && <CampaignPlanPanel campaign={campaign} />}
                {campaign && competitorAnalysis && <div className="border-t" />}

                {competitorAnalysis && (
                  <CompetitorAnalysisPanel competitor={competitorAnalysis} />
                )}

                {!hasGrowth && (
                  <EmptyTabState
                    icon={TrendingUp}
                    title="No growth assets yet"
                    description="Enable SEO, Campaign Plan or Competitor Analysis under Extra Outputs in the studio sidebar, then regenerate."
                  />
                )}
              </div>
            )}

            {/* ── Brand tab ─────────────────────────────────────────── */}
            {activeTab === "brand" && (
              <div className="space-y-3">
                {studioInput ? (
                  <div className="space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Settings Used for This Post
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Goal", value: studioInput.goal?.replace(/_/g, " ") },
                        { label: "Funnel", value: studioInput.funnelStage },
                        { label: "Tone", value: studioInput.brandVoice?.tone },
                        { label: "Brand", value: studioInput.brandVoice?.name || "—" },
                        { label: "Personality", value: studioInput.brandVoice?.personality },
                        { label: "Caption Length", value: studioInput.captionLength },
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded-lg bg-accent/50 p-3">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {label}
                          </p>
                          <p className="text-sm font-medium mt-0.5 capitalize">
                            {value ?? "—"}
                          </p>
                        </div>
                      ))}
                    </div>
                    {studioInput.brandVoice?.wordsToUse?.length ? (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
                          Brand Words Used
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {studioInput.brandVoice.wordsToUse.map((w) => (
                            <Badge
                              key={w}
                              className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/25 border"
                            >
                              {w}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <EmptyTabState
                    icon={Mic2}
                    title="No brand settings used"
                    description="Configure Brand Voice on the AI Studio page and generate to see which settings were applied."
                  />
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function EmptyTabState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ScanEye;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
      </div>
    </div>
  );
}
