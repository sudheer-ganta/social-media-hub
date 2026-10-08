import { randomUUID } from 'crypto';
import { env } from '../config/env';
import { UserFacingError } from '../utils/user-facing-error';
import { billingRepository, type CreditBalance, type Subscription } from '../repositories/billing.repository';
import { socialAccountRepository } from '../repositories/social-account.repository';
import { resolveEntitlement, type Entitlement } from '../billing/entitlements';
import {
  MAX_FAILED_GENERATIONS_PER_DAY,
  PLANS,
  TOPUP_PACK,
  TRIAL_DAYS,
  creditCost,
  isBillingInterval,
  isPaidPlanId,
  planRank,
  priceFor,
  type BillingInterval,
  type CreditAction,
  type PaidPlanId,
} from '../billing/plans';
import {
  isRazorpayConfigured,
  razorpay,
  verifyOrderPaymentSignature,
  verifySubscriptionPaymentSignature,
  verifyWebhookSignature,
  type RazorpaySubscription,
} from '../billing/razorpay.client';

/**
 * Billing orchestration: who is on which plan, what they may spend, and how
 * Razorpay's events change that.
 *
 * ─── Rollout safety ──────────────────────────────────────────────────────────
 * With BILLING_ENFORCED off (the default) every check still runs and still
 * writes the ledger, but nothing ever throws: where a member would have been
 * blocked, a `[billing] shadow` line is logged instead. That lets the credit
 * costs be watched against real traffic before anyone can be locked out.
 *
 * ─── Money rule ──────────────────────────────────────────────────────────────
 * A plan or a credit is granted from exactly one place for each Razorpay fact —
 * the webhook — and the checkout-success call just runs the same reducer early
 * for a faster UI. Every grant has an idempotency key derived from the Razorpay
 * ids, so the webhook, the verify call and a redelivery can all fire and the
 * member is still credited once.
 */

export class BillingError extends UserFacingError {
  constructor(message: string, status = 402, readonly code = 'BILLING') {
    super(message, status);
    this.name = 'BillingError';
  }
}

const DAY_MS = 86_400_000;

// ── Subscription lifecycle ───────────────────────────────────────────────────

/**
 * The member's subscription, created on first contact as a no-card trial. Also
 * where an elapsed trial is closed out, so the state in the database catches up
 * with the clock the next time anyone looks.
 */
async function ensureSubscription(userId: string, now = new Date()): Promise<Subscription> {
  let sub = await billingRepository.getSubscription(userId);

  if (!sub) {
    sub = await billingRepository.createTrialSubscription(userId, new Date(now.getTime() + TRIAL_DAYS * DAY_MS));
    await billingRepository.adjustCredits({
      userId,
      type: 'TRIAL_GRANT',
      idempotencyKey: `trial:${userId}`,
      action: 'trial',
      compute: () => ({ planDelta: PLANS.trial.limits.monthlyCredits, topupDelta: 0 }),
    });
    return sub;
  }

  if (sub.status === 'TRIALING' && sub.trialEndsAt && sub.trialEndsAt.getTime() <= now.getTime()) {
    sub = await billingRepository.setSubscriptionStatus(userId, 'EXPIRED');
    await billingRepository.adjustCredits({
      userId,
      type: 'EXPIRE',
      idempotencyKey: `trial-expire:${userId}`,
      action: 'trial',
      compute: (current) => (current.planCredits > 0 ? { planDelta: -current.planCredits, topupDelta: 0 } : { planDelta: 0, topupDelta: 0 }),
    });
  }
  return sub;
}

async function entitlementFor(userId: string, now = new Date()): Promise<{ sub: Subscription; entitlement: Entitlement }> {
  const sub = await ensureSubscription(userId, now);
  return { sub, entitlement: resolveEntitlement(sub, now) };
}

const BLOCK_MESSAGES: Record<string, string> = {
  trial_ended: 'Your free trial has ended. Choose a plan to keep creating.',
  halted: 'Your last payment did not go through. Update your payment method to keep creating.',
  lapsed: 'Your plan has ended. Renew to keep creating.',
  none: 'Choose a plan to start creating.',
};

