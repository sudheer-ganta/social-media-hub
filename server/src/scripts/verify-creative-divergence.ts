/**
 * Real-run proof that the architecture produces different, intentional
 * creatives — the milestone the unit tests cannot reach.
 *
 * The tests prove the plumbing permits divergence. Only a real model can show
 * that divergence actually happens. This script runs the live strategy and art
 * director stages across a matrix and prints what each request DECIDED, so the
 * question "did we fix it?" is answered by reading mechanisms rather than by
 * squinting at renders.
 *
 * It deliberately stops before image generation: the mechanism and the
 * blueprint are where template collapse is visible, they cost a fraction of a
 * full render, and a matrix of full generations would be slow and expensive.
 *
 *   MATRIX A — one occasion, four intents.
 *     Proves an occasion is not a creative concept. Four different mechanisms
 *     is a pass; four variations of one is the collapse returning.
 *
 *   MATRIX B — one request, four brands.
 *     Proves brand constrains without composing. Different mechanisms AND
 *     recognisably different voices is a pass.
 *
 *   MATRIX C — seven unrelated requests.
 *     Proves nothing inherits a house visual language.
 *
 * Usage:
 *   cd server && npx tsx src/scripts/verify-creative-divergence.ts
 *   cd server && npx tsx src/scripts/verify-creative-divergence.ts --json out.json
 *
 * Requires whatever API credentials the configured text provider needs. Costs
 * roughly two text calls per row.
 */

import { writeFileSync } from 'fs';
import { resolveBrandProfile } from '../ai/brand/brand-profile';
import { resolveCreativeDna } from '../ai/brand/creative-dna';
import { buildCanonicalCreativeBrief } from '../ai/brand/creative-brief';
import { generateCreativeStrategy } from '../ai/generators/creative-strategy.generator';
import { generateGraphicDesignConcept } from '../ai/generators/art-director.generator';
import { compareGraphicConcepts } from '../ai/strategy/concept-similarity';
import { providerForRole } from '../ai/providers';
import type { BrandProfileInput, CreativeIntentBrief, GraphicDesignConcept } from '../ai/types';

interface Row {
  matrix: 'A' | 'B' | 'C';
  label: string;
  request: string;
  brandName: string;
  mechanism: string;
  metaphor: string;
  hero: string;
  imageRole: string;
  typeBehavior: string;
  imageBehavior: string;
  spatialRelationship: string;
  dominantObject: string;
  hierarchy: string;
  compositionFamily: string;
  copyRoles: string;
  maxText: number | null;
  concept: GraphicDesignConcept;
}

const intentOf = (over: Partial<CreativeIntentBrief> = {}): CreativeIntentBrief => ({
  extracted: true,
  event: '',
  culturalContext: '',
  productCategory: '',
  offer: '',
  promotionType: '',
  venueType: '',
  audience: '',
  requiredClaims: [],
  optionalDetails: [],
  confidence: {},
  ...over,
});

const LOGO = 'https://cdn.example.com/logo.png';

async function runOne(input: {
  matrix: Row['matrix'];
  label: string;
  request: string;
  brandInput: BrandProfileInput;
  intent: CreativeIntentBrief;
  goal: 'sales' | 'event_promotion' | 'brand_awareness' | 'product_launch';
}): Promise<Row> {
  const provider = providerForRole('creative');
  const brand = resolveBrandProfile({ brand: input.brandInput });
  const creativeDna = resolveCreativeDna({ creativeDna: { logoAssetUrl: LOGO } });

  const { strategy } = await generateCreativeStrategy({
    provider,
    request: input.request,
    goal: input.goal,
    funnelStage: 'TOFU',
    platforms: ['instagram'],
    hasAssets: false,
    brand,
    creativeDna,
    intent: input.intent,
  });

  const brief = buildCanonicalCreativeBrief({
    userPrompt: input.request,
    goal: input.goal,
    funnelStage: 'TOFU',
    brand,
    creativeDna,
    intent: input.intent,
    logoAssetUrl: LOGO,
    creativeStrategy: strategy,
  });

  const concept = await generateGraphicDesignConcept({ provider, brief, strategy });

  return {
    matrix: input.matrix,
    label: input.label,
    request: input.request,
    brandName: brand.name,
    mechanism: concept.creativeMechanism ?? strategy.creativeMechanism ?? '(none)',
    metaphor: concept.visualMetaphor ?? '',
    hero: concept.hero,
    imageRole: concept.imageRole,
    typeBehavior: concept.typeBehavior ?? '',
    imageBehavior: concept.imageBehavior ?? '',
    spatialRelationship: concept.spatialRelationship ?? '',
    dominantObject: concept.dominantVisualObject ?? '',
    hierarchy: concept.hierarchyStrategy ?? '',
    compositionFamily: (concept.compositionFamily as string) ?? '(not decided)',
    copyRoles: concept.copyPlan?.requiredRoles.join('+') ?? '(none)',
    maxText: concept.copyPlan?.maxTextElements ?? null,
    concept,
  };
}

