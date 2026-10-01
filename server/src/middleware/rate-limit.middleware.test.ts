import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { creativeLimiter, aiLimiter } from './rate-limit.middleware';

let server: Server;
let base: string;
let currentUser = 'user-a';

beforeAll(async () => {
  const app = express();
  app.set('trust proxy', false);
  app.use((req, _res, next) => {
    req.user = { id: currentUser };
    next();
  });
  app.use('/api/ai/creative', creativeLimiter, (_req, res) => res.json({ ok: true }));
  app.use('/api/ai', aiLimiter, (_req, res) => res.json({ ok: true }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('rate limiting', () => {
  it('caps creative generation per user, and does not throttle other users', async () => {
    currentUser = 'user-a';
    const statuses: number[] = [];
    for (let i = 0; i < 22; i += 1) {
      statuses.push((await fetch(`${base}/api/ai/creative/generate`)).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429]);

    currentUser = 'user-b';
    expect((await fetch(`${base}/api/ai/creative/generate`)).status).toBe(200);
  });

  it('does not count creative requests against the caption bucket', async () => {
    currentUser = 'user-c';
    for (let i = 0; i < 25; i += 1) await fetch(`${base}/api/ai/creative/generate`);
    expect((await fetch(`${base}/api/ai/caption`)).status).toBe(200);
  });
});
