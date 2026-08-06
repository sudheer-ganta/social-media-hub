import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { FUNNEL_META } from "@/ai/prompts/modules";
import type { FunnelStage } from "@/ai/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FunnelStageOption {
  id: FunnelStage;
  color: string;
  activeClass: string;
  widthClass: string;
}

const STAGES: FunnelStageOption[] = [
  {
    id: "TOFU",
    color: "text-sky-500",
    activeClass: "bg-sky-500/15 border-sky-500/40 ring-sky-500/50",
    widthClass: "w-full",
  },
  {
    id: "MOFU",
    color: "text-violet-500",
    activeClass: "bg-violet-500/15 border-violet-500/40 ring-violet-500/50",
    widthClass: "w-5/6",
  },
  {
    id: "BOFU",
    color: "text-emerald-500",
    activeClass: "bg-emerald-500/15 border-emerald-500/40 ring-emerald-500/50",
    widthClass: "w-4/6",
  },
  {
    id: "Retention",
    color: "text-amber-500",
    activeClass: "bg-amber-500/15 border-amber-500/40 ring-amber-500/50",
    widthClass: "w-3/6",
  },
];

interface FunnelStageSelectorProps {
  value: FunnelStage;
  onChange: (stage: FunnelStage) => void;
}

export function FunnelStageSelector({ value, onChange }: FunnelStageSelectorProps) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Marketing Funnel Stage</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Each stage uses a different writing style and tone.
        </p>
      </div>

      {/* Visual funnel + buttons */}
      <div className="flex flex-col items-center gap-1.5">
        {STAGES.map(({ id, color, activeClass, widthClass }) => {
          const meta = FUNNEL_META[id];
          const active = value === id;
          return (
            <Tooltip key={id} delayDuration={200}>
              <TooltipTrigger asChild>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onChange(id)}
                  className={cn(
                    widthClass,
                    "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-all duration-200",
                    active
                      ? `${activeClass} ring-2 ring-offset-1 ring-offset-background`
                      : "border-border bg-card hover:bg-accent"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-black",
                        active ? "bg-current/10" : "bg-muted"
                      )}
                    >
                      <span className={cn("text-[10px] font-black", active ? color : "text-muted-foreground")}>
                        {id === "Retention" ? "R" : id[0]}
                      </span>
                    </div>
                    <div>
                      <p className={cn("text-xs font-semibold", active ? color : "text-foreground")}>
                        {id}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        {meta.label}
                      </p>
                    </div>
                  </div>
                  <p className="hidden text-[10px] text-muted-foreground sm:block max-w-[140px] text-right leading-tight truncate">
                    {meta.writingStyle}
                  </p>
                </motion.button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[220px]">
                <p className="font-semibold mb-1">{meta.label}</p>
                <p className="text-xs text-muted-foreground">{meta.description}</p>
                <p className="text-xs mt-1"><span className="font-medium">Style:</span> {meta.writingStyle}</p>
                <p className="text-xs"><span className="font-medium">Audience:</span> {meta.awareness}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
