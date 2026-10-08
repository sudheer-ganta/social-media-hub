/**
 * Creates the Razorpay plans for every (plan, interval) in billing/plans.ts and
 * prints the environment lines to paste into server/.env.
 *
 *   npm run billing:sync-plans            # dry run: shows what it would create
 *   npm run billing:sync-plans -- --apply # creates them in the Razorpay account
 *
 * Razorpay plans are immutable, so changing a price means creating a new plan
 * and pointing the env var at it. Existing subscribers stay on the plan they
 * bought. Run it against `rzp_test_` keys first — test and live are separate
 * accounts, so the live plan ids have to be created again with live keys.
 *
 * Already-set RAZORPAY_PLAN_* values are left alone and reported, never
 * recreated, so running it twice does not litter the dashboard with duplicates.
 */
import { env } from '../config/env';
import { BILLING_INTERVALS, PAID_PLAN_IDS, PLANS, priceFor } from '../billing/plans';
import { isRazorpayConfigured, razorpay } from '../billing/razorpay.client';

async function main() {
  const apply = process.argv.includes('--apply');
  if (!isRazorpayConfigured()) {
    console.error('Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env first.');
    process.exit(1);
  }
  const mode = env.RAZORPAY_KEY_ID.startsWith('rzp_live_') ? 'LIVE' : 'TEST';
  console.log(`Razorpay mode: ${mode}${apply ? '' : '  (dry run — pass --apply to create)'}\n`);

  const lines: string[] = [];
  for (const planId of PAID_PLAN_IDS) {
    for (const interval of BILLING_INTERVALS) {
      const key = `${planId}_${interval}`;
      const variable = `RAZORPAY_PLAN_${planId.toUpperCase()}_${interval.toUpperCase()}`;
      const amount = priceFor(planId, interval);
      const existing = env.RAZORPAY_PLAN_IDS[key];

      if (existing) {
        console.log(`= ${variable} already set (${existing}), skipping`);
        lines.push(`${variable}=${existing}`);
        continue;
      }
      console.log(`+ ${variable}: ${PLANS[planId].name} ${interval} at Rs ${(amount / 100).toLocaleString('en-IN')}`);
      if (!apply) continue;

      const created = await razorpay.createPlan({
        period: interval,
        interval: 1,
        item: { name: `FlowPost ${PLANS[planId].name} (${interval})`, amount, currency: 'INR', description: PLANS[planId].tagline },
        notes: { plan: planId, interval },
      });
      lines.push(`${variable}=${created.id}`);
    }
  }

  if (apply) console.log(`\nAdd to server/.env:\n\n${lines.join('\n')}\n`);
}

main().catch((error) => {
  console.error('sync failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
