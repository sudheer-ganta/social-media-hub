import { motion } from "framer-motion";
import { Check, RefreshCw, Sparkles, Undo2, Wand2 } from "lucide-react";
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
import { useApprovePost, useRequestAiGeneration } from "@/hooks/usePosts";
import { hasAiContent } from "@/utils/workflow";
import { PLATFORM_MAP } from "@/constants";
import type { Platform, Post } from "@/types";

interface AiPanelProps {
  post: Post;
  onUseCaption: (caption: string) => void;
}

/**
 * Shows the AI-generated content written back by the Make.com scenario
 * and hosts the human approval gate. Only rendered on the edit page.
 */
export function AiPanel({ post, onUseCaption }: AiPanelProps) {
  const requestAi = useRequestAiGeneration();
  const approvePost = useApprovePost();

  const generating = post.ai_status === "generating";
  const ready = post.ai_status === "ready" && hasAiContent(post);
  const failed = post.ai_status === "failed";

  const platformEntries = Object.entries(post.ai_platform_content ?? {}).filter(
    ([, content]) => Boolean(content),
  ) as [Platform, string][];

  // Tolerate hashtags arriving as one merged string ("tag1, tag2") from
  // automation tools — split into individual tags for display.
  const hashtags = (post.ai_hashtags ?? [])
    .flatMap((tag) => tag.split(/[,\s#]+/))
    .filter(Boolean);

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
              : ready
                ? "Review the generated content, then approve for publishing."
                : failed
                  ? "Generation failed — try again."
                  : "Generate a caption, hashtags and per-platform versions from your image."}
          </CardDescription>
        </div>
        {post.approved && (
          <Badge className="bg-success text-success-foreground">
            <Check className="h-3 w-3" />
            Approved
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {generating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground"
          >
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            Working on it — this usually takes under a minute. The page updates
            automatically when it's done.
          </motion.div>
        )}

        {ready && (
          <>
            {post.ai_caption && (
              <div className="rounded-md border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Suggested caption
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onUseCaption(post.ai_caption ?? "")}
                  >
                    <Wand2 />
                    Use as caption
                  </Button>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  {post.ai_caption}
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
          {(post.ai_status === "pending" || failed) && (
            <Button
              type="button"
              variant="secondary"
              loading={requestAi.isPending}
              onClick={() => requestAi.mutate(post.id)}
            >
              <Sparkles />
              {failed ? "Retry generation" : "Generate AI content"}
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
