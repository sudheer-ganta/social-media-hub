import { cn } from "@/lib/utils";
import type { StatusTone } from "@/constants/integrations";

interface StatusPillProps {
  label: string;
  tone: StatusTone;
  className?: string;
}

/**
 * Colour per tone. The component never sees a *status* — the backend already
 * decided which of the three colours a status paints, so a status added later
 * arrives with a tone and renders correctly without this file changing.
 */
const TONE_STYLES: Record<StatusTone, string> = {
  healthy:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  attention:
    "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  disconnected:
    "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400",
  neutral: "border-border bg-muted text-muted-foreground",
};

const DOT_STYLES: Record<StatusTone, string> = {
  healthy: "bg-emerald-500",
  attention: "bg-amber-500",
  disconnected: "bg-red-500",
  neutral: "bg-muted-foreground/40",
};

/**
 * The status indicator on a provider card: a coloured dot and a word.
 *
 * The dot is `aria-hidden` and the label carries the meaning, so the status is
 * never colour-only — which matters both for screen readers and for the ~8% of
 * men who would read a red and a green pill as the same grey.
 */
export function StatusPill({ label, tone, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_STYLES[tone],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          DOT_STYLES[tone],
          // A connection needing attention pulses; a healthy one sits still.
          tone === "attention" && "animate-pulse",
        )}
      />
      {label}
    </span>
  );
}
