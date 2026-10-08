import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import type { CreditEntryType, SubscriptionStatus } from '../generated/prisma/enums';

/**
 * Every billing table lives behind this file. Nothing else in the backend
 * touches them.
 *
 * Credit balances are the part that has to be exactly right. Every change to a
 * balance goes through {@link adjustCredits}, which in one transaction locks the
 * member's account row, refuses a repeated idempotency key, applies the change
 * and appends the ledger entry. The row lock serialises concurrent requests for
 * the same member, and the table's CHECK constraint is the backstop beneath it.
 */

export type Subscription = NonNullable<Awaited<ReturnType<typeof getSubscription>>>;

export interface CreditBalance {
  planCredits: number;
  topupCredits: number;
}

export interface CreditChange {
  planDelta: number;
  topupDelta: number;
}

export interface AdjustCreditsInput {
  userId: string;
  type: CreditEntryType;
  idempotencyKey: string;
  action?: string;
  requestId?: string;
  metadata?: Prisma.InputJsonValue;
  /**
   * Decides the change from the balance as it is *inside the lock*. Returning
   * null refuses the change (insufficient credits).
   */
  compute: (current: CreditBalance) => CreditChange | null;
}

export type AdjustCreditsResult =
  | { status: 'applied'; change: CreditChange; balance: CreditBalance }
  /** The key was already used; nothing changed. `change` is what it did the first time. */
  | { status: 'duplicate'; change: CreditChange; balance: CreditBalance }
  | { status: 'refused'; balance: CreditBalance };

export async function getSubscription(userId: string) {
  return prisma.subscription.findUnique({ where: { userId } });
}

export async function findSubscriptionByRazorpayId(razorpaySubscriptionId: string) {
  return prisma.subscription.findFirst({
    where: {
      OR: [{ razorpaySubscriptionId }, { checkoutSubscriptionId: razorpaySubscriptionId }],
    },
  });
}

/**
 * Creates the trial row for a first-time member. Safe to race: the unique
 * `user_id` makes the loser's insert fail, and it returns the winner's row.
 */
export async function createTrialSubscription(userId: string, trialEndsAt: Date) {
  try {
    return await prisma.subscription.create({
      data: { userId, planId: 'trial', status: 'TRIALING', trialEndsAt },
    });
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error;
    const existing = await getSubscription(userId);
    if (!existing) throw error;
    return existing;
  }
}

export async function updateSubscription(userId: string, data: Prisma.SubscriptionUpdateInput) {
  return prisma.subscription.update({ where: { userId }, data });
}

export async function setSubscriptionStatus(userId: string, status: SubscriptionStatus, extra: Prisma.SubscriptionUpdateInput = {}) {
  return prisma.subscription.update({ where: { userId }, data: { status, ...extra } });
}

export async function getCreditBalance(userId: string): Promise<CreditBalance> {
  const row = await prisma.creditAccount.findUnique({ where: { userId } });
  return { planCredits: row?.planCredits ?? 0, topupCredits: row?.topupCredits ?? 0 };
}

export async function getLedgerEntryByKey(idempotencyKey: string) {
  return prisma.creditLedgerEntry.findUnique({ where: { idempotencyKey } });
}

