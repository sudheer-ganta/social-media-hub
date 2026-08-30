import { useFormContext, Controller } from "react-hook-form";
import { Sparkles, Music } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CaptionEditor } from "./CaptionEditor";
import { HashtagPanel } from "./HashtagPanel";
import { AiStrategyPanel } from "./AiStrategyPanel";
import { AiCaptionPanel } from "./AiCaptionPanel";
import { useComposerState } from "./ComposerStateContext";
import type { PostFormValues } from "@/validators";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-destructive">{message}</p>;
}

export function MessageSection() {
  const { register, control, watch, setValue } = useFormContext<PostFormValues>();
  const {
    form: { formState: { errors } },
    isPublished,
    isBrand,
    post,
    context,
    brand,
    aiResult,
    generating,
    blockedReason,
    audience,
    setAudience,
    styleOverride,
    setStyleOverride,
    imageUrl,
    ai,
    generateStrategy,
    hashtags,
    studio,
    runHashtags,
    handleAppendHashtags,
    handleGenerate,
    isAiExpanded,
    setIsAiExpanded,
    isHashtagsExpanded,
    setIsHashtagsExpanded,
  } = useComposerState();

  const handleMusicClick = () => {
    const input = document.getElementById("post-music");
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const currentCaption = watch("caption") || "";
  const currentTitle = watch("title") || "";

  return (
    <div className="space-y-4 border-t pt-4">
      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="post-title">What are you feeling today?</Label>
        <Input
          id="post-title"
          placeholder="Tell me about your post..."
          {...register("title")}
          disabled={isPublished}
        />
        <FieldError message={errors.title?.message} />
      </div>

      {/* Caption & Toolbar */}
      <div className="space-y-1.5">
        <Label>Caption</Label>
        <Controller
          control={control}
          name="caption"
          render={({ field }) => (
            <CaptionEditor value={field.value} onChange={field.onChange} />
          )}
        />
        <FieldError message={errors.caption?.message} />

        {/* Ambient AI Toolbar */}
        {!isPublished && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Button
              type="button"
              variant={isAiExpanded ? "secondary" : "outline"}
              size="sm"
              onClick={() => setIsAiExpanded(!isAiExpanded)}
              className="gap-1 text-xs h-7 px-2"
            >
              <Sparkles className="h-3 w-3" />
              ✨ AI Write
            </Button>
            <Button
              type="button"
              variant={isHashtagsExpanded ? "secondary" : "outline"}
              size="sm"
              onClick={() => setIsHashtagsExpanded(!isHashtagsExpanded)}
              className="gap-1 text-xs h-7 px-2"
            >
              <span className="font-semibold text-xs">#</span>
              Hashtags
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleMusicClick}
              className="gap-1 text-xs h-7 px-2"
            >
              <Music className="h-3 w-3" />
              ♪ Music
            </Button>
          </div>
        )}
      </div>

      {/* Ambient Panels - AI and Hashtags */}
      {!isPublished && isHashtagsExpanded && (
        <div className="border rounded-lg p-3 bg-muted/20">
          <HashtagPanel
            result={hashtags.result}
            isGenerating={hashtags.isGenerating}
            canGenerate={Boolean(currentCaption.trim() || currentTitle.trim())}
            onGenerate={runHashtags}
            onApply={handleAppendHashtags}
            disabled={isPublished}
          />
        </div>
      )}

      {isBrand && !isPublished && isAiExpanded && (
        <div className="border rounded-lg p-3 bg-muted/20">
          <AiStrategyPanel studio={studio} hasImage={Boolean(imageUrl?.trim())} />
        </div>
      )}

      {!isPublished && isAiExpanded && (
        <div className="border rounded-lg p-3 bg-muted/20">
          <AiCaptionPanel
            result={aiResult}
            isGenerating={generating}
            error={ai.error ?? generateStrategy.error?.message ?? null}
            blockedReason={blockedReason}
            mode={isBrand ? "brand" : "personal"}
            audience={audience}
            onAudienceChange={setAudience}
            styleOverride={styleOverride}
            onStyleOverrideChange={setStyleOverride}
            hasImage={Boolean(imageUrl?.trim())}
            currentCaption={currentCaption}
            onGenerate={handleGenerate}
            showPlatformVariations={isBrand}
            onUseCaption={(caption) =>
              setValue("caption", caption, { shouldValidate: true })
            }
            onCaptionChosen={(caption, variationIndex) =>
              ai.recordFeedback({
                action: "selected",
                mode: isBrand ? "brand" : "personal",
                caption,
                ...(context.brandId && { brandId: context.brandId }),
                ...(post?.id && { postId: post.id }),
                ...(variationIndex !== undefined && { variationIndex }),
              })
            }
            onAppendHashtags={handleAppendHashtags}
            {...(!isBrand && {
              onUseSong: (song: string) =>
                setValue("music", song, { shouldValidate: true }),
            })}
          />
        </div>
      )}

      {/* Music & Campaign options */}
      <div className="grid gap-4 sm:grid-cols-2 border-t pt-4">
        <div className="space-y-1.5">
          <Label htmlFor="post-music">Music / Song</Label>
          <Input
            id="post-music"
            placeholder="Add song / music (optional)"
            {...register("music")}
            disabled={isPublished}
          />
          <FieldError message={errors.music?.message} />
        </div>

        {isBrand && (
          <details className="rounded-lg border p-3 self-start">
            <summary className="cursor-pointer text-sm font-medium">
              Campaign options
            </summary>
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="post-cta">Call to action</Label>
                <Input
                  id="post-cta"
                  placeholder={`Try ${isBrand ? (brand?.name ?? "this brand") : "Personal"} today`}
                  {...register("cta")}
                  disabled={isPublished}
                />
                <FieldError message={errors.cta?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="post-link">Link</Label>
                <Input
                  id="post-link"
                  placeholder="https://…"
                  {...register("link_url")}
                  disabled={isPublished}
                />
                <FieldError message={errors.link_url?.message} />
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
