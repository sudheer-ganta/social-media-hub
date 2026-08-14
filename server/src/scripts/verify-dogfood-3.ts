/**
 * Dogfood round 3 — the Creative Director redesign. Real Gemini research,
 * real concept generation (3–5 genuinely different mechanisms, quality-
 * gated), real art direction of the selected concept, real image generation,
 * real Cloudinary persistence.
 *
 *   cd server && npx ts-node --transpile-only src/scripts/verify-dogfood-3.ts <userId> <outDir>
 */
import fs from 'fs';
import path from 'path';
import { creativeGenerationService } from '../services/creative-generation.service';
import type { ScoredCreativeConcept } from '../ai/types';

const userId = process.argv[2];
const OUT_DIR = process.argv[3] || path.resolve(__dirname, '../../../dogfood-out-3');
if (!userId) {
  console.error('Usage: verify-dogfood-3.ts <userId> <outDir>');
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

async function saveFromUrl(name: string, url: string) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(file, buf);
  console.log(`  saved: ${file}`);
}

function printConcepts(concepts: ScoredCreativeConcept[], proposedCount: number) {
  console.log(`\n  proposed: ${proposedCount}, kept after quality gate: ${concepts.length}`);
  concepts.forEach((c, i) => {
    console.log(`\n  ${i + 1}. "${c.conceptName}" [${c.mode}] — mechanism: ${c.visualMechanism}`);
    console.log(`     bigIdea: ${c.bigIdea}`);
    if (c.interaction) console.log(`     interaction: ${c.interaction}`);
    if (c.visualMetaphor) console.log(`     visualMetaphor: ${c.visualMetaphor}`);
    if (c.productRole) console.log(`     productRole: ${c.productRole}`);
    if (c.whyItWouldStopTheScroll) console.log(`     whyItWouldStopTheScroll: ${c.whyItWouldStopTheScroll}`);
    console.log(
      `     scores: strength=${c.scores.conceptStrength} brandSpecificity=${c.scores.brandSpecificity} productRelevance=${c.scores.productRelevance} originality=${c.scores.visualOriginality} scrollStop=${c.scores.scrollStoppingPotential} clarity=${c.scores.messageClarity} social=${c.scores.socialInteractionPotential} templateRisk=${c.scores.templateRisk}`,
    );
  });
}

interface Scenario {
  name: string;
  prompt: string;
  brandName: string;
  industry?: string;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'A-seven-sisters',
    prompt:
      'Create a memorable campaign for our momo dish. Make it playful, clever and food-focused without looking like a generic restaurant poster.',
    brandName: 'Seven Sisters',
    industry: 'Food / Restaurant (Northeast Indian cuisine)',
  },
  {
    name: 'B-flowpost',
    prompt: 'Promote FlowPost. Show why marketers should stop managing every platform separately.',
    brandName: 'FlowPost',
    industry: 'Social media management software',
  },
  {
    name: 'C-visaworx',
    prompt:
      'Create a campaign about avoiding mistakes in visa applications. Make it trustworthy and memorable, but avoid generic corporate stock imagery.',
    brandName: 'VisaWorX',
    industry: 'Travel / Visa Services',
  },
];

async function run() {
  for (const scenario of SCENARIOS) {
    console.log('\n' + '='.repeat(70) + `\n${scenario.name.toUpperCase()} — "${scenario.prompt}"\n` + '='.repeat(70));

    const { concepts, proposedCount } = await creativeGenerationService.discoverConcepts(userId, {
      prompt: scenario.prompt,
      contextType: 'personal',
      brandVoice: { name: scenario.brandName, industry: scenario.industry },
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: ['instagram'],
    });

    printConcepts(concepts, proposedCount);

    if (concepts.length === 0) {
      console.log('  No concepts survived the quality gate — skipping render for this scenario.');
      continue;
    }

    // Prefer a genuinely idea-driven mechanism over a plain editorial one, to
    // demonstrate the picker choosing an idea rather than defaulting to the first.
    const selected =
      concepts.find((c) => c.mode === 'INTERACTIVE' || c.mode === 'VISUAL_METAPHOR' || c.mode === 'PLAYFUL') ??
      concepts[0];
    console.log(`\n  SELECTED: "${selected.conceptName}" [${selected.mode}]`);

    const asset = await creativeGenerationService.generate(userId, {
      prompt: scenario.prompt,
      contextType: 'personal',
      brandVoice: { name: scenario.brandName, industry: scenario.industry },
      goal: 'brand_awareness',
      funnelStage: 'TOFU',
      platforms: ['instagram'],
      selectedConcept: selected,
    });

    console.log('\n  RESULT');
    console.log('  status:', asset.status);
    console.log('  source:', asset.source);
    console.log('  imageUrl:', asset.imageUrl);
    console.log('  copyTreatment:', asset.creativeBrief.copyTreatment);
    if (asset.creativeBrief.headline) console.log('  headline:', asset.creativeBrief.headline);
    if (asset.imageUrl) await saveFromUrl(scenario.name, asset.imageUrl);
  }

  console.log('\nDONE —', OUT_DIR);
}

run().catch((error) => {
  console.error('verify-dogfood-3 failed:', error);
  process.exit(1);
});
