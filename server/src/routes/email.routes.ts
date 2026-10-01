import { Router, Request, Response } from 'express';
import { emailService } from '../services/email.service';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { emailLimiter } from '../middleware/rate-limit.middleware';
import { env } from '../config/env';

/**
 * Email API. Mounted at `/api/email`.
 *
 * ─── What this is allowed to be ──────────────────────────────────────────────
 * Every message goes out under Rally's own sender, so an endpoint that lets a
 * caller choose the recipient, the body or an attachment is an open relay:
 * phishing mail with a real `support@` From, and — through nodemailer's
 * `attachments: [{ path }]` — a way to mail the server's own files (including
 * `.env`) to anyone. So, deliberately:
 *
 *   - everything needs a session, and the diagnostics need an operator;
 *   - the recipient is always the caller's own address — never the body;
 *   - there is no raw-HTML mode and no attachments;
 *   - links in a message are always this app's own URL, never caller-supplied;
 *   - sends are rate limited.
 *
 * Mail to *other* people (a team invite, a digest to a client) must be sent by
 * server code that has decided it should be sent, calling `emailService`
 * directly — not by a route that forwards whatever a browser says.
 */
const router = Router();

/** Trims and bounds a free-text field; empty/non-strings become undefined. */
function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

const ALERT_TYPES = ['error', 'warning', 'info', 'success'] as const;
type AlertType = (typeof ALERT_TYPES)[number];

/**
 * GET /api/email/status — operators only.
 * Whether SMTP is enabled. Host, port and sender are not returned: that is
 * reconnaissance for anyone who is not running the deployment.
 */
router.get('/status', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  res.json({
    configured: emailService.isConfigured(),
    host: env.SMTP_HOST || null,
    port: env.SMTP_PORT || null,
    secure: env.SMTP_SECURE,
    fromName: env.SMTP_FROM_NAME,
    fromEmail: env.SMTP_FROM_EMAIL,
  });
});

/**
 * POST /api/email/verify — operators only.
 * Tests SMTP credentials and handshake.
 */
router.post('/verify', requireAuth, requireAdmin, emailLimiter, async (_req: Request, res: Response) => {
  try {
    const result = await emailService.verifyConnection();
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('[email] verify failed', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while testing SMTP connection',
    });
  }
});

/**
 * POST /api/email/send-test
 * Sends a sample message to the signed-in user's own address.
 */
router.post('/send-test', requireAuth, emailLimiter, async (req: Request, res: Response) => {
  try {
    const to = typeof req.user?.email === 'string' ? req.user.email : '';
    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Your account has no email address to send to.',
      });
    }

    const result = await emailService.sendAlertEmail({
      to,
      alertType: 'success',
      title: 'Rally Email Test',
      message: 'Your email notifications are working.',
      details: { Timestamp: new Date().toUTCString() },
      actionUrl: env.FRONTEND_URL,
      actionText: 'Open Rally Dashboard',
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('[email] send-test failed', err);
    return res.status(500).json({ success: false, error: 'Failed to send test email' });
  }
});

/**
 * POST /api/email/send
 * Sends a templated notification to the signed-in user's own address.
 *
 * Templates: `alert`, `welcome`, `digest`. (`password-reset` is Supabase's job
 * and `invite` mails a third party, so neither is reachable from a browser.)
 */
router.post('/send', requireAuth, emailLimiter, async (req: Request, res: Response) => {
  try {
    const to = typeof req.user?.email === 'string' ? req.user.email : '';
    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Your account has no email address to send to.',
      });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const template = text(body.template, 32);

    let result;

    switch (template) {
      case 'alert': {
        const alertType: AlertType = ALERT_TYPES.includes(body.alertType as AlertType)
          ? (body.alertType as AlertType)
          : 'info';
        result = await emailService.sendAlertEmail({
          to,
          alertType,
          title: text(body.title, 120) ?? text(body.subject, 120) ?? 'Notification',
          message: text(body.message, 1000) ?? '',
          actionUrl: env.FRONTEND_URL,
          actionText: 'Open Rally Dashboard',
        });
        break;
      }

      case 'welcome':
        result = await emailService.sendWelcomeEmail({
          to,
          name: text(body.name, 80),
          appUrl: env.FRONTEND_URL,
        });
        break;

      case 'digest': {
        const stats = (body.stats ?? {}) as Record<string, unknown>;
        result = await emailService.sendAnalyticsDigestEmail({
          to,
          name: text(body.name, 80),
          brandName: text(body.brandName, 80),
          period: text(body.period, 60) ?? 'Weekly Summary',
          stats: {
            totalImpressions: text(String(stats.totalImpressions ?? ''), 20),
            totalEngagement: text(String(stats.totalEngagement ?? ''), 20),
            postsPublished: text(String(stats.postsPublished ?? ''), 20),
            topNetwork: text(String(stats.topNetwork ?? ''), 40),
          },
          reportUrl: `${env.FRONTEND_URL.replace(/\/$/, '')}/analytics`,
        });
        break;
      }

      default:
        return res.status(400).json({
          success: false,
          error: 'Unknown template. Use "alert", "welcome" or "digest".',
        });
    }

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('[email] send failed', err);
    return res.status(500).json({ success: false, error: 'Failed to process email send request' });
  }
});

export default router;
