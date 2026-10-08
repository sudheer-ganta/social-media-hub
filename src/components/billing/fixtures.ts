import type {
  BillingHistory,
  BillingOverview,
  PlanCatalogue,
  PlanLimits,
} from "@/types/billing";

/**
 * Sample billing data for the dev preview and the component tests. The numbers
 * mirror `server/src/billing/plans.ts`; they are fixtures, not a second source
 * of truth, so the pricing page always renders what the API sends.
 */

const limits = (over: Partial<PlanLimits>): PlanLimits => ({
  monthlyCredits: 0,
  maxSocialAccounts: 2,
  maxBrands: 1,
  seats: 1,
  scheduledPostsPerMonth: 20,
  analyticsDays: 7,
  ...over,
});

export const CATALOGUE: PlanCatalogue = {
  trialDays: 14,
  paymentsConfigured: true,
  topupPack: { credits: 50, pricePaise: 59_900 },
  creditCosts: { concepts: 1, direction: 0, generate: 6, campaignVariation: 6, refine: 3, regenerate: 6, retype: 0 },
  plans: [
    {
      id: "trial", name: "Free trial", tagline: "14 days, no card needed",
      priceMonthlyPaise: null, priceYearlyPaise: null,
      limits: limits({ monthlyCredits: 18 }), highlights: [],
    },
    {
      id: "starter", name: "Starter", tagline: "For solo creators and small businesses",
      priceMonthlyPaise: 79_900, priceYearlyPaise: 799_000,
      limits: limits({ monthlyCredits: 80, maxSocialAccounts: 5, scheduledPostsPerMonth: null, analyticsDays: 30 }), highlights: [],
    },
    {
      id: "pro", name: "Pro", tagline: "For growing brands",
      priceMonthlyPaise: 199_900, priceYearlyPaise: 1_999_000,
      limits: limits({ monthlyCredits: 200, maxSocialAccounts: 15, maxBrands: 3, seats: 3, scheduledPostsPerMonth: null, analyticsDays: 365 }), highlights: [],
    },
    {
      id: "agency", name: "Agency", tagline: "For teams managing many brands",
      priceMonthlyPaise: 599_900, priceYearlyPaise: 5_999_000,
      limits: limits({ monthlyCredits: 650, maxSocialAccounts: 50, maxBrands: 15, seats: 10, scheduledPostsPerMonth: null, analyticsDays: 365 }), highlights: [],
    },
  ],
};

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

const base: BillingOverview = {
  plan: { id: "trial", name: "Free trial" },
  state: "trialing",
  status: "TRIALING",
  billingInterval: null,
  trialEndsAt: inDays(9),
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  limits: CATALOGUE.plans[0]!.limits,
  credits: { plan: 12, topup: 0, usable: 12 },
  enforced: true,
  paymentsConfigured: true,
};

export const OVERVIEWS = {
  trialing: base,
  active: {
    ...base, plan: { id: "pro", name: "Pro" }, state: "active", status: "ACTIVE", billingInterval: "monthly",
    trialEndsAt: null, currentPeriodEnd: inDays(18), limits: CATALOGUE.plans[2]!.limits,
    credits: { plan: 143, topup: 25, usable: 168 },
  },
  cancelling: {
    ...base, plan: { id: "starter", name: "Starter" }, state: "active", status: "ACTIVE", billingInterval: "yearly",
    trialEndsAt: null, currentPeriodEnd: inDays(120), cancelAtPeriodEnd: true, limits: CATALOGUE.plans[1]!.limits,
    credits: { plan: 31, topup: 0, usable: 31 },
  },
  pastDue: {
    ...base, plan: { id: "pro", name: "Pro" }, state: "past_due", status: "PAST_DUE", billingInterval: "monthly",
    trialEndsAt: null, currentPeriodEnd: inDays(-1), limits: CATALOGUE.plans[2]!.limits,
    credits: { plan: 20, topup: 0, usable: 20 },
  },
  trialEnded: {
    ...base, plan: { id: "free", name: "Free" }, state: "trial_ended", status: "EXPIRED",
    trialEndsAt: inDays(-2), limits: limits({}), credits: { plan: 0, topup: 0, usable: 0 },
  },
} satisfies Record<string, BillingOverview>;

export const HISTORY: BillingHistory = {
  payments: [
    { id: "p1", kind: "subscription", planId: "pro", amountPaise: 199_900, currency: "INR", status: "captured", createdAt: inDays(-12), razorpayInvoiceId: null },
    { id: "p2", kind: "topup", planId: null, amountPaise: 59_900, currency: "INR", status: "captured", createdAt: inDays(-5), razorpayInvoiceId: null },
  ],
  credits: [
    { id: "c1", type: "SPEND", planDelta: -6, topupDelta: 0, action: "generate", createdAt: inDays(-1) },
    { id: "c2", type: "REFUND", planDelta: 6, topupDelta: 0, action: "generate", createdAt: inDays(-1) },
    { id: "c3", type: "SPEND", planDelta: -3, topupDelta: 0, action: "refine", createdAt: inDays(-2) },
    { id: "c4", type: "TOPUP_GRANT", planDelta: 0, topupDelta: 50, action: "topup", createdAt: inDays(-5) },
    { id: "c5", type: "PLAN_GRANT", planDelta: 200, topupDelta: 0, action: "pro:monthly", createdAt: inDays(-12) },
  ],
};
