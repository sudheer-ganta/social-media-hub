import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Sparkles, Wand2, X, Camera, Palette, Compass, Lightbulb, Check } from "lucide-react";
import { RallyIcon } from "@/components/brand/Logo";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { cloudinaryService } from "@/services";
import { brandVoicesRepository } from "@/repositories/brand-voices.repository";
import { creativeService, type CreativeStyleSummary } from "@/services/creative.service";
import { useBrandVoices } from "@/hooks/useBrandVoices";
import { useCreativeDna } from "@/hooks/useCreativeDna";
import { useBrands } from "@/hooks/useBrands";
import { GOAL_META, FUNNEL_META } from "@/ai/prompts/modules";
import { detectMarketingStrategy } from "@/ai/strategy/marketing-strategy-detector";
import type { FunnelStage, MarketingGoal } from "@/ai/types";
import type {
  CreativeIntentBrief,
  GeneratedAsset,
  ReferenceStyleProfile,
  ScoredCreativeConcept,
} from "@/types/creative";
import type { PostMediaItem } from "@/types";
import { ReferenceImagesUploader, type ReferenceImage } from "./ReferenceImagesUploader";
import { GenerationMatrixProgress } from "./GenerationMatrixProgress";
import { CreativeTextEditor } from "@/components/creative/CreativeTextEditor";

/**
 * "Create with FlowPost" — the AI creative-generation flow.
 *
 *   Describe it → concepts → pick one → visual → campaign → Refine / Use in Post
 *
 * Two things about that flow are deliberate.
 *
 * The concept step is the point: FlowPost is the creative director, not the
 * image model — an idea is chosen before anything is art-directed, so the
 * member picks WHAT gets made, not just how it looks.
 *
 * The campaign step has no button. Picking a concept runs the visual and then
 * the campaign designed over it, as one action, because "image or campaign?"
 * is not a question a member has any basis to answer — they asked for a
 * creative. The two labels below are the only place the seam shows.
 */

const GOALS = Object.keys(GOAL_META) as MarketingGoal[];

const FUNNEL_STAGES = Object.keys(FUNNEL_META) as FunnelStage[];

type Step = "input" | "discovering" | "concepts" | "generating" | "result";

interface ReferenceAsset {
  url: string;
  name: string;
}

