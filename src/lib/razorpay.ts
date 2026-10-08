/**
 * Razorpay Checkout, loaded on demand.
 *
 * checkout.js is only fetched when a member actually starts a payment, so it
 * costs nothing on every other page. It is Razorpay's own script — card and UPI
 * details are typed into Razorpay's frame and never reach this app or our API.
 */

const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpayOptions {
  key: string;
  name: string;
  description?: string;
  subscription_id?: string;
  order_id?: string;
  prefill?: { email?: string; name?: string };
  theme?: { color?: string };
  handler: (response: Record<string, string>) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", callback: (response: { error?: { description?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loading = null; // allow a retry after a network blip
        reject(new Error("Could not load the payment window. Check your connection and try again."));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

export type CheckoutOutcome =
  | { status: "paid"; response: Record<string, string> }
  | { status: "dismissed" }
  | { status: "failed"; message: string };

/**
 * Opens Checkout for a subscription or a one-time order and resolves once the
 * member has paid, closed the window, or the payment failed. It never rejects
 * for those three; only a script that cannot load does.
 */
export async function openCheckout(
  target: { subscriptionId: string } | { orderId: string },
  options: { keyId: string; name: string; description: string; email?: string },
): Promise<CheckoutOutcome> {
  await loadScript();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("The payment window is unavailable. Please try again.");

  return new Promise<CheckoutOutcome>((resolve) => {
    const instance = new Razorpay({
      key: options.keyId,
      name: options.name,
      description: options.description,
      ...("subscriptionId" in target
        ? { subscription_id: target.subscriptionId }
        : { order_id: target.orderId }),
      ...(options.email && { prefill: { email: options.email } }),
      theme: { color: "#DC361A" },
      handler: (response) => resolve({ status: "paid", response }),
      modal: { ondismiss: () => resolve({ status: "dismissed" }) },
    });
    instance.on("payment.failed", (failure) =>
      resolve({
        status: "failed",
        message: failure.error?.description ?? "The payment did not go through.",
      }),
    );
    instance.open();
  });
}
