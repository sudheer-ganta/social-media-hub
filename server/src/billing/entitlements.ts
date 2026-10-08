import { FREE_FLOOR, PAST_DUE_GRACE_DAYS, PLANS, isPaidPlanId, type PlanId, type PlanLimits } from './plans';

/**
 * What a member may do right now, decided from their subscription row and the
 * clock. Pure: no database, no Date.now(), so every state transition is a plain
 * unit test.
 *
 * The status column says what *Razorpay last told us*; this says what that
 * means for access. The two differ on purpose: a cancelled member keeps the plan
 * they paid for until the period ends, and a member whose renewal webhook never
 * arrived does not keep it forever.
 */

export interface SubscriptionLike {
  planId: string;
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'HALTED' | 'CANCELED' | 'EXPIRED';
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

export type EntitlementState =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled_active'
  | 'trial_ended'
  | 'halted'
  | 'lapsed'
  | 'none';

export interface Entitlement {
  /** The plan whose limits apply; 'free' once nothing live remains. */
  effectivePlanId: PlanId | 'free';
  limits: PlanLimits;
  state: EntitlementState;
  /**
   * Whether the monthly plan allowance may be spent. Independent of whether any
   * remains. Bought top-up credits never expire and stay spendable regardless.
   */
  canSpendPlanCredits: boolean;
}

const DAY_MS = 86_400_000;

function floor(state: EntitlementState): Entitlement {
  return { effectivePlanId: 'free', limits: FREE_FLOOR, state, canSpendPlanCredits: false };
}

function paid(planId: PlanId, state: EntitlementState): Entitlement {
  return { effectivePlanId: planId, limits: PLANS[planId].limits, state, canSpendPlanCredits: true };
}

export function resolveEntitlement(sub: SubscriptionLike | null, now: Date): Entitlement {
  if (!sub) return floor('none');

  const planId = (isPaidPlanId(sub.planId) ? sub.planId : null);
  const periodEnd = sub.currentPeriodEnd?.getTime() ?? 0;
  const graceEnd = periodEnd + PAST_DUE_GRACE_DAYS * DAY_MS;

  switch (sub.status) {
    case 'TRIALING':
      return sub.trialEndsAt && sub.trialEndsAt.getTime() > now.getTime()
        ? paid('trial', 'trialing')
        : floor('trial_ended');

    case 'ACTIVE':
      if (!planId) return floor('none');
      // The renewal webhook normally advances `currentPeriodEnd` before it passes.
      // If it did not arrive, access ends after the grace window instead of never.
      return now.getTime() <= graceEnd ? paid(planId, 'active') : floor('lapsed');

    case 'PAST_DUE':
      if (!planId) return floor('none');
      return now.getTime() <= graceEnd ? paid(planId, 'past_due') : floor('lapsed');

    case 'CANCELED':
      if (!planId) return floor('none');
      return periodEnd > now.getTime() ? paid(planId, 'canceled_active') : floor('lapsed');

    case 'HALTED':
      return floor('halted');

    case 'EXPIRED':
    default:
      return floor(sub.trialEndsAt && !planId ? 'trial_ended' : 'lapsed');
  }
}
