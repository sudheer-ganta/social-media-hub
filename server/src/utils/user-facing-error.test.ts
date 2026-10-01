import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const prismaMock = vi.hoisted(() => ({
  generatedAsset: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
}));
vi.mock('../config/prisma', () => ({ prisma: prismaMock }));
vi.mock('../middleware/auth.middleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1' };
    next();
  },
}));
vi.mock('../repositories/creative-attribution.repository', () => ({
  creativeAttributionRepository: { syncPostAssets: vi.fn() },
}));
vi.mock('../services/creative-performance.service', () => ({ creativePerformanceService: {} }));

import creativeHistoryRoutes from '../routes/creative-history.routes';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/creative', creativeHistoryRoutes);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/creative`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('error responses', () => {
  it('returns a deliberate validation message to the member', async () => {
    const res = await fetch(`${base}/history?contextType=brand`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Choose a brand.');
  });

  // The leak: any thrown Error's message used to be returned as-is.
  it('does not echo an unexpected (database) error message', async () => {
    prismaMock.generatedAsset.findMany.mockRejectedValue(
      new Error('Invalid `prisma.generatedAsset.findMany()` invocation: column "secret_col" of table "generated_assets" ...'),
    );
    const res = await fetch(`${base}/history`);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/prisma|secret_col|generated_assets/);
    expect(body.error).toBe('Something went wrong. Please try again.');
  });
});
