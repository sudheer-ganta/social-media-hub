import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from './env';

// Prisma 7 requires an explicit driver adapter for SQL providers.
//
// DATABASE_URL points at Supabase's *session*-mode pooler (port 5432), not the
// transaction-mode one on 6543: transaction mode hands out a different backend
// per statement, which breaks interactive transactions and prepared statements.
if (!env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. The backend cannot reach the database. ' +
      'Copy the session-mode pooler URL (port 5432) from Supabase → Project ' +
      'Settings → Database into server/.env.',
  );
}

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

/**
 * The single Prisma Client for the process.
 *
 * Only modules under `repositories/` may import this — everything else goes
 * through a repository, so there is exactly one place per table that knows how
 * it is stored.
 *
 * Cached on globalThis so ts-node-dev's respawn-on-change doesn't leak a new
 * connection pool on every reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export const disconnectPrisma = () => prisma.$disconnect();
