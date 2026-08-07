import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { PLATFORMS } from "@/utils/constants";
import { useIntegrations } from "@/hooks/useIntegrations";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types";

interface PlatformSelectorProps {
  value: Platform[];
  onChange: (platforms: Platform[]) => void;
}

export function PlatformSelector({ value, onChange }: PlatformSelectorProps) {
  const { integrations } = useIntegrations();

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
        const integration = integrations.find((i) => i.provider === platform.id);
        const isConnected = integration?.connected ?? false;
        const accountName =
          integration?.account?.displayName ||
          (integration?.account?.username ? `@${integration.account.username}` : null);

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
                "flex w-full cursor-pointer flex-col rounded-xl border bg-card p-4 text-left shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated",
                selected && "border-primary/60 ring-1 ring-primary/40",
              )}
            >
              <div className="flex items-center gap-3 w-full">
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

              {/* Connected account status when platform is toggled ON */}
              <AnimatePresence>
                {selected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: "auto", marginTop: 10 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="overflow-hidden border-t pt-2.5"
                  >
                    {isConnected ? (
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-emerald-500 font-medium truncate">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            Connected{accountName ? `: ${accountName}` : ""}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shrink-0"
                        >
                          Ready
                        </Badge>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-amber-500 font-medium truncate">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Account not connected</span>
                        </div>
                        <Link
                          to="/integrations"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] text-primary underline flex items-center gap-0.5 hover:text-primary/80 shrink-0 font-medium"
                        >
                          Connect <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
