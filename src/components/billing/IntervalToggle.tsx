import { cn } from "@/lib/utils";
import type { BillingInterval } from "@/types/billing";

interface IntervalToggleProps {
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
  /** Locked while a member is on a live plan: changing interval needs a new subscription. */
  disabled?: boolean;
}

const OPTIONS: { value: BillingInterval; label: string; note?: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly", note: "2 months free" },
];

export function IntervalToggle({ value, onChange, disabled }: IntervalToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Billing interval"
      className={cn(
        "inline-flex rounded-full border border-rl-line bg-rl-surface p-1",
        disabled && "opacity-60",
      )}
    >
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rl-accent",
              selected ? "bg-rl-ink text-rl-bg" : "text-rl-muted hover:text-rl-ink",
              disabled && "cursor-not-allowed",
            )}
          >
            {option.label}
            {option.note && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-bold",
                  selected ? "bg-rl-accent text-white" : "bg-rl-soft text-rl-strong",
                )}
              >
                {option.note}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
