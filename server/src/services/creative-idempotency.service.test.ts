import { beforeEach, describe, expect, it, vi } from 'vitest';
const { findUnique, create, update, updateMany } = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() }));
vi.mock('../config/prisma', () => ({ prisma: { creativeIdempotencyRecord: { findUnique, create, update, updateMany } } }));
import { IdempotencyInProgressError, runIdempotent } from './creative-idempotency.service';

describe('creative request idempotency', () => {
  beforeEach(() => { findUnique.mockReset(); create.mockReset(); update.mockReset(); updateMany.mockReset(); });
  it('returns a completed response without crossing the paid boundary', async () => {
    findUnique.mockResolvedValue({ status: 'completed', response: { id: 'asset-1' } }); const work = vi.fn();
    expect(await runIdempotent('owner', 'generate', 'key', work)).toEqual({ value: { id: 'asset-1' }, cacheHit: true });
    expect(work).not.toHaveBeenCalled();
  });
  it('rejects a duplicate in-flight request', async () => {
    findUnique.mockResolvedValue({ status: 'running' });
    await expect(runIdempotent('owner', 'refine', 'key', vi.fn())).rejects.toBeInstanceOf(IdempotencyInProgressError);
  });
  it('stores the successful response for a network retry', async () => {
    findUnique.mockResolvedValue(null); create.mockResolvedValue({}); update.mockResolvedValue({});
    expect((await runIdempotent('owner', 'generate', 'key', async () => ({ id: 'new' }))).value).toEqual({ id: 'new' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) }));
  });
  it('atomically reclaims a failed request', async () => {
    findUnique.mockResolvedValue({ status: 'failed' }); updateMany.mockResolvedValue({ count: 1 }); update.mockResolvedValue({});
    await runIdempotent('owner', 'generate', 'retry-key', async () => ({ id: 'retried' }));
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'failed' }) }));
    expect(create).not.toHaveBeenCalled();
  });
});
