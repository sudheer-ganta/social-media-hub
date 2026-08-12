import { ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCount } from "./metric-display";
import { overviewCards, STATE_COPY, type CardKey } from "./insights";
import type {
  AnalyticsOverview,
  PlatformBreakdownEntry,
  SyncStatusEntry,
} from "@/services/analytics.service";

/**
 * The five figures the page opens with — each one a door.
 *
 * ─── Why this is one plate and not five cards ────────────────────────────────
 *
 * A row of five identical bordered boxes is the dashboard failure state: every
 * figure the same size, so nothing is more important than anything else, and the
 * member has to read all five to find the one they came for. This is a single
 * surface divided by hairlines — the same structure the rest of FlowPost uses —
 * so the row reads as one answer with five parts.
 *
 * ─── Why every cell is a button ──────────────────────────────────────────────
 *
 * "7 interactions" raises "from what?" and the page has the answer. A number
 * with no way into its own detail makes the member go and count posts by hand,
 * which is the exact work this page exists to remove. Nothing looks like a
 * button — hover, focus ring and a chevron are the affordance — because five
 * filled buttons would read as a toolbar rather than as figures.
 *
 * ─── The numbers are the API's ───────────────────────────────────────────────
 *
 * Nothing here counts anything. Every value comes from `overviewCards`, which is
 * pure and tested; this file's whole job is to render what it decided. The last
 * time a component on this page did its own counting, "Posts Published: 0" was
 * rendered beside a chart of nine publications.
 */
export function AnalyticsCards({
  overview,
  platforms,
  connections,
  loading,
  active,
  onSelect,
}: {
  overview: AnalyticsOverview | undefined;
  platforms: PlatformBreakdownEntry[] | undefined;
  connections: SyncStatusEntry[] | undefined;
  loading: boolean;
  /** The open drill-down, so the cell that opened it stays marked. */
  active: CardKey | null;
  onSelect: (key: CardKey) => void;
}) {
  const reduceMotion = useReducedMotion();
  const cards = overviewCards(overview, platforms ?? [], connections ?? []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-lg border border-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
        {cards.map((card) => (
          <div key={card.key} className="p-4 sm:p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-lg border border-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
      {cards.map((card, index) => {
        const isActive = active === card.key;

        return (
          <motion.button
            key={card.key}
            type="button"
            onClick={() => onSelect(card.key)}
            aria-expanded={isActive}
            aria-label={`${card.label} — view details`}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: reduceMotion ? 0 : index * 0.04,
              duration: 0.26,
              ease: [0.32, 0.72, 0, 1],
            }}
            className={cn(
              "group relative min-w-0 p-4 text-left transition-colors sm:p-5",
              "hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              isActive && "bg-secondary",
            )}
          >
            {/* The open cell is marked by an ink rule, not a fill — the same
                vocabulary the masthead uses for the section you are in. */}
            {isActive && (
              <motion.span
                // Slides between cells rather than fading, so the marker reads
                // as one object moving — the same vocabulary as the masthead
                // underline. Under reduced motion it simply appears in place.
                layoutId={reduceMotion ? undefined : "analytics-card-marker"}
                className="absolute inset-x-0 top-0 h-0.5 bg-foreground"
              />
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="text-meta truncate">{card.label}</span>
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                  "group-hover:translate-x-0.5",
                  isActive && "rotate-90",
                )}
                aria-hidden="true"
              />
            </div>

            <p
              className={cn(
                "mt-1.5 font-display text-[26px] font-semibold leading-none tracking-[-0.02em] tnum sm:text-3xl",
                card.value === null && "text-muted-foreground",
              )}
            >
              {/* Never 0 for an absent number. "—" and 0 are different facts and
                  only one of them is about the member's content. */}
              {card.value === null ? "—" : formatCount(card.value)}
            </p>

            <p className="mt-1.5 text-xs text-muted-foreground">
              {card.value === null
                ? (STATE_COPY[card.state] || card.emptyCopy)
                : card.unit}
            </p>

            {card.value !== null &&
              card.lines.map((line) => (
                <p
                  key={line}
                  className="mt-0.5 text-[11px] leading-snug text-muted-foreground"
                >
                  {line}
                </p>
              ))}
          </motion.button>
        );
      })}
    </div>
  );
}
