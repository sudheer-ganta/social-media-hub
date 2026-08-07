import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AiRunState } from "@/utils/workflow";

const TITLES: Partial<Record<AiRunState, string>> = {
  failed: "Generation failed",
  partial: "Some assets could not be generated",
};

interface AiErrorBannerProps {
  state: AiRunState;
  /** Why it failed, in the backend's own words. */
  error: string | null;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}

/**
 * The failure half of the AI panels: says what went wrong and offers the one
 * action that can fix it. A partial run keeps its amber, softer treatment —
 * the user still has content to work with.
 */
export function AiErrorBanner({
  state,
  error,
  onRetry,
  retrying,
  className,
}: AiErrorBannerProps) {
  if (state !== "failed" && state !== "partial") {
    return null;
  }

  const partial = state === "partial";

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 border px-4 py-3 sm:flex-row sm:items-start",
        partial
          ? "border-amber-500/25 bg-amber-500/5"
          : "border-destructive/25 bg-destructive/5",
        className,
      )}
    >
      <AlertTriangle
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          partial ? "text-amber-500" : "text-destructive",
        )}
      />
      <div className="flex-1 space-y-0.5">
        <p className="text-xs font-semibold">{TITLES[state]}</p>
        {error && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {error}
          </p>
        )}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        loading={retrying}
        onClick={onRetry}
        className="h-7 shrink-0 self-start text-xs"
      >
        <RefreshCw className="h-3 w-3" />
        Try again
      </Button>
    </div>
  );
}
