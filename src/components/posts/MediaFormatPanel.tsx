import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Crop as CropIcon, Info, Sliders, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { PLATFORM_MAP } from "@/constants";
import {
  RATIO_LABEL,
  RATIO_VALUE,
  applyCropToAll,
  computeCrop,
  focusOf,
  isSoft,
  ratiosFor,
  reconcileCrops,
  recommendedRatio,
  type AspectRatioId,
  type PlatformCrop,
  type PlatformMedia,
} from "@/utils/crop";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types";

/**
 * Media & Format — one upload, framed per network.
 *
 * The section that makes "FlowPost handles the platform formatting" true. It
 * shows the member what they actually uploaded, then one tab per selected
 * network where the framing can be adjusted. Nothing here touches the file:
 * every control edits a small crop record (see `utils/crop.ts`) that becomes a
 * delivery transformation at publish time.
 *
 * The original's dimensions are read from the browser's own decode of the
 * image — `naturalWidth`/`naturalHeight` — rather than asked of Cloudinary,
 * because it is one fewer request and it is the same number either way.
 */

interface MediaFormatPanelProps {
  imageUrl: string;
  platforms: Platform[];
  value: PlatformMedia;
  onChange: (next: PlatformMedia) => void;
}

/** Bytes of the stored asset, when the host will tell us without a download. */
function useImageFacts(imageUrl: string) {
  const [facts, setFacts] = useState<{
    width: number;
    height: number;
    bytes: number | null;
  } | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setFacts(null);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      setFacts({
        width: image.naturalWidth,
        height: image.naturalHeight,
        bytes: null,
      });
      // Best effort, and deliberately after the dimensions are already shown:
      // a HEAD that is blocked by CORS must cost the panel nothing.
      fetch(imageUrl, { method: "HEAD" })
        .then((response) => {
          const length = Number(response.headers.get("content-length"));
          if (!cancelled && Number.isFinite(length) && length > 0) {
            setFacts((current) => (current ? { ...current, bytes: length } : current));
          }
        })
        .catch(() => undefined);
    };
    image.onerror = () => {
      if (!cancelled) setFacts(null);
    };
    image.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return facts;
}

function fileNameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "image");
  } catch {
    return "image";
  }
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/**
 * The crop, drawn.
 *
 * A window over the original rather than a re-rendered image: the `<img>` is
 * scaled and offset inside a fixed-ratio box so what is on screen is literally
 * the source pixels the crop selects. Clicking re-centres the frame, which is
 * the whole of the "crop control" — a drag-handle rectangle would be a second
 * way to express the same four numbers.
 */
