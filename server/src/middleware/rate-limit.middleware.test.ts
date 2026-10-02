import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { creativeLimiter, creativeEditLimiter, aiLimiter, globalLimiter } from './rate-limit.middleware';

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
  app.use('/api/ai/creative', creativeLimiter);
  app.use('/api/ai/creative/retype', creativeEditLimiter);
  app.use('/api/ai/creative', (_req, res) => res.json({ ok: true }));
  app.use('/api/ai', aiLimiter, (_req, res) => res.json({ ok: true }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const post = (path: string) => fetch(`${base}${path}`, { method: 'POST' });
const get = (path: string) => fetch(`${base}${path}`);

describe('rate limiting', () => {
  it('caps creative generation per user, and does not throttle other users', async () => {
    currentUser = 'user-a';
    const statuses: number[] = [];
    for (let i = 0; i < 22; i += 1) statuses.push((await post('/api/ai/creative/generate')).status);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429]);

    currentUser = 'user-b';
    expect((await post('/api/ai/creative/generate')).status).toBe(200);
  });

  it('does not count creative requests against the caption bucket', async () => {
    currentUser = 'user-c';
    for (let i = 0; i < 25; i += 1) await post('/api/ai/creative/generate');
    expect((await get('/api/ai/caption')).status).toBe(200);
  });

  it('counts starting a background job the same as the direct endpoint it replaces', async () => {
    currentUser = 'user-jobs';
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) statuses.push((await post('/api/ai/creative/jobs')).status);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it('does not count a generation\'s status polls: one slow generation must not use up the allowance', async () => {
    currentUser = 'user-polling';
    expect((await post('/api/ai/creative/jobs')).status).toBe(200);
    // About five minutes of polling at a few seconds apart is far more than 20 requests.
    for (let i = 0; i < 120; i += 1) expect((await get('/api/ai/creative/jobs/9f1c2d3e-aaaa-bbbb-cccc-1234567890ab')).status).toBe(200);
    // ...and the member can still start more generations afterwards.
    for (let i = 0; i < 19; i += 1) expect((await post('/api/ai/creative/generate')).status).toBe(200);
  });

  it.each([
    ['reading history', () => get('/api/ai/creative/history')],
    ['loading the style library', () => get('/api/ai/creative/styles')],
    ['loading a creative\'s editable text', () => get('/api/ai/creative/text/asset-1')],
    ['recording a "not for us" signal', () => post('/api/ai/creative/signal')],
  ])('does not count %s against the generation allowance', async (_label, call) => {
    currentUser = `user-reads-${_label}`;
    for (let i = 0; i < 30; i += 1) expect((await call()).status).toBe(200);
    expect((await post('/api/ai/creative/generate')).status).toBe(200);
  });

  it('gives text edits their own, looser allowance instead of the generation one', async () => {
    currentUser = 'user-editing';
    // Far more than the 20 a generation gets: trying fonts and sizes is many small edits.
    for (let i = 0; i < 60; i += 1) expect((await post('/api/ai/creative/retype')).status).toBe(200);
    // Editing never ate into generation.
    expect((await post('/api/ai/creative/generate')).status).toBe(200);
  });
});

describe('global ceiling', () => {
  it('does not count job polls or font files, but still counts everything else', async () => {
    const app = express();
    app.use(globalLimiter);
    app.use((_req, res) => res.json({ ok: true }));
    const srv = await new Promise<Server>((resolve) => { const s = app.listen(0, () => resolve(s)); });
    const origin = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      for (let i = 0; i < 650; i += 1) {
        expect((await fetch(`${origin}/api/ai/creative/jobs/abc-123`)).status).toBe(200);
      }
      for (let i = 0; i < 40; i += 1) expect((await fetch(`${origin}/api/fonts/inter/400-normal.ttf`)).status).toBe(200);
      // The polls above would have tripped the 600 ceiling had they counted.
      expect((await fetch(`${origin}/api/posts`)).status).toBe(200);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  }, 30000);
});
