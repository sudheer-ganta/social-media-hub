import { Check, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionHealth } from "@/constants/integrations";

interface ConnectionHealthMeterProps {
  health: ConnectionHealth;
}

/**
 * Health as a star rating plus the checks behind it.
 *
 * The checklist is the point. A rating on its own is decoration — "★★★★☆" tells
 * a member nothing they can act on, while "Recently Verified ✗" tells them
 * exactly what pressing Refresh would fix. The stars are the summary; the list
 * is the substance, and both are always shown together.
 */
export function ConnectionHealthMeter({ health }: ConnectionHealthMeterProps) {
  const healthy = health.rating === health.maxRating;
  const poor = health.rating <= health.maxRating - 3;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Health
        </p>
        <div className="flex items-center gap-1.5">
          <div
            className="flex items-center gap-0.5"
            // The stars are decorative; the label beside them is the value, so
            // a screen reader reads "4 of 5 — Good" rather than five icons.
            role="img"
            aria-label={`${health.rating} of ${health.maxRating} — ${health.label}`}
          >
            {Array.from({ length: health.maxRating }, (_, index) => (
              <Star
                key={index}
                aria-hidden="true"
                className={cn(
                  "h-3 w-3",
                  index < health.rating
                    ? healthy
                      ? "fill-emerald-500 text-emerald-500"
                      : poor
                        ? "fill-red-500 text-red-500"
                        : "fill-amber-500 text-amber-500"
                    : "text-muted-foreground/30",
                )}
              />
            ))}
          </div>
          <span className="text-xs font-medium">{health.label}</span>
        </div>
      </div>

      <ul className="mt-2 space-y-1">
        {health.checks.map((check) => (
          <li
            key={check.id}
            className="flex items-start gap-1.5 text-xs"
            // The failure reason is the tooltip on a failed check, and nothing
            // at all on a passing one — no explanation is needed for "fine".
            title={check.passed ? undefined : check.detail}
          >
            {check.passed ? (
              <Check
                aria-hidden="true"
                className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500"
              />
            ) : (
              <X
                aria-hidden="true"
                className="mt-0.5 h-3 w-3 shrink-0 text-red-500"
              />
            )}
            <span
              className={cn(
                check.passed ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {check.label}
              <span className="sr-only">
                {check.passed ? " — passing" : ` — ${check.detail}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
