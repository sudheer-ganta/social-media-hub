import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Wand2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RallyIcon } from "@/components/brand/Logo";
import { useBrands } from "@/hooks/useBrands";
import { useBrandVoices } from "@/hooks/useBrandVoices";

export function BrandHeaderPrompt() {
  const navigate = useNavigate();
  const location = useLocation();
  const { brands, isLoading: brandsLoading } = useBrands();
  const { profiles, isLoading: voicesLoading } = useBrandVoices();

  // Don't show redundant prompt if user is already on Settings page configuring brands
  if (location.pathname === "/settings" || brandsLoading || voicesLoading) {
    return null;
  }

  // Case 1: User has NO brands created yet
  if (brands.length === 0) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-b border-primary/20 bg-gradient-to-r from-primary/10 via-card to-background px-4 py-2.5 text-xs sm:text-sm text-foreground"
        >
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                <RallyIcon className="h-3.5 w-3.5" />
              </span>
              <p className="font-medium">
                <strong className="text-primary font-semibold">Welcome to Rally!</strong> Create your Brand Profile to start generating tailored, on-brand social content.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => navigate("/settings?tab=brands")}
              className="h-7 shrink-0 gap-1.5 px-3 text-xs font-semibold shadow-xs"
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Create Brand Profile</span>
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Case 2: Brand exists, but brand voice is not configured
  const primaryBrand = brands[0];
  const primaryVoice = primaryBrand
    ? profiles.find((p) => p.brand_id === primaryBrand.id)
    : null;

  const isVoiceComplete = Boolean(
    primaryVoice &&
    primaryVoice.voice &&
    (primaryVoice.voice.tone?.trim() || primaryVoice.voice.description?.trim() || primaryVoice.name?.trim())
  );

  if (!isVoiceComplete && primaryBrand) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-b border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-card to-background px-4 py-2 text-xs sm:text-sm text-foreground"
        >
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-500">
                <Wand2 className="h-3.5 w-3.5" />
              </span>
              <p className="font-medium text-muted-foreground">
                Brand voice setup needed for <strong className="text-foreground font-semibold">{primaryBrand.name}</strong> to enable AI writing.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/settings?tab=brand-voice&brandId=${primaryBrand.id}`)}
              className="h-7 shrink-0 gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 text-xs font-medium"
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span>Configure Brand Voice</span>
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return null;
}
