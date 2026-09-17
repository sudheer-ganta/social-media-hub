import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import dotenv from 'dotenv';
dotenv.config();

import { geminiMarketingProvider, geminiVisionProvider } from '../ai/providers/gemini.provider';
import { geminiImageProvider } from '../ai/providers/gemini-image.provider';
import { buildCanonicalCreativeBrief } from '../ai/brand/creative-brief';
import { generateGraphicDesignConcept } from '../ai/generators/art-director.generator';
import { generateCreativeDirection } from '../ai/generators/creative-direction.generator';
import { designCreative } from '../ai/render/designer-composition';
import { analyzeImageField } from '../ai/render/image-field';
import { getStyleDNA, resolveStyleDNA } from '../ai/style-dna/style-dna';
import { resolveBrandProfile } from '../ai/brand/brand-profile';
import { resolveCreativeDna } from '../ai/brand/creative-dna';
import { buildTypeSystem } from '../ai/typography/type-system';
import { selectTypography } from '../ai/typography/font-selector';
import { resolveDesignRecipe } from '../ai/render/design-recipe';

/**
 * The acceptance gate for the text-intelligence stages.
 *
 * The unit tests prove the plumbing: that the measurement finds a subject, that a
 * scrim appears only when no ink can work, that the fitting pass is the identity
 * function on a plan with nothing wrong. None of that proves the typography got
 * BETTER, which is a judgement about pixels. So this renders the same brief twice
 * — once with FLOWPOST_TEXT_INTELLIGENCE=off, which is exactly the behaviour that
 * shipped before these stages existed, and once with it on — and writes both PNGs
 * plus a diagnostic report side by side for eyeballing.
 *
 * Costs real API calls, twice over. Run: cd server && npx tsx src/scripts/verify-text-placement.ts
 */

const USER_PROMPT =
  process.env.VERIFY_PROMPT ??
  'Launch of a small-batch cold brew in a returnable glass bottle. The point is that it is made slowly and locally.';

