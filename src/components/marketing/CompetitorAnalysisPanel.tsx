import { motion } from "framer-motion";
import {
  Crosshair,
  Compass,
  Mic2,
  CalendarClock,
  ThumbsUp,
  ThumbsDown,
  DoorOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CompetitorAnalysis } from "@/ai/types";

function BulletList({
  icon: Icon,
  label,
  items,
  accent,
}: {
  icon: typeof ThumbsUp;
  label: string;
  items: string[];
  accent: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", accent)} />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-relaxed">
            <span className={cn("mt-[7px] h-1 w-1 shrink-0 rounded-full", accent.replace("text-", "bg-"))} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface CompetitorAnalysisPanelProps {
  competitor: CompetitorAnalysis;
}

export function CompetitorAnalysisPanel({ competitor }: CompetitorAnalysisPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <div>
        <p className="text-sm font-semibold">Competitor Analysis</p>
        <p className="text-xs text-muted-foreground">
          How {competitor.brandName || "they"} position themselves, and where the gaps are.
        </p>
      </div>

      {/* Positioning summary */}
      <div className="rounded-xl border bg-accent/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Crosshair className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-bold">{competitor.brandName || "Competitor"}</span>
        </div>

        <div className="flex gap-2">
          <Compass className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-sm leading-relaxed">{competitor.positioning}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="flex items-start gap-1.5">
            <Mic2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tone</p>
              <p className="text-xs font-medium">{competitor.toneObserved}</p>
            </div>
          </div>
          <div className="flex items-start gap-1.5">
            <CalendarClock className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cadence</p>
              <p className="text-xs font-medium">{competitor.postingFrequency}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content themes */}
      {competitor.contentThemes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Content Themes
          </p>
          <div className="flex flex-wrap gap-1.5">
            {competitor.contentThemes.map((theme) => (
              <Badge key={theme} variant="secondary" className="text-xs">
                {theme}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <BulletList
          icon={ThumbsUp}
          label="Strengths"
          items={competitor.strengths}
          accent="text-emerald-500"
        />
        <BulletList
          icon={ThumbsDown}
          label="Weaknesses"
          items={competitor.weaknesses}
          accent="text-rose-500"
        />
      </div>

      {/* Gaps — the actionable part */}
      <BulletList
        icon={DoorOpen}
        label="Unclaimed Angles"
        items={competitor.gaps}
        accent="text-amber-500"
      />

      {competitor.differentiationAdvice && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
            How to differentiate
          </p>
          <p className="text-sm leading-relaxed">{competitor.differentiationAdvice}</p>
        </div>
      )}
    </motion.div>
  );
}
