import { motion } from "framer-motion";
import { CalendarRange, Lightbulb, Target, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CampaignPlan } from "@/ai/types";

const BUDGET_META: Record<CampaignPlan["budgetTier"], { label: string; className: string }> = {
  organic: { label: "Organic",     className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25" },
  low:     { label: "Low budget",  className: "bg-sky-500/10 text-sky-600 border-sky-500/25" },
  medium:  { label: "Mid budget",  className: "bg-violet-500/10 text-violet-600 border-violet-500/25" },
  high:    { label: "High budget", className: "bg-amber-500/10 text-amber-600 border-amber-500/25" },
};

interface CampaignPlanPanelProps {
  campaign: CampaignPlan;
}

export function CampaignPlanPanel({ campaign }: CampaignPlanPanelProps) {
  // Beats can arrive unsorted; the timeline only reads correctly in day order.
  const beats = [...campaign.beats].sort((a, b) => a.day - b.day);
  const budget = BUDGET_META[campaign.budgetTier] ?? BUDGET_META.organic;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <div>
        <p className="text-sm font-semibold">Campaign Plan</p>
        <p className="text-xs text-muted-foreground">
          A multi-day sequence built around this post.
        </p>
      </div>

      {/* Headline */}
      <div className="rounded-xl border bg-accent/30 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">{campaign.name}</span>
          <Badge variant="outline" className="text-[10px] gap-1">
            <CalendarRange className="h-2.5 w-2.5" />
            {campaign.durationDays} days
          </Badge>
          <Badge variant="outline" className={cn("border text-[10px] gap-1", budget.className)}>
            <Wallet className="h-2.5 w-2.5" />
            {budget.label}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <p className="text-sm leading-relaxed">{campaign.bigIdea}</p>
        </div>
      </div>

      {/* Timeline */}
      {beats.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Timeline
          </p>
          <div className="relative space-y-3 pl-6">
            {/* Spine */}
            <div className="absolute bottom-2 left-[7px] top-2 w-px bg-border" aria-hidden />

            {beats.map((beat, index) => (
              <motion.div
                key={`${beat.day}-${beat.channel}-${index}`}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04 }}
                className="relative"
              >
                <span
                  className="absolute -left-6 top-3 h-[7px] w-[7px] rounded-full bg-primary ring-4 ring-background"
                  aria-hidden
                />
                <div className="rounded-xl border bg-card p-3 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                      Day {beat.day}
                    </Badge>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {beat.channel}
                    </span>
                    <span className="text-xs font-medium">{beat.angle}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {beat.contentIdea}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      {campaign.kpis.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Success Metrics
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {campaign.kpis.map((kpi) => (
              <Badge key={kpi} variant="secondary" className="text-xs">
                {kpi}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