/** Enforcing mode throws; shadow mode logs what it would have done and carries on. */
function block(userId: string, message: string, status = 402, code = 'BILLING'): void {
  if (env.BILLING_ENFORCED) throw new BillingError(message, status, code);
  console.warn('[billing] shadow: would block', { userId, message });
}

// ── Credits ──────────────────────────────────────────────────────────────────

export interface CreditReservation {
  /** Credits taken for this request (0 if the action is free or was not charged). */
  cost: number;
  /** Gives the credits back. Safe to call more than once. */
  refund(): Promise<void>;
}

const NO_RESERVATION: CreditReservation = { cost: 0, refund: async () => undefined };

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Takes the credits for an action up front, so two concurrent requests cannot
 * both spend the same balance. Plan credits go first, then top-ups. The caller
 * must {@link CreditReservation.refund} if the work fails: members pay for
 * results, not attempts.
 */
async function reserveCredits(userId: string, action: CreditAction, requestId: string, variations = 1): Promise<CreditReservation> {
  const cost = creditCost(action, variations);
  if (cost === 0) return NO_RESERVATION;

  const now = new Date();
  const { entitlement } = await entitlementFor(userId, now);

  if (await billingRepository.countRefundsSince(userId, startOfUtcDay(now)) >= MAX_FAILED_GENERATIONS_PER_DAY) {
    block(userId, 'Too many attempts failed today. Please try again tomorrow, or contact support.', 429, 'FAILURE_CEILING');
  }

  const key = `spend:${userId}:${requestId}:${action}`;
  const result = await billingRepository.adjustCredits({
    userId,
    type: 'SPEND',
    idempotencyKey: key,
    action,
    requestId,
    metadata: { cost },
    compute: (current) => {
      const usablePlan = entitlement.canSpendPlanCredits ? current.planCredits : 0;
      if (usablePlan + current.topupCredits < cost) return null;
      const fromPlan = Math.min(usablePlan, cost);
      return { planDelta: -fromPlan, topupDelta: -(cost - fromPlan) };
    },
  });

  if (result.status === 'refused') {
    const usable = (entitlement.canSpendPlanCredits ? result.balance.planCredits : 0) + result.balance.topupCredits;
    const message = !entitlement.canSpendPlanCredits && usable === 0
      ? (BLOCK_MESSAGES[entitlement.state] ?? BLOCK_MESSAGES.none!)
      : `Not enough credits: this needs ${cost} and you have ${usable}. Upgrade or add credits to continue.`;
    block(userId, message, 402, 'INSUFFICIENT_CREDITS');
    return NO_RESERVATION;
  }

  let refunded = false;
  return {
    cost,
    async refund() {
      if (refunded || result.status === 'duplicate') return;
      refunded = true;
      try {
        const original = result.change;
        await billingRepository.adjustCredits({
          userId,
          type: 'REFUND',
          idempotencyKey: `refund:${key}`,
          action,
          requestId,
          compute: () => ({ planDelta: -original.planDelta, topupDelta: -original.topupDelta }),
        });
      } catch (error) {
        // The member's request already failed; the original error must reach them.
        // This line is what an operator greps for to make good on a lost refund.
        console.error('[billing] REFUND FAILED — credits were taken for a failed request', { userId, requestId, action, cost, error });
      }
    },
  };
}

/**
 * Shadow mode must never be able to break the product. If billing itself fails
 * (a migration not applied yet, the database briefly unreachable), the member's
 * request carries on uncharged and the failure is logged. Once enforcement is on
 * the same failure stops the request instead: giving AI away because the ledger
 * is down is not acceptable then.
 */
async function failOpenInShadow<T>(what: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof BillingError || env.BILLING_ENFORCED) throw error;
    console.error(`[billing] shadow: ${what} failed, continuing without it`, error instanceof Error ? error.message : error);
    return fallback;
  }
}

