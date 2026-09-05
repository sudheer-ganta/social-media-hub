import { prisma } from '../config/prisma';

export class IdempotencyInProgressError extends Error {}

export async function runIdempotent<T>(ownerId: string, action: string, key: string | undefined, work: () => Promise<T>): Promise<{ value: T; cacheHit: boolean }> {
  if (!key) return { value: await work(), cacheHit: false };
  const normalized = key.trim().slice(0, 160);
  if (!normalized) return { value: await work(), cacheHit: false };
  const unique = { ownerId_action_idempotencyKey: { ownerId, action, idempotencyKey: normalized } };
  const existing = await prisma.creativeIdempotencyRecord.findUnique({ where: unique });
  if (existing?.status === 'completed' && existing.response !== null) return { value: existing.response as T, cacheHit: true };
  if (existing?.status === 'running') throw new IdempotencyInProgressError('This creative request is already running.');
  try {
    if (existing?.status === 'failed') {
      const claimed = await prisma.creativeIdempotencyRecord.updateMany({
        where: { ...unique.ownerId_action_idempotencyKey, status: 'failed' },
        data: { status: 'running', response: undefined },
      });
      if (claimed.count !== 1) throw new IdempotencyInProgressError('This creative request is already running.');
    } else {
      await prisma.creativeIdempotencyRecord.create({ data: { ownerId, action, idempotencyKey: normalized } });
    }
  } catch {
    throw new IdempotencyInProgressError('This creative request is already running.');
  }
  try {
    const value = await work();
    await prisma.creativeIdempotencyRecord.update({ where: unique, data: { status: 'completed', response: value as any } });
    return { value, cacheHit: false };
  } catch (error) {
    await prisma.creativeIdempotencyRecord.update({ where: unique, data: { status: 'failed' } }).catch(() => undefined);
    throw error;
  }
}

export const creativeIdempotencyService = { runIdempotent };
