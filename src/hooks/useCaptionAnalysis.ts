import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { aiService } from "@/services/ai.service";
import { hasBlockers, type AnalysisBrief, type CaptionAnalysis } from "@/ai/analysis";

/**
 * Marketing Intelligence for whatever caption is currently on screen.
 *
 * Deliberately mirrors `useAiCaption` rather than extending it. The two answer
 * different questions at different moments — one writes, one judges — and
 * merging them would tie a score to the generation that produced it, which is
 * the exact coupling this sprint removed.
 *
 * ─── Not automatic ───────────────────────────────────────────────────────────
 * Analysis runs when asked, not on every keystroke. It is a model call: firing
 * it on a debounce while someone is mid-sentence would spend a request per
 * pause, score half-written copy, and show a number sliding around underneath
 * the person writing. A caption is analysed when its author thinks it is
 * finished.
 */

export interface UseCaptionAnalysis {
  /** The most recent analysis, or null before the first run. */
  analysis: CaptionAnalysis | null;
  isAnalysing: boolean;
  /** The last failure, in the backend's own words. Cleared on the next run. */
  error: string | null;
  /**
   * The caption the current `analysis` was run against. Compare it to what is
   * on screen to know whether the score still describes what the user is
   * looking at — the panel greys itself out rather than showing a stale number
   * as though it were live.
   */
  analysedCaption: string | null;
  /**
   * Scores one caption. Resolves with the analysis, or null when it failed —
   * the message is on `error` either way.
   */
  analyse: (brief: AnalysisBrief) => Promise<CaptionAnalysis | null>;
  reset: () => void;
}

export function useCaptionAnalysis(): UseCaptionAnalysis {
  const [analysis, setAnalysis] = useState<CaptionAnalysis | null>(null);
  const [analysedCaption, setAnalysedCaption] = useState<string | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Guards against an out-of-order result.
   *
   * Two analyses can be in flight if someone presses the button, edits, and
   * presses it again — and the first request finishing second would overwrite
   * the newer score with the older one. Only the latest run is allowed to
   * write state.
   */
  const runIdRef = useRef(0);

  const analyse = useCallback(
    async (brief: AnalysisBrief): Promise<CaptionAnalysis | null> => {
      const caption = brief.caption?.trim() ?? "";

      // The same floor the backend enforces, checked here so a caption that
      // obviously cannot be judged costs no round trip.
      if (caption.length < 12) {
        const message = "Write a line or two first — there's nothing to analyse yet.";
        setError(message);
        toast.error(message);
        return null;
      }

      const runId = ++runIdRef.current;
      setIsAnalysing(true);
      setError(null);

      try {
        const result = await aiService.analyzeCaption({ ...brief, caption });
        if (runId !== runIdRef.current) return result;

        setAnalysis(result);
        setAnalysedCaption(caption);

        // A blocker is the one outcome worth interrupting for: it means the
        // post will be truncated, rejected, or will carry a word the brand
        // explicitly banned. Everything else is in the panel to read.
        if (hasBlockers(result.checklist)) {
          const blocker = result.checklist.items.find(
            (item) => !item.passed && item.severity === "blocker",
          );
          toast.error("Fix this before publishing", {
            description: blocker?.fix ?? blocker?.label,
          });
        } else {
          toast.success(`Reach score ${result.reachScore}`, {
            description: `${result.checklist.readiness}% ready to publish.`,
          });
        }

        return result;
      } catch (cause) {
        if (runId !== runIdRef.current) return null;

        const message =
          cause instanceof Error
            ? cause.message
            : "Could not analyse this caption. Please try again.";
        setError(message);
        toast.error("Analysis failed", { description: message });
        return null;
      } finally {
        if (runId === runIdRef.current) setIsAnalysing(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    // Bumped so a request still in flight cannot repopulate what was just
    // cleared — reset has to actually mean "forget this".
    runIdRef.current += 1;
    setAnalysis(null);
    setAnalysedCaption(null);
    setError(null);
  }, []);

  return { analysis, isAnalysing, error, analysedCaption, analyse, reset };
}