function CropView({
  imageUrl,
  crop,
  onFocus,
}: {
  imageUrl: string;
  crop: PlatformCrop;
  onFocus?: (x: number, y: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onFocus || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    // Where the click lands inside the visible window, mapped back onto the
    // original's coordinate space through the crop currently on screen.
    const withinX = (event.clientX - rect.left) / rect.width;
    const withinY = (event.clientY - rect.top) / rect.height;
    onFocus(crop.x + withinX * crop.w, crop.y + withinY * crop.h);
  };

  return (
    <div
      ref={boxRef}
      onClick={handleClick}
      role={onFocus ? "button" : undefined}
      tabIndex={onFocus ? 0 : undefined}
      aria-label={onFocus ? "Click to re-centre the crop" : undefined}
      className={cn(
        "relative w-full overflow-hidden rounded-lg border bg-muted/40",
        onFocus && "cursor-crosshair",
      )}
      style={{ aspectRatio: String(RATIO_VALUE[crop.ratio]) }}
    >
      <img
        src={imageUrl}
        alt=""
        className="absolute max-w-none"
        style={{
          width: `${100 / crop.w}%`,
          height: `${100 / crop.h}%`,
          left: `${(-crop.x / crop.w) * 100}%`,
          top: `${(-crop.y / crop.h) * 100}%`,
        }}
      />
    </div>
  );
}

export function MediaFormatPanel({
  imageUrl,
  platforms,
  value,
  onChange,
}: MediaFormatPanelProps) {
  const facts = useImageFacts(imageUrl);
  const [active, setActive] = useState<Platform | null>(platforms[0] ?? null);

  // Keep the open tab on a platform that is still selected.
  useEffect(() => {
    if (platforms.length === 0) setActive(null);
    else if (!active || !platforms.includes(active)) setActive(platforms[0]);
  }, [platforms, active]);

  const imageAspect = facts ? facts.width / facts.height : 1;

  /**
   * Every selected platform has a crop, and only selected platforms do.
   *
   * Runs here rather than in the form because reconciling needs the original's
   * aspect ratio, and this is the component that knows it. Waiting for `facts`
   * matters: a crop built against a guessed 1:1 would be wrong for every
   * landscape upload, and `reconcileCrops` deliberately never rebuilds an entry
   * that already exists, so the wrong one would stick.
   */
  useEffect(() => {
    if (!facts) return;
    const next = reconcileCrops(value, platforms, facts.width / facts.height);
    const changed =
      Object.keys(next).length !== Object.keys(value).length ||
      Object.keys(next).some((key) => next[key] !== value[key]);
    if (changed) onChange(next);
  }, [facts, platforms, value, onChange]);

  const crop = active ? value[active] : undefined;

  const soft = useMemo(
    () =>
      crop && facts ? isSoft(crop, facts.width, facts.height) : false,
    [crop, facts],
  );

  if (!imageUrl) return null;

  const update = (next: PlatformCrop) => {
    if (!active) return;
    onChange({ ...value, [active]: next });
  };

  const setRatio = (ratio: AspectRatioId) => {
    if (!crop) return;
    const focus = focusOf(crop);
    update(computeCrop(ratio, imageAspect, { zoom: crop.zoom, focusX: focus.x, focusY: focus.y }));
  };

  const setZoom = (zoom: number) => {
    if (!crop) return;
    const focus = focusOf(crop);
    update(computeCrop(crop.ratio, imageAspect, { zoom, focusX: focus.x, focusY: focus.y }));
  };

  const setFocus = (x: number, y: number) => {
    if (!crop) return;
    update(computeCrop(crop.ratio, imageAspect, { zoom: crop.zoom, focusX: x, focusY: y }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CropIcon className="h-4 w-4 text-primary" />
          Media &amp; Format
        </CardTitle>
        <CardDescription>
          One upload, framed for each network. Your original file is never
          changed — these are delivery settings.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── The original ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start gap-4 rounded-lg border bg-muted/20 p-3">
          <img
            src={imageUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded-md border object-cover"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Original image
            </p>
            <p className="truncate text-sm font-medium">{fileNameOf(imageUrl)}</p>
            <p className="text-xs text-muted-foreground">
              {facts
                ? `${facts.width} × ${facts.height}px${
                    facts.bytes ? ` · ${formatBytes(facts.bytes)}` : ""
                  }`
                : "Reading dimensions…"}
            </p>
          </div>
          {facts && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                Math.min(facts.width, facts.height) >= 1080
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                  : "border-amber-500/20 bg-amber-500/10 text-amber-600",
              )}
            >
              {Math.min(facts.width, facts.height) >= 1080
                ? "Good quality"
                : "Low resolution"}
            </Badge>
          )}
        </div>

        {platforms.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Choose a platform below and its format options appear here.
          </p>
        ) : (
          <>
            {/* ── Platform tabs ──────────────────────────────────────── */}
            <div className="flex flex-wrap gap-1.5">
              {platforms.map((platform) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => setActive(platform)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    active === platform
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
                  {PLATFORM_MAP[platform]?.name ?? platform}
                </button>
              ))}
            </div>

            {active && crop && (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,260px)_1fr]">
                <CropView imageUrl={imageUrl} crop={crop} onFocus={setFocus} />

                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium">
                      {PLATFORM_MAP[active]?.name ?? active}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Recommended: {RATIO_LABEL[recommendedRatio(active)]}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Format
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {ratiosFor(active).map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => setRatio(ratio)}
                          className={cn(
                            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                            crop.ratio === ratio
                              ? "border-primary/60 bg-primary/10"
                              : "text-muted-foreground hover:bg-accent",
                          )}
                        >
                          {ratio}
                          {ratio === recommendedRatio(active) && (
                            <span className="ml-1 text-[9px] text-primary">★</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="crop-zoom"
                      className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      <Sliders className="h-3 w-3" />
                      Zoom · {crop.zoom.toFixed(1)}×
                    </label>
                    <input
                      id="crop-zoom"
                      type="range"
                      min={1}
                      max={3}
                      step={0.1}
                      value={crop.zoom}
                      onChange={(event) => setZoom(Number(event.target.value))}
                      className="w-full accent-primary"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Click the preview to choose what stays in frame.
                    </p>
                  </div>

                  {platforms.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onChange(
                          applyCropToAll(crop, platforms, imageAspect, active),
                        )
                      }
                    >
                      <Copy />
                      Apply this crop to all
                    </Button>
                  )}
                </div>
              </div>
            )}

            {soft && facts && (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>
                  Original image may appear soft at this size. This crop delivers
                  about {Math.round(facts.width * (crop?.w ?? 1))} ×{" "}
                  {Math.round(facts.height * (crop?.h ?? 1))}px and feeds render
                  around 1080px wide. FlowPost will not upscale it — a larger
                  original, or less zoom, is the only real fix.
                </span>
              </p>
            )}

            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Each platform gets an optimized version of your post. Your uploaded
              file stays exactly as it is.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export { CropView };
