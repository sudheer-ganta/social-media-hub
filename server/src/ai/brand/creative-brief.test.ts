import { describe, it, expect } from 'vitest';
import { buildCanonicalCreativeBrief } from './creative-brief';
import { resolveBrandProfile } from './brand-profile';
import { resolveCreativeDna } from './creative-dna';
import type { CreativeIntentBrief } from '../types';

describe('buildCanonicalCreativeBrief', () => {
  it('enforces campaign subject and event over uploaded product category (BTS example)', () => {
    const intent: CreativeIntentBrief = {
      extracted: true,
      event: 'BTS Return Party',
      culturalContext: 'K-pop / Korea',
      productCategory: 'Korean food',
      offer: '20% off',
      promotionType: 'event_promotion',
      venueType: 'Seoul, Korea',
      audience: 'BTS fans / global travelers',
      requiredClaims: ['BTS Return Party', '20% off', 'Korea'],
      optionalDetails: ['authentic Korean food'],
      confidence: { event: 95, offer: 95 },
    };

    const brief = buildCanonicalCreativeBrief({
      userPrompt: 'BTS return party in Korea, 20% off',
      goal: 'event_promotion',
      funnelStage: 'TOFU',
      intent,
      productAssetUrls: ['https://cdn.example.com/korean-dish.png'],
      referenceImageUrls: ['https://cdn.example.com/kpop-poster.png'],
      logoAssetUrl: 'https://cdn.example.com/logo.png',
    });

    // Subject and first read must be centered on the BTS Return Party event
    expect(brief.subject).toBe('BTS Return Party');
    expect(brief.event).toBe('BTS Return Party');
    expect(brief.offer).toBe('20% off');
    expect(brief.firstRead).toContain('BTS RETURN PARTY');
    expect(brief.firstRead).toContain('20% OFF');
    expect(brief.requiredClaims).toContain('BTS Return Party');
    expect(brief.requiredClaims).toContain('20% off');
    expect(brief.assets.productAssets.length).toBe(1);
    expect(brief.assets.logo?.url).toBe('https://cdn.example.com/logo.png');
  });

  it('correctly prioritizes travel promotion + discount offer', () => {
    const brief = buildCanonicalCreativeBrief({
      userPrompt: '20% off foreign trips',
      goal: 'sales',
      funnelStage: 'BOFU',
      productAssetUrls: ['https://cdn.example.com/travel-photo.png'],
    });

    expect(brief.offer).toBe('20% off');
    expect(brief.firstRead).toContain('20% OFF');
    expect(brief.goal).toBe('sales');
    expect(brief.funnelStage).toBe('BOFU');
  });

  it('synthesizes reasonable temporary brand DNA for new brands without prior identity', () => {
    const brief = buildCanonicalCreativeBrief({
      userPrompt: 'New sustainable activewear launch',
      goal: 'product_launch',
      funnelStage: 'TOFU',
    });

    expect(brief.brandVoice.tone).toBeDefined();
    expect(brief.brandVoice.personality.length).toBeGreaterThan(0);
    expect(brief.creativeStyle.name).toBeDefined();
  });
});
