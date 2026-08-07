import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, ExternalLink, RefreshCw, Sparkles, Undo2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { AiErrorBanner } from "@/components/shared/AiErrorBanner";
import { useApprovePost, useRequestAiGeneration } from "@/hooks/usePosts";
import {
  getFlatHashtags,
  getPlatformCaptions,
  getPrimaryCaption,
} from "@/ai/selectors";
import { getAiRunStatus, hasAiContent } from "@/utils/workflow";
import { PLATFORM_MAP } from "@/constants";
import type { Platform, Post } from "@/types";

interface AiPanelProps {
  post: Post;
  onUseCaption: (caption: string) => void;
}

/**
 * Shows the AI content stored on a saved post and hosts the human approval
 * gate. Only rendered on the edit page — a post that has never been saved has
 * nothing stored to review, and the live generation from this session is shown
 * by AiCaptionPanel instead.
 */
export function AiPanel({ post, onUseCaption }: AiPanelProps) {
  const navigate = useNavigate();
  const requestAi = useRequestAiGeneration();
  const approvePost = useApprovePost();

  const run = getAiRunStatus(post);
  // The only generation that can be in flight is this component's own request.
  // The database never holds a "generating" state now that the backend answers
  // in the same call.
  const generating = requestAi.isPending;
  const ready = post.ai_status === "ready" && hasAiContent(post);

  // These read the studio envelope when present and fall back to the flat
  // ai_* columns, so a post stored either way renders identically.
  const caption = getPrimaryCaption(post);
  const hashtags = getFlatHashtags(post);
  const platformEntries = Object.entries(getPlatformCaptions(post)) as [
    Platform,
    string,
  ][];

  return (
    <Card className={post.approved ? "border-success/40" : undefined}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Content
          </CardTitle>
          <CardDescription>
            {generating
              ? "Generating caption, hashtags and platform versions…"
              : run.error
                ? "The last run didn't finish — details below."
                : ready
                  ? "Review the generated content, then approve for publishing."
                  : "Generate a caption, hashtags and per-platform versions for this post."}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {post.image_url && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                navigate(
                  `/ai-studio?image=${encodeURIComponent(post.image_url)}${post.id ? `&postId=${post.id}` : ""}`
                )
              }
              className="h-8 text-xs gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Open in AI Studio
            </Button>
          )}
          {post.approved && (
            <Badge className="bg-success text-success-foreground">
              <Check className="h-3 w-3" />
              Approved
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <AiErrorBanner
          state={run.state}
          error={run.error}
          retrying={requestAi.isPending}
          onRetry={() => requestAi.mutate(post.id)}
          className="rounded-md"
        />

        {generating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground"
          >
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            Working on it — this usually takes a few seconds.
          </motion.div>
        )}

        {ready && (
          <>
            {caption && (
              <div className="rounded-md border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Suggested caption
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onUseCaption(caption)}
                  >
                    <Wand2 />
                    Use as caption
                  </Button>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  {caption}
                </p>
              </div>
            )}

            {hashtags.length > 0 && (
              <div className="rounded-md border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Hashtags
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {hashtags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {platformEntries.length > 0 && (
              <div className="grid gap-3 lg:grid-cols-2">
                {platformEntries.map(([platform, content]) => (
                  <div key={platform} className="rounded-md border p-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
                      {PLATFORM_MAP[platform]?.name ?? platform} version
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                      {content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-2">
          {/* The error banner above carries the retry when a run went wrong. */}
          {!generating && !ready && !run.error && (
            <Button
              type="button"
              variant="secondary"
              loading={requestAi.isPending}
              onClick={() => requestAi.mutate(post.id)}
            >
              <Sparkles />
              Generate AI content
            </Button>
          )}
          {ready && !post.approved && (
            <>
              <Button
                type="button"
                loading={approvePost.isPending}
                onClick={() => approvePost.mutate({ id: post.id, approved: true })}
                className="shadow-glow"
              >
                <Check />
                Approve
              </Button>
              <Button
                type="button"
                variant="outline"
                loading={requestAi.isPending}
                onClick={() => requestAi.mutate(post.id)}
              >
                <RefreshCw />
                Regenerate
              </Button>
            </>
          )}
          {post.approved && (
            <Button
              type="button"
              variant="outline"
              loading={approvePost.isPending}
              onClick={() => approvePost.mutate({ id: post.id, approved: false })}
            >
              <Undo2 />
              Remove approval
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
