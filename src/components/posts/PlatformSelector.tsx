import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ExternalLink, PlugZap } from "lucide-react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { PLATFORMS } from "@/utils/constants";
import type { Integration } from "@/constants/integrations";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types";

interface PlatformSelectorProps {
  value: Platform[];
  onChange: (platforms: Platform[]) => void;
  /**
   * The active context's integrations, fetched by the composer. Only networks
   * with a connection in that context are offered — a Personal post can never
   * even display a brand account, let alone select one.
   */
  integrations: Integration[];
  /** "personal" or the brand's name, for the empty state's wording. */
  contextLabel: string;
}

export function PlatformSelector({
  value,
  onChange,
  integrations,
  contextLabel,
}: PlatformSelectorProps) {
  const toggle = (platform: Platform) => {
    onChange(
      value.includes(platform)
        ? value.filter((p) => p !== platform)
        : [...value, platform],
    );
  };

  const connected = PLATFORMS.filter(
    (platform) =>
      integrations.find((i) => i.provider === platform.id)?.connected,
  );

  if (connected.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
        <PlugZap className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">
          No accounts connected for {contextLabel} yet.
        </p>
        <p className="text-xs text-muted-foreground">
          Connect a social account to this context to publish.
        </p>
        <Link
          to="/integrations"
          className="text-sm font-medium text-primary underline flex items-center gap-1 hover:text-primary/80"
        >
          Open Integrations <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {connected.map((platform, index) => {
          const selected = value.includes(platform.id);
          const integration = integrations.find(
            (i) => i.provider === platform.id,
          );
          const accountName =
            integration?.account?.displayName ||
            (integration?.account?.username
              ? `@${integration.account.username}`
              : null);

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
                      {accountName ?? platform.description}
                    </span>
                  </span>
                  <Switch
                    checked={selected}
                    onCheckedChange={() => toggle(platform.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Toggle ${platform.name}`}
                  />
                </div>

                <AnimatePresence>
                  {selected && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: "auto", marginTop: 10 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="overflow-hidden border-t pt-2.5"
                    >
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Showing accounts connected for {contextLabel}.{" "}
        <Link to="/integrations" className="text-primary underline">
          Connect more
        </Link>
      </p>
    </div>
  );
}
