import { AlertOctagon, Check, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  hasBlockers,
  type ChecklistItem,
  type ChecklistSeverity,
  type PrePublishChecklist as Checklist,
} from "@/ai/analysis";

/**
 * The pre-flight card.
 *
 * ─── Why this sits next to the reach score rather than inside it ─────────────
 * They answer different questions at different moments. The score answers *how
 * good is this*, which is a question you ask while writing. The checklist
 * answers *is this ready to go out*, which is the question you ask with your
 * hand on the publish button — and at that moment a 74/100 is not something
 * anyone can act on.
 *
 * Every unticked row here carries the specific fix, because a checklist whose
 * items you have to interpret is just a score with tick boxes.
 *
 * Ordering is deliberate and not by severity alone: unticked items come first,
 * blockers first within those. The user is here to find what is wrong, and the
 * ticked rows are reassurance to be scrolled past, not content to be read.
 */

const SEVERITY_ORDER: Record<ChecklistSeverity, number> = {
  blocker: 0,
  important: 1,
  polish: 2,
};

const SEVERITY_LABEL: Record<ChecklistSeverity, string> = {
  blocker: "Blocker",
  important: "Important",
  polish: "Polish",
};

const SEVERITY_STYLES: Record<ChecklistSeverity, string> = {
  blocker: "text-red-600 border-red-500/30 bg-red-500/10",
  important: "text-amber-600 border-amber-500/30 bg-amber-500/10",
  polish: "text-muted-foreground border-border bg-muted",
};

function sortItems(items: readonly ChecklistItem[]): ChecklistItem[] {
  return [...items].sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? 1 : -1;
    return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  });
}

interface PrePublishChecklistProps {
  checklist: Checklist;
  className?: string;
}

export function PrePublishChecklist({
  checklist,
  className,
}: PrePublishChecklistProps) {
  const items = sortItems(checklist.items);
  const blocked = hasBlockers(checklist);
  const outstanding = items.filter((item) => !item.passed).length;

  return (
    <div className={cn("space-y-4", className)}>
      {/* ── Readiness ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold">Before publishing</p>
          <span
            className={cn(
              "text-sm font-bold tabular-nums",
              blocked
                ? "text-red-600"
                : checklist.readiness >= 90
                  ? "text-emerald-600"
                  : "text-amber-600",
            )}
          >
            {checklist.readiness}% ready
          </span>
        </div>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              blocked
                ? "bg-red-500"
                : checklist.readiness >= 90
                  ? "bg-emerald-500"
                  : "bg-amber-500",
            )}
            style={{ width: `${checklist.readiness}%` }}
          />
        </div>

        <p className="mt-1.5 text-xs text-muted-foreground">
          {blocked
            ? "Something here will break the post on at least one network."
            : outstanding === 0
              ? "Everything checks out."
              : `${outstanding} item${outstanding === 1 ? "" : "s"} left — none of them blocking.`}
        </p>
      </div>

      {/* ── The items ─────────────────────────────────────────────────────── */}
      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "flex gap-2.5 rounded-lg px-2.5 py-2",
              !item.passed && item.severity === "blocker" && "bg-red-500/5",
              !item.passed && item.severity !== "blocker" && "bg-accent/40",
            )}
          >
            <span className="mt-0.5 shrink-0">
              {item.passed ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : item.severity === "blocker" ? (
                <AlertOctagon className="h-3.5 w-3.5 text-red-600" />
              ) : (
                <Square className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className={cn(
                    "text-xs",
                    item.passed ? "text-muted-foreground" : "font-medium",
                  )}
                >
                  {item.label}
                </p>
                {!item.passed && (
                  <span
                    className={cn(
                      "shrink-0 rounded border px-1.5 py-px text-[9px] font-medium uppercase tracking-wide",
                      SEVERITY_STYLES[item.severity],
                    )}
                  >
                    {SEVERITY_LABEL[item.severity]}
                  </span>
                )}
              </div>

              {/* The fix, and only when there is something to fix. A passed row
                  showing advice would read as a criticism of working copy. */}
              {!item.passed && item.fix && (
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {item.fix}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
