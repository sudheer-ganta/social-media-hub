import { useEffect, useState } from "react";
import { RallyPage } from "@/components/layout/RallyPage";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BillingHistory } from "@/components/billing/BillingHistory";
import { CreditCosts } from "@/components/billing/CreditCosts";
import { CurrentPlanPanel } from "@/components/billing/CurrentPlanPanel";
import { IntervalToggle } from "@/components/billing/IntervalToggle";
import { PlanGrid, hasLivePaidPlan, type PlanAction } from "@/components/billing/PlanGrid";
import { TopupPanel } from "@/components/billing/TopupPanel";
import {
  useBillingHistory,
  useBillingOverview,
  useBuyCredits,
  useCancelPlan,
  useChangePlan,
  usePlanCatalogue,
  useSubscribe,
} from "@/hooks/useBilling";
import { formatRupees } from "@/utils/money";
import type { BillingInterval, PaidPlanId } from "@/types/billing";

interface PendingChange {
  plan: PaidPlanId;
  kind: "upgrade" | "downgrade";
}

export default function Billing() {
  const catalogue = usePlanCatalogue();
  const overview = useBillingOverview();
  const history = useBillingHistory();

  const subscribe = useSubscribe();
  const changePlan = useChangePlan();
  const cancel = useCancelPlan();
  const buyCredits = useBuyCredits();

  const [interval, setInterval] = useState<BillingInterval>("yearly");
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const live = hasLivePaidPlan(overview.data);
  const memberInterval = overview.data?.billingInterval;

  // A member on a live plan sees (and can only change within) their own interval.
  useEffect(() => {
    if (live && memberInterval) setInterval(memberInterval);
  }, [live, memberInterval]);

  const handleSelect = (plan: PaidPlanId, action: PlanAction) => {
    if (action.kind === "subscribe") subscribe.mutate({ plan, interval });
    else if (action.kind === "upgrade" || action.kind === "downgrade") setPendingChange({ plan, kind: action.kind });
  };

  const failed = catalogue.isError || overview.isError;
  const loading = catalogue.isLoading || overview.isLoading;
  const planName = (id: PaidPlanId) => catalogue.data?.plans.find((p) => p.id === id)?.name ?? id;
  const busyPlan: PaidPlanId | null = subscribe.isPending
    ? (subscribe.variables?.plan ?? null)
    : changePlan.isPending
      ? (changePlan.variables ?? null)
      : null;

  return (
    <RallyPage
      title="Plans & billing"
      description="Pick the plan that fits how much you create. Change or cancel whenever you like."
    >
      {failed ? (
        <div className="rd-panel p-8 text-center" role="alert">
          <p className="text-[15px] font-semibold">We could not load your billing details.</p>
          <p className="mt-1 text-sm text-rl-muted">
            {(overview.error ?? catalogue.error) instanceof Error
              ? (overview.error ?? catalogue.error)?.message
              : "Please try again."}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => {
              void overview.refetch();
              void catalogue.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : loading || !catalogue.data || !overview.data ? (
        <div className="space-y-5" aria-busy="true" aria-label="Loading billing">
          <Skeleton className="h-56 w-full rounded-[18px]" />
          <div className="grid gap-5 md:grid-cols-3">
            <Skeleton className="h-96 rounded-[18px]" />
            <Skeleton className="h-96 rounded-[18px]" />
            <Skeleton className="h-96 rounded-[18px]" />
          </div>
        </div>
      ) : (
        <div className="space-y-10">
          {!catalogue.data.paymentsConfigured && (
            <p className="rounded-xl border border-rl-line bg-rl-soft/50 px-4 py-3 text-sm" role="status">
              Payments are still being set up, so plans cannot be purchased yet. Your trial and credits work as normal.
            </p>
          )}

          <CurrentPlanPanel
            overview={overview.data}
            onCancel={() => setConfirmingCancel(true)}
            cancelling={cancel.isPending}
          />

          <section aria-labelledby="plans-heading">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <h2 id="plans-heading" className="text-2xl font-bold tracking-tight">
                {live ? "Change plan" : "Choose a plan"}
              </h2>
              <IntervalToggle value={interval} onChange={setInterval} disabled={live} />
            </div>
            <PlanGrid
              catalogue={catalogue.data}
              interval={interval}
              overview={overview.data}
              busyPlan={busyPlan}
              paymentsDisabled={!catalogue.data.paymentsConfigured}
              onSelect={handleSelect}
            />
            {live && (
              <p className="mt-4 text-sm text-rl-muted">
                Upgrades start straight away. Switching to a lower plan takes effect when your current period ends.
                To move between monthly and yearly billing, do it when your plan renews.
              </p>
            )}
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <CreditCosts costs={catalogue.data.creditCosts} />
            <TopupPanel
              pack={catalogue.data.topupPack}
              available={catalogue.data.paymentsConfigured && hasPaidPlan(overview.data.plan.id)}
              busy={buyCredits.isPending}
              onBuy={() => buyCredits.mutate()}
            />
          </div>

          <BillingHistory history={history.data} />
        </div>
      )}

      <Dialog open={pendingChange !== null} onOpenChange={(open) => !open && setPendingChange(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingChange?.kind === "upgrade" ? "Upgrade" : "Switch"} to {pendingChange ? planName(pendingChange.plan) : ""}?
            </DialogTitle>
            <DialogDescription>
              {pendingChange?.kind === "upgrade"
                ? `Your new plan starts now and you get the extra credits straight away. Razorpay charges the price difference${
                    catalogue.data && pendingChange ? ` (${formatRupees(planPrice(catalogue.data.plans, pendingChange.plan, interval))} for the full ${interval === "yearly" ? "year" : "month"})` : ""
                  } for the rest of this period.`
                : "You keep your current plan and credits until this period ends. Then you move to the lower plan."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingChange(null)}>
              Not now
            </Button>
            <Button
              loading={changePlan.isPending}
              onClick={() => {
                if (!pendingChange) return;
                changePlan.mutate(pendingChange.plan, { onSettled: () => setPendingChange(null) });
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmingCancel} onOpenChange={setConfirmingCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel your plan?</DialogTitle>
            <DialogDescription>
              You keep full access, and your credits, until the end of the period you have paid for. You will not be
              charged again. Everything you have created stays in your library.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingCancel(false)}>
              Keep my plan
            </Button>
            <Button
              variant="destructive"
              loading={cancel.isPending}
              onClick={() => cancel.mutate(undefined, { onSettled: () => setConfirmingCancel(false) })}
            >
              Cancel plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RallyPage>
  );
}

function hasPaidPlan(id: string): boolean {
  return id === "starter" || id === "pro" || id === "agency";
}

function planPrice(
  plans: { id: string; priceMonthlyPaise: number | null; priceYearlyPaise: number | null }[],
  id: PaidPlanId,
  interval: BillingInterval,
): number {
  const plan = plans.find((p) => p.id === id);
  return (interval === "yearly" ? plan?.priceYearlyPaise : plan?.priceMonthlyPaise) ?? 0;
}
