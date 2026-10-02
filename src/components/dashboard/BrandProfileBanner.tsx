import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { RallyIcon } from "@/components/brand/Logo";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrands } from "@/hooks/useBrands";
import { useBrandVoices } from "@/hooks/useBrandVoices";
import { cn } from "@/lib/utils";

const INK_BUTTON =
  "inline-flex h-10 shrink-0 items-center rounded-[10px] bg-rl-ink px-4 text-[13.5px] font-semibold text-rl-bg transition-all duration-200 hover:opacity-85 active:scale-[0.98]";
const LINE_BUTTON =
  "inline-flex h-10 shrink-0 items-center rounded-[10px] border border-rl-line bg-rl-surface px-4 text-[13.5px] font-semibold transition-colors hover:border-rl-ink active:scale-[0.98]";

/** Brand state at the top of the dashboard: set up, needs a voice, or ready. */
export function BrandProfileBanner({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (index: number) => void;
}) {
  const navigate = useNavigate();
  const { brands, isLoading: brandsLoading } = useBrands();
  const { profiles, isLoading: voicesLoading } = useBrandVoices();

  if (brandsLoading || voicesLoading) {
    return <Skeleton className="h-[170px] w-full rounded-[18px] bg-rl-line/40" />;
  }

  if (brands.length === 0) {
    return (
      <div className="flex flex-col items-start justify-between gap-4 rounded-[18px] bg-rl-soft px-7 py-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <span className="rd-tile h-12 w-12 shrink-0">
            <RallyIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[19px] font-semibold tracking-[-0.035em]">Set up your brand</h3>
            <p className="mt-1 max-w-[56ch] text-[14px] leading-relaxed text-rl-ink/70">
              Add your name, tone and audience once. Every post is written to match.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => navigate("/settings?tab=brands")} className={INK_BUTTON}>
          Set up brand
        </button>
      </div>
    );
  }

  const active = brands[selected] ?? brands[0];
  const linkedVoice = profiles.find((p) => p.brand_id === active.id);
  const voice = linkedVoice?.voice;
  const isVoiceSet = Boolean(
    voice && (voice.tone?.trim() || voice.description?.trim() || linkedVoice?.name?.trim()),
  );
  const isComplete = Boolean(active.name.trim() && isVoiceSet);

  return (
    <div className={cn("p-6 sm:p-7", isComplete ? "rd-panel" : "rounded-[18px] bg-rl-soft")}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-5">
          <span className="rd-tile h-[68px] w-[68px] shrink-0 text-[22px] font-bold tracking-[-0.03em]">
            {active.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[21px] font-semibold tracking-[-0.04em]">{active.name}</h3>
            {isComplete ? (
              <div className="mt-1 space-y-0.5 text-[14px] leading-snug text-rl-muted">
                {voice?.tone && (
                  <p className="line-clamp-1">
                    <span className="text-rl-ink">Voice:</span> {voice.tone}
                  </p>
                )}
                {voice?.targetAudience && (
                  <p className="line-clamp-1">
                    <span className="text-rl-ink">Audience:</span> {voice.targetAudience}
                  </p>
                )}
                {!voice?.tone && !voice?.targetAudience && (
                  <p className="line-clamp-1">{active.description || "Brand identity configured."}</p>
                )}
              </div>
            ) : (
              <p className="mt-1 text-[14px] text-rl-ink/70">Add a brand voice before you create posts.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => navigate("/settings?tab=brands")} className={LINE_BUTTON}>
            Manage brand
          </button>
          <button
            type="button"
            onClick={() => navigate(`/settings?tab=brand-voice&brandId=${active.id}`)}
            className={isComplete ? LINE_BUTTON : INK_BUTTON}
          >
            {isVoiceSet ? "Brand voice" : "Set brand voice"}
          </button>
        </div>
      </div>

      {brands.length > 1 && (
        <div
          className={cn(
            "scrollbar-none mt-5 flex items-center gap-2 overflow-x-auto border-t pt-5",
            isComplete ? "border-rl-line" : "border-rl-ink/10",
          )}
        >
          {brands.map((b, idx) => {
            const on = idx === selected;
            return (
              <button
                key={b.id}
                type="button"
                aria-pressed={on}
                onClick={() => onSelect(idx)}
                className={cn(
                  "h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[13.5px] font-semibold transition-colors",
                  on
                    ? "bg-rl-soft text-rl-accent-strong"
                    : "border border-rl-line bg-rl-surface text-rl-ink hover:border-rl-ink/40",
                )}
              >
                {b.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => navigate("/settings?tab=brands")}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-rl-line bg-rl-surface px-4 text-[13.5px] font-semibold transition-colors hover:border-rl-ink/40"
          >
            <Plus className="h-3.5 w-3.5" />
            Add brand
          </button>
        </div>
      )}
    </div>
  );
}
