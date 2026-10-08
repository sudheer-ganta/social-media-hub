import { describe, expect, it } from 'vitest';
import { resolveEntitlement, type SubscriptionLike } from './entitlements';
import { FREE_FLOOR, PLANS } from './plans';

const NOW = new Date('2026-10-10T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const sub = (over: Partial<SubscriptionLike>): SubscriptionLike => ({
  planId: 'pro', status: 'ACTIVE', trialEndsAt: null, currentPeriodEnd: days(10), ...over,
});

describe('resolveEntitlement', () => {
  it('has no access without a subscription row', () => {
    const e = resolveEntitlement(null, NOW);
    expect(e.effectivePlanId).toBe('free');
    expect(e.canSpendPlanCredits).toBe(false);
  });

  it('gives a running trial the trial limits', () => {
    const e = resolveEntitlement(sub({ planId: 'trial', status: 'TRIALING', trialEndsAt: days(5), currentPeriodEnd: null }), NOW);
    expect(e).toMatchObject({ effectivePlanId: 'trial', state: 'trialing', canSpendPlanCredits: true });
    expect(e.limits).toEqual(PLANS.trial.limits);
  });

  it('drops an elapsed trial to the free floor even if the row still says TRIALING', () => {
    const e = resolveEntitlement(sub({ planId: 'trial', status: 'TRIALING', trialEndsAt: days(-1), currentPeriodEnd: null }), NOW);
    expect(e).toMatchObject({ effectivePlanId: 'free', state: 'trial_ended', canSpendPlanCredits: false });
    expect(e.limits).toEqual(FREE_FLOOR);
  });

  it('gives an active paid plan its own limits', () => {
    const e = resolveEntitlement(sub({}), NOW);
    expect(e).toMatchObject({ effectivePlanId: 'pro', state: 'active', canSpendPlanCredits: true });
  });

  it('keeps access through the grace window after a missed renewal, then lapses', () => {
    expect(resolveEntitlement(sub({ currentPeriodEnd: days(-2) }), NOW).state).toBe('active');
    expect(resolveEntitlement(sub({ currentPeriodEnd: days(-4) }), NOW)).toMatchObject({ effectivePlanId: 'free', state: 'lapsed' });
  });

  it('keeps access while a renewal is being retried (past due)', () => {
    expect(resolveEntitlement(sub({ status: 'PAST_DUE', currentPeriodEnd: days(-1) }), NOW))
      .toMatchObject({ effectivePlanId: 'pro', state: 'past_due' });
  });

  it('blocks a halted subscription immediately', () => {
    expect(resolveEntitlement(sub({ status: 'HALTED' }), NOW))
      .toMatchObject({ effectivePlanId: 'free', state: 'halted', canSpendPlanCredits: false });
  });

  it('lets a cancelled member use the period they paid for, and not a day more', () => {
    expect(resolveEntitlement(sub({ status: 'CANCELED', currentPeriodEnd: days(3) }), NOW).state).toBe('canceled_active');
    expect(resolveEntitlement(sub({ status: 'CANCELED', currentPeriodEnd: days(-1) }), NOW).effectivePlanId).toBe('free');
  });

  it('treats an unknown plan id as no plan rather than guessing one', () => {
    expect(resolveEntitlement(sub({ planId: 'platinum' }), NOW).effectivePlanId).toBe('free');
  });
});
