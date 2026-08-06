import { hasStudioOutput } from "@/ai/selectors";
import type { Post, WorkflowStatus } from "@/types";

/**
 * A post's pipeline stage is a combination of three columns:
 * status (publishing lifecycle), ai_status (AI enrichment) and
 * approved (human gate). This collapses them into one display state:
 *
 *   Draft → AI Generating → AI Ready → Approved → Scheduled
 *         → Publishing → Published / Failed
 */
export function getWorkflowStatus(post: Post): WorkflowStatus {
  switch (post.status) {
    case "failed":
      return "failed";
    case "published":
      return "published";
    case "publishing":
      return "publishing";
    case "scheduled":
      return "scheduled";
    case "draft":
      if (post.ai_status === "generating") return "ai_generating";
      if (post.approved) return "approved";
      if (post.ai_status === "ready") return "ai_ready";
      return "draft";
  }
}

/**
 * True when a post carries any AI output — the Marketing Studio envelope or
 * the legacy per-column fields. Both are checked: a post generated purely
 * through the studio has none of the legacy columns set, and gating on those
 * alone would leave it stuck without an Approve button.
 */
export function hasAiContent(post: Post): boolean {
  return Boolean(
    hasStudioOutput(post) ||
      post.ai_caption ||
      (post.ai_hashtags && post.ai_hashtags.length > 0) ||
      (post.ai_platform_content &&
        Object.keys(post.ai_platform_content).length > 0),
  );
}
