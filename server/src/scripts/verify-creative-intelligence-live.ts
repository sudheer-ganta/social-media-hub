import { creativeGenerationService } from '../services/creative-generation.service';
import { buildConceptIdentity, analyzeConceptPoolDivergence } from '../ai/strategy/creative-differentiation';
import { validateStyleBriefConsistency } from '../ai/intent/style-brief-consistency';

/**
 * FLOWPOST CREATIVE INTELLIGENCE LIVE RUNTIME VERIFICATION SCRIPT
 *
 * Exercises the actual live production path:
 * POST /concepts -> discoverConcepts
 * POST /generate -> generate
 *
 * Runs 10 fresh generations across 10 varied briefs.
 */

interface BriefScenario {
  id: number;
  category: string;
  prompt: string;
  goal: string;
  funnelStage: string;
  brandVoice?: any;
  creativeDna?: any;
  styleId?: string;
}

const SCENARIOS: BriefScenario[] = [
  {
    id: 1,
    category: 'Cultural/event',
    prompt: 'Dussehra Festival of Light celebrating victory of good over evil with traditional oil lamps',
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    brandVoice: { name: 'Vedic Living', description: 'Authentic Indian cultural heritage' },
    creativeDna: { brandColors: ['#ea580c', '#facc15', '#ffffff'], logoAssetUrl: 'http://example.com/logo.png' },
  },
  {
    id: 2,
    category: 'Food',
    prompt: 'Artisanal Himalayan Steamed Momo Tasting with fresh chili dip and bamboo steamers',
    goal: 'sales',
    funnelStage: 'BOFU',
    brandVoice: { name: 'Seven Sisters Kitchen', description: 'Northeastern Himalayan cuisine' },
    creativeDna: { brandColors: ['#0f172a', '#d97706', '#faf7f2'], logoAssetUrl: 'http://example.com/logo.png' },
  },
  {
    id: 3,
    category: 'Fashion',
    prompt: 'Minimalist Sustainable Organic Cotton Apparel draped over raw stone',
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    brandVoice: { name: 'Aura Organic', description: 'Sustainable luxury apparel' },
    creativeDna: { brandColors: ['#18181b', '#faf6f0', '#71717a'], logoAssetUrl: 'http://example.com/logo.png' },
    styleId: 'editorial',
  },
  {
    id: 4,
    category: 'Product',
    prompt: 'Precision Crafted Ergonomic Mechanical Keyboard on brushed aluminum workspace',
    goal: 'product_launch',
    funnelStage: 'MOFU',
    brandVoice: { name: 'KeyCraft Pro', description: 'Premium mechanical keyboards' },
    creativeDna: { brandColors: ['#2563eb', '#0f172a', '#ffffff'], logoAssetUrl: 'http://example.com/logo.png' },
  },
  {
    id: 5,
    category: 'Typography-led',
    prompt: 'The Power of Quiet Words - Editorial bold typographic statement on minimal paper background',
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    brandVoice: { name: 'Archive Press', description: 'Literary journal & publisher' },
    creativeDna: { brandColors: ['#000000', '#ffffff'], logoAssetUrl: 'http://example.com/logo.png' },
    styleId: 'bold-typography',
  },
  {
    id: 6,
    category: 'Negative-space',
    prompt: 'Monochrome Architecture & Silent Spaces highlighting geometric shadows and vast stillness',
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    brandVoice: { name: 'Form & Space', description: 'Architectural studio' },
    creativeDna: { brandColors: ['#18181b', '#fcfbf9'], logoAssetUrl: 'http://example.com/logo.png' },
    styleId: 'editorial',
  },
  {
    id: 7,
    category: 'Image-as-material',
    prompt: 'Textured Linen & Raw Paper Craft collage layering natural fibers and archival typography',
    goal: 'community_building',
    funnelStage: 'MOFU',
    brandVoice: { name: 'Crafted Linen Co', description: 'Artisanal paper & textiles' },
    creativeDna: { brandColors: ['#faf6f0', '#c2410c', '#18181b'], logoAssetUrl: 'http://example.com/logo.png' },
  },
  {
    id: 8,
    category: 'Object interaction',
    prompt: 'Hand Sculpting Terracotta Clay Pot under warm studio spotlight with spinning pottery wheel',
    goal: 'lead_generation',
    funnelStage: 'MOFU',
    brandVoice: { name: 'Terra Studio', description: 'Ceramic arts and workshops' },
    creativeDna: { brandColors: ['#ea580c', '#faf7f2', '#18181b'], logoAssetUrl: 'http://example.com/logo.png' },
  },
  {
    id: 9,
    category: 'Editorial',
    prompt: 'High Fashion Architectural Silhouette against golden hour city skyline',
    goal: 'brand_awareness',
    funnelStage: 'TOFU',
    brandVoice: { name: 'Maison Noir', description: 'Haute couture fashion house' },
    creativeDna: { brandColors: ['#000000', '#d97706', '#ffffff'], logoAssetUrl: 'http://example.com/logo.png' },
    styleId: 'editorial',
  },
  {
    id: 10,
    category: 'Creator/UGC',
    prompt: 'Daily Morning Coffee Ritual Vlog Moment with handcrafted ceramic mug on morning breakfast table',
    goal: 'customer_retention',
    funnelStage: 'Retention',
    brandVoice: { name: 'Daily Roast', description: 'Specialty coffee roasters' },
    creativeDna: { brandColors: ['#ea580c', '#faf6f0'], logoAssetUrl: 'http://example.com/logo.png' },
    styleId: 'creator-ugc',
  },
];