/** Runs `fn`, charging for `action` first and refunding if it throws. */
async function metered<T>(userId: string, action: CreditAction, requestId: string, fn: () => Promise<T>, variations = 1): Promise<T> {
  const reservation = await failOpenInShadow('credit reservation', NO_RESERVATION, () =>
    reserveCredits(userId, action, requestId, variations));
  try {
    return await fn();
  } catch (error) {
    await reservation.refund();
    throw error;
  }
}

async function grantTopup(userId: string, paymentId: string, orderId: string): Promise<void> {
  await billingRepository.adjustCredits({
    userId,
    type: 'TOPUP_GRANT',
    idempotencyKey: `topup:${paymentId}`,
    action: 'topup',
    metadata: { paymentId, orderId },
    compute: () => ({ planDelta: 0, topupDelta: TOPUP_PACK.credits }),
  });
}

// ── Plan limits ──────────────────────────────────────────────────────────────

/**
 * Called before a *new* social account is stored. A reconnect of one the member
 * already has is an update, not a new account, and is never counted.
 */
async function assertCanConnectAccount(identity: {
  userId: string;
  provider: string;
  providerAccountId: string;
  contextType?: string | null;
  brandId?: string | null;
}): Promise<void> {
  await failOpenInShadow('account limit check', undefined, async () => {
    if (await socialAccountRepository.connectionExists(identity)) return;
    const { entitlement } = await entitlementFor(identity.userId);
    const count = await socialAccountRepository.countByUser(identity.userId);
    if (count >= entitlement.limits.maxSocialAccounts) {
      block(
        identity.userId,
        `Your plan includes ${entitlement.limits.maxSocialAccounts} connected accounts. Upgrade to connect more.`,
        402,
        'ACCOUNT_LIMIT',
      );
    }
  });
}

// ── Overview for the app ─────────────────────────────────────────────────────

export interface BillingOverview {
  plan: { id: string; name: string };
  state: Entitlement['state'];
  status: Subscription['status'];
  billingInterval: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  limits: Entitlement['limits'];
  credits: { plan: number; topup: number; usable: number };
  /** Whether limits are being enforced; false while billing is in shadow mode. */
  enforced: boolean;
  paymentsConfigured: boolean;
}

async function getOverview(userId: string): Promise<BillingOverview> {
  const { sub, entitlement } = await entitlementFor(userId);
  const balance = await billingRepository.getCreditBalance(userId);
  const usable = (entitlement.canSpendPlanCredits ? balance.planCredits : 0) + balance.topupCredits;
  const planId = entitlement.effectivePlanId;
  return {
    plan: { id: planId, name: planId === 'free' ? 'Free' : PLANS[planId].name },
    state: entitlement.state,
    status: sub.status,
    billingInterval: sub.billingInterval,
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    limits: entitlement.limits,
    credits: { plan: balance.planCredits, topup: balance.topupCredits, usable },
    enforced: env.BILLING_ENFORCED,
    paymentsConfigured: isRazorpayConfigured(),
  };
}

// ── Razorpay linkage ─────────────────────────────────────────────────────────

function razorpayPlanId(plan: PaidPlanId, interval: BillingInterval): string {
  const id = env.RAZORPAY_PLAN_IDS[`${plan}_${interval}`];
  if (!id) throw new BillingError('This plan is not available for purchase yet.', 503, 'PLAN_NOT_CONFIGURED');
  return id;
}

/** Reverse lookup: which of our plans does a Razorpay plan id belong to. */
function ourPlanFor(razorpayPlan: string): { plan: PaidPlanId; interval: BillingInterval } | null {
  for (const [key, value] of Object.entries(env.RAZORPAY_PLAN_IDS)) {
    if (value && value === razorpayPlan) {
      const [plan, interval] = key.split('_');
      if (isPaidPlanId(plan) && isBillingInterval(interval)) return { plan, interval };
    }
  }
  return null;
}

