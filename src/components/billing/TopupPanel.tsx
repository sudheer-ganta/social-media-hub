import { Zap } from "lucide-react";
import { formatRupees } from "@/utils/money";

interface TopupPanelProps {
  pack: { credits: number; pricePaise: number };
  /** Top-ups are an add-on to a paid plan. */
  available: boolean;
  busy: boolean;
  onBuy: () => void;
}

export function TopupPanel({ pack, available, busy, onBuy }: TopupPanelProps) {
  return (
    <section className="rd-panel flex flex-col p-6 sm:p-7" aria-labelledby="topup-heading">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-rl-soft text-rl-strong">
          <Zap className="h-4 w-4" strokeWidth={2.2} aria-hidden />
        </span>
        <h2 id="topup-heading" className="text-lg font-bold tracking-tight">
          Need more credits?
        </h2>
      </div>
      <p className="mt-3 text-sm text-rl-muted">
        Add a pack any time. Bought credits never expire and are used after your monthly credits.
      </p>
      <p className="mt-5 flex items-baseline gap-2">
        <span className="rd-numeral text-[36px]">{pack.credits}</span>
        <span className="text-sm text-rl-muted">credits for {formatRupees(pack.pricePaise)}</span>
      </p>
      <button
        type="button"
        onClick={onBuy}
        disabled={!available || busy}
        aria-busy={busy}
        className="mt-5 inline-flex h-12 items-center justify-center rounded-xl border border-rl-line bg-rl-bg text-[14.5px] font-semibold transition hover:border-rl-ink disabled:cursor-not-allowed disabled:opacity-55"
      >
        {busy ? "Opening checkout…" : "Add credits"}
      </button>
      {!available && <p className="mt-2 text-xs text-rl-muted">Available once you are on a paid plan.</p>}
    </section>
  );
}