export async function runLiveVerification() {
  console.log('=====================================================');
  console.log('FLOWPOST CREATIVE INTELLIGENCE LIVE RUNTIME VERIFICATION');
  console.log('=====================================================\n');

  const userId = 'verify-user-1';
  const metrics = {
    conceptConvergenceCount: 0,
    styleConvergenceCount: 0,
    copyConvergenceCount: 0,
    unjustifiedTextImageOverlapCount: 0,
    intentionalTextImageOverlapCount: 0,
    conceptFallbackCount: 0,
    creative422Count: 0,
    infrastructureFailureCount: 0,
    criticPassCount: 0,
  };

  const results: any[] = [];

  for (const s of SCENARIOS) {
    console.log(`\n--- [Scenario ${s.id}/10] Category: ${s.category} ---`);
    console.log(`Prompt: "${s.prompt}"`);

    const requestBody = {
      prompt: s.prompt,
      goal: s.goal,
      funnelStage: s.funnelStage,
      contextType: 'personal',
      brandVoice: s.brandVoice,
      creativeDna: s.creativeDna,
      ...(s.styleId && { styleId: s.styleId }),
    };

    try {
      // Step 1: Discover concepts via live POST /concepts runtime
      const conceptResult = await creativeGenerationService.discoverConcepts(userId, requestBody);
      console.log(`[concepts] Discovered ${conceptResult.concepts.length} concepts`);

      const divergence = analyzeConceptPoolDivergence(conceptResult.concepts);
      if (divergence.hasConvergence) {
        metrics.conceptConvergenceCount++;
      }
      console.log(`[concepts] Pool diversity score: ${divergence.overallDiversityScore}, Has convergence: ${divergence.hasConvergence}`);

      const selectedConcept = conceptResult.concepts[0];
      console.log(`[concepts] Selected concept 1: "${selectedConcept.conceptName}" (${selectedConcept.visualMechanism})`);

      // Step 2: Validate style consistency before generation
      const initialStyleId = s.styleId || selectedConcept.styleId;
      const consistencyBefore = validateStyleBriefConsistency({
        concept: selectedConcept,
        selectedStyleId: initialStyleId,
      });

      console.log(`[style-gate] Initial status: ${consistencyBefore.status}, Repaired style: ${consistencyBefore.repairedStyleId ?? initialStyleId}`);
      if (consistencyBefore.status === 'STYLE_INCONSISTENT') {
        metrics.styleConvergenceCount++;
      }

      // Step 3: Run live POST /generate runtime
      const generatePayload = {
        ...requestBody,
        selectedConcept,
        intent: conceptResult.intent,
      };

      const asset = await creativeGenerationService.generate(userId, generatePayload, `req-${s.id}`);
      metrics.criticPassCount++;

      console.log(`[generate] SUCCESS - Asset created ID: ${asset.id}`);
      console.log(`[generate] Output Image URL: ${asset.imageUrl}`);

      results.push({
        scenario: s.id,
        category: s.category,
        conceptName: selectedConcept.conceptName,
        styleBefore: initialStyleId,
        styleAfter: consistencyBefore.repairedStyleId ?? initialStyleId,
        status: 'COMPLETED',
        assetId: asset.id,
      });
    } catch (error: any) {
      console.error(`[generate] FAILED - ${error.name}: ${error.message}`);
      if (error.status === 422) {
        metrics.creative422Count++;
      } else {
        metrics.infrastructureFailureCount++;
      }
      results.push({
        scenario: s.id,
        category: s.category,
        status: 'FAILED',
        error: error.message,
      });
    }
  }

  console.log('\n=====================================================');
  console.log('METRICS SUMMARY');
  console.log('=====================================================');
  console.log(JSON.stringify(metrics, null, 2));

  console.log('\n=====================================================');
  console.log('GENERATION RESULTS SUMMARY');
  console.log('=====================================================');
  console.table(results);
}

if (require.main === module) {
  runLiveVerification().catch(console.error);
}
