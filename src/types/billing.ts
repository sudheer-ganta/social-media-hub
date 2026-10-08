export type PlanId = "trial" | "starter" | "pro" | "agency";
export type PaidPlanId = Exclude<PlanId, "trial">;
export type BillingInterval = "monthly" | "yearly";

export interface PlanLimits {
  monthlyCredits: number;
  maxSocialAccounts: number;
  maxBrands: number;
  seats: number;
  /** Null is unlimited. */
  scheduledPostsPerMonth: number | null;
  analyticsDays: number;
}

export interface BillingPlan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Integer paise; null for the trial. */
  priceMonthlyPaise: number | null;
  priceYearlyPaise: number | null;
  limits: PlanLimits;
  highlights: string[];
}

export interface PlanCatalogue {
  plans: BillingPlan[];
  topupPack: { credits: number; pricePaise: number };
  creditCosts: Record<string, number>;
  trialDays: number;
  paymentsConfigured: boolean;
}

export type EntitlementState =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled_active"
  | "trial_ended"
  | "halted"
  | "lapsed"
  | "none";

export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "HALTED"
  | "CANCELED"
  | "EXPIRED";

export interface BillingOverview {
  plan: { id: PlanId | "free"; name: string };
  state: EntitlementState;
  status: SubscriptionStatus;
  billingInterval: BillingInterval | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  limits: PlanLimits;
  credits: { plan: number; topup: number; usable: number };
  enforced: boolean;
  paymentsConfigured: boolean;
}

export interface BillingPayment {
  id: string;
  kind: "subscription" | "topup";
  planId: string | null;
  amountPaise: number;
  currency: string;
  status: "captured" | "failed" | "refunded";
  createdAt: string;
  razorpayInvoiceId: string | null;
}

export interface CreditLedgerRow {
  id: string;
  type: "TRIAL_GRANT" | "PLAN_GRANT" | "TOPUP_GRANT" | "SPEND" | "REFUND" | "EXPIRE" | "ADJUSTMENT";
  planDelta: number;
  topupDelta: number;
  action: string | null;
  createdAt: string;
}

export interface BillingHistory {
  payments: BillingPayment[];
  credits: CreditLedgerRow[];
}

export interface CheckoutSession {
  keyId: string;
  subscriptionId: string;
  planName: string;
  interval: BillingInterval;
  amountPaise: number;
}

export interface TopupSession {
  keyId: string;
  orderId: string;
  amountPaise: number;
  credits: number;
}
