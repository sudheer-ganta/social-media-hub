/**
 * Dogfood round 4 — art-direction diversity. Real Gemini concept generation
 * only (no image render, no Cloudinary/DB persistence — discoverConcepts()
 * touches neither), checking whether concepts for the SAME request spread
 * across genuinely different art-direction families instead of collapsing
 * into one repeated visual template.
 *
 *   cd server && npx ts-node --transpile-only src/scripts/verify-dogfood-4-diversity.ts <userId>
 */
import { creativeGenerationService } from '../services/creative-generation.service';
import type { ScoredCreativeConcept } from '../ai/types';

const userId = process.argv[2] || 'dogfood-diversity-check';

interface Scenario {
  name: string;
  prompt: string;
  brandName: string;
  industry?: string;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'FlowPost test (spec §10)',
    prompt: 'Promote FlowPost and show why managing multiple social platforms is unnecessary.',
    brandName: 'FlowPost',
    industry: 'Social media management software',
  },
  {
    name: 'Seven Sisters (spec §9 benchmark brand)',
    prompt: 'Create a memorable campaign for our momo dish. Make it playful, clever and food-focused.',
    brandName: 'Seven Sisters',
    industry: 'Food / Restaurant (Northeast Indian cuisine)',
  },
];

function report(concepts: ScoredCreativeConcept[], proposedCount: number) {
  console.log(`  proposed: ${proposedCount}, kept after quality gate: ${concepts.length}`);
  concepts.forEach((c, i) => {
    console.log(
      `  ${i + 1}. "${c.conceptName}" — mechanism: ${c.visualMechanism} | mode: ${c.mode} | family: ${c.artDirectionFamily} | templateRisk: ${c.scores.templateRisk}`,
    );
  });
  const families = new Set(concepts.map((c) => c.artDirectionFamily));
  const mechanisms = new Set(concepts.map((c) => c.visualMechanism));
  console.log(`  → distinct art-direction families: ${families.size}/${concepts.length}`);
  console.log(`  → distinct mechanisms: ${mechanisms.size}/${concepts.length}`);
}

async function run() {
  for (const scenario of SCENARIOS) {
    console.log('\n' + '='.repeat(70) + `\n${scenario.name} — "${scenario.prompt}"\n` + '='.repeat(70));
    const { concepts, proposedCount } = await creativeGenerationService.discoverConcepts(userId, {
      prompt: scenario.prompt,
      contextType: 'personal',
      brandVoice: { name: scenario.brandName, industry: scenario.industry },
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: ['instagram'],
    });
    report(concepts, proposedCount);
  }
}

run().catch((error) => {
  console.error('verify-dogfood-4-diversity failed:', error);
  process.exit(1);
});