export async function adjustCredits(input: AdjustCreditsInput): Promise<AdjustCreditsResult> {
  return prisma.$transaction(async (tx) => {
    // The account row must exist to be locked.
    await tx.$executeRaw`
      INSERT INTO credit_accounts (user_id) VALUES (${input.userId}::uuid)
      ON CONFLICT (user_id) DO NOTHING`;

    const locked = await tx.$queryRaw<Array<{ plan_credits: number; topup_credits: number }>>`
      SELECT plan_credits, topup_credits FROM credit_accounts
      WHERE user_id = ${input.userId}::uuid FOR UPDATE`;
    const current: CreditBalance = {
      planCredits: locked[0]?.plan_credits ?? 0,
      topupCredits: locked[0]?.topup_credits ?? 0,
    };

    const prior = await tx.creditLedgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (prior) {
      return {
        status: 'duplicate' as const,
        change: { planDelta: prior.planDelta, topupDelta: prior.topupDelta },
        balance: current,
      };
    }

    const change = input.compute(current);
    if (!change) return { status: 'refused' as const, balance: current };

    const next = {
      planCredits: current.planCredits + change.planDelta,
      topupCredits: current.topupCredits + change.topupDelta,
    };
    // Checked here for a clean refusal; the CHECK constraint still backstops it.
    if (next.planCredits < 0 || next.topupCredits < 0) return { status: 'refused' as const, balance: current };

    await tx.creditAccount.update({
      where: { userId: input.userId },
      data: { planCredits: next.planCredits, topupCredits: next.topupCredits },
    });
    await tx.creditLedgerEntry.create({
      data: {
        userId: input.userId,
        type: input.type,
        planDelta: change.planDelta,
        topupDelta: change.topupDelta,
        idempotencyKey: input.idempotencyKey,
        ...(input.action && { action: input.action }),
        ...(input.requestId && { requestId: input.requestId }),
        ...(input.metadata !== undefined && { metadata: input.metadata }),
      },
    });
    return { status: 'applied' as const, change, balance: next };
  });
}

/** Refunded generations today, for the daily failure ceiling. */
export async function countRefundsSince(userId: string, since: Date): Promise<number> {
  return prisma.creditLedgerEntry.count({ where: { userId, type: 'REFUND', createdAt: { gte: since } } });
}

export async function listLedger(userId: string, limit = 50) {
  return prisma.creditLedgerEntry.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, type: true, planDelta: true, topupDelta: true, action: true, createdAt: true },
  });
}

export async function upsertPayment(input: {
  userId: string;
  razorpayPaymentId: string;
  razorpayOrderId?: string | null;
  razorpaySubscriptionId?: string | null;
  razorpayInvoiceId?: string | null;
  kind: 'subscription' | 'topup';
  planId?: string | null;
  amountPaise: number;
  currency?: string;
  status: 'captured' | 'failed' | 'refunded';
}) {
  const { razorpayPaymentId, ...rest } = input;
  return prisma.billingPayment.upsert({
    where: { razorpayPaymentId },
    create: { razorpayPaymentId, ...rest },
    update: { status: rest.status },
  });
}

export async function listPayments(userId: string, limit = 24) {
  return prisma.billingPayment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, kind: true, planId: true, amountPaise: true, currency: true, status: true, createdAt: true, razorpayInvoiceId: true },
  });
}

/**
 * Records a webhook delivery before it is processed. `fresh` is false for a
 * redelivery that already finished; a redelivery of one that failed comes back
 * fresh so it is retried.
 */
export async function recordWebhookEvent(id: string, eventType: string, payload: object): Promise<{ fresh: boolean }> {
  try {
    await prisma.billingWebhookEvent.create({ data: { id, eventType, payload: payload as Prisma.InputJsonValue } });
    return { fresh: true };
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error;
    const existing = await prisma.billingWebhookEvent.findUnique({ where: { id } });
    return { fresh: !existing?.processedAt };
  }
}

export async function markWebhookProcessed(id: string, error?: string) {
  await prisma.billingWebhookEvent.update({
    where: { id },
    data: error ? { error: error.slice(0, 500) } : { processedAt: new Date(), error: null },
  });
}

export const billingRepository = {
  getSubscription,
  findSubscriptionByRazorpayId,
  createTrialSubscription,
  updateSubscription,
  setSubscriptionStatus,
  getCreditBalance,
  getLedgerEntryByKey,
  adjustCredits,
  countRefundsSince,
  listLedger,
  upsertPayment,
  listPayments,
  recordWebhookEvent,
  markWebhookProcessed,
};
