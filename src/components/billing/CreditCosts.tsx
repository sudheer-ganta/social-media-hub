import { cn } from "@/lib/utils";

/** The member-facing name of each action the server meters, in the order they are usually used. */
const ROWS: { key: string; label: string; hint: string }[] = [
  { key: "concepts", label: "Creative ideas", hint: "A set of concepts to choose from" },
  { key: "generate", label: "Full creative", hint: "Strategy, design and finished image" },
  { key: "refine", label: "Refine a creative", hint: "Change one thing about a finished image" },
  { key: "campaignVariation", label: "Campaign variation", hint: "Each extra version in a campaign" },
  { key: "retype", label: "Reword the text", hint: "Edit the words without redrawing" },
];

export function CreditCosts({ costs, className }: { costs: Record<string, number>; className?: string }) {
  return (
    <section className={cn("rd-panel p-6 sm:p-7", className)} aria-labelledby="credit-costs-heading">
      <h2 id="credit-costs-heading" className="text-lg font-bold tracking-tight">
        What credits buy
      </h2>
      <p className="mt-1 text-sm text-rl-muted">
        You only spend credits when a creative is made. If something fails, the credits come back.
      </p>
      <ul className="mt-5 divide-y divide-rl-line/80">
        {ROWS.filter((row) => row.key in costs).map((row) => {
          const cost = costs[row.key]!;
          return (
            <li key={row.key} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-[14.5px] font-semibold">{row.label}</p>
                <p className="text-[13px] text-rl-muted">{row.hint}</p>
              </div>
              <span className="shrink-0 rounded-full bg-rl-bg px-3 py-1 text-[13px] font-bold tabular-nums">
                {cost === 0 ? "Free" : `${cost} ${cost === 1 ? "credit" : "credits"}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