/** Short adjective tags for the "FlowPost understood your style" transparency step — mirrors reference-style.generator.ts's summariseReferenceStyle, client-side, since it's display logic only. */
function summariseReferenceStyleTags(profile: ReferenceStyleProfile): string[] {
  if (!profile.analysed || !profile.visualLanguage) return [];
  return profile.visualLanguage
    .split(/[,/]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((tag) => tag.charAt(0).toUpperCase() + tag.slice(1));
}

function formatArtDirectionFamily(family: string): string {
  const mapping: Record<string, string> = {
    EDITORIAL_PHOTOGRAPHY: "Photography",
    SURREAL_EDITORIAL: "Surreal Photo",
    INTERACTIVE_GRAPHIC: "Interactive Graphic",
    TYPOGRAPHY_LED: "Typography Art",
    PRODUCT_STUDIO: "Studio Product",
    DOCUMENTARY: "Candid Photo",
    COLLAGE: "Collage Art",
    HANDCRAFTED: "Handcrafted Art",
    CINEMATIC: "Cinematic Still",
    MINIMAL_ART: "Minimalist Art",
    PLAYFUL_GRAPHIC: "Playful Graphic",
    CULTURAL_EDITORIAL: "Cultural Photo",
    INFORMATIONAL: "Informational Graphic",
    ILLUSTRATIVE: "Illustration",
  };
  return mapping[family] || family.replace(/_/g, " ");
}

function ArtDirectionPreview({
  family,
  brandColors,
}: {
  family: string;
  brandColors: string[];
}) {
  const c1 = brandColors[0] || "#71717a";
  const c2 = brandColors[1] || "#a1a1aa";

  const containerStyle = {
    background: `linear-gradient(135deg, ${c1}10, ${c2}20)`,
    borderColor: `${c1}25`,
  };

  return (
    <div
      style={containerStyle}
      className="relative h-16 w-full rounded-md border overflow-hidden flex items-center justify-center select-none"
    >
      {family === "EDITORIAL_PHOTOGRAPHY" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="border border-foreground/15 rounded-full h-8 w-8 flex items-center justify-center">
            <div className="border border-foreground/20 rounded-full h-4 w-4" />
          </div>
          <div className="absolute top-1.5 right-2 text-[8px] uppercase tracking-widest text-muted-foreground/60 font-mono">1/125s</div>
        </div>
      )}
      {family === "SURREAL_EDITORIAL" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            <div className="absolute -top-3 -left-3 h-5 w-5 rounded-full bg-foreground/10 blur-sm" />
            <div className="h-6 w-6 rounded-full border border-dashed border-foreground/30 animate-spin" style={{ animationDuration: "12s" }} />
          </div>
        </div>
      )}
      {family === "TYPOGRAPHY_LED" && (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="text-3xl font-serif font-bold text-foreground/10 select-none">
            Aa Bb
          </span>
        </div>
      )}
      {family === "PRODUCT_STUDIO" && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
          <div className="h-1 w-8 rounded-full bg-foreground/10 blur-[1px]" />
          <div className="h-3 w-3 rounded-sm bg-foreground/15 border border-foreground/20 rotate-12 -translate-y-0.5" />
        </div>
      )}
      {family === "DOCUMENTARY" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="border border-foreground/15 w-10 h-7 rounded flex items-center justify-center">
            <div className="h-1.5 w-1.5 rounded-full bg-red-500/50 animate-pulse" />
          </div>
        </div>
      )}
      {family === "COLLAGE" && (
        <div className="absolute inset-0 flex items-center justify-center gap-1">
          <div className="h-6 w-6 rounded bg-foreground/10 border border-foreground/15 rotate-6" />
          <div className="h-6 w-6 rounded bg-foreground/20 border border-foreground/25 -rotate-12 -translate-x-2" />
        </div>
      )}
      {family === "HANDCRAFTED" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-7 w-10 border border-dashed border-foreground/20 rounded bg-foreground/5 flex items-center justify-center">
            <span className="text-[9px] text-foreground/30 font-medium">Paper</span>
          </div>
        </div>
      )}
      {family === "CINEMATIC" && (
        <div className="absolute inset-0 flex flex-col justify-between py-1 bg-black/5">
          <div className="h-1 bg-black/20 w-full" />
          <div className="h-[2px] bg-foreground/20 w-3/4 mx-auto blur-[1px]" />
          <div className="h-1 bg-black/20 w-full" />
        </div>
      )}
      {family === "MINIMAL_ART" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-1.5 w-1.5 rounded-full bg-foreground/30" />
        </div>
      )}
      {family === "PLAYFUL_GRAPHIC" && (
        <div className="absolute inset-0 flex items-center justify-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-yellow-500/10 border border-yellow-500/20" />
          <div className="h-3 w-3 rounded bg-blue-500/10 border border-blue-500/20 rotate-45" />
        </div>
      )}
      {family === "CULTURAL_EDITORIAL" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="border border-foreground/15 rounded-full h-7 w-7 flex items-center justify-center">
            <div className="h-3 w-3 rounded-full bg-foreground/10" />
          </div>
        </div>
      )}
      {family === "INFORMATIONAL" && (
        <div className="absolute inset-0 flex flex-col gap-1 px-4 py-3 justify-center">
          <div className="h-[2px] bg-foreground/15 rounded w-full" />
          <div className="h-[2px] bg-foreground/15 rounded w-5/6" />
          <div className="h-[2px] bg-foreground/15 rounded w-2/3" />
        </div>
      )}
      {family === "ILLUSTRATIVE" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-7 rounded-tr-md rounded-bl-md bg-foreground/10 border border-foreground/20 transform skew-x-3" />
        </div>
      )}
    </div>
  );
}

interface CreateWithFlowPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextType: "personal" | "brand";
  brandId?: string;
  onUseInPost: (item: PostMediaItem) => void;
}

