import { Layers, Search, CalendarRange, Crosshair, Share2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { StudioFeatureFlags } from "@/ai/types";

interface FeatureMeta {
  key: keyof StudioFeatureFlags;
  icon: typeof Search;
  label: string;
  description: string;
  /** Shown when the feature depends on something the user hasn't filled in. */
  requires?: string;
}

const FEATURES: FeatureMeta[] = [
  {
    key: "seo",
    icon: Search,
    label: "SEO",
    description: "Keywords, meta title & description, alt text, slug",
  },
  {
    key: "campaign",
    icon: CalendarRange,
    label: "Campaign Plan",
    description: "Multi-day content sequence with KPIs",
  },
  {
    key: "competitorAnalysis",
    icon: Crosshair,
    label: "Competitor Analysis",
    description: "Positioning, themes and unclaimed angles",
    requires: "competitor",
  },
  {
    key: "platformVariations",
    icon: Share2,
    label: "Platform Versions",
    description: "Caption rewritten per platform with limits",
  },
];

interface StudioFeaturesProps {
  features: StudioFeatureFlags;
  onToggle: (key: keyof StudioFeatureFlags, enabled: boolean) => void;
  /** Whether competitor details have been entered — gates the analysis toggle. */
  hasCompetitor: boolean;
}

export function StudioFeatures({ features, onToggle, hasCompetitor }: StudioFeaturesProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Extra Outputs
        </p>
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Each adds a separate AI call — turn on only what this post needs.
      </p>

      <div className="space-y-1">
        {FEATURES.map(({ key, icon: Icon, label, description, requires }) => {
          const blocked = requires === "competitor" && !hasCompetitor;

          return (
            <label
              key={key}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-accent/50",
                blocked && "cursor-not-allowed opacity-50 hover:bg-transparent",
              )}
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{label}</p>
                <p className="text-[10px] leading-tight text-muted-foreground">
                  {blocked ? "Add competitor details below first" : description}
                </p>
              </div>
              <Switch
                checked={features[key]}
                disabled={blocked}
                onCheckedChange={(checked) => onToggle(key, checked)}
                className="mt-0.5 shrink-0"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
