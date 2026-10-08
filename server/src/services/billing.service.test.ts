import { createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Billing behaviour against an in-memory stand-in for the repository, which
 * reimplements the one property the real one provides: a change is applied once
 * per idempotency key, and a balance never goes negative. What is under test is
 * the service's decisions — who is charged what, and what a Razorpay event does.
 */

const hoisted = vi.hoisted(() => {
  const state = {
    subs: new Map<string, any>(),
    accounts: new Map<string, { planCredits: number; topupCredits: number }>(),
    ledger: [] as any[],
    payments: new Map<string, any>(),
    events: new Map<string, { processed: boolean }>(),
    accountCount: 0,
    accountExists: false,
    env: {
      BILLING_ENFORCED: true,
      RAZORPAY_KEY_ID: 'rzp_test_key',
      RAZORPAY_KEY_SECRET: 'key_secret',
      RAZORPAY_WEBHOOK_SECRET: 'whsec',
      RAZORPAY_PLAN_IDS: {
        starter_monthly: 'plan_starter_m', starter_yearly: 'plan_starter_y',
        pro_monthly: 'plan_pro_m', pro_yearly: 'plan_pro_y',
        agency_monthly: 'plan_agency_m', agency_yearly: 'plan_agency_y',
      } as Record<string, string>,
    },
  };
  return { state };
});
const S = hoisted.state;

vi.mock('../config/env', () => ({ env: hoisted.state.env }));
vi.mock('../billing/razorpay.client', async () => {
  const actual = await vi.importActual<typeof import('../billing/razorpay.client')>('../billing/razorpay.client');
  return {
    ...actual,
    isRazorpayConfigured: () => true,
    razorpay: { fetchSubscription: vi.fn(), createSubscription: vi.fn(), cancelSubscription: vi.fn(), updateSubscription: vi.fn(), createOrder: vi.fn(), fetchOrder: vi.fn() },
  };
});
vi.mock('../repositories/social-account.repository', () => ({
  socialAccountRepository: {
    countByUser: async () => hoisted.state.accountCount,
    connectionExists: async () => hoisted.state.accountExists,
  },
}));
vi.mock('../repositories/billing.repository', () => {
  const s = hoisted.state;
  const balanceOf = (id: string) => s.accounts.get(id) ?? { planCredits: 0, topupCredits: 0 };
  const billingRepository = {
    getSubscription: async (userId: string) => s.subs.get(userId) ?? null,
    findSubscriptionByRazorpayId: async (id: string) =>
      [...s.subs.values()].find((x) => x.razorpaySubscriptionId === id || x.checkoutSubscriptionId === id) ?? null,
    createTrialSubscription: async (userId: string, trialEndsAt: Date) => {
      const row = {
        userId, planId: 'trial', billingInterval: null, status: 'TRIALING', trialEndsAt, currentPeriodStart: null, currentPeriodEnd: null,
        cancelAtPeriodEnd: false, canceledAt: null, razorpayCustomerId: null, razorpaySubscriptionId: null,
        checkoutSubscriptionId: null, checkoutPlanId: null, checkoutInterval: null,
      };
      s.subs.set(userId, row);
      return row;
    },
    updateSubscription: async (userId: string, data: any) => {
      const row = { ...s.subs.get(userId), ...data };
      s.subs.set(userId, row);
      return row;
    },
    setSubscriptionStatus: async (userId: string, status: string, extra: any = {}) => {
      const row = { ...s.subs.get(userId), status, ...extra };
      s.subs.set(userId, row);
      return row;
    },
    getCreditBalance: async (userId: string) => ({ ...balanceOf(userId) }),
    getLedgerEntryByKey: async (k: string) => s.ledger.find((e) => e.idempotencyKey === k) ?? null,
    adjustCredits: async (input: any) => {
      const current = { ...balanceOf(input.userId) };
      const prior = s.ledger.find((e) => e.idempotencyKey === input.idempotencyKey);
      if (prior) return { status: 'duplicate', change: { planDelta: prior.planDelta, topupDelta: prior.topupDelta }, balance: current };
      const change = input.compute(current);
      if (!change) return { status: 'refused', balance: current };
      const next = { planCredits: current.planCredits + change.planDelta, topupCredits: current.topupCredits + change.topupDelta };
      if (next.planCredits < 0 || next.topupCredits < 0) return { status: 'refused', balance: current };
      s.accounts.set(input.userId, next);
      s.ledger.push({ ...input, ...change, createdAt: new Date(), compute: undefined });
      return { status: 'applied', change, balance: next };
    },
    countRefundsSince: async (userId: string) => s.ledger.filter((e) => e.userId === userId && e.type === 'REFUND').length,
    listLedger: async () => [],
    upsertPayment: async (p: any) => { s.payments.set(p.razorpayPaymentId, p); return p; },
    listPayments: async () => [],
    recordWebhookEvent: async (id: string) => {
      const existing = s.events.get(id);
      if (existing) return { fresh: !existing.processed };
      s.events.set(id, { processed: false });
      return { fresh: true };
    },
    markWebhookProcessed: async (id: string, error?: string) => { s.events.set(id, { processed: !error }); },
  };
  return { billingRepository };
});

import { billingService, BillingError, WebhookSignatureError } from './billing.service';

const USER = '11111111-1111-1111-1111-111111111111';
const sign = (body: string) => createHmac('sha256', S.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');

let eventSeq = 0;
async function deliver(event: string, payload: Record<string, unknown>, eventId = `evt_${++eventSeq}`) {
  const raw = Buffer.from(JSON.stringify({ event, created_at: 1, payload }));
  await billingService.handleWebhook(raw, sign(raw.toString()), eventId);
}

const subEntity = (over: Record<string, unknown> = {}) => ({
  id: 'sub_1', plan_id: 'plan_pro_m', status: 'active', customer_id: 'cust_1',
  current_start: 1_790_000_000, current_end: 1_792_592_000, notes: { user_id: USER }, ...over,
});
const chargedPayload = (entity = subEntity(), paymentId = 'pay_1') => ({
  subscription: { entity },
  payment: { entity: { id: paymentId, amount: 199_900, currency: 'INR', invoice_id: 'inv_1' } },
});

beforeEach(() => {
  S.subs.clear(); S.accounts.clear(); S.ledger.length = 0; S.payments.clear(); S.events.clear();
  S.accountCount = 0; S.accountExists = false; S.env.BILLING_ENFORCED = true; eventSeq = 0;
});

describe('trial', () => {
  it('starts a no-card trial with the trial allowance on first contact', async () => {
    const overview = await billingService.getOverview(USER);
    expect(overview).toMatchObject({ plan: { id: 'trial' }, state: 'trialing', credits: { plan: 18, topup: 0, usable: 18 } });
  });

  it('grants the trial credits once however often the member shows up', async () => {
    await Promise.all([billingService.getOverview(USER), billingService.getOverview(USER)]);
    await billingService.getOverview(USER);
    expect(S.ledger.filter((e) => e.type === 'TRIAL_GRANT')).toHaveLength(1);
    expect(S.accounts.get(USER)?.planCredits).toBe(18);
  });
});

describe('spending credits', () => {
  it('charges the action price and takes plan credits before top-ups', async () => {
    await billingService.getOverview(USER);
    S.accounts.set(USER, { planCredits: 4, topupCredits: 10 });
    const r = await billingService.reserveCredits(USER, 'generate', 'req1'); // costs 6
    expect(r.cost).toBe(6);
    expect(S.accounts.get(USER)).toEqual({ planCredits: 0, topupCredits: 8 });
  });

  it('does not charge twice for the same request id', async () => {
    await billingService.getOverview(USER);
    await billingService.reserveCredits(USER, 'generate', 'req1');
    await billingService.reserveCredits(USER, 'generate', 'req1');
    expect(S.accounts.get(USER)?.planCredits).toBe(12);
  });

  it('refunds exactly what was taken, from the same buckets, once', async () => {
    await billingService.getOverview(USER);
    S.accounts.set(USER, { planCredits: 4, topupCredits: 10 });
    const r = await billingService.reserveCredits(USER, 'generate', 'req1');
    await r.refund();
    await r.refund();
    expect(S.accounts.get(USER)).toEqual({ planCredits: 4, topupCredits: 10 });
    expect(S.ledger.filter((e) => e.type === 'REFUND')).toHaveLength(1);
  });

  it('metered() refunds when the work fails and rethrows the original error', async () => {
    await billingService.getOverview(USER);
    const boom = new Error('render failed');
    await expect(billingService.metered(USER, 'generate', 'req1', async () => { throw boom; })).rejects.toBe(boom);
    expect(S.accounts.get(USER)?.planCredits).toBe(18);
  });

  it('metered() keeps the charge when the work succeeds', async () => {
    await billingService.getOverview(USER);
    await expect(billingService.metered(USER, 'generate', 'req1', async () => 'asset')).resolves.toBe('asset');
    expect(S.accounts.get(USER)?.planCredits).toBe(12);
  });

  it('does not charge for free actions', async () => {
    await billingService.getOverview(USER);
    await billingService.metered(USER, 'retype', 'req1', async () => 'ok');
    expect(S.accounts.get(USER)?.planCredits).toBe(18);
  });

  it('charges a campaign per variation', async () => {
    await billingService.getOverview(USER);
    const r = await billingService.reserveCredits(USER, 'campaignVariation', 'req1', 3);
    expect(r.cost).toBe(18);
    expect(S.accounts.get(USER)?.planCredits).toBe(0);
  });

  it('refuses when the balance is short, and leaves it untouched', async () => {
    await billingService.getOverview(USER);
    S.accounts.set(USER, { planCredits: 5, topupCredits: 0 });
    await expect(billingService.reserveCredits(USER, 'generate', 'req1')).rejects.toMatchObject({ status: 402, code: 'INSUFFICIENT_CREDITS' });
    expect(S.accounts.get(USER)).toEqual({ planCredits: 5, topupCredits: 0 });
  });

  it('never blocks while billing is not enforced, but still records what it can', async () => {
    S.env.BILLING_ENFORCED = false;
    await billingService.getOverview(USER);
    S.accounts.set(USER, { planCredits: 5, topupCredits: 0 });
    await expect(billingService.reserveCredits(USER, 'generate', 'req1')).resolves.toBeDefined();
    expect(S.accounts.get(USER)).toEqual({ planCredits: 5, topupCredits: 0 });
  });

  it('stops plan credits at trial end but keeps bought top-ups spendable', async () => {
    await billingService.getOverview(USER);
    S.subs.set(USER, { ...S.subs.get(USER), trialEndsAt: new Date(Date.now() - 1000) });
    S.accounts.set(USER, { planCredits: 10, topupCredits: 0 });
    await expect(billingService.reserveCredits(USER, 'generate', 'req1')).rejects.toThrow(/trial has ended/i);

    S.accounts.set(USER, { planCredits: 0, topupCredits: 20 });
    await expect(billingService.reserveCredits(USER, 'generate', 'req2')).resolves.toMatchObject({ cost: 6 });
    expect(S.accounts.get(USER)?.topupCredits).toBe(14);
  });

  it('caps how many failed generations a member can burn in a day', async () => {
    await billingService.getOverview(USER);
    S.accounts.set(USER, { planCredits: 1000, topupCredits: 0 });
    for (let i = 0; i < 15; i += 1) {
      const r = await billingService.reserveCredits(USER, 'generate', `req${i}`);
      await r.refund();
    }
    await expect(billingService.reserveCredits(USER, 'generate', 'req-next')).rejects.toMatchObject({ status: 429 });
  });
});

describe('Razorpay webhooks', () => {
  it('rejects a bad signature before touching anything', async () => {
    const raw = Buffer.from('{"event":"subscription.charged"}');
    await expect(billingService.handleWebhook(raw, 'deadbeef', 'evt')).rejects.toBeInstanceOf(WebhookSignatureError);
    expect(S.events.size).toBe(0);
  });

  it('activates a plan and grants its allowance on the first charge', async () => {
    await billingService.getOverview(USER);
    await deliver('subscription.charged', chargedPayload());
    expect(S.subs.get(USER)).toMatchObject({ planId: 'pro', billingInterval: 'monthly', status: 'ACTIVE', razorpaySubscriptionId: 'sub_1' });
    // The trial's leftover is replaced by the plan's allowance, not added to it.
    expect(S.accounts.get(USER)?.planCredits).toBe(200);
    expect(S.payments.get('pay_1')).toMatchObject({ kind: 'subscription', planId: 'pro', amountPaise: 199_900 });
  });

  it('credits a period once across activated + charged + a redelivery', async () => {
    await billingService.getOverview(USER);
    await deliver('subscription.activated', { subscription: { entity: subEntity() } });
    await deliver('subscription.charged', chargedPayload());
    await deliver('subscription.charged', chargedPayload(), 'evt_replay');
    await deliver('subscription.charged', chargedPayload(), 'evt_replay'); // same event id again
    expect(S.ledger.filter((e) => e.type === 'PLAN_GRANT')).toHaveLength(1);
    expect(S.accounts.get(USER)?.planCredits).toBe(200);
  });

  it('resets the allowance at renewal instead of stacking it', async () => {
    await billingService.getOverview(USER);
    await deliver('subscription.charged', chargedPayload());
    S.accounts.set(USER, { planCredits: 37, topupCredits: 25 });
    await deliver('subscription.charged', chargedPayload(subEntity({ current_start: 1_792_592_000, current_end: 1_795_184_000 }), 'pay_2'));
    expect(S.accounts.get(USER)).toEqual({ planCredits: 200, topupCredits: 25 });
  });

  it('adds only the difference when a member upgrades mid-period', async () => {
    await billingService.getOverview(USER);
    await deliver('subscription.charged', chargedPayload(subEntity({ plan_id: 'plan_starter_m' })));
    S.accounts.set(USER, { planCredits: 50, topupCredits: 0 }); // spent 30 of 80
    await deliver('subscription.updated', { subscription: { entity: subEntity({ plan_id: 'plan_pro_m' }) } });
    expect(S.subs.get(USER)?.planId).toBe('pro');
    expect(S.accounts.get(USER)?.planCredits).toBe(50 + (200 - 80));
  });

  it('moves a failing renewal to past-due and then halted, keeping the data', async () => {
    await billingService.getOverview(USER);
    await deliver('subscription.charged', chargedPayload());
    await deliver('subscription.pending', { subscription: { entity: subEntity({ status: 'pending' }) } });
    expect(S.subs.get(USER)?.status).toBe('PAST_DUE');
    await deliver('subscription.halted', { subscription: { entity: subEntity({ status: 'halted' }) } });
    expect(S.subs.get(USER)).toMatchObject({ status: 'HALTED', planId: 'pro' });
  });

  it('marks a cancelled subscription cancelled without touching the credits already granted', async () => {
    await billingService.getOverview(USER);
    await deliver('subscription.charged', chargedPayload());
    await deliver('subscription.cancelled', { subscription: { entity: subEntity({ status: 'cancelled' }) } });
    expect(S.subs.get(USER)).toMatchObject({ status: 'CANCELED', cancelAtPeriodEnd: true });
    expect(S.accounts.get(USER)?.planCredits).toBe(200);
  });

  it('ignores a subscription it cannot attribute to a member', async () => {
    await expect(deliver('subscription.charged', chargedPayload(subEntity({ id: 'sub_unknown', notes: {} })))).resolves.toBeUndefined();
    expect(S.ledger).toHaveLength(0);
  });

  it('credits a paid top-up order once', async () => {
    const order = { entity: { id: 'order_1', amount: 59_900, amount_paid: 59_900, notes: { user_id: USER, kind: 'topup' } } };
    const payment = { entity: { id: 'pay_9', amount: 59_900 } };
    await deliver('order.paid', { order, payment });
    await deliver('order.paid', { order, payment }, 'evt_other');
    expect(S.accounts.get(USER)?.topupCredits).toBe(50);
    expect(S.payments.get('pay_9')).toMatchObject({ kind: 'topup', amountPaise: 59_900 });
  });

  it('does not credit an order that was paid for less than the pack price', async () => {
    const order = { entity: { id: 'order_2', amount: 100, amount_paid: 100, notes: { user_id: USER, kind: 'topup' } } };
    await deliver('order.paid', { order, payment: { entity: { id: 'pay_10', amount: 100 } } });
    expect(S.accounts.get(USER)?.topupCredits ?? 0).toBe(0);
  });
});

describe('shadow mode never breaks the product', () => {
  it('lets a request run uncharged when the billing store is unavailable', async () => {
    S.env.BILLING_ENFORCED = false;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const original = S.subs.get;
    S.subs.get = () => { throw new Error('relation "subscriptions" does not exist'); };
    try {
      await expect(billingService.metered(USER, 'generate', 'req1', async () => 'asset')).resolves.toBe('asset');
    } finally {
      S.subs.get = original;
      spy.mockRestore();
    }
  });

  it('stops the request instead once billing is enforced', async () => {
    S.env.BILLING_ENFORCED = true;
    const original = S.subs.get;
    S.subs.get = () => { throw new Error('db down'); };
    try {
      await expect(billingService.metered(USER, 'generate', 'req1', async () => 'asset')).rejects.toThrow('db down');
    } finally {
      S.subs.get = original;
    }
  });

  it('lets an account connect when the billing store is unavailable', async () => {
    S.env.BILLING_ENFORCED = false;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const original = S.subs.get;
    S.subs.get = () => { throw new Error('boom'); };
    try {
      await expect(billingService.assertCanConnectAccount({ userId: USER, provider: 'x', providerAccountId: 'a9' })).resolves.toBeUndefined();
    } finally {
      S.subs.get = original;
      spy.mockRestore();
    }
  });
});

describe('account limits', () => {
  it('blocks a new account at the plan limit and allows a reconnect', async () => {
    await billingService.getOverview(USER); // trial: 2 accounts
    S.accountCount = 2;
    const identity = { userId: USER, provider: 'x', providerAccountId: 'a1' };

    S.accountExists = false;
    await expect(billingService.assertCanConnectAccount(identity)).rejects.toMatchObject({ status: 402, code: 'ACCOUNT_LIMIT' });

    S.accountExists = true;
    await expect(billingService.assertCanConnectAccount(identity)).resolves.toBeUndefined();
  });

  it('allows connecting below the limit and never blocks in shadow mode', async () => {
    await billingService.getOverview(USER);
    S.accountCount = 1;
    await expect(billingService.assertCanConnectAccount({ userId: USER, provider: 'x', providerAccountId: 'a2' })).resolves.toBeUndefined();

    S.accountCount = 99;
    S.env.BILLING_ENFORCED = false;
    await expect(billingService.assertCanConnectAccount({ userId: USER, provider: 'x', providerAccountId: 'a3' })).resolves.toBeUndefined();
  });
});

describe('BillingError', () => {
  it('is a user-facing error carrying a status and a code', () => {
    const e = new BillingError('Pay up', 402, 'X');
    expect(e).toMatchObject({ status: 402, code: 'X', message: 'Pay up' });
  });
});
