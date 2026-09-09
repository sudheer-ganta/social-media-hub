import type { FunnelStage, MarketingGoal } from '../types';

export interface MarketingStrategyDetection {
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  reasoning: string;
}

/**
 * Auto-detects the marketing Goal and Funnel Stage from natural language prompts.
 *
 * Examples:
 * - "50% off weekend flash sale" -> Goal: 'sales', Funnel: 'BOFU'
 * - "Meet the chefs crafting our ramen" -> Goal: 'brand_awareness', Funnel: 'TOFU'
 * - "Reserve a table for tonight" -> Goal: 'bookings', Funnel: 'BOFU'
 * - "SevenSisters 3rd Anniversary event" -> Goal: 'event_promotion', Funnel: 'MOFU'
 * - "Introducing our new summer collection" -> Goal: 'product_launch', Funnel: 'MOFU'
 */
export function detectMarketingStrategy(prompt: string): MarketingStrategyDetection {
  const text = (prompt || '').trim();
  if (!text) {
    return {
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      reasoning: 'Default: Top-of-Funnel discovery & brand awareness.',
    };
  }

  // ── 1. Direct Sales & Conversions (BOFU) ──────────────────────────────────
  if (
    /\b(\d+%\s*off|\$\d+\s*off|discount|sale|clearance|flash\s*sale|bogo|buy\s*one\s*get\s*one|promo\s*code|coupon|cashback|save\s+\$?\d+|limited\s*time\s*offer|special\s*deal|special\s*offer|huge\s*savings|price\s*drop|order\s*now|shop\s*now|buy\s*now|checkout)\b/i.test(
      text,
    )
  ) {
    return {
      goal: 'sales',
      funnelStage: 'BOFU',
      reasoning: 'Detected promotional offer / discount (Bottom of Funnel).',
    };
  }

  // ── 2. Bookings & Reservations (BOFU) ─────────────────────────────────────
  if (
    /\b(book\s*now|booking|reserve|reservation|appointment|schedule|table\s*for|book\s*a\s*table|consultation|schedule\s*a\s*call|rsvp\s*now)\b/i.test(
      text,
    )
  ) {
    return {
      goal: 'bookings',
      funnelStage: 'BOFU',
      reasoning: 'Detected reservation or booking intent (Bottom of Funnel).',
    };
  }

  // ── 3. Event Promotion (MOFU) ─────────────────────────────────────────────
  if (
    /\b(event|anniversary|celebration|celebrating|fest|festival|party|gala|meetup|webinar|workshop|summit|conference|concert|gathering|doors\s*open|live\s*on|welcome\s*back|save\s*the\s*date)\b/i.test(
      text,
    )
  ) {
    return {
      goal: 'event_promotion',
      funnelStage: 'MOFU',
      reasoning: 'Detected event or milestone celebration (Middle of Funnel).',
    };
  }

  // ── 4. Product Launch & Drops (MOFU) ──────────────────────────────────────
  if (
    /\b(launch|launching|introducing|unveiling|reveal|new\s*collection|new\s*arrival|new\s*product|new\s*menu|drop|dropping|just\s*landed|preview|now\s*available)\b/i.test(
      text,
    )
  ) {
    return {
      goal: 'product_launch',
      funnelStage: 'MOFU',
      reasoning: 'Detected product drop or collection reveal (Middle of Funnel).',
    };
  }

  // ── 5. Lead Generation & Resources (MOFU) ─────────────────────────────────
  if (
    /\b(download|free\s*guide|ebook|whitepaper|register|get\s*started|free\s*trial|demo|sign\s*up\s*for\s*free)\b/i.test(
      text,
    )
  ) {
    return {
      goal: 'lead_generation',
      funnelStage: 'MOFU',
      reasoning: 'Detected lead capture / resource download offer (Middle of Funnel).',
    };
  }

  // ── 6. Newsletter / Subscription (MOFU) ───────────────────────────────────
  if (
    /\b(newsletter|subscribe|weekly\s*digest|stay\s*tuned|inbox)\b/i.test(text)
  ) {
    return {
      goal: 'newsletter',
      funnelStage: 'MOFU',
      reasoning: 'Detected newsletter subscription prompt (Middle of Funnel).',
    };
  }

  // ── 7. Website Traffic & Content (TOFU) ───────────────────────────────────
  if (
    /\b(visit\s*our\s*website|read\s*more|blog\s*post|article|check\s*out\s*the\s*link|link\s*in\s*bio|explore\s*more|read\s*the\s*full|learn\s*more)\b/i.test(
      text,
    )
  ) {
    return {
      goal: 'website_traffic',
      funnelStage: 'TOFU',
      reasoning: 'Detected content reading or website traffic driver (Top of Funnel).',
    };
  }

  // ── 8. Community & Culture (TOFU) ─────────────────────────────────────────
  if (
    /\b(community|our\s*story|behind\s*the\s*scenes|bts|meet\s*the\s*team|meet\s*the\s*chef|our\s*mission|our\s*journey|our\s*values|our\s*roots|welcome\s*to\s*the\s*family)\b/i.test(
      text,
    )
  ) {
    return {
      goal: 'community_building',
      funnelStage: 'TOFU',
      reasoning: 'Detected behind-the-scenes or brand culture storytelling (Top of Funnel).',
    };
  }

  // ── 9. Customer Retention & Loyalty (Retention) ───────────────────────────
  if (
    /\b(thank\s*you|appreciation|loyalty|members\s*only|vip|rewards|existing\s*customers)\b/i.test(
      text,
    )
  ) {
    return {
      goal: 'customer_retention',
      funnelStage: 'Retention',
      reasoning: 'Detected loyalty or customer appreciation focus (Retention).',
    };
  }

  // ── 10. Default: Brand Awareness (TOFU) ───────────────────────────────────
  return {
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    reasoning: 'Detected brand awareness and aesthetic storytelling (Top of Funnel).',
  };
}
