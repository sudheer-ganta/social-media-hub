import { useRef, useState } from "react";
import {
  Copy,
  Crop as CropIcon,
  Info,
  RotateCcw,
  Sliders,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CropView } from "./CropView";
import { cloudinaryService } from "@/services";
import {
  ACCEPTED_MEDIA_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "@/constants";
import {
  computeCrop,
  focusOf,
  isFullFrame,
  isSoft,
  type AspectRatioId,
} from "@/utils/crop";
import {
  COMPOSER_FORMATS,
  activeFormat,
  applyFormat,
  cropFor,
  itemAspect,
} from "@/utils/media";
import { cn } from "@/lib/utils";
import type { PostMediaItem } from "@/types";

/**
 * Format, and the crop editor for one image.
 *
 * ─── Why the crop editor is contextual ───────────────────────────────────────
 * It edits *the selected image*, and it is not on screen until asked for. The
 * previous version of this panel put a permanent crop stage at the top of the
 * composer, which made framing — a thing most posts never need — the largest
 * element on the page. Selecting a thumbnail and pressing Crop is the same
 * capability at the size of its actual importance.
 *
 * ─── Where a crop lives ──────────────────────────────────────────────────────
 * On the item. That is what makes it survive selection changes, reorders and a
 * reload without any of this component tracking it: switching to image 3 and
 * back to image 2 shows image 2's crop because it never went anywhere.
 *
 * ─── Mix ─────────────────────────────────────────────────────────────────────
 * Mix is not a fourth crop. It clears every crop, so each picture publishes at
 * the ratio it was uploaded at — a portrait stays portrait, a landscape stays
 * landscape. See `utils/media.ts#applyFormat`.
 */

interface MediaFormatPanelProps {
  items: PostMediaItem[];
  onChange: (items: PostMediaItem[]) => void;
  /** Index of the item under edit, or -1 when nothing is selected. */
  selected: number;
  onSelect: (index: number) => void;
}

export function MediaFormatPanel({
  items,
  onChange,
  selected,
  onSelect,
}: MediaFormatPanelProps) {
  const [cropping, setCropping] = useState(false);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);

  const item = items[selected];
  const format = activeFormat(items);

  if (items.length === 0) return null;

  const updateItem = (next: PostMediaItem) =>
    onChange(items.map((entry, index) => (index === selected ? next : entry)));

  const setFormat = (ratio: AspectRatioId) => {
    onChange(applyFormat(items, ratio));
  };

  /**
   * Re-frames the selected item, keeping its current shape.
   *
   * Zooming or re-centring an image under Mix necessarily gives it a crop —
   * "keep the original ratio" is about the *shape*, and a zoomed picture is
   * still that shape. So the ratio stays `original` and the rectangle shrinks
   * inside it, which is exactly what `computeCrop` does with that id.
   */
  const reframe = (options: { zoom?: number; focusX?: number; focusY?: number }) => {
    if (!item) return;
    const focus = item.crop ? focusOf(item.crop) : { x: 0.5, y: 0.5 };
    const ratio: AspectRatioId = item.crop?.ratio ?? "original";
    const crop = computeCrop(ratio, itemAspect(item), {
      zoom: options.zoom ?? item.crop?.zoom ?? 1,
      focusX: options.focusX ?? focus.x,
      focusY: options.focusY ?? focus.y,
    });
    // A full-frame rectangle under Mix is the state that has no crop at all —
    // storing one would leave the format reading as "individually framed" for
    // an image nobody actually framed.
    updateItem({
      ...item,
      crop: ratio === "original" && isFullFrame(crop) ? null : crop,
    });
  };

  /**
   * Puts every other image on this one's format and framing.
   *
   * The *format and focal point* travel, not the rectangle: each image
   * recomputes its own crop against its own dimensions, because a rectangle
   * that frames a face in a landscape frames something else entirely in a
   * portrait. Explicit, and never automatic — a member who cropped one image
   * deliberately has not asked for the others to move.
   */
  const applyToAll = () => {
    if (!item) return;
    const ratio: AspectRatioId = item.crop?.ratio ?? "original";
    const focus = item.crop ? focusOf(item.crop) : { x: 0.5, y: 0.5 };
    onChange(
      items.map((entry, index) => {
        if (index === selected) return entry;
        const crop = computeCrop(ratio, itemAspect(entry), {
          zoom: item.crop?.zoom ?? 1,
          focusX: focus.x,
          focusY: focus.y,
        });
        return {
          ...entry,
          crop: ratio === "original" && isFullFrame(crop) ? null : crop,
        };
      }),
    );
    toast.success("Crop applied to every image");
  };

  const handleReplace = async (file: File | undefined) => {
    if (!file || !item) return;

    // Replace takes whatever Add takes — one media collection means one set of
    // accepted files, and a member swapping a photo for a clip is doing an
    // ordinary thing rather than a special one.
    const isVideo = file.type.startsWith("video/");
    const ceiling = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
    if (file.size > ceiling) {
      toast.error(
        isVideo
          ? "Video is too large — maximum size is 1GB."
          : "Image is too large — maximum size is 20MB.",
      );
      return;
    }

    setReplacing(true);
    const previousUrl = item.url;
    try {
      const [uploaded, dimensions] = await Promise.all([
        cloudinaryService.uploadMedia(file),
        readDimensions(file),
      ]);

      // Same id, same position — this is the same slot in the carousel with a
      // different picture in it. The crop is recomputed rather than carried
      // over: it was a rectangle over the old image's dimensions, and reusing
      // it on a differently shaped file would frame something arbitrary.
      const width = uploaded.width ?? dimensions.width;
      const height = uploaded.height ?? dimensions.height;

      updateItem({
        ...item,
        url: uploaded.url,
        type: uploaded.kind,
        width,
        height,
        crop: item.crop
          ? cropFor({ ...item, width, height }, item.crop.ratio)
          : null,
        // Replaced wholesale rather than merged: the old file's duration and
        // poster describe a file that is no longer here, and a stale poster is
        // a thumbnail of something the member did not publish.
        mimeType: uploaded.mimeType,
        bytes: uploaded.bytes,
        durationMs: uploaded.durationMs,
        posterUrl: uploaded.posterUrl,
      });
      cloudinaryService.deleteImage(previousUrl);
      toast.success(uploaded.kind === "video" ? "Video replaced" : "Image replaced");
    } catch (error) {
      toast.error("Replace failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setReplacing(false);
    }
  };

  const remove = () => {
    if (!item) return;
    onChange(items.filter((_, index) => index !== selected));
    cloudinaryService.deleteImage(item.url);
    onSelect(Math.min(selected, items.length - 2));
    setCropping(false);
  };

  const soft =
    item && item.crop && item.width && item.height
      ? isSoft(item.crop, item.width, item.height)
      : false;

  return (
    <div className="space-y-4">
      {/* ── Format ───────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium">Format</p>
          <p className="text-xs text-muted-foreground">
            Choose how your media will appear on each platform
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {COMPOSER_FORMATS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={format === option.id}
              onClick={() => setFormat(option.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                format === option.id
                  ? "border-primary bg-primary/10"
                  : "hover:border-primary/40 hover:bg-accent/50",
              )}
            >
              {option.id === "original" ? (
                <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <FormatGlyph ratio={option.id} active={format === option.id} />
              )}
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate text-sm font-medium",
                    option.id === "original" && "text-primary",
                  )}
                >
                  {option.label}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {option.hint}
                </span>
              </span>
            </button>
          ))}
        </div>

        {format === "original" && (
          <p className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              &ldquo;Mix&rdquo; keeps each image at its original aspect ratio —
              nothing is cropped and nothing is padded.
            </span>
          </p>
        )}
        {format === null && (
          <p className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Your images are framed individually. Pick a format above to put
              them all on the same one.
            </span>
          </p>
        )}
      </div>

      {/* ── The selected image ───────────────────────────────────────────── */}
      {item && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm font-medium">
              Selected media ·{" "}
              <span className="tabular-nums text-muted-foreground">
                {String(selected + 1).padStart(2, "0")}
              </span>
            </p>

            <Button
              type="button"
              size="sm"
              variant={cropping ? "secondary" : "outline"}
              onClick={() => setCropping((open) => !open)}
            >
              <CropIcon />
              Crop
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              loading={replacing}
              onClick={() => replaceInput.current?.click()}
            >
              <RotateCcw />
              Replace
            </Button>
            <input
              ref={replaceInput}
              type="file"
              accept={Object.keys(ACCEPTED_MEDIA_TYPES).join(",")}
              className="sr-only"
              onChange={(event) => {
                void handleReplace(event.target.files?.[0]);
                // Cleared so choosing the same file twice still fires.
                event.target.value = "";
              }}
            />

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={remove}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 />
              Delete
            </Button>
          </div>

          {cropping && (
            <div className="grid gap-4 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[minmax(0,240px)_1fr]">
              <CropView
                // The still, deliberately: a crop rectangle dragged over
                // moving footage is a rectangle nobody can place. The preview
                // is where the clip plays.
                imageUrl={item.type === "video" ? (item.posterUrl ?? "") : item.url}
                crop={item.crop}
                imageAspect={itemAspect(item)}
                onFocus={(x, y) => reframe({ focusX: x, focusY: y })}
                className="rounded-lg border"
              />

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="crop-zoom"
                    className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    <Sliders className="h-3 w-3" />
                    Zoom · {(item.crop?.zoom ?? 1).toFixed(1)}×
                  </label>
                  <input
                    id="crop-zoom"
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={item.crop?.zoom ?? 1}
                    onChange={(event) =>
                      reframe({ zoom: Number(event.target.value) })
                    }
                    className="w-full accent-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Click the image to choose what stays in frame.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => updateItem({ ...item, crop: null })}
                  >
                    <RotateCcw />
                    Reset
                  </Button>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={applyToAll}
                    >
                      <Copy />
                      Apply to all
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setCropping(false)}
                  >
                    Done
                  </Button>
                </div>

                {soft && (
                  <p className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span>
                      This crop delivers about{" "}
                      {Math.round(item.width * (item.crop?.w ?? 1))} ×{" "}
                      {Math.round(item.height * (item.crop?.h ?? 1))}px, and
                      feeds render around 1080px wide. FlowPost will not upscale
                      it — a larger original, or less zoom, is the only real fix.
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A rectangle in the option's own proportions. Cheaper than four icons. */
function FormatGlyph({
  ratio,
  active,
}: {
  ratio: AspectRatioId;
  active: boolean;
}) {
  const shape =
    ratio === "4:5"
      ? "h-5 w-4"
      : ratio === "1:1"
        ? "h-4.5 w-4.5"
        : "h-3 w-5";

  return (
    <span
      className={cn(
        "shrink-0 rounded-sm border-2",
        shape,
        active ? "border-primary" : "border-muted-foreground/60",
      )}
    />
  );
}

/**
 * The replacement file's own dimensions, from the browser's decode.
 *
 * A fallback only: Cloudinary's numbers win, because it decoded the file that
 * was actually stored. This is what fills the gap when it reports none, and
 * zeroes mean "unmeasured" rather than a zero-sized picture.
 */
function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (width: number, height: number) => {
      resolve({ width, height });
      URL.revokeObjectURL(url);
    };

    if (file.type.startsWith("video/")) {
      const element = document.createElement("video");
      element.preload = "metadata";
      element.onloadedmetadata = () => done(element.videoWidth, element.videoHeight);
      element.onerror = () => done(0, 0);
      element.src = url;
      return;
    }

    const image = new Image();
    image.onload = () => done(image.naturalWidth, image.naturalHeight);
    image.onerror = () => done(0, 0);
    image.src = url;
  });
}
