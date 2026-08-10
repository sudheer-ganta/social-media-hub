import { useRef } from "react";
import { ratioValue, type PlatformCrop } from "@/utils/crop";
import { cn } from "@/lib/utils";

/**
 * A crop, drawn — the same window the composer edits and the preview shows.
 *
 * Not a re-rendered image: the `<img>` is scaled and offset inside a
 * fixed-ratio box, so what is on screen is literally the source pixels the crop
 * selects. That is what makes the preview trustworthy — it cannot show a
 * framing the delivery URL would not produce, because it is derived from the
 * same four fractions.
 *
 * A null crop is a real state and the common one under Mix: the picture is
 * shown whole, at its own aspect ratio, exactly as it will be published.
 */
export function CropView({
  imageUrl,
  crop,
  imageAspect,
  onFocus,
  className,
}: {
  imageUrl: string;
  /** Null delivers the image whole — see {@link imageAspect}. */
  crop: PlatformCrop | null;
  /**
   * The source's own width/height. Used when there is no crop, and to resolve
   * the `original` ratio — which is the one ratio whose shape depends on the
   * picture rather than on the format.
   */
  imageAspect: number;
  onFocus?: (x: number, y: number) => void;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  // Fractions of the source. Without a crop that is all of it, which makes the
  // arithmetic below identical for both cases rather than branching twice.
  const x = crop?.x ?? 0;
  const y = crop?.y ?? 0;
  const w = crop?.w ?? 1;
  const h = crop?.h ?? 1;

  const aspect = crop ? ratioValue(crop.ratio, imageAspect) : imageAspect;

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onFocus || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    // Where the click landed inside the visible window, mapped back onto the
    // original's coordinate space through the crop currently on screen.
    const withinX = (event.clientX - rect.left) / rect.width;
    const withinY = (event.clientY - rect.top) / rect.height;
    onFocus(x + withinX * w, y + withinY * h);
  };

  return (
    <div
      ref={boxRef}
      onClick={handleClick}
      role={onFocus ? "button" : undefined}
      tabIndex={onFocus ? 0 : undefined}
      aria-label={onFocus ? "Click to re-centre the crop" : undefined}
      className={cn(
        "relative w-full overflow-hidden bg-muted/40",
        onFocus && "cursor-crosshair",
        className,
      )}
      style={{ aspectRatio: String(aspect || 1) }}
    >
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        className="absolute max-w-none"
        style={{
          width: `${100 / w}%`,
          height: `${100 / h}%`,
          left: `${(-x / w) * 100}%`,
          top: `${(-y / h) * 100}%`,
        }}
      />
    </div>
  );
}
