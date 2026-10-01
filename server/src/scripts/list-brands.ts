import 'dotenv/config';
import { prisma } from '../config/prisma';

async function main() {
  console.log('--- FETCHING BRANDS & BRAND VOICES ---');
  
  try {
    const brands = await prisma.brand.findMany({
      include: {
        brand_voices: true,
        social_accounts: {
          select: {
            provider: true,
            displayName: true,
            username: true,
          },
        },
      },
    });

    console.log(`\nFound ${brands.length} Brands:`);
    for (const b of brands) {
      console.log(`- Brand Name: "${b.name}" (ID: ${b.id})`);
      console.log(`  Description: ${b.description || 'None'}`);
      console.log(`  Website: ${b.website || 'None'}`);
      console.log(`  Connected Accounts: ${b.social_accounts.map(a => `${a.provider}: @${a.username || a.displayName}`).join(', ') || 'None'}`);
      console.log(`  Brand Voices count: ${b.brand_voices.length}`);
    }

    const brandVoices = await prisma.brandVoice.findMany();
    console.log(`\nFound ${brandVoices.length} Brand Voices / Profiles:`);
    for (const bv of brandVoices) {
      console.log(`- Voice Name: "${bv.name}" (Default: ${bv.is_default})`);
      console.log(`  Payload:`, JSON.stringify(bv.voice, null, 2));
    }
  } catch (err: any) {
    console.error('Error fetching brands:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
