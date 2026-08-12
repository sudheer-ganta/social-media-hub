import { AlertTriangle, Check, Crop as CropIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  adviseOnMixedMedia,
  optionsFor,
  qualityNotes,
  formatBytes,
  formatDuration,
} from "@/utils/content-type";
import type { ContentType, ProviderCapabilities } from "@/types/capabilities";
import type { PostMediaItem, Platform } from "@/types";

/**
 * Choosing what to publish, per destination.
 *
 * ─── Nothing here knows a network ────────────────────────────────────────────
 *
 * There is no `if (provider === "instagram") showReel`. Every button below is
 * rendered from `ProviderCapabilities`, which arrives from the same declaration
 * the publish path validates against. Instagram shows Post / Carousel / Reel /
 * Story because those are the four keys its capability object has; Facebook
 * shows two because it has two. Bringing a format online is a backend edit and
 * no change in this file — and, more to the point, the composer cannot offer
 * something the publish button would refuse.
 *
 * ─── What the member sees ────────────────────────────────────────────────────
 *
 * Every format the network publishes, always, in a stable order. Unusable ones
 * are disabled *with the reason* rather than hidden: "Reel — add a video"
 * teaches what a Reel needs, where a Reel that vanishes when the video is
 * removed reads as a bug. And the reason is a sentence — never a status code, a
 * `media_type`, or anything with a colon and a JSON brace in it.
 */

interface ContentTypePickerProps {
  /** The destinations currently selected, in the order they are shown. */
  platforms: Platform[];
  /** Each destination's capabilities, straight from `GET /api/integrations`. */
  capabilities: Partial<Record<Platform, ProviderCapabilities>>;
  /** Display names, so this file holds no network strings of its own. */
  displayNames: Partial<Record<Platform, string>>;
  /** What the member has chosen per destination. Absent means "not yet". */
  value: Partial<Record<Platform, ContentType>>;
  onChange: (platform: Platform, contentType: ContentType) => void;
  media: PostMediaItem[];
  /** Drops the items a mixed-media resolution excludes. */
  onKeepOnly?: (keepIds: string[]) => void;
  /** Opens the existing crop UI for one item at a target ratio. */
  onCrop?: (itemId: string, ratio: string) => void;
  disabled?: boolean;
}

export function ContentTypePicker({
  platforms,
  capabilities,
  displayNames,
  value,
  onChange,
  media,
  onKeepOnly,
  onCrop,
  disabled,
}: ContentTypePickerProps) {
  // Nothing to choose between. A destination with one format is not a decision
  // the member should be asked to make — see the design principle.
  const worthShowing = platforms.filter(
    (platform) => Object.keys(capabilities[platform] ?? {}).length > 1,
  );

  if (worthShowing.length === 0) return null;

  return (
    <div className="space-y-4">
      {worthShowing.map((platform) => {
        const providerCapabilities = capabilities[platform] ?? {};
        const networkName = displayNames[platform] ?? platform;
        const options = optionsFor(providerCapabilities, media);
        const selected = value[platform];
        const advice = adviseOnMixedMedia(providerCapabilities, media, networkName);

        return (
          <div key={platform} className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">
              {networkName}
            </p>

            <div className="flex flex-wrap gap-2">
              {options.map((option) => (
                <button
                  key={option.contentType}
                  type="button"
                  disabled={disabled || !option.available}
                  aria-pressed={selected === option.contentType}
                  // The reason travels with the control rather than living in a
                  // tooltip only sighted mouse users will find.
                  aria-describedby={
                    option.reason ? `${platform}-${option.contentType}-why` : undefined
                  }
                  onClick={() => onChange(platform, option.contentType)}
                  className={cn(
                    "flex min-w-[7rem] flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
                    !option.available && "cursor-not-allowed opacity-55",
                    selected === option.contentType
                      ? "border-primary bg-accent shadow-glow"
                      : "border-border hover:border-primary/50 hover:bg-accent/40",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {option.label}
                    {selected === option.contentType && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </span>
                  <span
                    id={
                      option.reason
                        ? `${platform}-${option.contentType}-why`
                        : undefined
                    }
                    className="text-[11px] text-muted-foreground"
                  >
                    {option.reason ?? option.requirement}
                  </span>
                </button>
              ))}
            </div>

            {advice && onKeepOnly && (
              <MixedMediaNotice
                summary={advice.summary}
                explanation={advice.explanation}
                actions={advice.actions.map((action) => ({
                  label: action.label,
                  onSelect: () => {
                    onKeepOnly(action.keepIds);
                    onChange(platform, action.contentType);
                  },
                }))}
              />
            )}

            {selected && (
              <QualityStatus
                capability={providerCapabilities[selected]!}
                media={media}
                onCrop={onCrop}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * What to do when images and video were uploaded together.
 *
 * Never "Invalid media". Someone who attached three photos and a clip has done
 * something reasonable and there is usually a way to use it — so this names the
 * conflict in their own terms and offers the routes out as buttons they can
 * press, rather than leaving them to work out which file to delete.
 */
function MixedMediaNotice({
  summary,
  explanation,
  actions,
}: {
  summary: string;
  explanation: string;
  actions: Array<{ label: string; onSelect: () => void }>;
}) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5">
      <p className="text-xs font-medium">{summary}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{explanation}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onSelect}
            className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium hover:border-primary/50 hover:bg-accent/40"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The compact quality read-out for the chosen format.
 *
 * Facts first — resolution, running time, size — then anything worth
 * mentioning. Every note here is a *warning*: a 720p Reel publishes perfectly
 * well and just looks soft, so the member is told and left to decide. Only a
 * limit the network actually enforces disables the format above, and that
 * happens in {@link optionsFor}, not here.
 */
function QualityStatus({
  capability,
  media,
  onCrop,
}: {
  capability: NonNullable<ProviderCapabilities[ContentType]>;
  media: PostMediaItem[];
  onCrop?: (itemId: string, ratio: string) => void;
}) {
  if (media.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {media.map((item) => {
        const notes = qualityNotes(capability, item);
        const facts = [
          item.width && item.height ? `${item.width} × ${item.height}` : null,
          item.durationMs ? formatDuration(item.durationMs) : null,
          item.bytes ? formatBytes(item.bytes) : null,
        ].filter(Boolean);

        if (facts.length === 0 && notes.length === 0) return null;

        return (
          <div
            key={item.id}
            className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
          >
            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
              <span className="font-medium uppercase tracking-wide">
                {item.type}
              </span>
              {facts.map((fact) => (
                <span key={fact}>{fact}</span>
              ))}
              {notes.length === 0 && (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3 w-3" /> Good for {capability.label}
                </span>
              )}
            </p>

            {notes.map((note) => (
              <p
                key={note.kind}
                className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400"
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>{note.message}</span>
                {note.suggestedRatio && onCrop && (
                  <button
                    type="button"
                    onClick={() => onCrop(item.id, note.suggestedRatio!)}
                    className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 font-medium text-foreground hover:border-primary/50"
                  >
                    <CropIcon className="h-3 w-3" />
                    Crop to {note.suggestedRatio}
                  </button>
                )}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
