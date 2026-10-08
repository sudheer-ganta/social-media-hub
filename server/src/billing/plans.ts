/**
 * The product catalogue: what each plan costs and what it includes. Pure data
 * and arithmetic, no I/O, so pricing is changed in one reviewed place and the
 * guard test in `plans.test.ts` can prove a change does not make a plan lose
 * money.
 *
 * Money is integer paise. Credits are integers.
 *
 * A *credit* is a unit of AI work priced by what the work costs us: an idea or
 * a rewrite is cheap, a full render (several image calls plus a critic pass) is
 * not. Scheduling, the calendar and analytics cost almost nothing and are never
 * metered.
 */

export type PlanId = 'trial' | 'starter' | 'pro' | 'agency';
export type PaidPlanId = Exclude<PlanId, 'trial'>;
export type BillingInterval = 'monthly' | 'yearly';

export const PAID_PLAN_IDS: readonly PaidPlanId[] = ['starter', 'pro', 'agency'];
export const BILLING_INTERVALS: readonly BillingInterval[] = ['monthly', 'yearly'];

export const TRIAL_DAYS = 14;

/**
 * What an action costs a member. `retype` (rewording text on a finished
 * creative) re-uses the stored picture and is free; `direction` is a single
 * cheap text call and is free but rate-limited.
 */
export const CREDIT_COSTS = {
  concepts: 1,
  direction: 0,
  generate: 6,
  /** Per variation; a campaign of N labels costs N x this. */
  campaignVariation: 6,
  refine: 3,
  regenerate: 6,
  retype: 0,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

export interface PlanLimits {
  /** Monthly AI credits; granted fresh each period, unused ones do not roll over. */
  monthlyCredits: number;
  /** Connected social accounts, across every publishing context. */
  maxSocialAccounts: number;
  /** Brand profiles (Creative DNA). Shown on the pricing page. */
  maxBrands: number;
  /** Team seats. Shown on the pricing page. */
  seats: number;
  /** Scheduled posts per month; null is unlimited. Shown on the pricing page. */
  scheduledPostsPerMonth: number | null;
  /** Analytics look-back in days. Shown on the pricing page. */
  analyticsDays: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Price per billing interval in paise. Null for the trial. */
  priceMonthlyPaise: number | null;
  priceYearlyPaise: number | null;
  limits: PlanLimits;
  highlights: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: 'trial',
    name: 'Free trial',
    tagline: `${TRIAL_DAYS} days, no card needed`,
    priceMonthlyPaise: null,
    priceYearlyPaise: null,
    limits: {
      monthlyCredits: 18,
      maxSocialAccounts: 2,
      maxBrands: 1,
      seats: 1,
      scheduledPostsPerMonth: 20,
      analyticsDays: 7,
    },
    highlights: ['About 3 full creatives', '2 connected accounts', '20 scheduled posts'],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    tagline: 'For solo creators and small businesses',
    priceMonthlyPaise: 79_900,
    priceYearlyPaise: 799_000,
    limits: {
      monthlyCredits: 80,
      maxSocialAccounts: 5,
      maxBrands: 1,
      seats: 1,
      scheduledPostsPerMonth: null,
      analyticsDays: 30,
    },
    highlights: ['About 13 full creatives a month', '5 connected accounts', 'Unlimited scheduling'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'For growing brands',
    priceMonthlyPaise: 199_900,
    priceYearlyPaise: 1_999_000,
    limits: {
      monthlyCredits: 200,
      maxSocialAccounts: 15,
      maxBrands: 3,
      seats: 3,
      scheduledPostsPerMonth: null,
      analyticsDays: 365,
    },
    highlights: ['About 33 full creatives a month', '15 connected accounts', '3 brands, 3 seats'],
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    tagline: 'For teams managing many brands',
    priceMonthlyPaise: 599_900,
    priceYearlyPaise: 5_999_000,
    limits: {
      monthlyCredits: 650,
      maxSocialAccounts: 50,
      maxBrands: 15,
      seats: 10,
      scheduledPostsPerMonth: null,
      analyticsDays: 365,
    },
    highlights: ['About 108 full creatives a month', '50 connected accounts', '15 brands, 10 seats'],
  },
};

/**
 * What a member with no live plan gets: the trial is over and nothing was
 * bought. They keep what they already built and can still schedule, but cannot
 * spend AI credits. Not a sellable plan.
 */
export const FREE_FLOOR: PlanLimits = {
  monthlyCredits: 0,
  maxSocialAccounts: 2,
  maxBrands: 1,
  seats: 1,
  scheduledPostsPerMonth: 20,
  analyticsDays: 7,
};

/**
 * A bought block of credits. Priced above the per-credit rate of every plan so
 * upgrading is always the better deal; top-up credits do not expire.
 */
export const TOPUP_PACK = {
  credits: 50,
  pricePaise: 59_900,
} as const;

/** Renewal failures are retried by Razorpay; access continues this long past a missed period end. */
export const PAST_DUE_GRACE_DAYS = 3;

/**
 * Hard ceiling on failed generations per member per day. A failed run is
 * refunded, which means a member's credit balance no longer limits what failures
 * cost us, so this does.
 */
export const MAX_FAILED_GENERATIONS_PER_DAY = 15;

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return typeof value === 'string' && (PAID_PLAN_IDS as readonly string[]).includes(value);
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'yearly';
}

export function priceFor(plan: PaidPlanId, interval: BillingInterval): number {
  const p = PLANS[plan];
  const price = interval === 'monthly' ? p.priceMonthlyPaise : p.priceYearlyPaise;
  if (price == null) throw new Error(`Plan ${plan} has no ${interval} price`);
  return price;
}

/** How many credits an action costs. A campaign scales with its variation count. */
export function creditCost(action: CreditAction, variations = 1): number {
  if (action === 'campaignVariation') return CREDIT_COSTS.campaignVariation * Math.max(1, variations);
  return CREDIT_COSTS[action];
}

/** Rank for deciding whether a change is an upgrade or a downgrade. */
export function planRank(id: PlanId): number {
  return ['trial', 'starter', 'pro', 'agency'].indexOf(id);
}
