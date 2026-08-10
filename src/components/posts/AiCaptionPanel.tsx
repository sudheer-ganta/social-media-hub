import { motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Eye,
  Hash,
  ImageOff,
  Music,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { PLATFORM_MAP } from "@/constants";
import type { AudienceRegister, CaptionResult } from "@/ai/caption";
import type { ImageAnalysis } from "@/ai/types";
import type { Platform } from "@/types";

/**
 * The registers offered in the composer.
 *
 * Labelled by how the copy *reads* rather than by a birth-year bracket —
 * "Gen Z · short and dry" tells whoever is picking what they will get back,
 * which "Gen Z" on its own does not.
 */
const AUDIENCE_OPTIONS: { value: AudienceRegister; label: string }[] = [
  { value: "gen_z_millennial", label: "Gen Z + Millennial" },
  { value: "gen_z", label: "Gen Z · short, dry" },
  { value: "millennial", label: "Millennial · warm, story-led" },
  { value: "professional", label: "Professional · credible" },
  { value: "broad", label: "Broad · plain and clear" },
];

interface AiCaptionPanelProps {
  result: CaptionResult | null;
  isGenerating: boolean;
  error: string | null;
  /** Disabled reason, e.g. "add a title first". Null when generation is allowed. */
  blockedReason: string | null;
  audience: AudienceRegister;
  onAudienceChange: (audience: AudienceRegister) => void;
  /** Whether the form currently has an image, so the panel can say what it will do. */
  hasImage: boolean;
  /** Current caption text in the main form editor */
  currentCaption?: string;
  onGenerate: () => void;
  onUseCaption: (caption: string) => void;
  onAppendHashtags: (hashtags: string[]) => void;
  /**
   * Fills the composer's Music / Song field. Optional: a composer without an
   * audio field simply omits it and no suggestions are shown.
   */
  onUseSong?: (song: string) => void;
  /** Whether to show network-tailored caption cards (defaults to false for Personal). */
  showPlatformVariations?: boolean;
}

/** A row of chips, or nothing at all when the list is empty. */
function ChipRow({ label, values }: { label: string; values?: string[] }) {
  if (!values?.length) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {values.map((value) => (
        <Badge key={value} variant="outline" className="text-[10px] font-normal">
          {value}
        </Badge>
      ))}
    </div>
  );
}

/**
 * What the model saw, shown above the options.
 *
 * Here for trust, not decoration. When a caption lands well the user should be
 * able to see it was built on the actual picture, and when it lands badly they
 * should be able to see *why* — a wrong read of the image is a different
 * problem from a wrong read of the brand, and only one of them is fixed by
 * pressing Regenerate.
 */
function ImageReadStrip({ analysis }: { analysis: ImageAnalysis }) {
  const uncertain = analysis.confidenceScore < 60;

  return (
    <div className="rounded-md border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Eye className="h-3.5 w-3.5 text-primary" />
          What the AI saw
        </p>
        <div className="flex items-center gap-2">
          {analysis.colorPalette.slice(0, 6).map((hex) => (
            <span
              key={hex}
              title={hex}
              className="h-3.5 w-3.5 rounded-full border"
              style={{ backgroundColor: hex }}
            />
          ))}
          {uncertain && (
            <Badge variant="secondary" className="text-[10px]">
              low confidence
            </Badge>
          )}
        </div>
      </div>

      <p className="mt-2 text-sm leading-relaxed">
        {analysis.sceneDescription || analysis.primarySubject}
      </p>

      <div className="mt-3 space-y-1.5">
        <ChipRow label="Mood" values={analysis.mood ? [analysis.mood] : []} />
        <ChipRow label="Themes" values={analysis.themes} />
        <ChipRow label="Emotions" values={analysis.emotions} />
      </div>

      {uncertain && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          The image read as ambiguous, so these captions lean more on your brand
          and title than on the visual.
        </p>
      )}
    </div>
  );
}

/**
 * The Create Post page's AI panel.
 *
 * Reads from the live generation held in `useAiCaption`, not from the post
 * row — nothing here has been saved yet, and nothing here saves anything. Its
 * only outputs are two callbacks into the form: put this caption in the
 * editor, and add these hashtags to it. Whatever the user does to the text
 * afterwards is what Save Draft stores.
 *
 * The panel deliberately does not pick for the user. Every option is shown
 * with its angle and its tone, because the point of asking for three is that a
 * person judges which one fits — and since Sprint 4.2 the three differ by
 * creative direction rather than by wording, which makes that judgement a real
 * one.
 */
