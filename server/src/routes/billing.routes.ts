import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { UserFacingError } from '../utils/user-facing-error';
import { billingService, BillingError, WebhookSignatureError } from '../services/billing.service';
import { isRazorpayConfigured } from '../billing/razorpay.client';
import { CREDIT_COSTS, PLANS, TOPUP_PACK, TRIAL_DAYS } from '../billing/plans';

/**
 * Billing API. Mounted at `/api/billing`.
 *
 *   GET  /plans             the catalogue, prices and credit costs (public)
 *   GET  /me                this member's plan, limits and credit balance
 *   GET  /history           payments and credit ledger
 *   POST /checkout          start a subscription -> what Razorpay Checkout needs
 *   POST /checkout/confirm  checkout succeeded -> verify and activate early
 *   POST /change-plan       move between paid plans
 *   POST /cancel            cancel at the end of the paid period
 *   POST /topup             start a credit-pack purchase
 *   POST /topup/confirm     top-up succeeded -> verify and credit
 *
 * The webhook is a separate router (`billingWebhookRouter`) because it needs the
 * raw request body and no member session: Razorpay authenticates itself with a
 * signature, not a token.
 */

const router = Router();

function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof UserFacingError || error instanceof BillingError) {
        res.status(error.status).json({ error: error.message, code: error instanceof BillingError ? error.code : undefined });
        return;
      }
      // An unexpected error can quote a query or a provider response; keep it in the log.
      console.error('[billing] request failed', { method: req.method, path: req.path, error: error instanceof Error ? error.message : error });
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  };
}

const str = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);

router.get('/plans', (_req, res) => {
  const plans = Object.values(PLANS).map((plan) => ({
    id: plan.id,
    name: plan.name,
    tagline: plan.tagline,
    priceMonthlyPaise: plan.priceMonthlyPaise,
    priceYearlyPaise: plan.priceYearlyPaise,
    limits: plan.limits,
    highlights: plan.highlights,
  }));
  res.json({ plans, topupPack: TOPUP_PACK, creditCosts: CREDIT_COSTS, trialDays: TRIAL_DAYS, paymentsConfigured: isRazorpayConfigured() });
});

router.get('/me', requireAuth, handle(async (req, res) => {
  res.json(await billingService.getOverview(req.user.id));
}));

router.get('/history', requireAuth, handle(async (req, res) => {
  const [payments, credits] = await Promise.all([
    billingService.listPayments(req.user.id),
    billingService.listLedger(req.user.id),
  ]);
  res.json({ payments, credits });
}));

router.post('/checkout', requireAuth, handle(async (req, res) => {
  res.json(await billingService.startCheckout(req.user.id, req.body?.plan, req.body?.interval));
}));

router.post('/checkout/confirm', requireAuth, handle(async (req, res) => {
  res.json(await billingService.confirmCheckout(req.user.id, {
    paymentId: str(req.body?.razorpay_payment_id),
    subscriptionId: str(req.body?.razorpay_subscription_id),
    signature: str(req.body?.razorpay_signature),
  }));
}));

router.post('/change-plan', requireAuth, handle(async (req, res) => {
  res.json(await billingService.changePlan(req.user.id, req.body?.plan));
}));

router.post('/cancel', requireAuth, handle(async (req, res) => {
  res.json(await billingService.cancel(req.user.id));
}));

router.post('/topup', requireAuth, handle(async (req, res) => {
  res.json(await billingService.startTopup(req.user.id));
}));

router.post('/topup/confirm', requireAuth, handle(async (req, res) => {
  res.json(await billingService.confirmTopup(req.user.id, {
    orderId: str(req.body?.razorpay_order_id),
    paymentId: str(req.body?.razorpay_payment_id),
    signature: str(req.body?.razorpay_signature),
  }));
}));

export default router;

/**
 * Razorpay's server-to-server events. Mounted with `express.raw` ahead of the
 * JSON parser in app.ts: the signature is over the exact bytes, and parsing then
 * re-serialising would change them.
 *
 * Status codes matter here. 200 means "received, stop retrying"; 400 is a bad
 * signature (nobody should retry that); 500 asks Razorpay to retry, which is the
 * right answer when our own processing failed.
 */
export const billingWebhookRouter = Router();

billingWebhookRouter.post('/', async (req: Request, res: Response) => {
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    await billingService.handleWebhook(
      raw,
      req.header('x-razorpay-signature') ?? undefined,
      req.header('x-razorpay-event-id') ?? undefined,
    );
    res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }
    console.error('[billing] webhook processing failed', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});
