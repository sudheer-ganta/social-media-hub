import axios, { AxiosError } from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../config/env';
import { UserFacingError } from '../utils/user-facing-error';

/**
 * A thin Razorpay REST client plus the three signature checks the integration
 * depends on. axios is already a dependency, and the handful of endpoints used
 * here do not justify another one.
 *
 * Every signature check is constant-time and fails closed: a missing secret, a
 * missing signature or a length mismatch all answer "not valid".
 */

const API = 'https://api.razorpay.com/v1';

export function isRazorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

function hmacHex(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Webhook authenticity: HMAC-SHA256 of the **raw** request body with the
 * webhook secret, compared to `X-Razorpay-Signature`. It must be the raw bytes;
 * re-serialising parsed JSON changes whitespace and key order and never matches.
 */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined, secret = env.RAZORPAY_WEBHOOK_SECRET): boolean {
  if (!secret || !signature) return false;
  return safeEqualHex(hmacHex(secret, rawBody), signature);
}

/** Checkout-success callback for a subscription: HMAC(payment_id | subscription_id). */
export function verifySubscriptionPaymentSignature(
  paymentId: string, subscriptionId: string, signature: string | undefined, secret = env.RAZORPAY_KEY_SECRET,
): boolean {
  if (!secret || !signature || !paymentId || !subscriptionId) return false;
  return safeEqualHex(hmacHex(secret, `${paymentId}|${subscriptionId}`), signature);
}

/** Checkout-success callback for a one-time order: HMAC(order_id | payment_id). */
export function verifyOrderPaymentSignature(
  orderId: string, paymentId: string, signature: string | undefined, secret = env.RAZORPAY_KEY_SECRET,
): boolean {
  if (!secret || !signature || !orderId || !paymentId) return false;
  return safeEqualHex(hmacHex(secret, `${orderId}|${paymentId}`), signature);
}

async function call<T>(method: 'GET' | 'POST' | 'PATCH', path: string, data?: unknown): Promise<T> {
  if (!isRazorpayConfigured()) throw new UserFacingError('Payments are not set up on this server yet.', 503);
  try {
    const response = await axios.request<T>({
      method,
      url: `${API}${path}`,
      data,
      auth: { username: env.RAZORPAY_KEY_ID, password: env.RAZORPAY_KEY_SECRET },
      timeout: 20_000,
    });
    return response.data;
  } catch (error) {
    const e = error as AxiosError<{ error?: { description?: string; code?: string } }>;
    // Razorpay's description is written for developers, so it is logged and the
    // member gets a generic line. Key material never appears in either.
    console.error('[billing] razorpay request failed', {
      method, path, status: e.response?.status, code: e.response?.data?.error?.code, description: e.response?.data?.error?.description,
    });
    throw new UserFacingError('The payment provider could not complete that request. Please try again.', 502);
  }
}

export interface RazorpaySubscription {
  id: string;
  plan_id: string;
  status: string;
  customer_id?: string | null;
  current_start?: number | null;
  current_end?: number | null;
  paid_count?: number;
  total_count?: number;
  short_url?: string;
  notes?: Record<string, string> | unknown[];
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  amount_paid?: number;
  currency: string;
  status: string;
  notes?: Record<string, string> | unknown[];
}

export interface RazorpayPlanInput {
  period: 'monthly' | 'yearly';
  interval: number;
  item: { name: string; amount: number; currency: 'INR'; description?: string };
  notes?: Record<string, string>;
}

export const razorpay = {
  createPlan: (input: RazorpayPlanInput) => call<{ id: string }>('POST', '/plans', input),

  createSubscription: (input: { plan_id: string; total_count: number; customer_notify?: 0 | 1; notes?: Record<string, string> }) =>
    call<RazorpaySubscription>('POST', '/subscriptions', { customer_notify: 1, ...input }),

  fetchSubscription: (id: string) => call<RazorpaySubscription>('GET', `/subscriptions/${encodeURIComponent(id)}`),

  cancelSubscription: (id: string, atCycleEnd: boolean) =>
    call<RazorpaySubscription>('POST', `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 }),

  updateSubscription: (id: string, input: { plan_id: string; schedule_change_at: 'now' | 'cycle_end'; remaining_count?: number }) =>
    call<RazorpaySubscription>('PATCH', `/subscriptions/${encodeURIComponent(id)}`, input),

  fetchOrder: (id: string) => call<RazorpayOrder>('GET', `/orders/${encodeURIComponent(id)}`),

  createOrder: (input: { amount: number; currency: 'INR'; receipt: string; notes?: Record<string, string> }) =>
    call<RazorpayOrder>('POST', '/orders', input),
};