export function AiCaptionPanel({
  result,
  isGenerating,
  error,
  blockedReason,
  audience,
  onAudienceChange,
  hasImage,
  currentCaption,
  onGenerate,
  onUseCaption,
  onAppendHashtags,
  onUseSong,
  showPlatformVariations = false,
}: AiCaptionPanelProps) {
  const [selectedCaption, setSelectedCaption] = useState<string | null>(null);

  const handleSelectCaption = (caption: string) => {
    setSelectedCaption(caption);
    onUseCaption(caption);
  };

  const hasResult = Boolean(result && result.variations.length > 0);
  const platformEntries = Object.entries(result?.platformCaptions ?? {}) as [
    Platform,
    string,
  ][];

  /** An image was sent but stage one could not use it. Worth saying out loud. */
  const imageWasIgnored = hasResult && hasImage && !result?.imageAnalysis;

  return (
    <Card>
      <CardHeader className="flex-col sm:flex-row sm:items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <span>AI Assistant</span>
          </CardTitle>
          <CardDescription>
            {isGenerating
              ? hasImage
                ? "Looking at your image, then writing from what it sees…"
                : "Writing suggestions from your title, caption and platforms…"
              : hasResult
                ? "Pick an angle, apply it to your post, then edit it freely."
                : hasImage
                  ? "Optional. Your image is analysed first, then suggestions are written from what's actually in it."
                  : "Optional. Get caption, hook and hashtag suggestions from your title and chosen platforms."}
          </CardDescription>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 pt-2 sm:pt-0">
          <Select
            value={audience}
            onValueChange={(next) => onAudienceChange(next as AudienceRegister)}
            disabled={isGenerating}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Who this is written for">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIENCE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant={hasResult ? "outline" : "secondary"}
            size="sm"
            loading={isGenerating}
            disabled={Boolean(blockedReason)}
            title={blockedReason ?? undefined}
            onClick={onGenerate}
            className="w-full sm:w-auto"
          >
            {hasResult ? <RefreshCw /> : <Sparkles />}
            {hasResult ? "Regenerate" : "Generate"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-md border border-destructive/25 bg-destructive/5 px-4 py-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold">Generation failed</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {error}
              </p>
            </div>
          </div>
        )}

        {isGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground"
          >
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            {hasImage
              ? "Reading the image, then writing three angles from it — this takes a few seconds longer than text alone."
              : "Writing your captions — this usually takes a few seconds."}
          </motion.div>
        )}

        {!isGenerating && !hasResult && !error && (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {blockedReason ??
              "Nothing generated yet. Add a title, then press Generate."}
          </p>
        )}

        {!isGenerating && hasResult && result && (
          <>
            {result.imageAnalysis && (
              <ImageReadStrip analysis={result.imageAnalysis} />
            )}

            {imageWasIgnored && (
              <div className="flex items-start gap-3 rounded-md border border-dashed px-4 py-3">
                <ImageOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Your image could not be analysed — check that the URL is public
                  and points at a JPG, PNG or WebP. These captions were written
                  from the title and brand voice alone.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {result.variations.map((variation, index) => {
                const isSelected = Boolean(
                  currentCaption
                    ? currentCaption.includes(variation.caption.trim()) || variation.caption.trim().includes(currentCaption.trim())
                    : selectedCaption
                      ? selectedCaption === variation.caption
                      : result.caption === variation.caption,
                );
                return (
                  <div
                    key={`${variation.tone}-${index}`}
                    className={`rounded-md border p-4 transition-colors ${isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : ""
                      }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {variation.angle && (
                          <Badge className="text-[10px]">{variation.angle}</Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px]">
                          {variation.tone}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {variation.wordCount}{" "}
                          {variation.wordCount === 1 ? "word" : "words"}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleSelectCaption(variation.caption)}
                      >
                        {isSelected ? <Check className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
                        {isSelected ? "Applied" : "Apply to Post"}
                      </Button>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                      {variation.caption}
                    </p>
                    {variation.whyItWorks && (
                      <p className="mt-3 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
                        {variation.whyItWorks}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {result.hashtags.length > 0 && (
              <div className="rounded-md border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Hashtags
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onAppendHashtags(result.hashtags)}
                  >
                    <Hash />
                    Add to caption
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {result.hashtags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Only ever present when the Music / Song field was empty at
                generation time — the backend suppresses the whole list once a
                song is chosen, so there is nothing here that could tempt anyone
                into replacing a decision the user already made. */}
            {onUseSong && result.songSuggestions?.length ? (
              <div className="rounded-md border p-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Music className="h-3.5 w-3.5 text-primary" />
                  Audio ideas
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  AI recommendations based on your content — not live chart data.
                  Check the track is available on your platform before you post.
                </p>
                <div className="mt-3 space-y-2">
                  {result.songSuggestions.map((song) => (
                    <div
                      key={`${song.title}-${song.artist}`}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-md border bg-muted/20 p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {song.title}
                          <span className="text-muted-foreground">
                            {" "}
                            · {song.artist}
                          </span>
                        </p>
                        {song.reason && (
                          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                            {song.reason}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          onUseSong(`${song.title} - ${song.artist}`)
                        }
                      >
                        <Music />
                        Use this song
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {showPlatformVariations && platformEntries.length > 0 && (
              <div className="grid gap-3 lg:grid-cols-2">
                {platformEntries.map(([platform, caption]) => {
                  const isSelected = selectedCaption === caption;
                  return (
                    <div
                      key={platform}
                      className={`rounded-md border p-4 transition-colors ${isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : ""
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
                          {PLATFORM_MAP[platform]?.name ?? platform}
                        </p>
                        <Button
                          type="button"
                          variant={isSelected ? "default" : "ghost"}
                          size="sm"
                          onClick={() => handleSelectCaption(caption)}
                        >
                          {isSelected ? <Check className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
                          {isSelected ? "Applied" : "Use"}
                        </Button>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                        {caption}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Generated by {result.meta.model} in{" "}
              {(result.meta.durationMs / 1000).toFixed(1)}s
              {result.imageAnalysis ? " · image analysed first" : ""} · your API
              key stays on the server
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
