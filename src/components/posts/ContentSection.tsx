import { useFormContext } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { CreateWithFlowPostChooser } from "./CreateWithFlowPost/CreateWithFlowPostChooser";
import { MediaUploader } from "./MediaUploader";
import { ContentTypePicker } from "./ContentTypePicker";
import { MediaFormatPanel } from "./MediaFormatPanel";
import { useComposerState } from "./ComposerStateContext";
import type { PostFormValues } from "@/validators";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-destructive">{message}</p>;
}

export function ContentSection() {
  const { watch, formState: { errors } } = useFormContext<PostFormValues>();
  const {
    media,
    setMedia,
    selectedMedia,
    setSelectedMedia,
    maxMedia,
    isPublished,
    context,
    publishableProviders,
    contentCapabilities,
    providerNames,
    contentTypes,
    setContentTypes,
  } = useComposerState();

  const selectedPlatforms = watch("platforms") || [];

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Media</Label>
      {media.length === 0 && !isPublished && (
        <CreateWithFlowPostChooser
          contextType={context.contextType === "brand" ? "brand" : "personal"}
          {...(context.brandId && { brandId: context.brandId })}
          onUseInPost={(item) => setMedia([...media, item])}
        />
      )}
      <MediaUploader
        items={media}
        onChange={setMedia}
        selected={selectedMedia}
        onSelect={setSelectedMedia}
        maxItems={maxMedia}
        disabled={isPublished}
      />
      <FieldError message={errors.image_url?.message} />

      {/* What to publish it as. Renders only for destinations with
          more than one format — a network with a single answer is
          not a question worth asking. Every option, and every
          reason an option is unavailable, comes from the server's
          capability declaration. */}
      <ContentTypePicker
        platforms={selectedPlatforms.filter((platform) =>
          publishableProviders.has(platform),
        )}
        capabilities={contentCapabilities}
        displayNames={providerNames}
        value={contentTypes}
        onChange={(platform, contentType) =>
          setContentTypes((current) => ({
            ...current,
            [platform]: contentType,
          }))
        }
        media={media}
        onKeepOnly={(keepIds) =>
          setMedia(media.filter((item) => keepIds.includes(item.id)))
        }
        onCrop={(itemId) => {
          // Opens the *existing* crop UI on that item rather than a
          // second crop implementation. The format panel below owns
          // framing; this only points at what needs it.
          const at = media.findIndex((item) => item.id === itemId);
          if (at !== -1) setSelectedMedia(at);
        }}
        disabled={isPublished}
      />

      {media.length > 0 && !isPublished && (
        <MediaFormatPanel
          items={media}
          onChange={setMedia}
          selected={selectedMedia}
          onSelect={setSelectedMedia}
        />
      )}
    </div>
  );
}
