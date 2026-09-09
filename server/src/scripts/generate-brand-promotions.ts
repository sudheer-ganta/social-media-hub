import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { prisma } from '../config/prisma';
import { creativeGenerationService } from '../services/creative-generation.service';

const userId = 'd15e131b-34da-43d2-bfaf-a9ba332506fd';
const brainOutDir = 'C:\\Users\\mail\\.gemini\\antigravity-ide\\brain\\96bfb727-5fcc-4e02-8366-c96ee49cab16';
const localOutDir = path.join(__dirname, '..', '..', '..', 'out');

const BRAND_PROMOTIONS = [
  {
    brandName: 'klar',
    prompt: 'Experience bespoke slow travel with klar. Curated luxury itineraries, private local guides, and serene journeys designed for pure restoration.',
    subject: 'Luxury Slow Travel Curation'
  },
  {
    brandName: 'LifeKrafts',
    prompt: 'Upgrade your living space with LifeKrafts. Reliable custom mosquito nets, AC curtains, anti-skid protection, and smart home utility essentials.',
    subject: 'Practical Home Improvement Solutions'
  },
  {
    brandName: 'Villy',
    prompt: 'Shop fashion with confidence on Villy. Experience India\'s first 2D Virtual Try-On for trendy men and women collections — try on yourself before you buy.',
    subject: 'Next-Gen Fashion Virtual Try-On'
  }
];

async function run() {
  console.log('=== Starting Dynamic Brand Promotions Generation for Klar, LifeKrafts & Villy ===');
  fs.mkdirSync(brainOutDir, { recursive: true });
  fs.mkdirSync(localOutDir, { recursive: true });

  const brands = await prisma.brand.findMany();
  const voices = await prisma.brandVoice.findMany();
  const dnas = await prisma.creativeDna.findMany();

  const generatedFiles: Array<{ brand: string; path: string; concept: string; headline: string }> = [];

  for (const promo of BRAND_PROMOTIONS) {
    const brand = brands.find(b => 
      b.name.toLowerCase() === promo.brandName.toLowerCase() || 
      b.name.toLowerCase().replace(/\s+/g, '') === promo.brandName.toLowerCase()
    );

    if (!brand) {
      console.warn(`Brand "${promo.brandName}" not found in database, skipping...`);
      continue;
    }

    console.log(`\n======================================================`);
    console.log(`Generating Brand Promotion for: ${brand.name}`);
    console.log(`Prompt: "${promo.prompt}"`);
    console.log(`======================================================`);

    // 1. Resolve Voice Profile
    const brandVoiceRecord = voices.find(v => 
      v.brand_id === brand.id || 
      v.name.toLowerCase() === brand.name.toLowerCase() || 
      v.name.toLowerCase().replace(/\s+/g, '') === brand.name.toLowerCase()
    );
    const brandVoice = brandVoiceRecord?.voice ?? {
      name: brand.name,
      description: brand.description,
      tone: 'confident, professional, distinct'
    };

    // 2. Resolve Creative DNA Profile
    const creativeDnaProfile = dnas.find(d => 
      d.name.toLowerCase() === brand.name.toLowerCase() || 
      d.name.toLowerCase().replace(/\s+/g, '') === brand.name.toLowerCase()
    );
    const creativeDna = (creativeDnaProfile?.dna as any) ?? {};

    // 3. Discover Concepts
    console.log(`[1/2] Discovering distinct commercial concepts...`);
    const conceptsResult = await creativeGenerationService.discoverConcepts(userId, {
      prompt: promo.prompt,
      contextType: 'personal',
      brandVoice,
      creativeDna,
      goal: 'brand_promotion',
      funnelStage: 'MOFU',
      platforms: ['instagram']
    });

    const selectedConcept = conceptsResult.concepts[0];
    const intent = conceptsResult.intent;

    console.log(`  -> Selected Concept: "${selectedConcept.conceptName}" (${selectedConcept.artDirectionFamily})`);
    console.log(`  -> Big Idea: "${selectedConcept.bigIdea}"`);

    // 4. Generate Creative
    console.log(`[2/2] Generating high-craft creative composition...`);
    const asset = await creativeGenerationService.generate(userId, {
      prompt: promo.prompt,
      contextType: 'personal',
      brandVoice,
      creativeDna,
      goal: 'brand_promotion',
      funnelStage: 'MOFU',
      platforms: ['instagram'],
      selectedConcept,
      intent
    });

    if (asset.imageUrl) {
      console.log(`  -> Creative generation successful!`);
      const baseFilename = `brand-promotion-${brand.name.toLowerCase().replace(/\s+/g, '')}.png`;
      const brainPath = path.join(brainOutDir, baseFilename);
      const localPath = path.join(localOutDir, baseFilename);

      let buffer: Buffer;
      if (asset.imageUrl.startsWith('data:image')) {
        const base64Data = asset.imageUrl.replace(/^data:image\/\w+;base64,/, '');
        buffer = Buffer.from(base64Data, 'base64');
      } else {
        const response = await axios.get<ArrayBuffer>(asset.imageUrl, { responseType: 'arraybuffer', timeout: 30_000 });
        buffer = Buffer.from(response.data);
      }

      fs.writeFileSync(brainPath, buffer);
      fs.writeFileSync(localPath, buffer);
      console.log(`  -> Saved to brain: ${brainPath}`);
      console.log(`  -> Saved to local out: ${localPath}`);

      generatedFiles.push({
        brand: brand.name,
        path: brainPath,
        concept: selectedConcept.conceptName,
        headline: (asset as any).direction?.headline || promo.subject
      });
    } else {
      console.error(`  -> Generation failed: No image URL returned for ${brand.name}`);
    }
  }

  await prisma.$disconnect();
  console.log('\n======================================================');
  console.log(`Generated ${generatedFiles.length} brand promotion creatives successfully!`);
  console.log(JSON.stringify(generatedFiles, null, 2));
}

run().catch(async (err) => {
  console.error('Fatal error generating promotions:', err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
