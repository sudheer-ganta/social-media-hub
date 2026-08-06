import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { HashtagGroup } from "@/ai/types";

const CATEGORY_META: Record<
  HashtagGroup["category"],
  { label: string; color: string; badgeClass: string }
> = {
  trending:   { label: "Trending",   color: "text-rose-500",    badgeClass: "bg-rose-500/10 text-rose-600 border-rose-500/25" },
  niche:      { label: "Niche",      color: "text-violet-500",  badgeClass: "bg-violet-500/10 text-violet-600 border-violet-500/25" },
  location:   { label: "Location",   color: "text-emerald-500", badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25" },
  branded:    { label: "Branded",    color: "text-primary",     badgeClass: "bg-primary/10 text-primary border-primary/25" },
  competitor: { label: "Competitor", color: "text-amber-500",   badgeClass: "bg-amber-500/10 text-amber-600 border-amber-500/25" },
};

function DifficultyBar({ score, label }: { score: number; label: string }) {
  const color =
    score >= 70 ? "bg-rose-500" : score >= 40 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-muted-foreground w-12 shrink-0">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", color)}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <span className="text-[9px] font-mono text-muted-foreground w-6 text-right">{score}</span>
    </div>
  );
}

interface HashtagIntelligenceProps {
  groups: HashtagGroup[];
  onRegenerateGroup?: (category: HashtagGroup["category"]) => void;
  isRegenerating?: HashtagGroup["category"] | null;
}

export function HashtagIntelligence({
  groups,
  onRegenerateGroup,
  isRegenerating,
}: HashtagIntelligenceProps) {
  if (groups.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">Hashtag Intelligence</p>
        <p className="text-xs text-muted-foreground">
          Categorized hashtags with difficulty and popularity scores.
        </p>
      </div>

      <div className="space-y-3">
        {groups.map((group) => {
          const meta = CATEGORY_META[group.category];
          const loading = isRegenerating === group.category;

          return (
            <motion.div
              key={group.category}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border bg-card p-4 space-y-3"
            >
              {/* Group header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] font-semibold border", meta.badgeClass)}
                  >
                    {meta.label}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    Suggest {group.suggestedQuantity} tags
                  </span>
                </div>
                {onRegenerateGroup && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] text-muted-foreground"
                    onClick={() => onRegenerateGroup(group.category)}
                    disabled={loading}
                  >
                    <RefreshCw className={cn("h-3 w-3 mr-1", loading && "animate-spin")} />
                    Regen
                  </Button>
                )}
              </div>

              {/* Hashtags */}
              <div className="flex flex-wrap gap-1.5">
                {group.hashtags.map((ht) => (
                  <div key={ht.tag} className="group flex flex-col items-center">
                    <Badge
                      variant="secondary"
                      className="text-xs cursor-pointer transition-colors hover:bg-accent"
                      onClick={() => navigator.clipboard.writeText(`#${ht.tag}`)}
                    >
                      #{ht.tag}
                    </Badge>
                  </div>
                ))}
              </div>

              {/* Scores for first tag (representative) */}
              {group.hashtags[0] && (
                <div className="space-y-1 pt-1 border-t">
                  <DifficultyBar score={group.hashtags[0].difficultyScore} label="Difficulty" />
                  <DifficultyBar score={group.hashtags[0].popularityScore} label="Popularity" />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
