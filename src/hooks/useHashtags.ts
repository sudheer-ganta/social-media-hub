import { useState } from "react";
import { toast } from "sonner";
import { aiService } from "@/services/ai.service";
import type { HashtagBrief, HashtagResult } from "@/ai/hashtags";

/**
 * Choosing hashtags for the caption as it stands.
 *
 * ─── Not a query ─────────────────────────────────────────────────────────────
 * Deliberately plain state rather than `useMutation` or `useQuery`. There is
 * nothing to cache — the answer depends on caption text that changes as the
 * member types, so a cache key would either miss constantly or serve tags chosen
 * for a caption that no longer exists. And there is nothing to invalidate: this
 * writes nothing.
 *
 * ─── It cannot break publishing ──────────────────────────────────────────────
 * A failure sets an error toast and leaves `result` alone. The caption, the
 * scheduler and the publish button are all unaffected — hashtags are an
 * enhancement, and a member whose tag request failed still has a post to send.
 */
export interface UseHashtags {
  result: HashtagResult | null;
  isGenerating: boolean;
  run: (brief: HashtagBrief) => Promise<void>;
  /** Clears the panel, e.g. when the member has applied the tags. */
  reset: () => void;
}

export function useHashtags(): UseHashtags {
  const [result, setResult] = useState<HashtagResult | null>(null);
  const [isGenerating, setGenerating] = useState(false);

  const run = async (brief: HashtagBrief) => {
    setGenerating(true);
    try {
      const next = await aiService.generateHashtags(brief);
      setResult(next);

      // An empty set is a real answer, not a failure — the backend is allowed to
      // decide a post reads better bare. Surfacing its note as an ordinary toast
      // rather than an error is what keeps that distinction visible.
      if (next.primary.length === 0) {
        toast.info("No hashtags for this one", {
          description: next.note || "This post reads better without them.",
        });
      }
    } catch (cause) {
      // The backend's message is written for a member — "add a caption or a
      // topic first" — so it is shown rather than replaced.
      toast.error(
        cause instanceof Error ? cause.message : "Could not choose hashtags.",
      );
    } finally {
      setGenerating(false);
    }
  };

  return { result, isGenerating, run, reset: () => setResult(null) };
}
