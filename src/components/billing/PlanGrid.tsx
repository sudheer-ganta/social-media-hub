import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRupees, perMonthPaise } from "@/utils/money";
import type {
  BillingInterval,
  BillingOverview,
  BillingPlan,
  PaidPlanId,
  PlanCatalogue,
} from "@/types/billing";

/** What a plan's button does, decided once so the label and the click agree. */
export type PlanAction =
  | { kind: "current" }
  | { kind: "subscribe" }
  | { kind: "upgrade" }
  | { kind: "downgrade" }
  /** The public pricing page: send them to sign up. */
  | { kind: "signup" }
  | { kind: "unavailable"; reason: string };

const PAID: PaidPlanId[] = ["starter", "pro", "agency"];
const RANK: Record<string, number> = { trial: 0, free: 0, starter: 1, pro: 2, agency: 3 };

/** A member on a live paid plan changes plan in place; anyone else starts a new subscription. */
export function hasLivePaidPlan(overview?: BillingOverview): boolean {
  return Boolean(overview && overview.state === "active" && PAID.includes(overview.plan.id as PaidPlanId));
}

export function actionFor(plan: BillingPlan, interval: BillingInterval, overview?: BillingOverview, publicMode = false): PlanAction {
  if (publicMode) return { kind: "signup" };
  if (!overview) return { kind: "subscribe" };

  if (overview.state === "past_due") {
    return { kind: "unavailable", reason: "Your last payment is being retried" };
  }
  if (hasLivePaidPlan(overview)) {
    if (plan.id === overview.plan.id) return { kind: "current" };
    if (overview.billingInterval && overview.billingInterval !== interval) {
      return { kind: "unavailable", reason: `Switch to ${interval} billing when your plan renews` };
    }
    return RANK[plan.id]! > RANK[overview.plan.id]! ? { kind: "upgrade" } : { kind: "downgrade" };
  }
  return { kind: "subscribe" };
}

const LABELS: Record<PlanAction["kind"], string> = {
  current: "Your plan",
  subscribe: "Choose plan",
  upgrade: "Upgrade",
  downgrade: "Switch down",
  signup: "Start free trial",
  unavailable: "Unavailable",
};

interface PlanGridProps {
  catalogue: PlanCatalogue;
  interval: BillingInterval;
  overview?: BillingOverview;
  /** The plan whose button is mid-request. */
  busyPlan?: PaidPlanId | null;
  publicMode?: boolean;
  /** Payments are not set up on the server yet: every purchase button is inert. */
  paymentsDisabled?: boolean;
  /** Called for every action except `signup`, which the caller renders as a link. */
  onSelect?: (plan: PaidPlanId, action: PlanAction) => void;
  /** Renders the call to action for the public page (a link, not a button). */
  renderSignup?: (className: string, label: string) => React.ReactNode;
}

function features(plan: BillingPlan, creditsPerCreative: number): string[] {
  const { limits } = plan;
  const renders = Math.floor(limits.monthlyCredits / creditsPerCreative);
  return [
    `${limits.monthlyCredits} AI credits a month (about ${renders} full creatives)`,
    `${limits.maxSocialAccounts} connected accounts`,
    `${limits.maxBrands} ${limits.maxBrands === 1 ? "brand profile" : "brand profiles"}`,
    limits.seats > 1 ? `${limits.seats} team seats` : "1 seat",
    limits.scheduledPostsPerMonth === null ? "Unlimited scheduling" : `${limits.scheduledPostsPerMonth} scheduled posts a month`,
    limits.analyticsDays >= 365 ? "1 year of analytics" : `${limits.analyticsDays} days of analytics`,
  ];
}

export function PlanGrid({ catalogue, interval, overview, busyPlan, publicMode, paymentsDisabled, onSelect, renderSignup }: PlanGridProps) {
  const plans = catalogue.plans.filter((p): p is BillingPlan & { id: PaidPlanId } => PAID.includes(p.id as PaidPlanId));

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {plans.map((plan) => {
        const featured = plan.id === "pro";
        const monthly = plan.priceMonthlyPaise ?? 0;
        const yearly = plan.priceYearlyPaise ?? 0;
        const headline = interval === "monthly" ? monthly : perMonthPaise(yearly);
        const action = actionFor(plan, interval, overview, publicMode);
        const busy = busyPlan === plan.id;
        const disabled =
          action.kind === "current" ||
          action.kind === "unavailable" ||
          Boolean(busyPlan) ||
          Boolean(paymentsDisabled && action.kind !== "signup");

        const buttonClass = cn(
          "mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl text-[14.5px] font-semibold transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rl-accent focus-visible:ring-offset-2 focus-visible:ring-offset-rl-surface",
          featured
            ? "bg-rl-strong text-white hover:brightness-105"
            : "border border-rl-line bg-rl-bg text-rl-ink hover:border-rl-ink",
          "disabled:cursor-not-allowed disabled:opacity-55",
        );

        return (
          <article
            key={plan.id}
            className={cn(
              "rd-panel relative flex flex-col p-6 sm:p-7",
              featured && "border-rl-accent ring-1 ring-rl-accent/40 md:-translate-y-2",
              action.kind === "current" && "bg-rl-soft/40",
            )}
          >
            {featured && (
              <span className="absolute -top-3 left-6 rounded-full bg-rl-strong px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                Most popular
              </span>
            )}
            <h3 className="text-xl font-bold tracking-tight">{plan.name}</h3>
            <p className="mt-1 text-sm text-rl-muted">{plan.tagline}</p>

            <div className="mt-6 flex items-baseline gap-1.5">
              <span className="rd-numeral text-[44px]">{formatRupees(headline)}</span>
              <span className="text-sm text-rl-muted">/ month</span>
            </div>
            <p className="mt-1 min-h-5 text-[13px] text-rl-muted">
              {interval === "yearly"
                ? `Billed ${formatRupees(yearly)} a year. You save ${formatRupees(monthly * 12 - yearly)}.`
                : "Billed monthly. Cancel any time."}
            </p>

            <ul className="mt-6 flex-1 space-y-2.5">
              {features(plan, catalogue.creditCosts.generate ?? 6).map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-[14px] leading-snug">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-rl-strong" strokeWidth={2.5} aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            {action.kind === "signup" && renderSignup ? (
              renderSignup(buttonClass, LABELS.signup)
            ) : (
              <button
                type="button"
                className={buttonClass}
                disabled={disabled}
                aria-busy={busy}
                onClick={() => onSelect?.(plan.id, action)}
              >
                {busy ? "Opening checkout…" : LABELS[action.kind]}
              </button>
            )}
            {action.kind === "unavailable" && (
              <p className="mt-2 text-center text-xs text-rl-muted">{action.reason}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
