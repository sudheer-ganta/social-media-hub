import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Building2,
  Sparkles,
  Wand2,
  ArrowRight,
  Plus,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBrands } from "@/hooks/useBrands";
import { useBrandVoices } from "@/hooks/useBrandVoices";
import { cn } from "@/lib/utils";

export function BrandProfileBanner() {
  const navigate = useNavigate();
  const { brands, isLoading: brandsLoading } = useBrands();
  const { profiles, isLoading: voicesLoading } = useBrandVoices();

  const [selectedBrandIndex, setSelectedBrandIndex] = useState(0);

  if (brandsLoading || voicesLoading) {
    return (
      <div className="mb-6 h-28 w-full animate-pulse rounded-xl border border-border/40 bg-card/60" />
    );
  }

  // Case 1: User has NO brands created yet
  if (brands.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mb-6 overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-card to-background p-5 shadow-sm"
      >
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-sm">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  Set Up Your Brand Profile
                </h3>
                <Badge variant="secondary" className="text-[10px] font-medium uppercase tracking-wider">
                  Setup Required
                </Badge>
              </div>
              <p className="mt-1 max-w-xl text-xs sm:text-sm text-muted-foreground">
                Define your brand identity, tone of voice, and guidelines so AI can create tailored, on-brand posts for your social channels.
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate("/settings?tab=brands")}
            className="group shrink-0 gap-2 font-medium"
          >
            <span>Set Up Brand Profile</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
      </motion.div>
    );
  }

  // Case 2: User has one or more brands
  const activeBrand = brands[selectedBrandIndex] ?? brands[0];
  const linkedVoice = activeBrand
    ? profiles.find((p) => p.brand_id === activeBrand.id)
    : null;

  // A brand profile is considered set when it has a linked voice profile configured
  const isVoiceSet = Boolean(
    linkedVoice &&
    linkedVoice.voice &&
    (linkedVoice.voice.tone?.trim() || linkedVoice.voice.description?.trim() || linkedVoice.name?.trim())
  );

  const isProfileComplete = Boolean(
    activeBrand &&
    activeBrand.name.trim() &&
    isVoiceSet
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "mb-6 overflow-hidden rounded-xl border p-5 shadow-soft transition-all",
        isProfileComplete
          ? "border-border/80 bg-gradient-to-r from-card via-card to-primary/[0.04]"
          : "border-amber-500/30 bg-gradient-to-r from-card via-card to-amber-500/[0.04]"
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left Section: Brand info and status */}
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-bold text-base shadow-sm border",
            isProfileComplete
              ? "bg-primary/10 border-primary/20 text-primary"
              : "bg-amber-500/10 border-amber-500/20 text-amber-500"
          )}>
            {activeBrand.name.slice(0, 2).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Brand Profile
              </span>
              <span className="text-muted-foreground/40">•</span>
              <h3 className="text-lg font-bold tracking-tight text-foreground truncate">
                {activeBrand.name}
              </h3>

              {isProfileComplete ? (
                <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-[11px] font-medium">
                  <CheckCircle2 className="h-3 w-3" />
                  Profile Ready
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-500 text-[11px] font-medium">
                  <AlertCircle className="h-3 w-3" />
                  Voice Setup Needed
                </Badge>
              )}

              {linkedVoice && (
                <Badge variant="secondary" className="gap-1 text-[11px] font-normal">
                  <Wand2 className="h-3 w-3 text-primary" />
                  {linkedVoice.name || "Custom Voice"}
                </Badge>
              )}
            </div>

            {!isProfileComplete ? (
              <p className="mt-1 text-xs text-amber-500/90 font-medium">
                ⚠️ Brand profile is not fully set. Please set your Brand Voice before you can create posts.
              </p>
            ) : (
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground line-clamp-1">
                {activeBrand.description || "Brand identity configured."}
              </p>
            )}

            {/* Sub-meta: Voice tone details if configured */}
            {linkedVoice?.voice?.tone && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Voice Tone:</span>
                <span className="rounded bg-muted/60 px-2 py-0.5 text-xs text-foreground/80 font-mono">
                  {linkedVoice.voice.tone}
                </span>
                {linkedVoice.voice.targetAudience && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <span>Audience: {linkedVoice.voice.targetAudience}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Section: Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-center shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/settings?tab=brands")}
            className="gap-1.5 text-xs font-medium"
            title="Edit brand name, description, and website"
          >
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Manage Brand</span>
          </Button>

          {/* If voice is not set, highlight Brand Voice setup button */}
          <Button
            variant={isProfileComplete ? "outline" : "default"}
            size="sm"
            onClick={() => navigate(`/settings?tab=brand-voice&brandId=${activeBrand.id}`)}
            className={cn(
              "gap-1.5 text-xs font-medium",
              !isProfileComplete && "bg-amber-600 hover:bg-amber-700 text-white border-transparent shadow-sm"
            )}
            title="Configure brand voice guidelines and AI writing style"
          >
            <Wand2 className="h-3.5 w-3.5" />
            <span>{isVoiceSet ? "Brand Voice" : "Set Brand Voice"}</span>
          </Button>

          {/* ONLY show New Post if brand profile is complete! */}
          {isProfileComplete && (
            <Button
              size="sm"
              onClick={() => navigate(`/posts/new?context=brand&brand=${activeBrand.id}`)}
              className="gap-1.5 text-xs font-medium"
              title="Create a new post under this brand"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>New Post</span>
            </Button>
          )}
        </div>
      </div>

      {/* Brand Selector Tabs if user has multiple brands */}
      {brands.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
          <span className="text-xs text-muted-foreground mr-1">Your Brands:</span>
          {brands.map((b, idx) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedBrandIndex(idx)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors border",
                idx === selectedBrandIndex
                  ? "bg-primary/10 border-primary text-primary font-semibold shadow-xs"
                  : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {b.name}
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/settings?tab=brands")}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <Plus className="h-3 w-3" />
            <span>Add Brand</span>
          </Button>
        </div>
      )}
    </motion.div>
  );
}
