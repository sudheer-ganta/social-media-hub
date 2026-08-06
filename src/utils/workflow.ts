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

export function hasAiContent(post: Post): boolean {
  return Boolean(
    post.ai_caption ||
      (post.ai_hashtags && post.ai_hashtags.length > 0) ||
      (post.ai_platform_content &&
        Object.keys(post.ai_platform_content).length > 0),
  );
}
