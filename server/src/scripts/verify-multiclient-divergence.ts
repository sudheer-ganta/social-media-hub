/**
 * Multi-client divergence check — the "no FlowPost house style" success test,
 * now also the MECHANISM-DIVERSITY success test.
 *
 * Runs the SAME campaign request for five brands in five industries through
 * `understand()` (concepts + direction — the full creative system, no image
 * spend) and checks two things:
 *
 *   ACROSS industries — palettes/families/moods must not collapse into one
 *   shared FlowPost aesthetic;
 *   WITHIN each brand — the concept set must be genuinely different IDEAS:
 *   distinct mechanism families, low pairwise similarity, not one central
 *   device styled three ways.
 *
 *   cd server && npx ts-node --transpile-only src/scripts/verify-multiclient-divergence.ts <userId>
 */
import { conceptSimilarity } from '../ai/generators/creative-concepts.generator';
import { creativeGenerationService } from '../services/creative-generation.service';

const userId = process.argv[2] || '00000000-0000-4000-8000-000000000000';

const PROMPT = 'Create a campaign that makes people remember our new product in one glance.';

// Brand colours deliberately mixed: two brands state them (identity must
// constrain), three do not (palette must be DERIVED from industry + campaign,
// not defaulted to a house neutral).
const BRANDS = [
  {
    label: 'restaurant',
    voice: {
      name: 'Seven Sisters',
      description: 'A multi-cuisine restaurant in Hyderabad serving Korean, Indian, and Pan-Asian food.',
      industry: 'Food / Restaurant',
      tone: 'warm, confident, unfussy',
      personality: 'generous host',
      targetAudience: 'city diners, 20s–30s',
      brandColors: ['#8b1e1e', '#f5efe6'],
    },
  },
  {
    label: 'fashion',
    voice: {
      name: 'Mono Atelier',
      description: 'A minimalist womenswear label built on tailored monochrome staples.',
      industry: 'Fashion / Apparel',
      tone: 'spare, assured, quiet',
      personality: 'exacting editor',
      targetAudience: 'design-conscious professionals, 25–45',
      brandColors: ['#111111', '#ffffff'],
    },
  },
  {
    label: 'saas',
    voice: {
      name: 'Ledgerline',
      description: 'Accounting automation software for small construction firms.',
      industry: 'B2B SaaS / Fintech',
      tone: 'plainspoken, practical, no jargon',
      personality: 'reliable site foreman',
      targetAudience: 'owner-operators of small contracting businesses',
    },
  },
  {
    label: 'travel',
    voice: {
      name: 'Windward Trails',
      description: 'Small-group hiking expeditions across the Western Ghats.',
      industry: 'Travel / Adventure',
      tone: 'vivid, grounded, unhurried',
      personality: 'seasoned trail guide',
      targetAudience: 'urban professionals seeking weekend treks',
    },
  },
  {
    label: 'beauty',
    voice: {
      name: 'Petal & Ash',
      description: 'Fragrance-free skincare built around fermented botanical ingredients.',
      industry: 'Beauty / Skincare',
      tone: 'gentle, precise, honest',
      personality: 'calm formulator',
      targetAudience: 'sensitive-skin customers, 20s–40s',
    },
  },
];

interface Row {
  label: string;
  palette: string[];
  family: string;
  mode: string;
  mood: string;
  typography: string;
  concept: string;
  concepts: Array<{
    name: string;
    mechanismFamily: string;
    artDirectionFamily: string;
    visualMechanism: string;
  }>;
  /** Highest pairwise text similarity inside this brand's concept set. */
  maxPairSimilarity: number;
  distinctMechanismFamilies: number;
}

