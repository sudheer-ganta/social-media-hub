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
import { GOAL_META, FUNNEL_META } from "@/ai/prompts/modules";
import type { FunnelStage, MarketingGoal } from "@/ai/types";
import type { GeneratedAsset, ReferenceStyleProfile, ScoredCreativeConcept } from "@/types/creative";
import type { PostMediaItem } from "@/types";
import { ReferenceImagesUploader, type ReferenceImage } from "./ReferenceImagesUploader";

/**
 * "Create with FlowPost" — the AI creative-generation flow.
 *
 * Describe what you want → FlowPost's creative director proposes several
 * genuinely different advertising ideas → you pick one → it's art-directed
 * and rendered → Regenerate/Refine/Use in Post.
 *
 * The concept step is the point: FlowPost is the creative director, not the
 * image model — an idea is chosen before anything is art-directed or
 * rendered, so the member picks WHAT gets made, not just how it looks.
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
  const [asset, setAsset] = useState<GeneratedAsset | null>(null);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingLabel, setGeneratingLabel] = useState("Generating visual…");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generatingLabelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reset() {
    setStep("input");
    setPrompt("");
    setAssets([]);
    setReferenceImages([]);
    setReferenceStyle(null);
    setConcepts([]);
    setAsset(null);
    setRefineInstruction("");
    setError(null);
  }

  function buildRequest(selectedConcept?: ScoredCreativeConcept) {
    return {
      prompt,
      contextType,
      ...(contextType === "brand" && brandId && { brandId }),
      goal,
      funnelStage,
      platforms: [],
      assetUrls: assets.map((a) => a.url),
      ...(referenceImages.length > 0 && {
        referenceImageUrls: referenceImages.map((r) => r.url),
        referenceLabels: referenceImages.map((r) => r.label ?? ""),
      }),
      ...(selectedConcept && { selectedConcept }),
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
      setStep("concepts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStep("input");
    }
  }

  async function handleCreateConcept(concept: ScoredCreativeConcept) {
    setStep("generating");
    setError(null);
    // No backend progress stream for a single request/response call — this
    // timed swap is cosmetic, just naming the two real stages (Gemini's
    // visual, then FlowPost's deterministic renderer) so the wait doesn't
    // read as one opaque black box.
    setGeneratingLabel("Generating visual…");
    generatingLabelTimer.current = setTimeout(() => setGeneratingLabel("Designing your creative…"), 6000);
    try {
      const result = await creativeService.generateCreative(buildRequest(concept));
      setAsset(result);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStep("concepts");
    } finally {
      if (generatingLabelTimer.current) clearTimeout(generatingLabelTimer.current);
    }
  }

  async function handleRefine() {
    if (!asset || !refineInstruction.trim()) return;
    setRefining(true);
    try {
      const result = await creativeService.refineCreative(asset.id, refineInstruction.trim());
      setAsset(result);
      setRefineInstruction("");
    } catch (err) {
      toast.error("Could not apply that change", {
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

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Product / reference / logo (optional)</Label>
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
                      disabled={busy}
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
          {step === "discovering" && (
            <Button disabled>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Thinking of ideas…
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
