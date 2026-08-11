import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { postsService } from "@/services";
import { aiService } from "@/services/ai.service";
import type {
  AudienceRegister,
  CaptionMode,
  CaptionResult,
} from "@/ai/caption";

/**
 * Caption generation for the Create Post page.
 *
 * Deliberately **not** tied to a post row. The Create Post flow is: describe
 * the post → generate → read it → edit it → decide whether to keep it. Only
 * the last step involves the database, and it goes through the existing posts
 * API like any other save.
 *
 * That is the whole shape change from the Make.com pipeline, which could not
 * generate anything until a row existed to hang a webhook off — so an unsaved
 * post had to be silently created first, and abandoning the result left a
 * stray draft behind.
 */

export interface UseAiCaptionDraft {
  /**
   * Which brain writes it, from the composer's publishing context. Personal
   * reaches none of the marketing pipeline — see the backend's `CaptionMode`.
   */
  mode?: CaptionMode;
  /** The brand whose style memory to read. Brand mode only. */
  brandId?: string;
  title: string;
  caption?: string;
  image_url?: string;
  platforms?: string[];
  /** The song already in the composer. Suggestions are suppressed when set. */
  music?: string;
  /** Personal only — opt in to audio ideas. See CaptionBrief.suggestSongs. */
  suggestSongs?: boolean;
  /** Which register to write in. Omitted lets the backend choose. */
  audience?: AudienceRegister;
  /** Brand-context identity: the AI writes as this brand, not the default voice. */
  brand?: { name: string; description?: string } | null;
}

export interface UseAiCaption {
  /** The most recent generation, or null before the first one. */
  result: CaptionResult | null;
  isGenerating: boolean;
  /** The last failure, in the backend's own words. Cleared on the next run. */
  error: string | null;
  /**
   * Generates from the form's current values. Resolves with the result, or
   * null when it failed — the error is on `error` either way, so a caller that
   * only wants to fill a textarea can ignore the return.
   */
  generate: (draft: UseAiCaptionDraft) => Promise<CaptionResult | null>;
  /** Forgets the current result, e.g. after the user saves the post. */
  reset: () => void;
}

export function useAiCaption(
  initialResult?: CaptionResult | null,
  storageKey?: string,
): UseAiCaption {
  const [result, setResult] = useState<CaptionResult | null>(() => {
    if (initialResult) return initialResult;
    if (storageKey) {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) return JSON.parse(raw);
      } catch (e) {
        // ignore
      }
    }
    return null;
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync result to sessionStorage whenever it changes
  useEffect(() => {
    if (!storageKey) return;
    try {
      if (result) sessionStorage.setItem(storageKey, JSON.stringify(result));
      else sessionStorage.removeItem(storageKey);
    } catch (e) {
      // ignore
    }
  }, [result, storageKey]);

  const generate = useCallback(
    async (draft: UseAiCaptionDraft): Promise<CaptionResult | null> => {
      const title = draft.title.trim();
      if (title.length < 3) {
        const message = "Add a title first — that's what the AI writes about.";
        setError(message);
        toast.error(message);
        return null;
      }

      setIsGenerating(true);
      setError(null);

      try {
        // The caption already on screen is sent as `previousCaption`, which is
        // what makes the second press of Regenerate produce a different angle
        // rather than a reworded copy of the first.
        const brief = await postsService.buildBriefFromDraft({
          ...draft,
          title,
        });
        const generated = await aiService.generateCaption(brief);

        setResult(generated);

        // Saying whether the image was read is worth a few words: it is the
        // difference between copy built on the picture and copy built on the
        // title, and the user is about to judge the options either way.
        const count = generated.variations.length;
        // "Angle" is a Brand word. Personal options are not different takes on
        // one direction, so describing them that way would be describing the
        // wrong product.
        const detail =
          draft.mode === "personal"
            ? ""
            : generated.imageAnalysis
              ? `, each on a different angle from "${generated.imageAnalysis.primarySubject}"`
              : "";

        toast.success(
          generated.imageAnalysis ? "Written from your image" : "Caption ready",
          {
            description: `${count} option${count === 1 ? "" : "s"}${detail} — edit anything before you save.`,
          },
        );
        return generated;
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : "Could not generate a caption. Please try again.";
        setError(message);
        toast.error("Generation failed", { description: message });
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, isGenerating, error, generate, reset };
}
