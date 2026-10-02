import { useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Brain, Building2, User, Wand2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { BrandSettings } from "@/components/settings/BrandSettings";
import { BrandVoiceSettings } from "@/components/settings/BrandVoiceSettings";
import { BrandIntelligenceSettings } from "@/components/settings/BrandIntelligenceSettings";
import { cn } from "@/lib/utils";

type Tab = "general" | "brands" | "brand-voice" | "intelligence";

/*
  Brand Intelligence is its own tab rather than a section inside Brands, because
  it covers Personal too (a member has a learned voice whether or not they have
  a brand) and because it is informational: reading it is optional and nothing
  on it needs filling in.
*/
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General & Platforms", icon: User },
  { id: "brands", label: "Brands", icon: Building2 },
  { id: "brand-voice", label: "Brand Voice Profiles", icon: Wand2 },
  { id: "intelligence", label: "Brand Intelligence", icon: Brain },
];
const VALID_TABS = TABS.map((tab) => tab.id);

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const reduceMotion = useReducedMotion();
  const rawTab = searchParams.get("tab") as Tab | null;
  const activeTab: Tab = rawTab && VALID_TABS.includes(rawTab) ? rawTab : "general";

  const handleTabChange = (tab: Tab) => {
    setSearchParams(tab === "general" ? {} : { tab });
  };

  return (
    <PageContainer
      title="Settings"
      description="Your profile, brands, and how Rally writes for them."
      className="max-w-6xl"
    >
      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
        {/* Section nav: a scrolling pill row on small screens, a sticky rail on lg. */}
        <nav
          aria-label="Settings sections"
          className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-1 scrollbar-none sm:-mx-6 sm:px-6 lg:sticky lg:top-8 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleTabChange(id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="settings-nav-active"
                    className="absolute inset-0 rounded-lg bg-secondary"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 380, damping: 32 }
                    }
                  />
                )}
                <Icon
                  className={cn("relative h-4 w-4", active && "text-primary")}
                  strokeWidth={1.75}
                />
                <span className="relative">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          {activeTab === "general" && <SettingsForm />}
          {activeTab === "brands" && <BrandSettings />}
          {activeTab === "brand-voice" && <BrandVoiceSettings />}
          {activeTab === "intelligence" && <BrandIntelligenceSettings />}
        </div>
      </div>
    </PageContainer>
  );
}
