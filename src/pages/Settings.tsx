import { useState } from "react";
import { Brain, Building2, User, Wand2 } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { BrandSettings } from "@/components/settings/BrandSettings";
import { BrandVoiceSettings } from "@/components/settings/BrandVoiceSettings";
import { BrandIntelligenceSettings } from "@/components/settings/BrandIntelligenceSettings";
import { cn } from "@/lib/utils";

type Tab = "general" | "brands" | "brand-voice" | "intelligence";

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>("general");

  return (
    <PageContainer
      title="Settings"
      description="Manage account profile, default platforms, and global Brand Voice rules."
      className="max-w-4xl"
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex border-b gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors",
              activeTab === "general"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <User className="h-4 w-4" />
            General & Platforms
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("brands")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors",
              activeTab === "brands"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Building2 className="h-4 w-4" />
            Brands
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("brand-voice")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors",
              activeTab === "brand-voice"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Wand2 className="h-4 w-4" />
            Brand Voice Profiles
          </button>
          {/*
            Its own tab rather than a section inside Brands, because it covers
            Personal too — a member has a learned voice whether or not they have
            a brand — and because it is informational: reading it is optional and
            nothing on it needs filling in.
          */}
          <button
            type="button"
            onClick={() => setActiveTab("intelligence")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors",
              activeTab === "intelligence"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Brain className="h-4 w-4" />
            Brand Intelligence
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "general" && <SettingsForm />}
        {activeTab === "brands" && <BrandSettings />}
        {activeTab === "brand-voice" && <BrandVoiceSettings />}
        {activeTab === "intelligence" && <BrandIntelligenceSettings />}
      </div>
    </PageContainer>
  );
}
