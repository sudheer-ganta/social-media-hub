import { motion } from "framer-motion";
import { Copy, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PlatformVariations } from "@/ai/types";

/** Hard caption limits per platform. Unlisted platforms just show a count. */
const CHARACTER_LIMITS: Record<string, number> = {
  linkedin: 3000,
  instagram: 2200,
  facebook: 63206,
  x: 280,
  threads: 500,
};

function CharacterCounter({ platform, count }: { platform: string; count: number }) {
  const limit = CHARACTER_LIMITS[platform.toLowerCase()];
  if (!limit) {
    return (
      <span className="font-mono text-[10px] text-muted-foreground">{count} chars</span>
    );
  }

  const ratio = count / limit;
  return (
    <span
      className={cn(
        "font-mono text-[10px]",
        ratio > 1 ? "font-semibold text-rose-600" : ratio > 0.9 ? "text-amber-600" : "text-muted-foreground",
      )}
    >
      {count.toLocaleString()}/{limit.toLocaleString()}
    </span>
  );
}

interface PlatformVariationsPanelProps {
  variations: PlatformVariations;
  onUseCaption?: (caption: string) => void;
}

export function PlatformVariationsPanel({
  variations,
  onUseCaption,
}: PlatformVariationsPanelProps) {
  const entries = Object.entries(variations);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">Platform Versions</p>
        <p className="text-xs text-muted-foreground">
          One composer. Different platforms. No format headaches.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map(([platform, variation], index) => {
          const limit = CHARACTER_LIMITS[platform.toLowerCase()];
          const over = limit !== undefined && variation.characterCount > limit;

          return (
            <motion.div
              key={platform}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className={cn(
                "space-y-2.5 rounded-xl border bg-card p-4",
                over && "border-rose-500/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {platform}
                </p>
                <CharacterCounter platform={platform} count={variation.characterCount} />
              </div>

              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {variation.caption}
              </p>

              {variation.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {variation.hashtags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="cursor-pointer text-[10px]"
                      onClick={() => navigator.clipboard.writeText(`#${tag}`)}
                    >
                      #{tag}
                    </Badge>
                  ))}
                </div>
              )}

              {variation.notes && (
                <div className="flex gap-1.5 border-t pt-2">
                  <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    {variation.notes}
                  </p>
                </div>
              )}

              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 flex-1 text-[10px]"
                  onClick={() => navigator.clipboard.writeText(variation.caption)}
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
                {onUseCaption && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 flex-1 text-[10px]"
                    onClick={() => onUseCaption(variation.caption)}
                  >
                    Use
                  </Button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
