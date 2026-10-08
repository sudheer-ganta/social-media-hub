import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/app/AuthProvider";
import { billingService } from "@/services/billing.service";
import { openCheckout } from "@/lib/razorpay";
import type { BillingInterval, BillingOverview, PaidPlanId } from "@/types/billing";

export const billingKeys = {
  all: ["billing"] as const,
  catalogue: () => [...billingKeys.all, "catalogue"] as const,
  overview: () => [...billingKeys.all, "overview"] as const,
  history: () => [...billingKeys.all, "history"] as const,
};

/** Prices and limits. Public and slow-changing, so it is cached for a long time. */
export function usePlanCatalogue() {
  return useQuery({
    queryKey: billingKeys.catalogue(),
    queryFn: billingService.fetchCatalogue,
    staleTime: 10 * 60_000,
  });
}

/** The member's plan, limits and credit balance. */
export function useBillingOverview() {
  return useQuery({
    queryKey: billingKeys.overview(),
    queryFn: billingService.fetchOverview,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useBillingHistory() {
  return useQuery({
    queryKey: billingKeys.history(),
    queryFn: billingService.fetchHistory,
    staleTime: 30_000,
  });
}

/** After any money movement: refetch the balance, the plan and the history. */
function useRefreshBilling() {
  const queryClient = useQueryClient();
  return (overview?: BillingOverview) => {
    if (overview) queryClient.setQueryData(billingKeys.overview(), overview);
    void queryClient.invalidateQueries({ queryKey: billingKeys.all });
  };
}

const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/**
 * Starts a subscription: ask the server for a Razorpay subscription, open
 * Checkout, then hand the signed result back for verification.
 *
 * If the member pays but the confirmation call fails (a dropped connection),
 * nothing is lost: Razorpay's webhook activates the plan regardless, and the
 * toast says so rather than implying the payment failed.
 */
export function useSubscribe() {
  const { user } = useAuth();
  const refresh = useRefreshBilling();

  return useMutation({
    mutationFn: async ({ plan, interval }: { plan: PaidPlanId; interval: BillingInterval }) => {
      const session = await billingService.startCheckout(plan, interval);
      const outcome = await openCheckout(
        { subscriptionId: session.subscriptionId },
        {
          keyId: session.keyId,
          name: "FlowPost",
          description: `${session.planName} plan, billed ${interval}`,
          email: user?.email,
        },
      );
      if (outcome.status === "dismissed") return "dismissed" as const;
      if (outcome.status === "failed") throw new Error(outcome.message);

      try {
        const overview = await billingService.confirmCheckout({
          razorpay_payment_id: outcome.response.razorpay_payment_id ?? "",
          razorpay_subscription_id: outcome.response.razorpay_subscription_id ?? "",
          razorpay_signature: outcome.response.razorpay_signature ?? "",
        });
        refresh(overview);
      } catch (error) {
        console.error("[billing] confirmation failed after payment", error);
        toast.info("Payment received", {
          description: "Your plan will be active in a moment. Refresh if it does not appear.",
        });
        refresh();
        return "pending" as const;
      }
      return "paid" as const;
    },
    onSuccess: (result) => {
      if (result === "paid") toast.success("You're all set", { description: "Your plan is active." });
    },
    onError: (error) => toast.error("Payment failed", { description: message(error, "Please try again.") }),
  });
}

export function useChangePlan() {
  const refresh = useRefreshBilling();
  return useMutation({
    mutationFn: (plan: PaidPlanId) => billingService.changePlan(plan),
    onSuccess: (overview) => {
      refresh(overview);
      toast.success("Plan change requested", {
        description: "It will show here as soon as Razorpay confirms it.",
      });
    },
    onError: (error) => toast.error("Could not change plan", { description: message(error, "Please try again.") }),
  });
}

export function useCancelPlan() {
  const refresh = useRefreshBilling();
  return useMutation({
    mutationFn: () => billingService.cancel(),
    onSuccess: (overview) => {
      refresh(overview);
      toast.success("Plan will end at the close of this period", {
        description: "You keep full access until then.",
      });
    },
    onError: (error) => toast.error("Could not cancel", { description: message(error, "Please try again.") }),
  });
}

/** Buys one credit pack through a one-time Razorpay order. */
export function useBuyCredits() {
  const { user } = useAuth();
  const refresh = useRefreshBilling();

  return useMutation({
    mutationFn: async () => {
      const session = await billingService.startTopup();
      const outcome = await openCheckout(
        { orderId: session.orderId },
        {
          keyId: session.keyId,
          name: "FlowPost",
          description: `${session.credits} AI credits`,
          email: user?.email,
        },
      );
      if (outcome.status === "dismissed") return "dismissed" as const;
      if (outcome.status === "failed") throw new Error(outcome.message);

      try {
        refresh(
          await billingService.confirmTopup({
            razorpay_order_id: outcome.response.razorpay_order_id ?? "",
            razorpay_payment_id: outcome.response.razorpay_payment_id ?? "",
            razorpay_signature: outcome.response.razorpay_signature ?? "",
          }),
        );
      } catch (error) {
        console.error("[billing] top-up confirmation failed after payment", error);
        toast.info("Payment received", { description: "Your credits will appear in a moment." });
        refresh();
        return "pending" as const;
      }
      return "paid" as const;
    },
    onSuccess: (result) => {
      if (result === "paid") toast.success("Credits added");
    },
    onError: (error) => toast.error("Payment failed", { description: message(error, "Please try again.") }),
  });
}
