import { getGenerationMeta, hasStudioOutput } from "@/ai/selectors";
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
    // Claimed by the backend publisher but not yet sent. Collapsed into
    // "publishing" rather than given its own badge: the distinction matters to
    // the scheduler, not to someone watching their post go out.
    case "queued":
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
 * the flat per-column fields. Both are checked: a post generated purely
 * through the studio has none of the flat columns set, and gating on those
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

export type AiRunState =
  | "idle"
  | "generating"
  | "ready"
  | "partial"
  | "failed";

export interface AiRunStatus {
  state: AiRunState;
  /** User-facing failure reason; null when there is nothing wrong. */
  error: string | null;
  /** True when the user can start another run right now. */
  canRetry: boolean;
}

/**
 * The one place that decides what an AI run is currently doing and whether
 * something went wrong with it.
 *
 * ─── Why there is no "stalled" state any more ────────────────────────────────
 * Generation used to be a database handshake: the browser wrote
 * ai_status = 'generating', a Make.com scenario noticed, and minutes later
 * something wrote back. When the scenario died it wrote nothing, so a row
 * could sit at 'generating' forever and the client had to time it out itself.
 *
 * Since Sprint 4.1 the backend answers in the same request. A run that fails
 * fails visibly, in front of the user, and a row is only ever written once the
 * outcome is known — so 'generating' is never a persisted state, and a stall
 * has nothing left to mean.
 */
export function getAiRunStatus(post: Post): AiRunStatus {
  const meta = getGenerationMeta(post);

  // Only reachable for rows written by the retired pipeline, which are now
  // simply out of date. Offer the retry that replaces them.
  if (post.ai_status === "generating") {
    return { state: "idle", error: null, canRetry: true };
  }

  if (post.ai_status === "failed" || meta.status === "failed") {
    return {
      state: "failed",
      error:
        meta.error ??
        "The last generation didn't finish. Try again — if it keeps failing, check that the server has an AI key configured.",
      canRetry: true,
    };
  }

  if (meta.status === "partial") {
    return {
      state: "partial",
      error: meta.error ?? "Some assets could not be generated.",
      canRetry: true,
    };
  }

  if (post.ai_status === "ready" && hasAiContent(post)) {
    return { state: "ready", error: null, canRetry: true };
  }

  return { state: "idle", error: null, canRetry: true };
}