export function CreateWithFlowPostDialog({
  open,
  onOpenChange,
  contextType,
  brandId,
  onUseInPost,
}: CreateWithFlowPostDialogProps) {
  const [step, setStep] = useState<Step>("input");
  const [prompt, setPrompt] = useState("");
  const [customStrategyOverride, setCustomStrategyOverride] = useState(false);
  const [manualGoal, setManualGoal] = useState<MarketingGoal>("brand_awareness");
  const [manualFunnelStage, setManualFunnelStage] = useState<FunnelStage>("TOFU");

  const detectedStrategy = useMemo(() => detectMarketingStrategy(prompt), [prompt]);
  const activeGoal = customStrategyOverride ? manualGoal : detectedStrategy.goal;
  const activeFunnelStage = customStrategyOverride ? manualFunnelStage : detectedStrategy.funnelStage;

  const [styleId, setStyleId] = useState("auto");
  const [styles, setStyles] = useState<CreativeStyleSummary[]>([]);
  const [assets, setAssets] = useState<ReferenceAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [referenceStyle, setReferenceStyle] = useState<ReferenceStyleProfile | null>(null);
  const [concepts, setConcepts] = useState<ScoredCreativeConcept[]>([]);
  const [intent, setIntent] = useState<CreativeIntentBrief | null>(null);
  const [asset, setAsset] = useState<GeneratedAsset | null>(null);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingLabel, setGeneratingLabel] = useState("Finding the creative direction…");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const generatingLabelTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  // The member's saved identity. Dynamically resolved based on active brandId
  // when in brand context; otherwise falling back to default profiles.
  const { profiles: brandVoiceProfiles, defaultProfile: defaultBrandVoiceProfile } = useBrandVoices();
  const { profiles: creativeDnaProfiles, defaultProfile: defaultCreativeDnaProfile } = useCreativeDna();
  const { brands } = useBrands();

  const activeBrand = contextType === "brand" && brandId
    ? (brands.find((b) => b.id === brandId) ?? null)
    : null;

  const brandVoiceProfile = activeBrand
    ? (brandVoiceProfiles.find((p) => p.brand_id === activeBrand.id) ??
       brandVoiceProfiles.find((p) => p.name.toLowerCase().trim() === activeBrand.name.toLowerCase().trim()) ??
       null)
    : defaultBrandVoiceProfile?.brand_id ? null : defaultBrandVoiceProfile;

  const creativeDnaProfile = activeBrand
    ? (creativeDnaProfiles.find((p) => p.name.toLowerCase().replace(/\s+/g, "") === activeBrand.name.toLowerCase().replace(/\s+/g, "")) ?? defaultCreativeDnaProfile)
    : defaultCreativeDnaProfile;

  // A logo uploaded in this dialog overrides the saved one for this creative.
  const [logoOverride, setLogoOverride] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const brandVoiceLogo = brandVoiceProfile?.voice?.logoUrl || creativeDnaProfile?.dna?.logoAssetUrl || "";
  const logoAssetUrl = logoOverride ?? brandVoiceLogo;
  const isUsingSavedBrandLogo = !logoOverride && Boolean(brandVoiceLogo);
  const logoMissing = !logoAssetUrl;

  useEffect(() => {
    if (!open || styles.length > 0) return;
    let active = true;
    void creativeService.fetchCreativeStyles()
      .then((items) => { if (active) setStyles(items); })
      .catch(() => { /* Style auto-detection remains available if catalog loading fails. */ });
    return () => { active = false; };
  }, [open, styles.length]);

  function reset() {
    setStep("input");
    setPrompt("");
    setCustomStrategyOverride(false);
    setStyleId("auto");
    setAssets([]);
    setReferenceImages([]);
    setReferenceStyle(null);
    setConcepts([]);
    setIntent(null);
    setAsset(null);
    setRefineInstruction("");
    setLogoOverride(null);
    setError(null);
  }

  function buildRequest(selectedConcept?: ScoredCreativeConcept) {
    const dna = {
      ...(creativeDnaProfile?.dna ?? {}),
      ...(logoAssetUrl && { logoAssetUrl }),
    };
    return {
      prompt,
      ...(styleId !== "auto" && { styleId }),
      contextType,
      ...(contextType === "brand" && brandId && { brandId }),
      goal: activeGoal,
      funnelStage: activeFunnelStage,
      platforms: [],
      assetUrls: assets.map((a) => a.url),
      ...(brandVoiceProfile && {
        brandVoice: {
          ...(brandVoiceProfile.voice as unknown as Record<string, unknown>),
          name: brandVoiceProfile.name,
        },
      }),
      ...(Object.keys(dna).length > 0 && { creativeDna: dna }),
      ...(referenceImages.length > 0 && {
        referenceImageUrls: referenceImages.map((r) => r.url),
        referenceLabels: referenceImages.map((r) => r.label ?? ""),
      }),
      // Reusing the profile `/concepts` already analysed keeps the same design
      // language on the finished creative and skips a second vision call.
      ...(referenceStyle?.analysed && { referenceStyleProfile: referenceStyle }),
      ...(selectedConcept && { selectedConcept }),
      ...(intent && { intent }),
    };
  }

  async function handleAttachAsset(file: File) {
    if (assets.length >= 5) { toast.error("You can include up to five product images."); return; }
    setUploading(true);
    try {
      const uploaded = await cloudinaryService.uploadMedia(file);
      setAssets((prev) => [...prev, { url: uploaded.url, name: file.name }]);
    } catch (err) {
      toast.error("Could not attach that image", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleAttachLogo(file: File) {
    setUploadingLogo(true);
    try {
      const uploaded = await cloudinaryService.uploadMedia(file);
      setLogoOverride(uploaded.url);

      if (brandVoiceProfile && !brandVoiceProfile.voice.logoUrl) {
        try {
          await brandVoicesRepository.update(brandVoiceProfile.id, {
            voice: { ...brandVoiceProfile.voice, logoUrl: uploaded.url },
          });
          toast.success(`Saved logo to ${brandVoiceProfile.name} Brand Voice`);
        } catch {
          // non-fatal
        }
      }
    } catch (err) {
      toast.error("Could not upload that logo", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleDiscoverConcepts() {
    if (prompt.trim().length < 3) {
      setError("Tell us what you want to create — a sentence is enough.");
      return;
    }
    setError(null);
    setStep("discovering");
    try {
      const result = await creativeService.discoverConcepts(buildRequest());
      setConcepts(result.concepts);
      setReferenceStyle(result.referenceStyle ?? null);
      setIntent(result.intent ?? null);
      setStep("concepts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStep("input");
    }
  }

  /**
   * One action, two stages. Picking a concept generates the visual and then
   * the campaign designed over it — there is no second button, and no point
   * at which the member is asked to choose between them.
   */
  async function handleCreateConcept(concept: ScoredCreativeConcept) {
    if (logoMissing) {
      setError("Add your logo to create a creative.");
      setStep("input");
      return;
    }
    if (concept.generationStatus === "generated" && concept.generatedAsset?.imageUrl) {
      // Instant local reopen. The cheap background request lets the backend
      // record this explicit selection and re-validates scope, but its cache
      // lookup returns before any provider/config checks and never calls Gemini.
      setAsset(concept.generatedAsset);
      setStep("result");
      void creativeService.generateCreative(buildRequest(concept)).then(setAsset).catch(() => undefined);
      return;
    }
    setStep("generating");
    setError(null);
    // No backend progress stream for a single request/response call — this
    // timed walk through the pipeline's real stages is cosmetic, but it keeps
    // a ~40–60s wait from reading as one opaque "please wait". Offsets track
    // the backend's stage budget (direction → image → campaign → QC/upload).
    setGeneratingLabel("Finding the creative direction…");
    generatingLabelTimers.current = [
      setTimeout(() => setGeneratingLabel("Creating your visual…"), 10000),
      setTimeout(() => setGeneratingLabel("Designing your campaign…"), 25000),
      setTimeout(() => setGeneratingLabel("Final check…"), 42000),
    ];
    try {
      const result = await creativeService.generateCreative(buildRequest(concept));
      setAsset(result);
      setConcepts((current) => current.map((item) => item.conceptId === concept.conceptId
        ? { ...item, generationStatus: "generated", generatedAsset: result }
        : item));
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStep("concepts");
    } finally {
      generatingLabelTimers.current.forEach(clearTimeout);
      generatingLabelTimers.current = [];
    }
  }

  /**
   * A refinement that fails must never cost the member the creative they
   * already have: `asset` is only replaced on success, so the previous
   * creative stays on screen exactly as it was.
   */
  async function runRefine(instruction: string): Promise<boolean> {
    if (!asset) return false;
    setRefining(true);
    try {
      const result = await creativeService.refineCreative(asset.id, instruction);
      setAsset(result);
      return true;
    } catch (err) {
      toast.error("Refinement failed. Your previous creative is unchanged.", {
        description: err instanceof Error ? err.message : undefined,
      });
      return false;
    } finally {
      setRefining(false);
    }
  }

  async function handleRefine() {
    const instruction = refineInstruction.trim();
    if (!instruction) return;
    if (await runRefine(instruction)) setRefineInstruction("");
  }

  async function handleRejectConcept(concept: ScoredCreativeConcept) {
    if (contextType !== "brand" || !activeBrand?.id || !concept.conceptId) return;
    try {
      await creativeService.rejectCreativeConcept(concept.conceptId, activeBrand.id);
      setConcepts((items) => items.filter((item) => item.conceptId !== concept.conceptId));
      toast.success("Rally will learn from that choice.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not record that preference.");
    }
  }

  async function handleRegenerate() {
    if (!asset) return;
    setRefining(true);
    try {
      const result = await creativeService.regenerateCreative(asset.id);
      setAsset(result);
      toast.success("Created a new variation. Your previous creative remains in history.");
    } catch (err) {
      toast.error("Regeneration failed. Your previous creative is unchanged.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRefining(false);
    }
  }

  function handleUseInPost() {
    if (!asset?.imageUrl) return;
    void creativeService.recordCreativeSignal(asset.id, "reused").catch(() => undefined);
    onUseInPost({
      id: asset.id,
      generatedAssetId: asset.id,
      url: asset.imageUrl,
      type: "image",
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      crop: null,
    });
    toast.success("Added to your post");
    onOpenChange(false);
    reset();
  }

  function handleSaveCreative() {
    if (!asset) return;
    void creativeService.recordCreativeSignal(asset.id, "saved")
      .then(() => toast.success("Saved to your generation history"))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not save that choice."));
  }

  const busy = step === "discovering" || step === "generating";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className={cn("flex max-h-[92dvh] flex-col gap-0 overflow-hidden bg-background p-0 transition-all duration-300", (step === "result" || step === "concepts") ? "max-w-4xl sm:max-w-4xl" : (step === "generating" || step === "discovering") ? "max-w-3xl sm:max-w-3xl" : "max-w-2xl sm:max-w-2xl")}>
        <DialogHeader className="shrink-0 flex-row items-center gap-3 space-y-0 border-b px-6 py-4 pr-14 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <RallyIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <DialogTitle className="font-display text-base leading-tight">
              Create with Rally
            </DialogTitle>
            <DialogDescription className="text-sm leading-snug">
              {step === "concepts"
                ? "Rally found these creative directions. Pick the idea, not just a look."
                : step === "discovering"
                ? "Rally is exploring different ways to tell your idea."
                : step === "generating"
                ? "Rally is building your creative from the direction you picked."
                : "Describe the creative you want. Rally brings your brand's visual identity to it."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 py-6 scrollbar-thin">
          {step === "input" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="fp-prompt" className="text-sm font-medium">
                  What are you creating?
                </Label>
                <Textarea
                  id="fp-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder='e.g. "A premium Diwali campaign for our new black kurta collection, elegant and festive, not loud."'
                  rows={4}
                  className="resize-none bg-card"
                  disabled={busy}
                />
              </div>

              <div className="space-y-3 rounded-xl border bg-secondary/40 px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Marketing strategy
                    </span>
                    {!customStrategyOverride && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        Auto-detected
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setCustomStrategyOverride(!customStrategyOverride)}
                    disabled={busy}
                  >
                    {customStrategyOverride ? "Use Auto-detection" : "Customize"}
                  </Button>
                </div>

                {!customStrategyOverride ? (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span>Goal</span>
                      <span className="rounded-md border bg-card px-2.5 py-1 text-xs font-medium text-foreground">
                        {GOAL_META[activeGoal]?.label || activeGoal}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>Funnel</span>
                      <span className="rounded-md border bg-card px-2.5 py-1 text-xs font-medium text-foreground">
                        {FUNNEL_META[activeFunnelStage]?.label || activeFunnelStage}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Goal</Label>
                      <Select value={manualGoal} onValueChange={(v) => setManualGoal(v as MarketingGoal)} disabled={busy}>
                        <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {GOALS.map((g) => (
                            <SelectItem key={g} value={g}>{GOAL_META[g].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Funnel stage</Label>
                      <Select value={manualFunnelStage} onValueChange={(v) => setManualFunnelStage(v as FunnelStage)} disabled={busy}>
                        <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FUNNEL_STAGES.map((f) => (
                            <SelectItem key={f} value={f}>{FUNNEL_META[f].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Creative style</Label>
                <Select value={styleId} onValueChange={setStyleId} disabled={busy}>
                  <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect from my brief</SelectItem>
                    {styles.map((style) => (
                      <SelectItem key={style.id} value={style.id}>{style.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Your choice guides the composition, typography, colors and image style. Reference images guide the look within this style.
                </p>
              </div>

              {(
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-sm font-medium">
                      Brand logo <span className="text-destructive">*</span>
                    </Label>
                    {isUsingSavedBrandLogo && (
                      <Badge variant="outline" className="gap-1 border-success/25 bg-success/10 text-[11px] font-normal text-success">
                        <Check className="h-3 w-3" /> Loaded from {brandVoiceProfile?.name || activeBrand?.name || "Brand Voice"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Required. Your original logo gets its own clear space, away from text and product images.
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    {logoAssetUrl ? (
                      <img
                        src={logoAssetUrl}
                        alt="Brand logo"
                        className="h-12 w-12 shrink-0 rounded-lg border bg-secondary object-contain p-1.5"
                      />
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 bg-card text-sm"
                      disabled={uploadingLogo || busy}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {uploadingLogo ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : logoAssetUrl ? (
                        "Replace logo"
                      ) : (
                        "Upload logo"
                      )}
                    </Button>
                    {logoOverride && brandVoiceLogo && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 text-sm text-muted-foreground hover:text-foreground"
                        onClick={() => setLogoOverride(null)}
                      >
                        Reset to brand logo
                      </Button>
                    )}
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleAttachLogo(file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  {logoMissing && (
                    <p className="text-xs font-medium text-destructive">
                      Add your logo to create a creative.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Product images <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  {assets.map((a) => (
                    <span
                      key={a.url}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm"
                    >
                      {a.name}
                      <button
                        type="button"
                        onClick={() => setAssets((prev) => prev.filter((x) => x.url !== a.url))}
                        aria-label={`Remove ${a.name}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 bg-card text-sm"
                    disabled={uploading || busy || assets.length >= 5}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Plus className="h-4 w-4" />Add image</>)}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleAttachAsset(file);
                      e.target.value = "";
                    }}
                  />
                </div>
                {assets.length > 0 && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Every image you add will appear in the post, without redrawing or cropping it.
                  </p>
                )}
              </div>

              <ReferenceImagesUploader
                images={referenceImages}
                onChange={setReferenceImages}
                disabled={busy}
              />

              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            </>
          )}

          {step === "discovering" && (
            <div className="py-2">
              <GenerationMatrixProgress variant="concepts" />
            </div>
          )}

          {step === "generating" && (
            <div className="py-2">
              <GenerationMatrixProgress variant="image" />
            </div>
          )}

          {step === "concepts" && (
            <div className="space-y-3">
              {referenceStyle && referenceStyle.analysed && (
                <div className="rounded-xl border border-dashed bg-card px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Rally understood your style
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {summariseReferenceStyleTags(referenceStyle).map((tag) => (
                      <span key={tag} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                        {tag}
                      </span>
                    ))}
                    <span className="text-[11px] text-muted-foreground">
                      · Reference influence: {referenceStyle.influence}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Creating something original from this direction.</p>
                </div>
              )}
              <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2">
                {concepts.map((concept) => (
                  <div
                    key={concept.conceptId ?? concept.conceptName}
                    className="flex flex-col justify-between gap-5 rounded-xl border bg-card p-4 shadow-sm transition-shadow duration-300 hover:border-foreground/25 hover:shadow-md"
                  >
                    <div className="space-y-3">
                      {concept.generationStatus === "generated" && (
                        <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                          Generated
                        </span>
                      )}
                      {/* Visual Style Preview */}
                      <ArtDirectionPreview
                        family={concept.artDirectionFamily}
                        brandColors={creativeDnaProfile?.dna.brandColors || []}
                      />

                      {/* Header Badges */}
                      <div className="flex flex-wrap gap-1.5">
                        <span className="rounded bg-secondary/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {concept.visualMechanism}
                        </span>
                        <span className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {concept.artDirectionFamily.includes("PHOTO") || concept.artDirectionFamily === "DOCUMENTARY" || concept.artDirectionFamily === "CINEMATIC" ? (
                            <Camera className="h-2.5 w-2.5" />
                          ) : (
                            <Palette className="h-2.5 w-2.5" />
                          )}
                          {formatArtDirectionFamily(concept.artDirectionFamily)}
                        </span>
                        <span className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <Compass className="h-2.5 w-2.5" />
                          {concept.mode}
                        </span>
                      </div>

                      {/* Concept Title */}
                      <p className="font-display text-base font-semibold leading-snug tracking-tight text-foreground">{concept.conceptName}</p>

                      {/* Big Idea Description */}
                      <p className="text-sm leading-relaxed text-muted-foreground">{concept.bigIdea}</p>

                      {/* Why it works visual callout */}
                      {concept.whyItWouldStopTheScroll && (
                        <div className="rounded-lg bg-secondary/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                          <span className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                            <Lightbulb className="h-3.5 w-3.5" /> Why this works
                          </span>
                          {concept.whyItWouldStopTheScroll}
                        </div>
                      )}

                      {/* Brand connection */}
                      {concept.brandConnection && (
                        <p className="border-l-2 pl-3 text-xs italic leading-relaxed text-muted-foreground">
                          {concept.brandConnection}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                    <Button
                      className="h-10 flex-1 gap-1.5"
                      disabled={busy || logoMissing}
                      onClick={() => handleCreateConcept(concept)}
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {concept.generationStatus === "generated" ? "Show creative" : "Create this creative"}
                    </Button>
                    {contextType === "brand" && concept.generationStatus !== "generated" && (
                      <Button type="button" variant="outline" className="h-10" disabled={busy} onClick={() => handleRejectConcept(concept)}>
                        Not for us
                      </Button>
                    )}
                    </div>
                  </div>
                ))}
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          )}

          {step === "result" && asset && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              <div className="md:col-span-6 space-y-2">
                {asset.imageUrl && (
                  <div className="relative flex items-center justify-center overflow-hidden rounded-xl border bg-secondary/50 shadow-sm">
                    <img
                      src={asset.imageUrl}
                      alt={asset.creativeBrief.concept}
                      className="w-full max-h-[62vh] object-contain rounded-xl"
                    />
                  </div>
                )}
              </div>
              <div className="md:col-span-6 space-y-4">
                <div>
                  <h3 className="font-display text-lg font-semibold leading-snug tracking-tight text-foreground">{asset.creativeBrief.concept}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{asset.creativeBrief.visualStory}</p>
                </div>
                
                <CreativeTextEditor
                  asset={asset}
                  disabled={refining}
                  onBusyChange={setRefining}
                  onAssetChange={setAsset}
                />
                {asset.creativeBrief.marketingCreative?.secondaryInfo?.length ? (
                  <p className="text-xs text-muted-foreground">
                    {asset.creativeBrief.marketingCreative.secondaryInfo.join(' · ')}
                  </p>
                ) : null}
                {asset.typography && (
                  <div className="inline-flex items-center gap-1.5 rounded-md border bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">Typography:</span>
                    {asset.typography.headlineFont}
                    {asset.typography.accentFont ? ` + ${asset.typography.accentFont}` : ''}
                    {asset.typography.bodyFont !== asset.typography.headlineFont ? ` + ${asset.typography.bodyFont}` : ''}
                  </div>
                )}

                <div className="space-y-2 border-t pt-4">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Wand2 className="h-3.5 w-3.5 text-primary" /> Refine Creative
                  </label>
                  <div className="flex items-center gap-2">
                    <Textarea
                      value={refineInstruction}
                      onChange={(e) => setRefineInstruction(e.target.value)}
                      placeholder='Refine, e.g. "make it brighter", "more vibrant flowers"'
                      rows={2}
                      className="resize-none bg-card text-sm"
                      disabled={refining}
                    />
                    <Button size="sm" disabled={refining || !refineInstruction.trim()} onClick={handleRefine} className="h-full px-3">
                      {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-background px-6 py-4">
          {step === "input" && (
            <Button onClick={handleDiscoverConcepts} disabled={busy || !prompt.trim()}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Find creative directions
            </Button>
          )}
          {step === "concepts" && logoMissing && (
            <p className="mr-auto text-xs text-destructive">
              Add your logo to create a creative.
            </p>
          )}
          {step === "discovering" && (
            <Button disabled>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Understanding your idea…
            </Button>
          )}
          {step === "concepts" && (
            <Button variant="outline" onClick={() => setStep("input")}>Edit request</Button>
          )}
          {step === "generating" && (
            <Button disabled>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              {generatingLabel}
            </Button>
          )}
          {step === "result" && (
            <>
              <Button variant="outline" onClick={() => setStep("concepts")}>Back to concepts</Button>
              <Button variant="outline" disabled={refining} onClick={handleRegenerate}>
                {refining ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                New variation
              </Button>
              <Button
                variant="ghost"
                onClick={handleSaveCreative}
              >
                Save Creative
              </Button>
              <Button onClick={handleUseInPost} disabled={!asset?.imageUrl}>Use in Post</Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
