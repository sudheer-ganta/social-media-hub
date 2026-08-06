import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Columns2, Grid2X2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ContentTone, ContentVariation } from "@/ai/types";

const TONE_COLORS: Record<ContentTone, string> = {
  Professional: "border-blue-500/30 bg-blue-500/5 text-blue-600",
  Minimal:      "border-zinc-500/30 bg-zinc-500/5 text-zinc-600",
  Luxury:       "border-amber-500/30 bg-amber-500/5 text-amber-600",
  Storytelling: "border-violet-500/30 bg-violet-500/5 text-violet-600",
  Emotional:    "border-rose-500/30 bg-rose-500/5 text-rose-600",
  Sales:        "border-emerald-500/30 bg-emerald-500/5 text-emerald-600",
  Corporate:    "border-slate-500/30 bg-slate-500/5 text-slate-600",
  Creative:     "border-pink-500/30 bg-pink-500/5 text-pink-600",
  Technical:    "border-cyan-500/30 bg-cyan-500/5 text-cyan-600",
};

interface ContentVariationsProps {
  variations: ContentVariation[];
  onUseCaption?: (caption: string) => void;
}

function VariationCard({
  variation,
  onUse,
  compact = false,
}: {
  variation: ContentVariation;
  onUse?: () => void;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(variation.caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "rounded-xl border p-4 space-y-3 transition-all",
        TONE_COLORS[variation.tone]
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge
          variant="outline"
          className={cn("text-[10px] font-semibold border", TONE_COLORS[variation.tone])}
        >
          {variation.tone}
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          {variation.wordCount}w
        </span>
      </div>

      {variation.hook && (
        <p className="text-xs font-semibold text-foreground/80 italic">
          "{variation.hook}"
        </p>
      )}

      <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", compact && "line-clamp-4")}>
        {variation.caption}
      </p>

      <div className="flex gap-1.5 pt-1 border-t border-current/10">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={copy}
        >
          {copied ? (
            <><Check className="h-3 w-3 text-emerald-500" /> Copied</>
          ) : (
            <><Copy className="h-3 w-3" /> Copy</>
          )}
        </Button>
        {onUse && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onUse}
          >
            Use as Caption
          </Button>
        )}
      </div>
    </motion.div>
  );
}

export function ContentVariationsPanel({
  variations,
  onUseCaption,
}: ContentVariationsProps) {
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState<number>(0);
  const [compareB, setCompareB] = useState<number>(1);

  if (variations.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Content Variations</p>
          <p className="text-xs text-muted-foreground">{variations.length} tones generated</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setCompareMode((p) => !p)}
        >
          {compareMode ? <Grid2X2 className="h-3 w-3" /> : <Columns2 className="h-3 w-3" />}
          {compareMode ? "Grid" : "Compare"}
        </Button>
      </div>

      {compareMode ? (
        /* Compare two variations side by side */
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { idx: compareA, setIdx: setCompareA, label: "A" },
              { idx: compareB, setIdx: setCompareB, label: "B" },
            ].map(({ idx, setIdx, label }) => (
              <div key={label} className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Variant {label}
                </p>
                <select
                  value={idx}
                  onChange={(e) => setIdx(Number(e.target.value))}
                  className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
                >
                  {variations.map((v, i) => (
                    <option key={v.tone} value={i}>{v.tone}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[compareA, compareB].map((i) => (
              <VariationCard
                key={i}
                variation={variations[i]}
                onUse={onUseCaption ? () => onUseCaption(variations[i].caption) : undefined}
                compact
              />
            ))}
          </div>
        </div>
      ) : (
        /* Grid view */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {variations.map((v) => (
            <VariationCard
              key={v.tone}
              variation={v}
              onUse={onUseCaption ? () => onUseCaption(v.caption) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
