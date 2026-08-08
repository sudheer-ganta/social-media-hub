import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkles,
  CheckCircle2,
  ExternalLink,
  Check,
  RefreshCw,
  Copy,
  ChevronDown,
  Wand2,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Post } from "@/types";
import {
  getContentVariations,
  getCtaOptions,
  getHashtagGroups,
  getImageAnalysis,
  getStudioInput,
} from "@/ai/selectors";
import type { ContentVariation } from "@/ai/types";
import { useApprovePost, useRequestAiGeneration } from "@/hooks/usePosts";

interface PostAiSummaryProps {
  post: Post;
  onApplyCaption?: (caption: string) => void;
}

export function PostAiSummary({ post, onApplyCaption }: PostAiSummaryProps) {
  const navigate = useNavigate();
  const requestAi = useRequestAiGeneration();
  const approvePost = useApprovePost();

  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isGenerating = requestAi.isPending;
  const isReady = post.ai_status === "ready";
  const isFailed = post.ai_status === "failed";

  const inputSettings = getStudioInput(post);
  const analysis = getImageAnalysis(post);
  const contentVars = getContentVariations(post);
  const variations: ContentVariation[] = contentVars?.variations ?? [];
  const ctaOpts = getCtaOptions(post);
  const ctas = ctaOpts?.options ?? [];
  const hashtagGrp = getHashtagGroups(post);
  const hashtagGroups = hashtagGrp?.groups ?? [];

  // Derived checklist items
  const hasAnalysis = !!analysis;
  const hasVariations = variations.length > 0 || !!post.ai_caption;
  const hasHashtags = hashtagGroups.length > 0 || (post.ai_hashtags?.length ?? 0) > 0;
  const hasPlatforms = !!post.ai_platform_content && Object.keys(post.ai_platform_content).length > 0;

  // Calculate a sample quality score based on richness
  const qualityScore = isReady
    ? Math.min(
        100,
        75 +
          (hasAnalysis ? 10 : 0) +
          (variations.length >= 3 ? 10 : 0) +
          (ctas.length > 0 ? 5 : 0)
      )
    : 0;

  const copyCaption = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenStudio = () => {
    navigate(`/posts/${post.id}/edit`);
  };

  if (!isReady && !isGenerating && !isFailed) {
    return (
      <div className="rounded-xl border border-dashed p-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20">
        <div className="flex items-center gap-3 text-center sm:text-left">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Wand2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold">AI Marketing Studio</p>
            <p className="text-[11px] text-muted-foreground">
              Generate strategic captions, tone variations, and marketing insights.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={requestAi.isPending}
          onClick={() => requestAi.mutate(post.id)}
          className="h-8 text-xs shrink-0 gap-1.5"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Generate AI Content
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3.5 shadow-sm">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold">Generated with AI</span>
              {isReady && (
                <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                  <Award className="h-3 w-3" />
                  Quality Score: {qualityScore}/100
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {isReady && !post.approved && (
            <Button
              type="button"
              size="sm"
              loading={approvePost.isPending}
              onClick={() => approvePost.mutate({ id: post.id, approved: true })}
              className="h-7 px-2.5 text-xs shadow-glow"
            >
              <Check className="h-3 w-3 mr-1" />
              Approve
            </Button>
          )}
          {post.approved && (
            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] px-2 py-1">
              ✓ Approved
            </Badge>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenStudio}
            className="h-7 px-2.5 text-xs gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            Open AI Studio
          </Button>
        </div>
      </div>

      {/* Generating Indicator */}
      {isGenerating && (
        <div className="flex items-center gap-2 rounded-lg bg-accent/40 px-3 py-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
          Generating content…
        </div>
      )}

      {/* Operational Summary Grid */}
      {isReady && (
        <div className="space-y-3">
          {/* Quick Metrics / Checklist */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className={cn("flex items-center gap-1.5 rounded-md border px-2.5 py-1.5", hasAnalysis ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "bg-muted/30 text-muted-foreground")}>
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Image Analyzed</span>
            </div>
            <div className={cn("flex items-center gap-1.5 rounded-md border px-2.5 py-1.5", hasVariations ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "bg-muted/30 text-muted-foreground")}>
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Captions Ready ({variations.length || 1})</span>
            </div>
            <div className={cn("flex items-center gap-1.5 rounded-md border px-2.5 py-1.5", hasHashtags ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "bg-muted/30 text-muted-foreground")}>
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Hashtags Built</span>
            </div>
            <div className={cn("flex items-center gap-1.5 rounded-md border px-2.5 py-1.5", hasPlatforms ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "bg-muted/30 text-muted-foreground")}>
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Platforms Ready</span>
            </div>
          </div>

          {/* Compact Presets Bar */}
          {inputSettings && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground pt-1 border-t">
              <span className="font-medium text-foreground">Preset:</span>
              {inputSettings.goal && (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  Goal: {inputSettings.goal.replace(/_/g, " ")}
                </Badge>
              )}
              {inputSettings.funnelStage && (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  Funnel: {inputSettings.funnelStage}
                </Badge>
              )}
              {inputSettings.brandVoice?.tone && (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  Tone: {inputSettings.brandVoice.tone}
                </Badge>
              )}
            </div>
          )}

          {/* Quick Caption Preview & Use Button */}
          {post.ai_caption && (
            <div className="rounded-lg border bg-accent/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">Primary Generated Caption</span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => copyCaption(post.ai_caption!)}
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  {onApplyCaption && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px] font-semibold text-primary"
                      onClick={() => onApplyCaption(post.ai_caption!)}
                    >
                      Use as Post Caption
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-foreground leading-relaxed line-clamp-3">
                {post.ai_caption}
              </p>
            </div>
          )}

          {/* Expandable Variations Preview */}
          {variations.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setExpanded((p) => !p)}
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>{expanded ? "Hide variations" : `View ${variations.length} tone variations`}</span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
              </button>

              {expanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="grid gap-2 pt-2 sm:grid-cols-2"
                >
                  {variations.map((v: ContentVariation) => (
                    <div key={v.tone} className="rounded-lg border p-2.5 space-y-1.5 text-xs bg-card">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[9px]">
                          {v.tone}
                        </Badge>
                        {onApplyCaption && (
                          <button
                            type="button"
                            onClick={() => onApplyCaption(v.caption)}
                            className="text-[10px] text-primary hover:underline font-medium"
                          >
                            Apply
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-3 leading-snug">
                        {v.caption}
                      </p>
                    </div>
                  ))}
                </motion.div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
