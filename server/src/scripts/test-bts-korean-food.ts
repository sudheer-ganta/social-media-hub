import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../config/prisma';
import { creativeGenerationService } from '../services/creative-generation.service';

async function main() {
  console.log('=== Starting Live SevenSisters BTS Korean Food Generation ===');

  let brand: any = null;
  try {
    brand = await prisma.brand.findFirst({
      where: { name: { contains: 'Seven', mode: 'insensitive' } },
    });
  } catch (e) {
    console.log('DB query skipped.');
  }

  const userId = brand?.userId || brand?.created_by || brand?.ownerId || 'ddbead95-388b-440c-b4d4-559dd712f9c0';
  const brandId = brand?.id;

  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180" viewBox="0 0 600 180">
    <rect width="600" height="180" fill="none"/>
    <text x="300" y="80" font-family="serif" font-weight="bold" font-size="46" fill="#FFFFFF" text-anchor="middle" letter-spacing="6">SEVENSISTERS</text>
    <line x1="160" y1="105" x2="440" y2="105" stroke="#D4AF37" stroke-width="2"/>
    <text x="300" y="140" font-family="sans-serif" font-weight="600" font-size="18" fill="#D4AF37" text-anchor="middle" letter-spacing="6">ASIAN CULINARY CRAFT</text>
  </svg>`;
  const logoBuf = await sharp(Buffer.from(logoSvg)).png().toBuffer();
  const logoBase64 = `data:image/png;base64,${logoBuf.toString('base64')}`;

  const prompt = 'BTS return event celebration at SevenSisters. Authentic Korean food feast, 10% off this Saturday.';

  console.log('\n--- 1. Calling creativeGenerationService.discoverConcepts ---');
  const discoveryResult = await creativeGenerationService.discoverConcepts(userId, {
    prompt,
    contextType: brandId ? 'brand' : 'personal',
    brandId,
    styleId: 'auto',
    platforms: ['instagram'],
    assetUrls: [],
    creativeDna: {
      logoAssetUrl: logoBase64,
      brandColors: ['#faf6f0', '#c2410c', '#18181b', '#d97706'],
      mood: 'warm, appetizing, celebratory, editorial',
    },
    brandVoice: {
      name: 'SevenSisters',
      description: 'Contemporary Asian dining celebrating culinary heritage with modern craft.',
      tone: 'warm, vibrant, celebratory',
      wordsToUse: ['craft', 'feast', 'korean', 'noodles', 'table', 'celebration'],
    },
  });

  console.log(`Discovered ${discoveryResult.concepts.length} Creative Concepts:`);
  discoveryResult.concepts.forEach((c: any, i: number) => {
    console.log(`  [${i + 1}] ${c.conceptName} (${c.artDirectionFamily}) - ${c.visualMechanism}`);
  });

  const selectedConcept = discoveryResult.concepts[0];
  console.log(`\nSelected Concept: "${selectedConcept.conceptName}"`);

  console.log('\n--- 2. Calling creativeGenerationService.generate ---');
  const asset = await creativeGenerationService.generate(userId, {
    prompt,
    contextType: brandId ? 'brand' : 'personal',
    brandId,
    styleId: 'auto',
    platforms: ['instagram'],
    assetUrls: [],
    selectedConcept,
    creativeDna: {
      logoAssetUrl: logoBase64,
      brandColors: ['#faf6f0', '#c2410c', '#18181b', '#d97706'],
      mood: 'warm, appetizing, celebratory, editorial',
    },
    brandVoice: {
      name: 'SevenSisters',
      description: 'Contemporary Asian dining celebrating culinary heritage with modern craft.',
      tone: 'warm, vibrant, celebratory',
      wordsToUse: ['craft', 'feast', 'korean', 'noodles', 'table', 'celebration'],
    },
  });

  console.log(`\n======================================================`);
  console.log(`SUCCESS! Generated SevenSisters BTS Korean Food Creative!`);
  console.log(`Asset ID: ${asset.id}`);
  console.log(`Image URL: ${asset.imageUrl}`);
  console.log(`Concept: ${asset.creativeBrief.concept}`);
  console.log(`Headline: "${asset.creativeBrief.headline}"`);
  console.log(`Brand Message / Offer: "${asset.creativeBrief.marketingCreative?.offerText || asset.creativeBrief.marketingCreative?.brandMessage}"`);
  console.log(`Typography: ${asset.typography?.headlineFont} + ${asset.typography?.accentFont || ''}`);
  console.log(`======================================================\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Generation test failed:', err);
  process.exit(1);
});
