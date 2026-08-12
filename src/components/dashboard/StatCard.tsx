import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  /**
   * Null means *not measured*, and renders as an em dash.
   *
   * Distinct from `loading`, which means "we are fetching it". A card that has
   * finished loading and has nothing to show must not display 0 — every stat on
   * this card is a count or a platform metric, and a fabricated zero is
   * indistinguishable on screen from a real one.
   */
  value: number | null;
  icon: LucideIcon;
  hint: string;
  accentClassName?: string;
  loading?: boolean;
  index?: number;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accentClassName,
  loading,
  index = 0,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
    >
      <Card className="transition-shadow hover:shadow-elevated">
        <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-medium text-muted-foreground">{label}</p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-16" />
            ) : (
              <p
                className={cn(
                  "mt-0.5 sm:mt-1 text-2xl sm:text-3xl font-bold tabular-nums tracking-tight",
                  value === null && "text-muted-foreground",
                )}
              >
                {value === null ? "—" : value.toLocaleString()}
              </p>
            )}
            <p className="mt-0.5 truncate text-[11px] sm:text-xs text-muted-foreground">{hint}</p>
          </div>
          <div
            className={cn(
              "flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg",
              accentClassName ?? "bg-accent text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
