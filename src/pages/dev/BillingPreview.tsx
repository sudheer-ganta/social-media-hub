import { useState } from "react";
import { RallyPage } from "@/components/layout/RallyPage";
import { BillingHistory } from "@/components/billing/BillingHistory";
import { CreditCosts } from "@/components/billing/CreditCosts";
import { CurrentPlanPanel } from "@/components/billing/CurrentPlanPanel";
import { IntervalToggle } from "@/components/billing/IntervalToggle";
import { PlanGrid } from "@/components/billing/PlanGrid";
import { TopupPanel } from "@/components/billing/TopupPanel";
import { CATALOGUE, HISTORY, OVERVIEWS } from "@/components/billing/fixtures";
import type { BillingInterval } from "@/types/billing";

type StateKey = keyof typeof OVERVIEWS;

/** Dev-only visual harness for the billing page in each state. Stripped by the DEV guard in App. */
export default function BillingPreview() {
  const [state, setState] = useState<StateKey>("trialing");
  const [interval, setInterval] = useState<BillingInterval>("yearly");
  const overview = OVERVIEWS[state];
  const live = overview.state === "active";

  return (
    <RallyPage title="Plans & billing" description="Dev preview: pick a state to see how the page reads.">
      <div className="space-y-10">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Preview state">
          {(Object.keys(OVERVIEWS) as StateKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setState(key)}
              aria-pressed={state === key}
              className={`h-9 rounded-full border px-4 text-[13px] font-semibold ${
                state === key ? "border-rl-ink bg-rl-ink text-rl-bg" : "border-rl-line bg-rl-surface"
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        <CurrentPlanPanel overview={overview} onCancel={() => undefined} />

        <section>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-2xl font-bold tracking-tight">{live ? "Change plan" : "Choose a plan"}</h2>
            <IntervalToggle
              value={live && overview.billingInterval ? overview.billingInterval : interval}
              onChange={setInterval}
              disabled={live}
            />
          </div>
          <PlanGrid
            catalogue={CATALOGUE}
            interval={live && overview.billingInterval ? overview.billingInterval : interval}
            overview={overview}
            onSelect={() => undefined}
          />
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <CreditCosts costs={CATALOGUE.creditCosts} />
          <TopupPanel
            pack={CATALOGUE.topupPack}
            available={["starter", "pro", "agency"].includes(overview.plan.id)}
            busy={false}
            onBuy={() => undefined}
          />
        </div>

        <BillingHistory history={HISTORY} />
      </div>
    </RallyPage>
  );
}
