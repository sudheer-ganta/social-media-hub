import { motion } from "framer-motion";
import {
  Megaphone,
  Users,
  Globe,
  ShoppingCart,
  CalendarCheck,
  Rocket,
  PartyPopper,
  Mail,
  Heart,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GOAL_META } from "@/ai/prompts/modules";
import type { MarketingGoal } from "@/ai/types";

interface GoalOption {
  id: MarketingGoal;
  icon: typeof Megaphone;
  color: string;
  bg: string;
}

const GOAL_OPTIONS: GoalOption[] = [
  { id: "brand_awareness",    icon: Megaphone,      color: "text-violet-500",  bg: "bg-violet-500/10 border-violet-500/20" },
  { id: "lead_generation",    icon: Users,          color: "text-blue-500",    bg: "bg-blue-500/10 border-blue-500/20" },
  { id: "website_traffic",    icon: Globe,          color: "text-cyan-500",    bg: "bg-cyan-500/10 border-cyan-500/20" },
  { id: "sales",              icon: ShoppingCart,   color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { id: "bookings",           icon: CalendarCheck,  color: "text-amber-500",   bg: "bg-amber-500/10 border-amber-500/20" },
  { id: "product_launch",     icon: Rocket,         color: "text-rose-500",    bg: "bg-rose-500/10 border-rose-500/20" },
  { id: "event_promotion",    icon: PartyPopper,    color: "text-pink-500",    bg: "bg-pink-500/10 border-pink-500/20" },
  { id: "newsletter",         icon: Mail,           color: "text-indigo-500",  bg: "bg-indigo-500/10 border-indigo-500/20" },
  { id: "community_building", icon: Heart,          color: "text-red-500",     bg: "bg-red-500/10 border-red-500/20" },
  { id: "customer_retention", icon: Star,           color: "text-yellow-500",  bg: "bg-yellow-500/10 border-yellow-500/20" },
];

interface MarketingGoalSelectorProps {
  value: MarketingGoal;
  onChange: (goal: MarketingGoal) => void;
}

export function MarketingGoalSelector({ value, onChange }: MarketingGoalSelectorProps) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Marketing Goal</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Your goal shapes every word, CTA, and hashtag generated.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {GOAL_OPTIONS.map(({ id, icon: Icon, color, bg }) => {
          const meta = GOAL_META[id];
          const active = value === id;
          return (
            <motion.button
              key={id}
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => onChange(id)}
              className={cn(
                "relative flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all duration-200",
                active
                  ? `${bg} ring-2 ring-offset-1 ring-offset-background ${color.replace("text-", "ring-")}`
                  : "border-border bg-card hover:bg-accent hover:border-accent-foreground/20"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                  active ? bg : "bg-muted"
                )}
              >
                <Icon className={cn("h-4 w-4", active ? color : "text-muted-foreground")} />
              </div>
              <div className="min-w-0">
                <p className={cn("text-xs font-semibold truncate", active ? color : "text-foreground")}>
                  {meta.label}
                </p>
                <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                  {meta.primaryAction}
                </p>
              </div>
              {active && (
                <motion.span
                  layoutId="goal-active-ring"
                  className="absolute inset-0 rounded-lg ring-2 ring-primary/50"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