/** Billing cycles to authorise. Razorpay needs a finite count; this is ten years. */
const TOTAL_COUNT: Record<BillingInterval, number> = { monthly: 120, yearly: 10 };

export interface CheckoutSession {
  keyId: string;
  subscriptionId: string;
  planName: string;
  interval: BillingInterval;
  amountPaise: number;
}

async function startCheckout(userId: string, planInput: unknown, intervalInput: unknown): Promise<CheckoutSession> {
  if (!isPaidPlanId(planInput)) throw new BillingError('Pick one of the paid plans.', 400, 'BAD_PLAN');
  if (!isBillingInterval(intervalInput)) throw new BillingError('Choose monthly or yearly billing.', 400, 'BAD_INTERVAL');
  if (!isRazorpayConfigured()) throw new BillingError('Payments are not set up on this server yet.', 503, 'NOT_CONFIGURED');

  const sub = await ensureSubscription(userId);
  if (sub.razorpaySubscriptionId && (sub.status === 'ACTIVE' || sub.status === 'PAST_DUE')) {
    throw new BillingError('You already have a plan. Use change plan to switch.', 409, 'ALREADY_SUBSCRIBED');
  }

  const created = await razorpay.createSubscription({
    plan_id: razorpayPlanId(planInput, intervalInput),
    total_count: TOTAL_COUNT[intervalInput],
    notes: { user_id: userId, plan: planInput, interval: intervalInput },
  });

  await billingRepository.updateSubscription(userId, {
    checkoutSubscriptionId: created.id,
    checkoutPlanId: planInput,
    checkoutInterval: intervalInput,
  });

  return {
    keyId: env.RAZORPAY_KEY_ID,
    subscriptionId: created.id,
    planName: PLANS[planInput].name,
    interval: intervalInput,
    amountPaise: priceFor(planInput, intervalInput),
  };
}

function epochToDate(value: number | null | undefined): Date | null {
  return typeof value === 'number' && value > 0 ? new Date(value * 1000) : null;
}

/**
 * The one reducer for a Razorpay subscription entity. Called from webhooks and
 * from the checkout-success verification, so both paths produce identical state.
 */
