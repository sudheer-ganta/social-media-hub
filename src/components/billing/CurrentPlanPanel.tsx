import dayjs from "dayjs";
import { cn } from "@/lib/utils";
import type { BillingOverview, EntitlementState } from "@/types/billing";

const STATE_LABEL: Record<EntitlementState, { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  trialing: { label: "Free trial", tone: "good" },
  active: { label: "Active", tone: "good" },
  past_due: { label: "Payment retrying", tone: "warn" },
  canceled_active: { label: "Ending", tone: "warn" },
  trial_ended: { label: "Trial ended", tone: "bad" },
  halted: { label: "Payment failed", tone: "bad" },
  lapsed: { label: "Plan ended", tone: "bad" },
  none: { label: "No plan", tone: "neutral" },
};

const TONE_CLASS = {
  good: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  bad: "bg-rl-soft text-rl-strong",
  neutral: "bg-rl-line/60 text-rl-muted",
};

/** One sentence about where the plan stands, in the member's terms. */
export function describeState(overview: BillingOverview): string {
  const day = (iso: string | null) => (iso ? dayjs(iso).format("D MMM YYYY") : "");
  switch (overview.state) {
    case "trialing": {
      const left = overview.trialEndsAt ? Math.max(0, dayjs(overview.trialEndsAt).diff(dayjs(), "day") + 1) : 0;
      return `Your trial ends on ${day(overview.trialEndsAt)} (${left} ${left === 1 ? "day" : "days"} left).`;
    }
    case "active":
      return overview.cancelAtPeriodEnd
        ? `Ends on ${day(overview.currentPeriodEnd)}. You will not be charged again.`
        : `Renews on ${day(overview.currentPeriodEnd)}${overview.billingInterval ? `, billed ${overview.billingInterval}` : ""}.`;
    case "canceled_active":
      return `Cancelled. You keep full access until ${day(overview.currentPeriodEnd)}.`;
    case "past_due":
      return "Your last payment did not go through. Razorpay is retrying it, and your access continues for now.";
    case "halted":
      return "Your payment failed repeatedly, so your plan is paused. Choose a plan below to restart it.";
    case "trial_ended":
      return "Your free trial has ended. Choose a plan to keep creating. Everything you made is still here.";
    case "lapsed":
      return "Your plan has ended. Choose a plan to keep creating. Everything you made is still here.";
    default:
      return "Choose a plan to start creating.";
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] font-medium uppercase tracking-wide text-rl-muted">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold">{value}</dd>
    </div>
  );
}

interface CurrentPlanPanelProps {
  overview: BillingOverview;
  /** Allowance of the current plan, for the meter. */
  onCancel?: () => void;
  cancelling?: boolean;
}

export function CurrentPlanPanel({ overview, onCancel, cancelling }: CurrentPlanPanelProps) {
  const { credits, limits } = overview;
  const state = STATE_LABEL[overview.state];
  const allowance = limits.monthlyCredits;
  // The bar shows how much of this month's allowance is left; bought credits sit beside it.
  const planShare = allowance > 0 ? Math.min(100, Math.round((credits.plan / allowance) * 100)) : 0;
  const canCancel = overview.state === "active" && !overview.cancelAtPeriodEnd;

  return (
    <section className="rd-panel p-6 sm:p-8" aria-labelledby="current-plan-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-rl-muted">Your plan</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 id="current-plan-heading" className="text-3xl font-bold tracking-tight">
              {overview.plan.name}
            </h2>
            <span className={cn("rounded-full px-3 py-1 text-[12px] font-bold", TONE_CLASS[state.tone])}>
              {state.label}
            </span>
          </div>
          <p className="mt-2 max-w-[60ch] text-[14.5px] leading-relaxed text-rl-muted">{describeState(overview)}</p>
        </div>

        {canCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="h-10 rounded-xl border border-rl-line px-4 text-[13.5px] font-semibold text-rl-muted transition hover:border-rl-ink hover:text-rl-ink disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel plan"}
          </button>
        )}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <div className="flex items-end justify-between gap-4">
            <p className="text-[13px] font-medium text-rl-muted">AI credits available</p>
            <p className="rd-numeral text-[40px]" aria-live="polite">
              {credits.usable}
            </p>
          </div>
          {allowance > 0 && (
            <div
              className="mt-3 h-3 overflow-hidden rounded-full bg-rl-line/70"
              role="progressbar"
              aria-label="Monthly credits remaining"
              aria-valuemin={0}
              aria-valuemax={allowance}
              aria-valuenow={Math.min(credits.plan, allowance)}
            >
              <div
                className="h-full rounded-full bg-rl-accent transition-[width] duration-500"
                style={{ width: `${planShare}%` }}
              />
            </div>
          )}
          <p className="mt-2 text-[13px] text-rl-muted">
            {allowance > 0
              ? `${credits.plan} of ${allowance} monthly credits left`
              : "No monthly credits on this plan"}
            {credits.topup > 0 && ` · ${credits.topup} bought credits (these never expire)`}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
          <Stat label="Connected accounts" value={`Up to ${limits.maxSocialAccounts}`} />
          <Stat label="Brand profiles" value={String(limits.maxBrands)} />
          <Stat label="Team seats" value={String(limits.seats)} />
          <Stat
            label="Scheduling"
            value={limits.scheduledPostsPerMonth === null ? "Unlimited" : `${limits.scheduledPostsPerMonth} / month`}
          />
        </dl>
      </div>
    </section>
  );
}