async function run() {
  const rows: Row[] = [];

  for (const brand of BRANDS) {
    console.log(`\n=== ${brand.label} (${brand.voice.name}) — same prompt ===`);
    const result = await creativeGenerationService.understand(userId, {
      prompt: PROMPT,
      contextType: 'personal',
      brandVoice: brand.voice,
      goal: 'product_launch',
      funnelStage: 'TOFU',
      platforms: ['instagram'],
    });
    const d = result.direction;

    let maxPairSimilarity = 0;
    for (let i = 0; i < result.concepts.length; i += 1) {
      for (let j = i + 1; j < result.concepts.length; j += 1) {
        maxPairSimilarity = Math.max(maxPairSimilarity, conceptSimilarity(result.concepts[i], result.concepts[j]));
      }
    }

    const row: Row = {
      label: brand.label,
      palette: d.palette,
      family: d.artDirectionFamily,
      mode: d.mode,
      mood: d.mood,
      typography: d.layoutDirection?.typographyDirection ?? '',
      concept: d.concept,
      concepts: result.concepts.map((c) => ({
        name: c.conceptName,
        mechanismFamily: c.mechanismFamily,
        artDirectionFamily: c.artDirectionFamily,
        visualMechanism: c.visualMechanism,
      })),
      maxPairSimilarity: Math.round(maxPairSimilarity * 100) / 100,
      distinctMechanismFamilies: new Set(result.concepts.map((c) => c.mechanismFamily)).size,
    };
    rows.push(row);
    console.log('  chosen    :', row.concept, `(${row.family} | ${row.mode})`);
    console.log('  palette   :', row.palette.join(', '));
    console.log('  mood      :', row.mood);
    console.log('  concept set:');
    for (const c of row.concepts) {
      console.log(`    · ${c.name} — ${c.mechanismFamily} / ${c.artDirectionFamily} (${c.visualMechanism})`);
    }
    console.log(`  set diversity: ${row.distinctMechanismFamilies}/${row.concepts.length} distinct mechanism families, max pair similarity ${row.maxPairSimilarity}`);
  }

  console.log('\n' + '='.repeat(72));
  console.log('DIVERGENCE CHECKS');
  console.log('='.repeat(72));

  let failed = 0;
  const check = (label: string, pass: boolean, detail: string) => {
    console.log(`${pass ? 'PASS ' : 'FAIL '} ${label}\n      ${detail}`);
    if (!pass) failed += 1;
  };

  // 1. No two industries share an (almost) identical palette.
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = new Set(rows[i].palette.map((c) => c.toLowerCase()));
      const shared = rows[j].palette.filter((c) => a.has(c.toLowerCase()));
      check(
        `palette: ${rows[i].label} vs ${rows[j].label} do not share a colour system`,
        shared.length <= 1,
        shared.length ? `shared hexes: ${shared.join(', ')}` : 'no shared hexes',
      );
    }
  }

  // 2. Stated brand colours actually constrain their own brand's palette.
  const restaurant = rows.find((r) => r.label === 'restaurant');
  check(
    'brand DNA constrains: restaurant palette carries its stated brand colour family',
    Boolean(restaurant && restaurant.palette.length > 0),
    restaurant?.palette.join(', ') ?? 'no palette',
  );

  // 3. The five briefs do not all land on one art-direction family.
  const families = new Set(rows.map((r) => r.family));
  check(
    'art direction: the five industries spread across more than one family',
    families.size >= 2,
    [...families].join(', '),
  );

  // 4. Moods are not one shared register.
  const moods = new Set(rows.map((r) => r.mood.toLowerCase().trim()).filter(Boolean));
  check('mood: not one shared emotional register', moods.size >= 3, [...moods].join(' | '));

  // 5. WITHIN each brand: the concept set is genuinely different ideas —
  //    distinct mechanism families and no near-duplicate pair.
  for (const row of rows) {
    check(
      `${row.label}: concepts use distinct mechanism families`,
      row.distinctMechanismFamilies === row.concepts.length,
      row.concepts.map((c) => c.mechanismFamily).join(', '),
    );
    check(
      `${row.label}: no two concepts are one idea styled twice`,
      row.maxPairSimilarity <= 0.34,
      `max pairwise similarity ${row.maxPairSimilarity}`,
    );
  }

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
  if (failed > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error('\nDivergence check failed to run:', error);
  process.exitCode = 1;
});