async function applySubscriptionEntity(userId: string, entity: RazorpaySubscription): Promise<void> {
  const current = await ensureSubscription(userId);
  const known = ourPlanFor(entity.plan_id);
  const start = epochToDate(entity.current_start);
  const end = epochToDate(entity.current_end);

  switch (entity.status) {
    case 'active': {
      const pendingMatch = current.checkoutSubscriptionId === entity.id;
      const plan = known?.plan
        ?? (pendingMatch && isPaidPlanId(current.checkoutPlanId) ? current.checkoutPlanId : null)
        ?? (isPaidPlanId(current.planId) ? current.planId : null);
      const interval = known?.interval
        ?? (pendingMatch && isBillingInterval(current.checkoutInterval) ? current.checkoutInterval : null)
        ?? (isBillingInterval(current.billingInterval) ? current.billingInterval : null);
      if (!plan || !interval) {
        console.error('[billing] active subscription with an unknown plan', { userId, razorpayPlan: entity.plan_id });
        throw new Error('Unknown Razorpay plan');
      }

      const wasSamePlanLive = current.razorpaySubscriptionId === entity.id && current.planId === plan;
      const previousPlan = isPaidPlanId(current.planId) && current.razorpaySubscriptionId === entity.id ? current.planId : null;

      await billingRepository.updateSubscription(userId, {
        planId: plan,
        billingInterval: interval,
        status: 'ACTIVE',
        razorpaySubscriptionId: entity.id,
        ...(entity.customer_id && { razorpayCustomerId: entity.customer_id }),
        checkoutSubscriptionId: null,
        checkoutPlanId: null,
        checkoutInterval: null,
        trialEndsAt: null,
        ...(start && { currentPeriodStart: start }),
        ...(end && { currentPeriodEnd: end }),
        // A fresh active period on a subscription we had marked for cancellation
        // means the member kept it; a real cancellation arrives as `cancelled`.
        cancelAtPeriodEnd: current.cancelAtPeriodEnd && wasSamePlanLive,
        canceledAt: null,
      });

      // Same billing period as before means this event is a plan change inside it
      // (an upgrade applied now), not a renewal.
      const samePeriod = Boolean(start && current.currentPeriodStart && current.currentPeriodStart.getTime() === start.getTime());

      if (start && !(samePeriod && previousPlan && previousPlan !== plan)) {
        // New period (or first activation): the allowance is reset, not added to.
        const allowance = PLANS[plan].limits.monthlyCredits;
        await billingRepository.adjustCredits({
          userId,
          type: 'PLAN_GRANT',
          idempotencyKey: `plan:${userId}:${entity.id}:${Math.floor(start.getTime() / 1000)}`,
          action: `${plan}:${interval}`,
          compute: (balance: CreditBalance) => ({ planDelta: allowance - balance.planCredits, topupDelta: 0 }),
        });
      } else if (previousPlan && previousPlan !== plan && planRank(plan) > planRank(previousPlan)) {
        // Mid-period upgrade: add the difference in allowances straight away.
        const gained = PLANS[plan].limits.monthlyCredits - PLANS[previousPlan].limits.monthlyCredits;
        await billingRepository.adjustCredits({
          userId,
          type: 'PLAN_GRANT',
          idempotencyKey: `plan-change:${userId}:${entity.id}:${plan}:${start ? Math.floor(start.getTime() / 1000) : 'now'}`,
          action: `${previousPlan}->${plan}`,
          compute: () => ({ planDelta: Math.max(0, gained), topupDelta: 0 }),
        });
      }
      return;
    }

    case 'pending':
      await billingRepository.setSubscriptionStatus(userId, 'PAST_DUE');
      return;

    case 'halted':
    case 'paused':
      await billingRepository.setSubscriptionStatus(userId, 'HALTED');
      return;

    case 'cancelled':
      await billingRepository.setSubscriptionStatus(userId, 'CANCELED', { cancelAtPeriodEnd: true, canceledAt: new Date() });
      return;

    case 'completed':
    case 'expired':
      await billingRepository.setSubscriptionStatus(userId, 'EXPIRED');
      return;

    default:
      // created / authenticated: the member has not been charged yet. Nothing to grant.
      return;
  }
}

async function userForSubscription(entity: RazorpaySubscription): Promise<string | null> {
  const notes = entity.notes && !Array.isArray(entity.notes) ? entity.notes : {};
  const row = await billingRepository.findSubscriptionByRazorpayId(entity.id);
  return row?.userId ?? (typeof notes.user_id === 'string' ? notes.user_id : null);
}

/** Checkout-success callback: verify the signature, then run the reducer early for instant UI. */
async function confirmCheckout(userId: string, input: { paymentId?: string; subscriptionId?: string; signature?: string }): Promise<BillingOverview> {
  const { paymentId = '', subscriptionId = '', signature } = input;
  if (!verifySubscriptionPaymentSignature(paymentId, subscriptionId, signature)) {
    throw new BillingError('We could not verify that payment.', 400, 'BAD_SIGNATURE');
  }
  const sub = await ensureSubscription(userId);
  if (sub.checkoutSubscriptionId !== subscriptionId && sub.razorpaySubscriptionId !== subscriptionId) {
    throw new BillingError('That payment does not belong to your account.', 403, 'NOT_YOURS');
  }
  const entity = await razorpay.fetchSubscription(subscriptionId);
  await applySubscriptionEntity(userId, entity);
  return getOverview(userId);
}

async function cancel(userId: string): Promise<BillingOverview> {
  const sub = await ensureSubscription(userId);
  if (!sub.razorpaySubscriptionId || sub.status === 'CANCELED' || sub.status === 'EXPIRED') {
    throw new BillingError('There is no active plan to cancel.', 400, 'NOTHING_TO_CANCEL');
  }
  // At cycle end: the member has paid for the period and keeps it.
  await razorpay.cancelSubscription(sub.razorpaySubscriptionId, true);
  await billingRepository.updateSubscription(userId, { cancelAtPeriodEnd: true });
  return getOverview(userId);
}

