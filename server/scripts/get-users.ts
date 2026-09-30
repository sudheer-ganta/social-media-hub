import { prisma } from '../src/config/prisma';

async function main() {
  try {
    const authUsers = await prisma.$queryRawUnsafe<any[]>(`SELECT id, email FROM auth.users LIMIT 10;`);
    console.log('Auth users:', authUsers);
  } catch (e) {
    console.error('Failed to query auth.users:', e);
  }

  try {
    const posts = await prisma.post.findMany({ take: 5, select: { created_by: true } });
    console.log('Posts created_by:', posts);
  } catch (e) {
    console.error('Failed to query posts:', e);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