async function logoAsset(): Promise<{ mimeType: string; data: string }> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180" viewBox="0 0 600 180">
    <rect width="600" height="180" fill="none"/>
    <text x="300" y="96" font-family="sans-serif" font-weight="700" font-size="54" fill="#111111" text-anchor="middle" letter-spacing="4">SLOWPOUR</text>
    <line x1="170" y1="126" x2="430" y2="126" stroke="#111111" stroke-width="3"/>
  </svg>`;
  return { mimeType: 'image/png', data: (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64') };
}

/** A compact read of where the type ended up relative to what the picture is of. */
async function describePlacement(png: Buffer, label: string): Promise<void> {
  const field = await analyzeImageField(png);
  const round = (v: number) => Number(v.toFixed(2));
  console.log(`  ${label}: subject box`, {
    x: round(field.subjectBox.x),
    y: round(field.subjectBox.y),
    w: round(field.subjectBox.width),
    h: round(field.subjectBox.height),
  });
}

async function main() {
  const brand = resolveBrandProfile({
    brand: {
      name: 'Slowpour',
      description: 'A small coffee roaster bottling cold brew in returnable glass.',
      tone: 'plain, unhurried, confident',
      wordsToUse: ['slow', 'batch', 'return'],
    },
  });
  const creativeDna = resolveCreativeDna({
    creativeDna: { brandColors: ['#14110f', '#c9a227', '#f4efe6'], mood: 'quiet, tactile, editorial' },
  });
  const styleDna = getStyleDNA('editorial')!;
  const resolvedStyleDna = resolveStyleDNA({ styleId: 'editorial', prompt: USER_PROMPT })!;
  const logo = await logoAsset();

  console.log('=== Text placement A/B ===');
  console.log('Brief:', USER_PROMPT);

  const canonicalBrief = buildCanonicalCreativeBrief({
    userPrompt: USER_PROMPT,
    goal: 'product_launch',
    funnelStage: 'MOFU',
    brand,
    creativeDna,
    styleDna: resolvedStyleDna,
    logoAssetUrl: 'https://example.com/slowpour-logo.png',
  });

  console.log('\n--- Art director ---');
  const graphicConcept = await generateGraphicDesignConcept({ provider: geminiVisionProvider, brief: canonicalBrief });
  console.log('Idea:', graphicConcept.visualIdea);
  console.log('Declared scale contrast:', graphicConcept.typographyScaleContrast ?? '(undecided)');
  console.log('Hierarchy strategy:', graphicConcept.hierarchyStrategy ?? '(undecided)');

  console.log('\n--- Creative direction ---');
  const { direction } = await generateCreativeDirection({
    provider: geminiMarketingProvider,
    request: USER_PROMPT,
    goal: 'product_launch',
    funnelStage: 'MOFU',
    platforms: ['instagram'],
    hasAssets: false,
    brand,
    creativeDna,
    mode: 'EDITORIAL',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    selectedStyle: styleDna,
  });
  console.log('Headline:', direction.headline);
  console.log('Support:', direction.supportingLine);

  // What the type system decided, before any rendering — the numbers that replaced
  // the fixed 0.055–0.09 / 0.022–0.040 bands.
  const { recipe } = resolveDesignRecipe(direction, creativeDna, {
    styleDna: resolvedStyleDna.style,
    styleDnaVariant: resolvedStyleDna.variant,
  });
  const typography = await selectTypography({
    direction,
    creativeDna,
    recipe,
    styleDna: resolvedStyleDna.style,
    provider: geminiMarketingProvider,
  });
  console.log('\n--- Typography ---');
  console.log('Pairing:', typography.headlineFont, '+', typography.bodyFont, typography.accentFont ? `(accent ${typography.accentFont})` : '');
  console.log('Reasoning:', typography.typographyReasoning);

  const typeSystem = buildTypeSystem({
    typography,
    concept: graphicConcept,
    copy: [
      { role: 'HEADLINE', text: direction.headline },
      ...(direction.supportingLine ? [{ role: 'SUPPORT' as const, text: direction.supportingLine }] : []),
    ],
  });
  console.log('Type system:', typeSystem.reasoning);

  const outDir = path.join(__dirname, '..', '..', '..', 'out');
  fs.mkdirSync(outDir, { recursive: true });

  for (const enabled of [false, true]) {
    const label = enabled ? 'on' : 'off';
    process.env.FLOWPOST_TEXT_INTELLIGENCE = enabled ? 'on' : 'off';
    console.log(`\n=== Rendering with FLOWPOST_TEXT_INTELLIGENCE=${label} ===`);

    const result = await designCreative({
      direction,
      context: {
        brand,
        creativeDna,
        goal: 'product_launch',
        funnelStage: 'MOFU',
        platforms: ['instagram'],
        canonicalBrief,
        graphicConcept,
      },
      styleDna: resolvedStyleDna,
      canonicalBrief,
      graphicConcept,
      products: [],
      references: [],
      logo,
      textProvider: geminiVisionProvider,
      imageProvider: geminiImageProvider,
      onCall: (kind) => console.log(`  [ai call] ${kind}`),
      onStageTiming: (stage, ms) => console.log(`  [timing] ${stage} ${ms}ms`),
    });

    const outPath = path.join(outDir, `text-placement-${label}.png`);
    fs.writeFileSync(outPath, result.data);
    if (result.visual) {
      fs.writeFileSync(path.join(outDir, `text-placement-${label}-visual.png`), Buffer.from(result.visual.data, 'base64'));
      await describePlacement(Buffer.from(result.visual.data, 'base64'), 'wordless visual');
    }

    console.log(`  saved ${outPath}`);
    console.log('  copy nodes as rendered:');
    for (const node of result.plan.nodes.filter((n: { kind: string }) => n.kind === 'copy')) {
      console.log(
        `    ${node.id}: at ${node.x.toFixed(2)},${node.y.toFixed(2)} scale ${node.fontScale} colour ${node.color}` +
          (node.scrim ? ` scrim ${node.scrim.color}@${node.scrim.opacity} ${node.scrim.direction}` : ''),
      );
    }
    console.log('  critic:', {
      passed: result.critic.passed,
      textOccludesSubject: result.critic.textOccludesSubject,
      templateLook: result.critic.templateLook,
      problems: result.critic.problems,
    });
  }

  console.log('\nCompare out/text-placement-off.png against out/text-placement-on.png.');
  console.log('The wordless visuals are saved too, so you can see what each pass was working with.');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