async function changePlan(userId: string, planInput: unknown): Promise<BillingOverview> {
  if (!isPaidPlanId(planInput)) throw new BillingError('Pick one of the paid plans.', 400, 'BAD_PLAN');
  const sub = await ensureSubscription(userId);
  if (!sub.razorpaySubscriptionId || sub.status !== 'ACTIVE' || !isPaidPlanId(sub.planId) || !isBillingInterval(sub.billingInterval)) {
    throw new BillingError('Start a plan first.', 400, 'NO_PLAN');
  }
  if (planInput === sub.planId) throw new BillingError('You are already on that plan.', 400, 'SAME_PLAN');

  // Same billing interval only: moving between monthly and yearly changes the
  // charge cycle, which is cleaner done as cancel-and-resubscribe at renewal.
  const upgrade = planRank(planInput) > planRank(sub.planId);
  await razorpay.updateSubscription(sub.razorpaySubscriptionId, {
    plan_id: razorpayPlanId(planInput, sub.billingInterval),
    // Upgrades apply now; downgrades wait for the period the member already paid for.
    schedule_change_at: upgrade ? 'now' : 'cycle_end',
  });
  // The reducer applies it when Razorpay confirms (`subscription.updated` / `charged`).
  return getOverview(userId);
}

// ── Top-ups ──────────────────────────────────────────────────────────────────

export interface TopupSession { keyId: string; orderId: string; amountPaise: number; credits: number }

async function startTopup(userId: string): Promise<TopupSession> {
  if (!isRazorpayConfigured()) throw new BillingError('Payments are not set up on this server yet.', 503, 'NOT_CONFIGURED');
  const { entitlement } = await entitlementFor(userId);
  // Top-ups are an add-on to a plan, and cost more per credit than one.
  if (!isPaidPlanId(entitlement.effectivePlanId)) {
    throw new BillingError('Choose a plan before adding credits.', 400, 'NEEDS_PLAN');
  }
  const order = await razorpay.createOrder({
    amount: TOPUP_PACK.pricePaise,
    currency: 'INR',
    receipt: `topup_${randomUUID().slice(0, 24)}`,
    notes: { user_id: userId, kind: 'topup', credits: String(TOPUP_PACK.credits) },
  });
  return { keyId: env.RAZORPAY_KEY_ID, orderId: order.id, amountPaise: TOPUP_PACK.pricePaise, credits: TOPUP_PACK.credits };
}

