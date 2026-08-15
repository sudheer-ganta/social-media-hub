import { useRef, useState } from "react";
import { Loader2, Sparkles, Wand2, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { cloudinaryService } from "@/services";
import { creativeService } from "@/services/creative.service";
import { useBrandVoices } from "@/hooks/useBrandVoices";
import { useCreativeDna } from "@/hooks/useCreativeDna";
import { GOAL_META, FUNNEL_META } from "@/ai/prompts/modules";
import type { FunnelStage, MarketingGoal } from "@/ai/types";
import type {
  CreativeIntentBrief,
  GeneratedAsset,
  ReferenceStyleProfile,
  ScoredCreativeConcept,
} from "@/types/creative";
import type { PostMediaItem } from "@/types";
import { ReferenceImagesUploader, type ReferenceImage } from "./ReferenceImagesUploader";

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
  const [goal, setGoal] = useState<MarketingGoal>("brand_awareness");
  const [funnelStage, setFunnelStage] = useState<FunnelStage>("TOFU");
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

  // The member's saved identity. Neither of these used to be sent at all,
  // which is why brand mode produced creatives with no logo and none of the
  // brand's own voice — the backend was resolving both from nothing.
  const { defaultProfile: brandVoiceProfile } = useBrandVoices();
  const { defaultProfile: creativeDnaProfile } = useCreativeDna();

  // A logo uploaded in this dialog overrides the saved one for this creative.
  const [logoOverride, setLogoOverride] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoAssetUrl = logoOverride ?? creativeDnaProfile?.dna.logoAssetUrl ?? "";
  // Brand mode renders nothing without a real logo — FlowPost will not invent
  // one, and a branded creative carrying a made-up mark is worse than none.
  const logoMissing = contextType === "brand" && !logoAssetUrl;

  function reset() {
    setStep("input");
    setPrompt("");
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
      contextType,
      ...(contextType === "brand" && brandId && { brandId }),
      goal,
      funnelStage,
      platforms: [],
      assetUrls: assets.map((a) => a.url),
      ...(brandVoiceProfile && { brandVoice: brandVoiceProfile.voice as unknown as Record<string, unknown> }),
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
      setError("Add your brand logo to create a branded creative.");
      setStep("input");
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
  async function handleRefine() {
    if (!asset || !refineInstruction.trim()) return;
    setRefining(true);
    try {
      const result = await creativeService.refineCreative(asset.id, refineInstruction.trim());
      setAsset(result);
      setRefineInstruction("");
    } catch (err) {
      toast.error("Refinement failed. Your previous creative is unchanged.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRefining(false);
    }
  }

  function handleUseInPost() {
    if (!asset?.imageUrl) return;
    onUseInPost({
      id: asset.id,
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

  const busy = step === "discovering" || step === "generating";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className={cn("p-0 overflow-hidden", step === "concepts" ? "max-w-2xl" : "max-w-lg")}>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2 font-display text-lg">
            <Sparkles className="h-4 w-4" />
            Create with FlowPost
          </DialogTitle>
          <DialogDescription className="text-xs">
            {step === "concepts"
              ? "FlowPost found these creative directions. Pick the idea, not just a look."
              : "Describe the creative you want. FlowPost brings your brand's visual identity to it."}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {(step === "input" || step === "discovering") && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="fp-prompt" className="text-sm font-semibold">
                  What are you creating?
                </Label>
                <Textarea
                  id="fp-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder='e.g. "A premium Diwali campaign for our new black kurta collection — elegant and festive, not loud."'
                  rows={4}
                  disabled={busy}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Goal</Label>
                  <Select value={goal} onValueChange={(v) => setGoal(v as MarketingGoal)} disabled={busy}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GOALS.map((g) => (
                        <SelectItem key={g} value={g}>{GOAL_META[g].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Funnel stage</Label>
                  <Select value={funnelStage} onValueChange={(v) => setFunnelStage(v as FunnelStage)} disabled={busy}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FUNNEL_STAGES.map((f) => (
                        <SelectItem key={f} value={f}>{FUNNEL_META[f].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {contextType === "brand" && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">
                    Brand logo <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Required for branded creatives. FlowPost places your real logo file — it never draws one.
                  </p>
                  <div className="flex items-center gap-2">
                    {logoAssetUrl ? (
                      <img
                        src={logoAssetUrl}
                        alt="Brand logo"
                        className="h-10 w-10 rounded border bg-secondary object-contain p-1"
                      />
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={uploadingLogo || busy}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {uploadingLogo ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : logoAssetUrl ? (
                        "Replace logo"
                      ) : (
                        "+ Upload logo"
                      )}
                    </Button>
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
                    <p className="text-[11px] text-destructive">
                      Add your brand logo to create a branded creative.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Product / reference (optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {assets.map((a) => (
                    <span
                      key={a.url}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-secondary px-2.5 py-1 text-xs"
                    >
                      {a.name}
                      <button
                        type="button"
                        onClick={() => setAssets((prev) => prev.filter((x) => x.url !== a.url))}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={uploading || busy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : "+ Add"}
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
                  <p className="text-[11px] text-muted-foreground">
                    FlowPost will preserve what's shown here, not invent a replacement.
                  </p>
                )}
              </div>

              <ReferenceImagesUploader
                images={referenceImages}
                onChange={setReferenceImages}
                disabled={busy}
              />

              {error && <p className="text-xs text-destructive">{error}</p>}
            </>
          )}

          {(step === "concepts" || step === "generating") && (
            <div className="space-y-3">
              {referenceStyle && referenceStyle.analysed && (
                <div className="rounded-md border border-dashed px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    FlowPost understood your style
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {summariseReferenceStyleTags(referenceStyle).map((tag) => (
                      <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {concepts.map((concept) => (
                  <div key={concept.conceptName} className="flex flex-col gap-2 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-tight">{concept.conceptName}</p>
                      <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {concept.visualMechanism}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{concept.bigIdea}</p>
                    {concept.brandConnection && (
                      <p className="text-[11px] text-muted-foreground italic">{concept.brandConnection}</p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 self-start"
                      disabled={busy || logoMissing}
                      onClick={() => handleCreateConcept(concept)}
                    >
                      {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Create this
                    </Button>
                  </div>
                ))}
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          )}

          {step === "result" && asset && (
            <div className="space-y-4">
              {asset.imageUrl && (
                <img
                  src={asset.imageUrl}
                  alt={asset.creativeBrief.concept}
                  className="w-full rounded-lg border object-cover"
                />
              )}
              <p className="text-sm font-semibold">{asset.creativeBrief.concept}</p>
              <p className="text-xs text-muted-foreground">{asset.creativeBrief.visualStory}</p>
              {asset.creativeBrief.headline && (
                <p className="text-xs font-medium">"{asset.creativeBrief.headline}"</p>
              )}
              {asset.creativeBrief.marketingCreative?.brandMessage && (
                <p className="text-xs text-muted-foreground">"{asset.creativeBrief.marketingCreative.brandMessage}"</p>
              )}
              {asset.creativeBrief.marketingCreative?.secondaryInfo?.length ? (
                <p className="text-xs text-muted-foreground">
                  {asset.creativeBrief.marketingCreative.secondaryInfo.join(' · ')}
                </p>
              ) : null}

              <div className="flex items-center gap-2">
                <Textarea
                  value={refineInstruction}
                  onChange={(e) => setRefineInstruction(e.target.value)}
                  placeholder='Refine — e.g. "make it more premium" or "darker background"'
                  rows={1}
                  className="min-h-9 resize-none text-sm"
                  disabled={refining}
                />
                <Button size="sm" variant="outline" disabled={refining || !refineInstruction.trim()} onClick={handleRefine}>
                  {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
          {step === "input" && (
            <Button onClick={handleDiscoverConcepts} disabled={busy || !prompt.trim()}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Find creative directions
            </Button>
          )}
          {step === "concepts" && logoMissing && (
            <p className="mr-auto text-xs text-destructive">
              Add your brand logo to create a branded creative.
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
              <Button
                variant="ghost"
                onClick={() => toast.success("Saved to your generation history")}
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
