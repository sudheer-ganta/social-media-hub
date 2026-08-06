import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CtaOption, CtaStyle } from "@/ai/types";

const CTA_COLORS: Record<CtaStyle, { card: string; badge: string }> = {
  Soft:         { card: "border-sky-500/20 bg-sky-500/5 hover:bg-sky-500/10",         badge: "bg-sky-500/10 text-sky-600 border-sky-500/30" },
  Hard:         { card: "border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10",       badge: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
  Luxury:       { card: "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10",   badge: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  Professional: { card: "border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10",      badge: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  Urgency:      { card: "border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10", badge: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  Minimal:      { card: "border-zinc-500/20 bg-zinc-500/5 hover:bg-zinc-500/10",      badge: "bg-zinc-500/10 text-zinc-600 border-zinc-500/30" },
};

interface CtaIntelligenceProps {
  options: CtaOption[];
}

export function CtaIntelligence({ options }: CtaIntelligenceProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const copy = async (opt: CtaOption) => {
    await navigator.clipboard.writeText(opt.text);
    setCopiedType(opt.type);
    setSelected(opt.type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  if (options.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">CTA Intelligence</p>
        <p className="text-xs text-muted-foreground">Click any CTA to select and copy it.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((opt) => {
          const colors = CTA_COLORS[opt.type];
          const isSelected = selected === opt.type;
          const isCopied = copiedType === opt.type;

          return (
            <motion.button
              key={opt.type}
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => copy(opt)}
              className={cn(
                "relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all duration-200",
                colors.card,
                isSelected && "ring-2 ring-primary/40 ring-offset-1 ring-offset-background"
              )}
            >
              <div className="flex w-full items-center justify-between gap-1">
                <Badge
                  variant="outline"
                  className={cn("text-[10px] font-semibold border", colors.badge)}
                >
                  {opt.type}
                </Badge>
                {isCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <Copy className="h-3 w-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100" />
                )}
              </div>

              <p className="text-sm font-semibold leading-snug">
                {opt.text}
              </p>

              <p className="text-[10px] text-muted-foreground leading-tight">
                {opt.label}
              </p>
            </motion.button>
          );
        })}
      </div>

      {selected && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-muted-foreground"
        >
          Selected: <span className="text-foreground font-medium">{selected}</span> CTA
        </motion.p>
      )}
    </div>
  );
}