async function confirmTopup(userId: string, input: { orderId?: string; paymentId?: string; signature?: string }): Promise<BillingOverview> {
  const { orderId = '', paymentId = '', signature } = input;
  if (!verifyOrderPaymentSignature(orderId, paymentId, signature)) {
    throw new BillingError('We could not verify that payment.', 400, 'BAD_SIGNATURE');
  }
  // The signature proves the order was paid, not whose order it is.
  const order = await razorpay.fetchOrder(orderId);
  const notes = order.notes && !Array.isArray(order.notes) ? order.notes : {};
  if (notes.user_id !== userId) throw new BillingError('That payment does not belong to your account.', 403, 'NOT_YOURS');
  if ((order.amount_paid ?? 0) < TOPUP_PACK.pricePaise) throw new BillingError('That payment is not complete yet.', 409, 'NOT_PAID');

  await billingRepository.upsertPayment({
    userId, razorpayPaymentId: paymentId, razorpayOrderId: orderId, kind: 'topup',
    amountPaise: order.amount_paid ?? TOPUP_PACK.pricePaise, status: 'captured',
  });
  await grantTopup(userId, paymentId, orderId);
  return getOverview(userId);
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

interface WebhookBody {
  event?: string;
  created_at?: number;
  payload?: {
    subscription?: { entity?: RazorpaySubscription };
    payment?: { entity?: { id: string; order_id?: string; amount: number; currency?: string; invoice_id?: string; status?: string; notes?: Record<string, string> | unknown[] } };
    order?: { entity?: { id: string; amount: number; amount_paid?: number; notes?: Record<string, string> | unknown[] } };
  };
}

export class WebhookSignatureError extends Error {}

async function processWebhook(body: WebhookBody): Promise<void> {
  const event = body.event ?? '';
  const subscription = body.payload?.subscription?.entity;
  const payment = body.payload?.payment?.entity;
  const order = body.payload?.order?.entity;

  if (event.startsWith('subscription.') && subscription) {
    const userId = await userForSubscription(subscription);
    if (!userId) {
      console.warn('[billing] webhook for a subscription with no known member', { event, subscriptionId: subscription.id });
      return;
    }
    await applySubscriptionEntity(userId, subscription);

    if (event === 'subscription.charged' && payment) {
      const plan = ourPlanFor(subscription.plan_id)?.plan ?? null;
      await billingRepository.upsertPayment({
        userId,
        razorpayPaymentId: payment.id,
        razorpaySubscriptionId: subscription.id,
        razorpayInvoiceId: payment.invoice_id ?? null,
        kind: 'subscription',
        planId: plan,
        amountPaise: payment.amount,
        currency: payment.currency ?? 'INR',
        status: 'captured',
      });
    }
    return;
  }

  if (event === 'order.paid' && order && payment) {
    const notes = order.notes && !Array.isArray(order.notes) ? order.notes : {};
    if (notes.kind !== 'topup' || typeof notes.user_id !== 'string') return;
    if ((order.amount_paid ?? order.amount) < TOPUP_PACK.pricePaise) {
      console.warn('[billing] top-up order paid for less than the pack price', { orderId: order.id });
      return;
    }
    await billingRepository.upsertPayment({
      userId: notes.user_id, razorpayPaymentId: payment.id, razorpayOrderId: order.id, kind: 'topup',
      amountPaise: order.amount_paid ?? order.amount, status: 'captured',
    });
    await grantTopup(notes.user_id, payment.id, order.id);
    return;
  }

  if (event === 'payment.failed') {
    console.warn('[billing] payment failed', { paymentId: payment?.id, orderId: payment?.order_id });
  }
  // Every other event is acknowledged and ignored.
}

/**
 * Entry point for POST /api/billing/webhook. `rawBody` must be the unparsed
 * bytes — the signature covers them exactly.
 *
 * Throws {@link WebhookSignatureError} for a bad signature (answer 400). Any
 * other throw means processing failed and Razorpay should retry (answer 500);
 * the event is stored first, so a retry re-runs it and idempotency keys make the
 * re-run safe.
 */
async function handleWebhook(rawBody: Buffer, signature: string | undefined, eventIdHeader: string | undefined): Promise<void> {
  if (!verifyWebhookSignature(rawBody, signature)) throw new WebhookSignatureError('Invalid webhook signature');

  const body = JSON.parse(rawBody.toString('utf8')) as WebhookBody;
  const eventId = eventIdHeader
    || `${body.event}:${body.payload?.subscription?.entity?.id ?? body.payload?.payment?.entity?.id ?? body.payload?.order?.entity?.id}:${body.created_at}`;

  const { fresh } = await billingRepository.recordWebhookEvent(eventId, body.event ?? 'unknown', body);
  if (!fresh) return;

  try {
    await processWebhook(body);
    await billingRepository.markWebhookProcessed(eventId);
  } catch (error) {
    await billingRepository.markWebhookProcessed(eventId, error instanceof Error ? error.message : String(error)).catch(() => undefined);
    throw error;
  }
}

export const billingService = {
  getOverview,
  reserveCredits,
  metered,
  assertCanConnectAccount,
  startCheckout,
  confirmCheckout,
  cancel,
  changePlan,
  startTopup,
  confirmTopup,
  handleWebhook,
  listPayments: billingRepository.listPayments,
  listLedger: billingRepository.listLedger,
};
