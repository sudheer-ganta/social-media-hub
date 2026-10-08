import { describe, expect, it } from 'vitest';
import {
  BILLING_INTERVALS, CREDIT_COSTS, PAID_PLAN_IDS, PLANS, TOPUP_PACK, creditCost, planRank, priceFor,
} from './plans';

/**
 * Margin guard. These constants are the pricing assumptions; when the measured
 * cost per render (ai_usage_events, now that tokens are logged) moves, change them
 * here and this test says whether the catalogue still earns money.
 */
const RUPEES_PER_FULL_RENDER = 17;          // measured estimate, Oct 2026
const RUPEES_PER_FULL_RENDER_2027 = 25;     // after Gemini 3.6 Flash promo pricing ends
const GST = 0.18;                           // prices are treated as GST-inclusive
const MAX_AI_SHARE_MONTHLY = 0.40;          // AI cost as a share of net revenue, if every credit is used
const MAX_AI_SHARE_YEARLY = 0.45;           // yearly plans bill 10 months for 12

const costPerCredit = (rupeesPerRender: number) => rupeesPerRender / CREDIT_COSTS.generate;
const netPaise = (grossPaise: number) => grossPaise / (1 + GST);

describe('plan catalogue', () => {
  it('prices every paid plan for both intervals, and yearly is ten months', () => {
    for (const id of PAID_PLAN_IDS) {
      for (const interval of BILLING_INTERVALS) expect(priceFor(id, interval)).toBeGreaterThan(0);
      expect(PLANS[id].priceYearlyPaise).toBe(PLANS[id].priceMonthlyPaise! * 10);
    }
  });

  it('gets strictly more of everything as the plan goes up', () => {
    const order = ['trial', 'starter', 'pro', 'agency'] as const;
    for (let i = 1; i < order.length; i += 1) {
      const lower = PLANS[order[i - 1]!].limits;
      const higher = PLANS[order[i]!].limits;
      expect(higher.monthlyCredits).toBeGreaterThan(lower.monthlyCredits);
      expect(higher.maxSocialAccounts).toBeGreaterThan(lower.maxSocialAccounts);
      expect(planRank(order[i]!)).toBeGreaterThan(planRank(order[i - 1]!));
    }
  });

  it('charges a campaign per variation', () => {
    expect(creditCost('campaignVariation', 3)).toBe(3 * CREDIT_COSTS.campaignVariation);
    expect(creditCost('campaignVariation', 0)).toBe(CREDIT_COSTS.campaignVariation);
  });

  it('makes upgrading cheaper per credit than topping up', () => {
    const topupPerCredit = TOPUP_PACK.pricePaise / TOPUP_PACK.credits;
    for (const id of PAID_PLAN_IDS) {
      const planPerCredit = PLANS[id].priceMonthlyPaise! / PLANS[id].limits.monthlyCredits;
      expect(topupPerCredit).toBeGreaterThan(planPerCredit);
    }
  });
});

describe('plan margins (AI cost if every credit were spent)', () => {
  for (const id of PAID_PLAN_IDS) {
    it(`${id} monthly stays under ${MAX_AI_SHARE_MONTHLY * 100}% of net revenue`, () => {
      const aiCost = PLANS[id].limits.monthlyCredits * costPerCredit(RUPEES_PER_FULL_RENDER) * 100;
      expect(aiCost / netPaise(PLANS[id].priceMonthlyPaise!)).toBeLessThanOrEqual(MAX_AI_SHARE_MONTHLY);
    });

    it(`${id} yearly stays under ${MAX_AI_SHARE_YEARLY * 100}% of net revenue`, () => {
      const aiCostPerMonth = PLANS[id].limits.monthlyCredits * costPerCredit(RUPEES_PER_FULL_RENDER) * 100;
      const netPerMonth = netPaise(PLANS[id].priceYearlyPaise!) / 12;
      expect(aiCostPerMonth / netPerMonth).toBeLessThanOrEqual(MAX_AI_SHARE_YEARLY);
    });

    it(`${id} still makes money in 2027 even at full use`, () => {
      const aiCost = PLANS[id].limits.monthlyCredits * costPerCredit(RUPEES_PER_FULL_RENDER_2027) * 100;
      expect(aiCost).toBeLessThan(netPaise(PLANS[id].priceMonthlyPaise!));
    });
  }

  it('a top-up pack is profitable', () => {
    const aiCost = TOPUP_PACK.credits * costPerCredit(RUPEES_PER_FULL_RENDER_2027) * 100;
    expect(aiCost).toBeLessThan(netPaise(TOPUP_PACK.pricePaise) * 0.6);
  });
});
