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

/**
 * How long a post may sit at ai_status = 'generating' before we stop believing
 * it. Make normally writes back within a minute; anything past this means the
 * scenario died without ever flipping the row to 'failed' — a broken module,
 * an expired connection, or an operations limit. Nothing in the database will
 * ever correct that, so the client has to.
 */
export const AI_GENERATION_TIMEOUT_MS = 3 * 60 * 1000;

export type AiRunState =
  | "idle"
  | "generating"
  | "stalled"
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

/** True when a run has been 'generating' past the timeout with no write-back. */
export function isGenerationStalled(post: Post, now = Date.now()): boolean {
  if (post.ai_status !== "generating") return false;
  const startedAt = Date.parse(post.updated_at);
  if (Number.isNaN(startedAt)) return false;
  return now - startedAt > AI_GENERATION_TIMEOUT_MS;
}

/**
 * The one place that decides what an AI run is currently doing and whether
 * something went wrong with it. Three separate signals feed in:
 *
 *   - ai_status — set by us, then by Make on success or explicit failure
 *   - ai_studio_output.meta — Make's own report, including partial runs
 *   - updated_at — the only evidence available when Make dies silently
 */
export function getAiRunStatus(post: Post, now = Date.now()): AiRunStatus {
  const meta = getGenerationMeta(post);

  if (post.ai_status === "generating") {
    return isGenerationStalled(post, now)
      ? {
          state: "stalled",
          error:
            "The generation never came back. The Make.com scenario likely stopped before it could write results. Check the scenario's run history, then try again.",
          canRetry: true,
        }
      : { state: "generating", error: null, canRetry: false };
  }

  if (post.ai_status === "failed" || meta.status === "failed") {
    return {
      state: "failed",
      error:
        meta.error ??
        "The AI scenario reported a failure but didn't say why. Check the Make.com run history for the failing module.",
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
