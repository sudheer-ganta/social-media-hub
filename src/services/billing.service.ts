import { API_BASE_URL } from "@/constants/api";
import { authenticatedFetch } from "@/lib/auth-token";
import type {
  BillingHistory,
  BillingInterval,
  BillingOverview,
  CheckoutSession,
  PaidPlanId,
  PlanCatalogue,
  TopupSession,
} from "@/types/billing";

const BASE = `${API_BASE_URL}/api/billing`;

/** A billing call the server refused, with the message it wrote for the member. */
export class BillingApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "BillingApiError";
  }
}

async function parse<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && typeof body.error === "string"
        ? body.error
        : fallback;
    throw new BillingApiError(message, response.status, body?.code);
  }
  return body as T;
}

function post<T>(path: string, body: unknown, fallback: string): Promise<T> {
  return authenticatedFetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then((response) => parse<T>(response, fallback));
}

export interface CheckoutConfirmation {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

export interface TopupConfirmation {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/**
 * The browser's side of the billing API. Amounts are integer paise and credits
 * integers, exactly as the server sends them; formatting is the page's job.
 */
export const billingService = {
  /** Public: no session needed, so the pricing page works signed out. */
  async fetchCatalogue(): Promise<PlanCatalogue> {
    const response = await fetch(`${BASE}/plans`);
    return parse<PlanCatalogue>(response, "Could not load the plans.");
  },

  async fetchOverview(): Promise<BillingOverview> {
    const response = await authenticatedFetch(`${BASE}/me`);
    return parse<BillingOverview>(response, "Could not load your plan.");
  },

  async fetchHistory(): Promise<BillingHistory> {
    const response = await authenticatedFetch(`${BASE}/history`);
    return parse<BillingHistory>(response, "Could not load your billing history.");
  },

  startCheckout: (plan: PaidPlanId, interval: BillingInterval) =>
    post<CheckoutSession>("/checkout", { plan, interval }, "Could not start checkout."),

  confirmCheckout: (confirmation: CheckoutConfirmation) =>
    post<BillingOverview>("/checkout/confirm", confirmation, "Could not confirm your payment."),

  changePlan: (plan: PaidPlanId) =>
    post<BillingOverview>("/change-plan", { plan }, "Could not change your plan."),

  cancel: () => post<BillingOverview>("/cancel", {}, "Could not cancel your plan."),

  startTopup: () => post<TopupSession>("/topup", {}, "Could not start the purchase."),

  confirmTopup: (confirmation: TopupConfirmation) =>
    post<BillingOverview>("/topup/confirm", confirmation, "Could not confirm your payment."),
};
