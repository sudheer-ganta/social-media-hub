import { describe, it, expect } from 'vitest';
import {
  buildImageRealizationSpec,
  compileImagePromptFromSpec,
  deriveCopyLoadProfile,
  deriveReadingSpaceRequirement,
  deriveTextImageRelationship,
  detectTextRelationshipMode,
  ImageRealizationSpec
} from './image-realization-spec';

describe('ImageRealizationSpec Suite', () => {
  it('correctly derives copyLoadProfile from counts and boolean flags', () => {
    expect(deriveCopyLoadProfile(1, false, false, false)).toBe('PRIMARY_ONLY');
    expect(deriveCopyLoadProfile(2, true, false, false)).toBe('PRIMARY_PLUS_SUPPORT');
    expect(deriveCopyLoadProfile(3, true, true, false)).toBe('PRIMARY_SUPPORT_CTA');
    expect(deriveCopyLoadProfile(4, true, true, true)).toBe('MULTI_TEXT');
  });

  it('derives readingSpaceRequirement appropriately', () => {
    expect(deriveReadingSpaceRequirement('PRIMARY_ONLY', 'OVERLAY_INTENTIONAL')).toBe('MINIMAL');
    expect(deriveReadingSpaceRequirement('PRIMARY_PLUS_SUPPORT', 'OVERLAY_INTENTIONAL')).toBe('MODERATE');
    expect(deriveReadingSpaceRequirement('PRIMARY_SUPPORT_CTA', 'OVERLAY_INTENTIONAL')).toBe('LARGE');
    expect(deriveReadingSpaceRequirement('MULTI_TEXT', 'OVERLAY_INTENTIONAL')).toBe('MULTI_REGION');
    expect(deriveReadingSpaceRequirement('PRIMARY_SUPPORT_CTA', 'SEPARATED')).toBe('MINIMAL');
  });

  it('detects textRelationshipMode distinguishing diegetic vs marketing text', () => {
    // Standard concept with no diegetic requirement
    const marketingMode = detectTextRelationshipMode('Shadow forms diya pattern', 'Handmade clay lamp', 'Warm festive scene');
    expect(marketingMode.mode).toBe('FLOWPOST_MARKETING_TEXT');
    expect(marketingMode.guidance).toContain('typeset by FlowPost');

    // Diegetic in-scene text concept (e.g. coffee shop storefront sign)
    const diegeticMode1 = detectTextRelationshipMode('Storefront signage with name visible', 'Bakery facade', 'Morning sunlight');
    expect(diegeticMode1.mode).toBe('IMAGE_DIEGETIC_TEXT');

    const diegeticMode2 = detectTextRelationshipMode('Handmade mug', 'Packaging label with logo', 'Artisan workshop');
    expect(diegeticMode2.mode).toBe('IMAGE_DIEGETIC_TEXT');
  });

  it('builds a complete ImageRealizationSpec without dropping hero, imageRole, or affordance', () => {
    const spec = buildImageRealizationSpec({
      concept: {
        id: 'c1',
        conceptName: 'Festive Diya Radiance',
        creativeMechanism: 'Shadow and warm light cast intricate festive shapes',
        dominantVisualObject: 'Handmade clay diya lamp with golden flame',
        hero: 'image',
        imageRole: 'hero',
        imageBehavior: 'Full-bleed atmospheric ground',
        artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY'
      } as any,
      styleDna: {
        style: {
          id: 'warm-editorial',
          name: 'Warm Editorial',
          description: 'Deep warm shadows and golden hour lighting',
        }
      } as any,
      direction: {
        headline: 'Celebrate the Festival of Lights',
        supportingLine: 'Handcrafted traditional brass and terracotta collection',
        cta: 'Discover the Collection',
        dominantVisualObject: 'Clay Diya',
        spatialRelationship: 'PRIMARY_FOCAL_HERO',
        visualStory: 'Natural sunlight cast through brass cutout creating shadow pattern',
      } as any,
      copySummary: {
        copyCount: 3,
        hasHeadline: true,
        hasSupport: true,
        hasCta: true,
        hasBadge: false,
      },
      attemptId: 0,
      requestId: 'req-123'
    });

    expect(spec.conceptId).toBe('c1');
    expect(spec.conceptName).toBe('Festive Diya Radiance');
    expect(spec.dominantVisualObject).toBe('Handmade clay diya lamp with golden flame');
    expect(spec.hero).toBe('image');
    expect(spec.imageRole).toBe('hero');
    expect(spec.imageBehavior).toBe('Full-bleed atmospheric ground');
    expect(spec.copyLoadProfile).toBe('PRIMARY_SUPPORT_CTA');
    expect(spec.readingSpaceRequirement).toBe('LARGE');
    expect(spec.prohibitedVisualInterpretations).toContain('Generic AI 3D extruded lettering with texture on surface');
  });

  it('compiles prompt containing visual intent, affordance, and naturalness without exact coordinates or font sizes', () => {
    const spec = buildImageRealizationSpec({
      concept: {
        id: 'c2',
        conceptName: 'Artisan Workshop',
        creativeMechanism: 'Hands molding terracotta pot on spinning wheel',
        dominantVisualObject: 'Artisan hands shaping terracotta clay',
        hero: 'image',
        imageRole: 'hero',
        imageBehavior: 'Full-bleed atmospheric ground'
      } as any,
      direction: {
        headline: 'Authentic Craftsmanship'
      } as any
    });

    const prompt = compileImagePromptFromSpec(spec);

    // Verifies key prompt structures
    expect(prompt).toContain('DOMINANT SUBJECT:');
    expect(prompt).toContain('Artisan hands shaping terracotta clay');
    expect(prompt).toContain('CREATIVE MECHANISM:');
    expect(prompt).toContain('Hands molding terracotta pot on spinning wheel');
    expect(prompt).toContain('COMPOSITION AFFORDANCE & SPATIAL INTENT:');
    expect(prompt).toContain('NATURAL CRAFT & PHYSICAL PLAUSIBILITY:');
    expect(prompt).toContain('TYPOGRAPHY & TEXT RULES:');
    expect(prompt).toContain('Marketing typography will be typeset by FlowPost over the image.');

    // Asserts no exact coordinates or font sizes are leaked into the image model
    expect(prompt).not.toMatch(/\b\d+px\b/i);
    expect(prompt).not.toMatch(/\bx=\s*0\.\d+/i);
    expect(prompt).not.toMatch(/\by=\s*0\.\d+/i);
    expect(prompt).not.toMatch(/\bfont-family\b/i);
  });

  it('allows diegetic text in prompt when textRelationshipMode is IMAGE_DIEGETIC_TEXT', () => {
    const spec = buildImageRealizationSpec({
      concept: {
        id: 'c3',
        conceptName: 'Vintage Cafe Storefront',
        creativeMechanism: 'Morning sunlight hits storefront signage and wooden door',
        dominantVisualObject: 'Cozy rustic bakery storefront signage',
        hero: 'image',
        imageRole: 'full-bleed',
        imageBehavior: 'Full-bleed atmospheric ground'
      } as any,
      direction: {
        headline: 'Fresh Pastries Daily'
      } as any
    });

    const prompt = compileImagePromptFromSpec(spec);
    expect(prompt).toContain('TYPOGRAPHY & TEXT RULES: Environmental in-scene text on storefront');
    expect(prompt).toContain('Do NOT add marketing headlines, slogan overlays, or CTA buttons.');
  });
});
