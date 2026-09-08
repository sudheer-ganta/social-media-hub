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
import { getStyleDNA } from '../ai/style-dna/style-dna';
import { resolveBrandProfile } from '../ai/brand/brand-profile';
import { resolveCreativeDna } from '../ai/brand/creative-dna';

async function getFoodAsset(): Promise<string> {
  const foodImgPath = 'C:\\Users\\mail\\.gemini\\antigravity-ide\\brain\\8de5b799-27f7-4229-be9b-b28d768a00b5\\sevensisters_craft_dish_1788854108122.jpg';
  if (fs.existsSync(foodImgPath)) {
    const buf = fs.readFileSync(foodImgPath);
    return buf.toString('base64');
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
    <rect width="800" height="800" fill="#2d1b16"/>
    <circle cx="400" cy="400" r="320" fill="#3a251e" stroke="#c2410c" stroke-width="4"/>
    <text x="400" y="400" font-family="sans-serif" font-weight="bold" font-size="36" fill="#facc15" text-anchor="middle">ASIAN CRAFT DISH</text>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return buf.toString('base64');
}

async function getLogoAsset(): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180" viewBox="0 0 600 180">
    <rect width="600" height="180" fill="none"/>
    <text x="300" y="80" font-family="serif" font-weight="bold" font-size="46" fill="#FFFFFF" text-anchor="middle" letter-spacing="6">SEVENSISTERS</text>
    <line x1="160" y1="105" x2="440" y2="105" stroke="#D4AF37" stroke-width="2"/>
    <text x="300" y="140" font-family="sans-serif" font-weight="600" font-size="18" fill="#D4AF37" text-anchor="middle" letter-spacing="6">ASIAN CULINARY CRAFT</text>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return buf.toString('base64');
}

async function main() {
  console.log('=== Starting SevenSisters 3rd Anniversary Generation ===');
  const userPrompt = 'SevenSisters 3rd Anniversary. Celebrating three years of culinary craft and welcoming our community.';
  const brand = resolveBrandProfile({
    name: 'SevenSisters',
    tagline: 'Asian Culinary Craft',
    description: 'Contemporary Asian dining celebrating culinary heritage with modern craft.',
    voice: { tone: 'warm, elevated, editorial', vocabulary: ['craft', 'heritage', 'table', 'season'] },
  });
  const creativeDna = resolveCreativeDna({
    palette: ['#0f0f11', '#c2410c', '#f5f0e8', '#d97706'],
    tone: 'editorial, warm, elevated',
  });

  const styleDna = getStyleDNA('editorial');

  const foodData = await getFoodAsset();
  const logoData = await getLogoAsset();

  const productAsset = { mimeType: 'image/jpeg', data: foodData };
  const logoAsset = { mimeType: 'image/png', data: logoData };

  // 1. Canonical Creative Brief
  console.log('\n--- 1. Building Canonical Creative Brief ---');
  const canonicalBrief = buildCanonicalCreativeBrief({
    userPrompt,
    goal: 'event_promotion',
    funnelStage: 'MOFU',
    brand,
    creativeDna,
    styleDna: { id: styleDna.id, variant: 'default', source: 'style-dna', style: styleDna },
    productAssetUrls: ['https://example.com/sevensisters-dish.png'],
    logoAssetUrl: 'https://example.com/sevensisters-logo.png',
  });

  console.log('Subject:', canonicalBrief.subject);
  console.log('Event:', canonicalBrief.event);
  console.log('First Read:', canonicalBrief.firstRead);
  console.log('Attention Hierarchy:', canonicalBrief.attentionHierarchy);

  // 2. Art Director — Executable Design Blueprint
  console.log('\n--- 2. Art Director Generating Design Blueprint ---');
  const graphicConcept = await generateGraphicDesignConcept({
    provider: geminiVisionProvider,
    brief: canonicalBrief,
  });

  console.log('Concept Name:', graphicConcept.conceptName);
  console.log('Visual Idea:', graphicConcept.visualIdea);
  console.log('Hero Element:', graphicConcept.hero);
  console.log('Hero Placement:', graphicConcept.heroPlacement);
  console.log('Image Role & Treatment:', graphicConcept.imageRole, '|', graphicConcept.imageTreatment);
  console.log('Typography Strategy:', graphicConcept.typographyStrategy);
  console.log('Logo Sanctuary:', graphicConcept.logoSanctuary);
  console.log('Omitted Elements:', graphicConcept.elementsToOmit);

  // 3. Creative Direction (Copy & Prompts)
  console.log('\n--- 3. Creative Direction Synthesizing Copy ---');
  const { direction } = await generateCreativeDirection({
    provider: geminiMarketingProvider,
    request: userPrompt,
    goal: 'event_promotion',
    funnelStage: 'MOFU',
    platforms: ['instagram'],
    hasAssets: true,
    brand,
    creativeDna,
    mode: 'EDITORIAL',
    artDirectionFamily: 'EDITORIAL_PHOTOGRAPHY',
    selectedStyle: styleDna,
  });

  console.log('Headline:', direction.headline);
  console.log('Supporting Line:', direction.supportingLine);
  console.log('Event Badge:', direction.marketingCreative?.eventBadge);
  console.log('Offer / Message:', direction.marketingCreative?.offerText || direction.marketingCreative?.brandMessage);

  // 4. Blank Canvas Composition & Exact Asset Rendering
  console.log('\n--- 4. Executing Blank Canvas Composition & Critic ---');
  const result = await designCreative({
    direction,
    context: {
      brand,
      creativeDna,
      goal: 'event_promotion',
      funnelStage: 'MOFU',
      platforms: ['instagram'],
      canonicalBrief,
      graphicConcept,
    },
    styleDna: { id: styleDna.id, variant: 'default', source: 'style-dna', style: styleDna },
    canonicalBrief,
    graphicConcept,
    products: [productAsset],
    references: [],
    logo: logoAsset,
    textProvider: geminiVisionProvider,
    imageProvider: geminiImageProvider,
    onCall: (kind) => console.log(`[ai call] ${kind}`),
  });

  const outDir = path.join(__dirname, '..', '..', '..', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'sevensisters-3rd-anniversary.png');
  fs.writeFileSync(outPath, result.data);

  console.log(`\n=== Creative Generated & Saved to ${outPath} ===`);
  console.log('Blind Critic Evaluation:', {
    passed: result.critic.passed,
    observedSubject: result.critic.observedSubject,
    observedHero: result.critic.observedHero,
    templateLook: result.critic.templateLook,
    humanCraft: result.critic.humanCraft,
    strengths: result.critic.strengths,
  });
}

main().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});
