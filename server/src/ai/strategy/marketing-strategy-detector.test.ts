import { describe, it, expect } from 'vitest';
import { detectMarketingStrategy } from './marketing-strategy-detector';

describe('detectMarketingStrategy', () => {
  it('detects Sales / BOFU for discount and flash sale prompts', () => {
    const result = detectMarketingStrategy('50% off weekend flash sale on our entire summer line');
    expect(result.goal).toBe('sales');
    expect(result.funnelStage).toBe('BOFU');
  });

  it('detects Brand Awareness / TOFU for behind-the-scenes and brand craft storytelling', () => {
    const result = detectMarketingStrategy('Meet the chefs crafting our ramen in the kitchen');
    expect(result.goal).toBe('brand_awareness');
    expect(result.funnelStage).toBe('TOFU');
  });

  it('detects Event Promotion / MOFU for anniversary and milestone events', () => {
    const result = detectMarketingStrategy('SevenSisters 3rd Anniversary celebration this weekend');
    expect(result.goal).toBe('event_promotion');
    expect(result.funnelStage).toBe('MOFU');
  });

  it('detects Bookings / BOFU for reservation prompts', () => {
    const result = detectMarketingStrategy('Reserve a table for tonight’s wine tasting dinner');
    expect(result.goal).toBe('bookings');
    expect(result.funnelStage).toBe('BOFU');
  });

  it('detects Product Launch / MOFU for new product drops', () => {
    const result = detectMarketingStrategy('Introducing our new autumn wool overcoat collection drop');
    expect(result.goal).toBe('product_launch');
    expect(result.funnelStage).toBe('MOFU');
  });

  it('defaults to Brand Awareness / TOFU for general aesthetic briefs', () => {
    const result = detectMarketingStrategy('A minimal quiet-luxury aesthetic poster with natural lighting');
    expect(result.goal).toBe('brand_awareness');
    expect(result.funnelStage).toBe('TOFU');
  });
});
