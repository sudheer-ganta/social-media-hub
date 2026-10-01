import { Router, Request, Response } from 'express';
import { emailService } from '../services/email.service';
import { requireAuth } from '../middleware/auth.middleware';
import { env } from '../config/env';

const router = Router();

/**
 * GET /api/email/status
 * Returns whether SMTP is enabled and current host metadata.
 */
router.get('/status', (req: Request, res: Response) => {
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
 * POST /api/email/verify
 * Tests SMTP credentials and handshake.
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const result = await emailService.verifyConnection();
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Internal server error while testing SMTP connection',
    });
  }
});

/**
 * POST /api/email/send-test
 * Sends a sample test email to verify end-to-end delivery.
 * Requires auth or accepts destination email in body.
 */
router.post('/send-test', requireAuth, async (req: Request, res: Response) => {
  try {
    const userEmail = req.body.to || (req as any).user?.email;
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'Destination email address ("to") is required.',
      });
    }

    const result = await emailService.sendAlertEmail({
      to: userEmail,
      alertType: 'success',
      title: 'Rally SMTP Integration Test',
      message: 'Congratulations! Your SMTP settings have been configured and verified successfully.',
      details: {
        'Timestamp': new Date().toUTCString(),
        'SMTP Host': env.SMTP_HOST,
        'SMTP Port': env.SMTP_PORT,
        'Sender': `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
      },
      actionUrl: env.FRONTEND_URL,
      actionText: 'Open Rally Dashboard',
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to send test email',
    });
  }
});

/**
 * POST /api/email/send
 * General-purpose endpoint to dispatch custom or templated emails.
 */
router.post('/send', requireAuth, async (req: Request, res: Response) => {
  try {
    const { template, to, subject, html, text, ...params } = req.body;

    if (!to) {
      return res.status(400).json({ success: false, error: 'Recipient "to" is required' });
    }

    let result;

    switch (template) {
      case 'alert':
        result = await emailService.sendAlertEmail({
          to,
          alertType: params.alertType || 'info',
          title: params.title || subject || 'System Alert',
          message: params.message || '',
          details: params.details,
          actionUrl: params.actionUrl,
          actionText: params.actionText,
        });
        break;

      case 'welcome':
        result = await emailService.sendWelcomeEmail({
          to,
          name: params.name,
          appUrl: params.appUrl,
        });
        break;

      case 'password-reset':
        if (!params.resetLink) {
          return res.status(400).json({ success: false, error: 'resetLink is required for password-reset template' });
        }
        result = await emailService.sendPasswordResetEmail({
          to,
          name: params.name,
          resetLink: params.resetLink,
          expiryMinutes: params.expiryMinutes,
        });
        break;

      case 'digest':
        result = await emailService.sendAnalyticsDigestEmail({
          to,
          name: params.name,
          brandName: params.brandName,
          period: params.period || 'Weekly Summary',
          stats: params.stats || {},
          reportUrl: params.reportUrl,
        });
        break;

      case 'invite':
        if (!params.inviteUrl || !params.inviterName || !params.teamName) {
          return res.status(400).json({
            success: false,
            error: 'inviterName, teamName, and inviteUrl are required for invite template',
          });
        }
        result = await emailService.sendTeamInviteEmail({
          to,
          inviterName: params.inviterName,
          teamName: params.teamName,
          role: params.role,
          inviteUrl: params.inviteUrl,
        });
        break;

      default:
        // Raw custom email
        if (!subject || !html) {
          return res.status(400).json({
            success: false,
            error: 'Custom emails require "subject" and "html" body.',
          });
        }
        result = await emailService.sendMail({
          to,
          subject,
          html,
          text,
          replyTo: params.replyTo,
          attachments: params.attachments,
        });
        break;
    }

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to process email send request',
    });
  }
});

export default router;