const NORTHWIND: BrandProfileInput = {
  name: 'Northwind',
  industry: 'hospitality',
  tone: 'plain, unsentimental',
  personality: 'precise, quietly confident',
  targetAudience: 'people who eat out on weeknights',
};

/** MATRIX A — one occasion, four intents. */
const MATRIX_A = [
  { label: 'A1 family dinner', request: 'Deepavali family dinner at our place', intent: intentOf({ event: 'Deepavali', audience: 'families', requiredClaims: ['Deepavali'] }) },
  { label: 'A2 discount', request: 'Deepavali 50% off', intent: intentOf({ event: 'Deepavali', offer: '50% off', requiredClaims: ['Deepavali', '50% off'] }) },
  { label: 'A3 party', request: 'Deepavali party night', intent: intentOf({ event: 'Deepavali', promotionType: 'party', requiredClaims: ['Deepavali'] }) },
  { label: 'A4 greeting', request: 'Deepavali wishes from our brand', intent: intentOf({ event: 'Deepavali', requiredClaims: ['Deepavali'] }) },
];

/** MATRIX B — one request, four brands. */
const MATRIX_B: Array<{ label: string; brandInput: BrandProfileInput }> = [
  { label: 'B1 luxury', brandInput: { name: 'Meridian', industry: 'private travel', tone: 'restrained, understated', personality: 'discreet, precise', targetAudience: 'private clients', brandColors: ['#12110f'] } },
  { label: 'B2 budget', brandInput: { name: 'Hoplite', industry: 'travel', tone: 'blunt, cheap and proud of it', personality: 'loud, scrappy', targetAudience: 'students', brandColors: ['#ff3b00'] } },
  { label: 'B3 youth', brandInput: { name: 'Wayfare', industry: 'travel', tone: 'warm, encouraging', personality: 'curious, communal', targetAudience: 'first-time backpackers', brandColors: ['#2f7d5b'] } },
  { label: 'B4 corporate', brandInput: { name: 'Continuum', industry: 'travel management', tone: 'efficient, factual', personality: 'reliable, unshowy', targetAudience: 'corporate travel managers', brandColors: ['#1c3f7a'] } },
];

/** MATRIX C — seven unrelated requests, one brand-neutral profile each. */
const MATRIX_C = [
  { label: 'C1 travel offer', request: 'Foreign trips get 10% off', goal: 'sales' as const, intent: intentOf({ offer: '10% off', productCategory: 'foreign trips', requiredClaims: ['10% off'] }) },
  { label: 'C2 festival', request: 'Deepavali family dinner', goal: 'event_promotion' as const, intent: intentOf({ event: 'Deepavali', requiredClaims: ['Deepavali'] }) },
  { label: 'C3 fandom', request: 'BTS anniversary party, 10% off Korean food', goal: 'event_promotion' as const, intent: intentOf({ event: 'BTS Anniversary Party', offer: '10% off', requiredClaims: ['BTS Anniversary Party', '10% off'] }) },
  { label: 'C4 opening', request: 'Grand opening of our salon', goal: 'event_promotion' as const, intent: intentOf({ event: 'Grand Opening', requiredClaims: ['Grand Opening'] }) },
  { label: 'C5 sale', request: 'Summer sale, 50% off', goal: 'sales' as const, intent: intentOf({ offer: '50% off', requiredClaims: ['50% off'] }) },
  { label: 'C6 coffee', request: 'New coffee shop opening on Mill Street', goal: 'event_promotion' as const, intent: intentOf({ event: 'Opening', venueType: 'coffee shop', requiredClaims: ['Mill Street'] }) },
  { label: 'C7 property', request: 'Luxury waterfront apartments now launching', goal: 'product_launch' as const, intent: intentOf({ productCategory: 'waterfront apartments', requiredClaims: [] }) },
];

