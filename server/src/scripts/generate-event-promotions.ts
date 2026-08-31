import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { prisma } from '../config/prisma';
import { creativeGenerationService } from '../services/creative-generation.service';

const userId = 'd15e131b-34da-43d2-bfaf-a9ba332506fd';
const outDir = 'C:\\Users\\saikr\\.gemini\\antigravity-ide\\brain\\0a8a305d-847b-43ba-86bf-48daf7e62138';

const FALLBACK_VOICES: Record<string, any> = {
  klar: {
    name: 'klar',
    description: 'Minimalist, luxury-oriented, and slow-travel curator offering highly customized itineraries.',
    industry: 'Travel & Tourism',
    tone: 'serene, quiet, minimal, unhurried',
    writingStyle: 'vivid, spare, precise, editorial',
    wordsToUse: ['clarity', 'serenity', 'unhurried', 'curated', 'stillness', 'grounded'],
    wordsToAvoid: ['unleash', 'game-changing', 'elevate', 'hype', 'cheap', 'budget'],
    emojiStyle: 'None',
    ctaStyle: 'Soft',
    targetAudience: 'design-conscious professionals seeking slow, immersive travel experiences',
    personality: 'Minimal',
    products: ['Custom itineraries', 'Luxury slow-travel lodging curation', 'Private local guides'],
    usp: 'Quiet luxury travel designed for pure restoration.',
    brandColors: ['#F4F3EF', '#1A1A1A']
  },
  shrutham: {
    name: 'shrutham',
    description: 'Organic traditional cotton clothing label celebrating heritage designs.',
    industry: 'Fashion & Apparel',
    tone: 'authentic, warm, traditional, artistic',
    personality: 'handloom curator',
    targetAudience: 'traditional apparel lovers and organic fashion advocates',
  },
  FlowPost: {
    name: 'FlowPost',
    description: 'AI-powered social publishing and content intelligence platform.',
    industry: 'B2B SaaS',
    tone: 'bold, professional, direct, encouraging',
    personality: 'smart publishing co-pilot',
    targetAudience: 'social media managers, marketers, and brands',
  },
  SevenSisters: {
    name: 'SevenSisters',
    description: 'Asian Multi Cuisine restaurant in Hyderabad serving authentic regional dishes.',
    industry: 'Food & Restaurant',
    tone: 'warm, welcoming, vibrant, premium',
    personality: 'generous culinary host',
    targetAudience: 'families, foodies, and city diners',
  }
};

const EVENTS = [
  {
    brandName: 'klar',
    prompt: 'Promote our upcoming Slow Travel Sanctuary Retreat in Kyoto. Focus on restored energy and unhurried schedules.',
    event: 'Kyoto Sanctuary Retreat'
  },
  {
    brandName: 'shrutham',
    prompt: 'Promote our live handloom weaving showcase and new collection launch exhibition.',
    event: 'Heritage Weaves Exhibition'
  },
  {
    brandName: 'FlowPost',
    prompt: 'Join our live creator masterclass on organic reach and scheduling automation.',
    event: 'Creator Growth Masterclass'
  },
  {
    brandName: 'SevenSisters',
    prompt: 'Book tables for our Pan-Asian Street Food Festival in Hyderabad this weekend.',
    event: 'Pan-Asian Street Food Festival'
  }
];

async function run() {
  console.log(`Starting Event Promotion generation...`);

  const brands = await prisma.brand.findMany({
    where: { created_by: userId }
  });

  const voices = await prisma.brandVoice.findMany({
    where: { created_by: userId }
  });

  const dnas = await prisma.creativeDna.findMany({
    where: { created_by: userId }
  });

  for (const eventConfig of EVENTS) {
    const brand = brands.find(b => b.name.toLowerCase() === eventConfig.brandName.toLowerCase() || b.name.toLowerCase().replace(/\s+/g, '') === eventConfig.brandName.toLowerCase());
    if (!brand) {
      console.log(`Brand ${eventConfig.brandName} not found in database, skipping...`);
      continue;
    }

    console.log(`\n--------------------------------------------`);
    console.log(`Generating Event Promotion for Brand: ${brand.name}`);
    console.log(`Event: ${eventConfig.event}`);
    console.log(`--------------------------------------------`);

    // 1. Resolve Voice Profile
    let brandVoice = voices.find(v => v.name.toLowerCase() === brand.name.toLowerCase() || v.name.toLowerCase().replace(/\s+/g, '') === brand.name.toLowerCase())?.voice;
    if (!brandVoice) {
      console.log(`  No exact brand voice found in DB. Using fallback.`);
      brandVoice = FALLBACK_VOICES[brand.name] ?? FALLBACK_VOICES[brand.name.replace(/\s+/g, '')];
    }

    // 2. Resolve Creative DNA Profile
    const creativeDnaProfile = dnas.find(d => d.name.toLowerCase() === brand.name.toLowerCase() || d.name.toLowerCase().replace(/\s+/g, '') === brand.name.toLowerCase());
    const creativeDna = creativeDnaProfile?.dna ?? {};

    // 3. Discover Concepts
    console.log(`  Discovering creative concepts...`);
    const conceptsResult = await creativeGenerationService.discoverConcepts(userId, {
      prompt: eventConfig.prompt,
      contextType: 'personal',
      brandVoice,
      creativeDna,
      goal: 'event_promotion',
      funnelStage: 'BOFU',
      platforms: ['instagram']
    });

    const selectedConcept = conceptsResult.concepts[0];
    const intent = conceptsResult.intent;

    console.log(`  Selected Concept: ${selectedConcept.conceptName} (${selectedConcept.artDirectionFamily})`);
    console.log(`  Generating final creative...`);

    // 4. Generate Creative
    const asset = await creativeGenerationService.generate(userId, {
      prompt: eventConfig.prompt,
      contextType: 'personal',
      brandVoice,
      creativeDna,
      goal: 'event_promotion',
      funnelStage: 'BOFU',
      platforms: ['instagram'],
      selectedConcept,
      intent
    });

    if (asset.imageUrl) {
      console.log(`  Generation complete. Image URL: ${asset.imageUrl}`);
      const filename = `event-promotion-${brand.name.toLowerCase().replace(/\s+/g, '')}.png`;
      const filePath = path.join(outDir, filename);
      const response = await axios.get<ArrayBuffer>(asset.imageUrl, { responseType: 'arraybuffer', timeout: 30_000 });
      fs.writeFileSync(filePath, Buffer.from(response.data));
      console.log(`  SUCCESS: Saved event poster to ${filePath}`);
    } else {
      console.error(`  FAILED: No image URL returned for ${brand.name}`);
    }
  }

  await prisma.$disconnect();
  console.log(`\nAll event promotions generated successfully!`);
}

run().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
