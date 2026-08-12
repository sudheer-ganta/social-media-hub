import { Hash, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { HashtagResult } from "@/ai/hashtags";

/**
 * "Here are the hashtags that actually fit this content."
 *
 * ─── Two tiers, and why ──────────────────────────────────────────────────────
 * `primary` already fits the tightest selected network's ceiling, so it can be
 * added to the caption in one press without pushing any destination over its
 * limit. `secondary` is everything relevant that did not fit, offered
 * individually — which is what makes a cross-post to Instagram and X workable:
 * Instagram would happily take eight tags, X tolerates two, and the member can
 * see the other six without either network being wrong.
 *
 * ─── An empty result is a result ──────────────────────────────────────────────
 * When the backend decides a post reads better bare, this renders the reason and
 * no tags. It does not show a retry, because there is nothing to retry — the
 * answer was "none", and offering to re-roll until tags appear would defeat the
 * point of letting the model say so.
 */

interface HashtagPanelProps {
  result: HashtagResult | null;
  isGenerating: boolean;
  /** Whether there is enough in the editor to choose tags from. */
  canGenerate: boolean;
  onGenerate: () => void;
  /** Appends tags to the caption. Goes through `withHashtags` in the composer. */
  onApply: (tags: string[]) => void;
  disabled?: boolean;
}

export function HashtagPanel({
  result,
  isGenerating,
  canGenerate,
  onGenerate,
  onApply,
  disabled,
}: HashtagPanelProps) {
  const hasTags = (result?.primary.length ?? 0) > 0;

  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Hash className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-sm font-semibold">Hashtags</p>
        </div>

        <Button
          type="button"
          size="sm"
          variant={result ? "ghost" : "outline"}
          className="h-7 px-2.5 text-[11px]"
          disabled={disabled || isGenerating || !canGenerate}
          onClick={onGenerate}
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Choosing…
            </>
          ) : result ? (
            <>
              <RefreshCw className="mr-1 h-3 w-3" />
              Again
            </>
          ) : (
            "Choose hashtags"
          )}
        </Button>
      </div>

      {!result && !isGenerating && (
        <p className="text-[11px] text-muted-foreground">
          {canGenerate
            ? "Chosen from this caption, the image and how this account has tagged before."
            : "Write a caption or a title first — tags are chosen from what the post actually says."}
        </p>
      )}

      {/*
        The note carries the model's reasoning, including "this post reads better
        without them". Rendered above the tags so an empty result still explains
        itself rather than looking like a failed request.
      */}
      {result?.note && (
        <p className="text-[11px] text-muted-foreground">{result.note}</p>
      )}

      {hasTags && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {result!.primary.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                #{tag}
              </Badge>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-[11px]"
              disabled={disabled}
              onClick={() => onApply(result!.primary)}
            >
              Add to caption
            </Button>

            {/*
              Stated only when the selected networks genuinely disagree. It is the
              one case where a member would otherwise think the tool had simply
              given them too few tags.
            */}
            {result!.budget.conflict && (
              <p className="text-[10px] text-muted-foreground">
                Your selected networks want different amounts — kept to{" "}
                {result!.budget.max} so none of them is overloaded.
              </p>
            )}
          </div>
        </>
      )}

      {(result?.secondary.length ?? 0) > 0 && (
        <div className="space-y-1.5 border-t pt-2">
          <p className="text-[10px] text-muted-foreground">
            Also relevant — tap to add one:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result!.secondary.map((tag) => (
              <button
                key={tag}
                type="button"
                disabled={disabled}
                onClick={() => onApply([tag])}
                className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