function table(rows: Row[], columns: Array<[string, (r: Row) => string]>): string {
  const widths = columns.map(([head, get]) =>
    Math.min(46, Math.max(head.length, ...rows.map((r) => get(r).length))),
  );
  const line = (cells: string[]) =>
    cells.map((cell, i) => cell.slice(0, widths[i]).padEnd(widths[i])).join(' | ');
  return [
    line(columns.map(([head]) => head)),
    widths.map((w) => '-'.repeat(w)).join('-+-'),
    ...rows.map((r) => line(columns.map(([, get]) => get(r)))),
  ].join('\n');
}

/** Every pair's conceptual similarity — the number that says whether this matrix collapsed. */
function similarityReport(rows: Row[]): { worst: number; pairs: string[] } {
  const pairs: string[] = [];
  let worst = 0;
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const report = compareGraphicConcepts(rows[i].concept, rows[j].concept);
      worst = Math.max(worst, report.similarity);
      if (report.tooSimilar) {
        pairs.push(`  COLLAPSE  ${rows[i].label} ~ ${rows[j].label} (${(report.similarity * 100).toFixed(0)}% — shared: ${report.sharedAxes.join(', ')})`);
      }
    }
  }
  return { worst, pairs };
}

function summarise(name: string, rows: Row[]): boolean {
  console.log(`\n\n=== MATRIX ${name} ===\n`);
  console.log(table(rows, [
    ['row', (r) => r.label],
    ['brand', (r) => r.brandName],
    ['creative mechanism', (r) => r.mechanism],
    ['dominant object', (r) => r.dominantObject],
    ['hero', (r) => r.hero],
    ['image', (r) => r.imageRole],
    ['copy', (r) => `${r.copyRoles}${r.maxText ? ` (${r.maxText})` : ''}`],
    ['family', (r) => r.compositionFamily],
  ]));

  const mechanisms = new Set(rows.map((r) => r.mechanism.toLowerCase().trim()));
  const { worst, pairs } = similarityReport(rows);

  console.log(`\ndistinct mechanisms: ${mechanisms.size}/${rows.length}`);
  console.log(`worst pairwise conceptual similarity: ${(worst * 100).toFixed(0)}%`);
  if (pairs.length) {
    console.log('\nPairs the similarity check considers the SAME creative structure:');
    console.log(pairs.join('\n'));
  }

  const passed = mechanisms.size === rows.length && pairs.length === 0;
  console.log(`\nMATRIX ${name}: ${passed ? 'PASS' : 'FAIL'}`);
  if (!passed) {
    console.log('  A failure here means the pipeline is still deriving the design from the');
    console.log('  category rather than from the idea. Do NOT fix it by adding a rule for');
    console.log('  the specific request that collapsed — find what carried the sameness.');
  }
  return passed;
}

async function main() {
  const jsonFlag = process.argv.indexOf('--json');
  const jsonPath = jsonFlag >= 0 ? process.argv[jsonFlag + 1] : undefined;

  if (!providerForRole('creative').isConfigured()) {
    console.error('The creative text provider is not configured. Set its API key and re-run.');
    process.exit(2);
  }

  const rows: Row[] = [];

  for (const entry of MATRIX_A) {
    rows.push(await runOne({ matrix: 'A', ...entry, brandInput: NORTHWIND, goal: 'event_promotion' }));
  }
  for (const entry of MATRIX_B) {
    rows.push(await runOne({
      matrix: 'B',
      label: entry.label,
      request: 'Foreign trips get 10% off',
      brandInput: entry.brandInput,
      intent: intentOf({ offer: '10% off', productCategory: 'foreign trips', requiredClaims: ['10% off'] }),
      goal: 'sales',
    }));
  }
  for (const entry of MATRIX_C) {
    rows.push(await runOne({ matrix: 'C', ...entry, brandInput: NORTHWIND }));
  }

  const results = (['A', 'B', 'C'] as const).map((m) => summarise(m, rows.filter((r) => r.matrix === m)));

  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(rows, null, 2));
    console.log(`\nFull blueprints written to ${jsonPath}`);
  }

  console.log('\n\n=== WHAT TO LOOK FOR ===');
  console.log('Read the "creative mechanism" and "dominant object" columns as prose, not as');
  console.log('pass/fail. The counts above catch identical answers; only you can catch four');
  console.log('differently-worded descriptions of the same picture. Ask of each matrix:');
  console.log('  - Could I swap two rows\' mechanisms and have both still make sense?');
  console.log('    If yes, neither mechanism is specific to its request.');
  console.log('  - Does any column hold the same value for every row? That column is a');
  console.log('    default that has survived, and it is where the next collapse will start.');

  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch((error) => {
  console.error('verify-creative-divergence failed:', error);
  process.exit(1);
});
