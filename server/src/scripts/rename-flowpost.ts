import 'dotenv/config';
import { prisma } from '../config/prisma';

async function main() {
  // 1. Rename Brands
  const brands = await prisma.brand.findMany();
  console.log('Brands found in DB:', brands.map(b => ({ id: b.id, name: b.name })));

  for (const b of brands) {
    if (b.name.toLowerCase().includes('flowpost')) {
      const newName = b.name.replace(/flowpost/gi, 'Rally');
      await prisma.brand.update({
        where: { id: b.id },
        data: { name: newName }
      });
      console.log(`✅ Renamed Brand ${b.id}: "${b.name}" -> "${newName}"`);
    }
  }

  // 2. Rename BrandVoices
  const voices = await prisma.brandVoice.findMany();
  for (const v of voices) {
    let changed = false;
    let newName = v.name;
    if (v.name.toLowerCase().includes('flowpost')) {
      newName = v.name.replace(/flowpost/gi, 'Rally');
      changed = true;
    }

    let voiceStr = JSON.stringify(v.voice || {});
    if (voiceStr.includes('FlowPost') || voiceStr.includes('flowpost')) {
      voiceStr = voiceStr.replace(/FlowPost/g, 'Rally').replace(/flowpost/g, 'rally');
      changed = true;
    }

    if (changed) {
      await prisma.brandVoice.update({
        where: { id: v.id },
        data: { 
          name: newName,
          voice: JSON.parse(voiceStr) 
        }
      });
      console.log(`✅ Renamed BrandVoice ${v.id} ("${v.name}" -> "${newName}") and updated voice payload`);
    }
  }

  console.log('🎉 All Database references updated to Rally!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
