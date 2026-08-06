import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number;
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
        <CardContent className="flex items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
                {value.toLocaleString()}
              </p>
            )}
            <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
          </div>
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              accentClassName ?? "bg-accent text-accent-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
