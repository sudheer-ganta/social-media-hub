import { useState } from "react";
import { ChevronDown, Globe, User, AtSign } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CompetitorContext } from "@/ai/types";

interface CompetitorInputProps {
  value: CompetitorContext | null;
  onChange: (ctx: CompetitorContext | null) => void;
}

export function CompetitorInput({ value, onChange }: CompetitorInputProps) {
  const [open, setOpen] = useState(false);

  const set = (key: keyof CompetitorContext, val: string) => {
    const next = { ...(value ?? {}), [key]: val || undefined };
    const isEmpty =
      !next.website && !next.brandName && !next.socialHandle;
    onChange(isEmpty ? null : (next as CompetitorContext));
  };

  const hasData = value && (value.website || value.brandName || value.socialHandle);

  return (
    <div className="rounded-lg border border-dashed p-3 space-y-2">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-xs font-semibold">
            Competitor Inspiration{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </p>
          {hasData && !open && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {[value?.brandName, value?.socialHandle, value?.website]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2.5 pt-1">
              <p className="text-[10px] text-muted-foreground leading-snug">
                AI will draw tonal inspiration — not copy content.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <User className="h-3 w-3" /> Brand Name
                </Label>
                <Input
                  value={value?.brandName ?? ""}
                  onChange={(e) => set("brandName", e.target.value)}
                  placeholder="e.g. Apple"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <AtSign className="h-3 w-3" /> Social Handle
                </Label>
                <Input
                  value={value?.socialHandle ?? ""}
                  onChange={(e) => set("socialHandle", e.target.value)}
                  placeholder="e.g. @apple"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Globe className="h-3 w-3" /> Website
                </Label>
                <Input
                  value={value?.website ?? ""}
                  onChange={(e) => set("website", e.target.value)}
                  placeholder="e.g. apple.com"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
