import { motion } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { PLATFORMS } from "@/utils/constants";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types";

interface PlatformSelectorProps {
  value: Platform[];
  onChange: (platforms: Platform[]) => void;
}

export function PlatformSelector({ value, onChange }: PlatformSelectorProps) {
  const toggle = (platform: Platform) => {
    onChange(
      value.includes(platform)
        ? value.filter((p) => p !== platform)
        : [...value, platform],
    );
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {PLATFORMS.map((platform, index) => {
        const selected = value.includes(platform.id);
        return (
          <motion.div
            key={platform.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04, duration: 0.25 }}
          >
            <div
              onClick={() => toggle(platform.id)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 rounded-lg border bg-card p-4 text-left shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated",
                selected && "border-primary/60 ring-1 ring-primary/40",
              )}
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white transition-transform"
                style={{ backgroundColor: platform.color }}
              >
                <PlatformIcon platform={platform.id} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {platform.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {platform.description}
                </span>
              </span>
              <Switch
                checked={selected}
                onCheckedChange={() => toggle(platform.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Toggle ${platform.name}`}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
