import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content?: string | Buffer;
    path?: string;
    contentType?: string;
  }>;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    this.initTransporter();
  }

  /**
   * Initializes or refreshes the nodemailer transporter from current environment config.
   */
  public initTransporter(): void {
    if (this.isConfigured()) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            }
          : undefined,
        // Sensible connection pool timeouts
        connectionTimeout: 10000,
        greetingTimeout: 5000,
        socketTimeout: 15000,
      });
    } else {
      this.transporter = null;
    }
  }

  /**
   * Checks if SMTP credentials have been provided in the environment.
   */
  public isConfigured(): boolean {
    return Boolean(env.SMTP_HOST && (env.SMTP_USER || env.SMTP_PORT === 1025 || env.SMTP_PORT === 25));
  }

  /**
   * Test SMTP server handshake and credentials.
   */
  public async verifyConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'SMTP is not configured. Please set SMTP_HOST and SMTP_USER in your environment.',
      };
    }

    try {
      if (!this.transporter) {
        this.initTransporter();
      }
      if (!this.transporter) {
        throw new Error('Could not instantiate mail transport.');
      }

      await this.transporter.verify();
      return {
        success: true,
        message: `SMTP connection to ${env.SMTP_HOST}:${env.SMTP_PORT} verified successfully.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `SMTP connection error: ${err.message || String(err)}`,
      };
    }
  }

  /**
   * Base email sending method.
   */
  public async sendMail(options: SendMailOptions): Promise<EmailResult> {
    if (!this.isConfigured()) {
      console.warn('[EmailService] SMTP not configured. Simulating mail send to:', options.to);
      console.warn(`[EmailService] Subject: "${options.subject}"`);
      return {
        success: false,
        error: 'SMTP server is not configured in environment variables (SMTP_HOST is empty).',
      };
    }

    try {
      if (!this.transporter) {
        this.initTransporter();
      }
      if (!this.transporter) {
        throw new Error('Transporter unavailable');
      }

      const defaultFrom = `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`;

      const info = await this.transporter.sendMail({
        from: options.from || defaultFrom,
        to: options.to,
        subject: options.subject,
        text: options.text || this.stripHtml(options.html),
        html: options.html,
        replyTo: options.replyTo,
        cc: options.cc,
        bcc: options.bcc,
        attachments: options.attachments,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err: any) {
      console.error('[EmailService] Failed to send email:', err);
      return {
        success: false,
        error: err.message || 'Unknown SMTP error',
      };
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pre-built Email Scenarios & High-Impact Templates
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * System Alert / Notification Email
   * (e.g. Scheduled post failed, OAuth token expired, connection lost)
   */
  public async sendAlertEmail(params: {
    to: string;
    alertType: 'error' | 'warning' | 'info' | 'success';
    title: string;
    message: string;
    details?: Record<string, string | number | undefined>;
    actionUrl?: string;
    actionText?: string;
  }): Promise<EmailResult> {
    const badgeColors = {
      error: { bg: '#FEE2E2', text: '#991B1B', label: 'CRITICAL ALERT' },
      warning: { bg: '#FEF3C7', text: '#92400E', label: 'ATTENTION REQUIRED' },
      info: { bg: '#E0F2FE', text: '#075985', label: 'NOTICE' },
      success: { bg: '#DCFCE7', text: '#166534', label: 'SUCCESS' },
    };

    const badge = badgeColors[params.alertType] || badgeColors.info;

    let detailsHtml = '';
    if (params.details && Object.keys(params.details).length > 0) {
      const rows = Object.entries(params.details)
        .filter(([_, val]) => val !== undefined)
        .map(
          ([key, val]) => `
          <tr>
            <td style="padding: 8px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #E2E8F0; width: 35%;">${this.escapeHtml(key)}</td>
            <td style="padding: 8px 12px; color: #1E293B; border-bottom: 1px solid #E2E8F0;">${this.escapeHtml(String(val))}</td>
          </tr>`
        )
        .join('');

      detailsHtml = `
        <div style="margin: 20px 0; background-color: #F8FAFC; border-radius: 8px; border: 1px solid #E2E8F0; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; text-align: left;">
            ${rows}
          </table>
        </div>
      `;
    }

    const ctaHtml = params.actionUrl
      ? `
        <div style="margin-top: 28px; text-align: center;">
          <a href="${this.safeUrl(params.actionUrl)}" style="background-color: #4F46E5; color: #FFFFFF; padding: 12px 24px; font-weight: 600; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 15px;">
            ${this.escapeHtml(params.actionText || 'View in Dashboard')}
          </a>
        </div>
      `
      : '';

    const html = this.wrapInBaseTemplate(`
      <div style="text-align: left;">
        <div style="display: inline-block; padding: 4px 10px; background-color: ${badge.bg}; color: ${badge.text}; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; border-radius: 9999px; margin-bottom: 12px;">
          ${badge.label}
        </div>
        <h2 style="margin: 0 0 12px 0; color: #0F172A; font-size: 20px; font-weight: 700; line-height: 1.3;">
          ${this.escapeHtml(params.title)}
        </h2>
        <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">
          ${this.escapeHtml(params.message)}
        </p>
        ${detailsHtml}
        ${ctaHtml}
      </div>
    `);

    return this.sendMail({
      to: params.to,
      subject: `[${env.SMTP_FROM_NAME}] ${params.title}`,
      html,
    });
  }

  /**
   * Welcome Email for New Users / Signups
   */
  public async sendWelcomeEmail(params: {
    to: string;
    name?: string;
    appUrl?: string;
  }): Promise<EmailResult> {
    const url = params.appUrl || env.FRONTEND_URL;
    const greetingName = params.name ? ` ${this.escapeHtml(params.name)}` : '';

    const html = this.wrapInBaseTemplate(`
      <div style="text-align: left;">
        <h2 style="margin: 0 0 16px 0; color: #0F172A; font-size: 22px; font-weight: 700;">
          Welcome to Rally${greetingName}! 🚀
        </h2>
        <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">
          We're thrilled to have you onboard. Rally makes managing, scheduling, and generating multi-platform social media content effortless.
        </p>

        <div style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px;">
          <h3 style="margin: 0 0 12px 0; font-size: 15px; color: #1E293B;">Quick Steps to Get Started:</h3>
          <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.8;">
            <li><strong>Connect Accounts:</strong> Link your LinkedIn, Instagram, Facebook, and X accounts in Integrations.</li>
            <li><strong>Define Brand Voice:</strong> Set up your brand tone and guidelines in AI Studio.</li>
            <li><strong>Create & Schedule:</strong> Draft your first high-impact post or generate on-brand creative visuals.</li>
          </ul>
        </div>

        <div style="margin-top: 28px; text-align: center;">
          <a href="${url}" style="background-color: #4F46E5; color: #FFFFFF; padding: 12px 28px; font-weight: 600; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 15px;">
            Go to Your Dashboard
          </a>
        </div>
      </div>
    `);

    return this.sendMail({
      to: params.to,
      subject: `Welcome to Rally${params.name ? ', ' + params.name : ''}!`,
      html,
    });
  }

  /**
   * Password Reset Email
   */
  public async sendPasswordResetEmail(params: {
    to: string;
    name?: string;
    resetLink: string;
    expiryMinutes?: number;
  }): Promise<EmailResult> {
    const expiry = params.expiryMinutes || 30;

    const html = this.wrapInBaseTemplate(`
      <div style="text-align: left;">
        <h2 style="margin: 0 0 16px 0; color: #0F172A; font-size: 20px; font-weight: 700;">
          Reset Your Rally Password
        </h2>
        <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">
          We received a request to reset your password. Click the button below to choose a new password. This link will expire in <strong>${expiry} minutes</strong>.
        </p>

        <div style="margin: 28px 0; text-align: center;">
          <a href="${this.safeUrl(params.resetLink)}" style="background-color: #4F46E5; color: #FFFFFF; padding: 12px 28px; font-weight: 600; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 15px;">
            Reset Password
          </a>
        </div>

        <p style="margin: 0; color: #64748B; font-size: 13px; line-height: 1.5;">
          If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
        </p>
      </div>
    `);

    return this.sendMail({
      to: params.to,
      subject: `[Rally] Password Reset Request`,
      html,
    });
  }

  /**
   * Weekly/Monthly Analytics Digest Email
   */
  public async sendAnalyticsDigestEmail(params: {
    to: string;
    name?: string;
    brandName?: string;
    period: string; // e.g. "Last 7 Days" or "March 2026"
    stats: {
      totalImpressions?: number | string;
      totalEngagement?: number | string;
      postsPublished?: number | string;
      topNetwork?: string;
    };
    reportUrl?: string;
  }): Promise<EmailResult> {
    const url = params.reportUrl || `${env.FRONTEND_URL}/analytics`;
    const brandLabel = params.brandName ? ` for ${this.escapeHtml(params.brandName)}` : '';

    const statCards = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0;">
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 14px; border-radius: 8px; text-align: center;">
          <div style="font-size: 12px; color: #64748B; text-transform: uppercase; font-weight: 600;">Impressions</div>
          <div style="font-size: 22px; font-weight: 700; color: #0F172A; margin-top: 4px;">${this.escapeHtml(String(params.stats.totalImpressions ?? '—'))}</div>
        </div>
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 14px; border-radius: 8px; text-align: center;">
          <div style="font-size: 12px; color: #64748B; text-transform: uppercase; font-weight: 600;">Engagements</div>
          <div style="font-size: 22px; font-weight: 700; color: #0F172A; margin-top: 4px;">${this.escapeHtml(String(params.stats.totalEngagement ?? '—'))}</div>
        </div>
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 14px; border-radius: 8px; text-align: center;">
          <div style="font-size: 12px; color: #64748B; text-transform: uppercase; font-weight: 600;">Posts Published</div>
          <div style="font-size: 22px; font-weight: 700; color: #0F172A; margin-top: 4px;">${this.escapeHtml(String(params.stats.postsPublished ?? '0'))}</div>
        </div>
        <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 14px; border-radius: 8px; text-align: center;">
          <div style="font-size: 12px; color: #64748B; text-transform: uppercase; font-weight: 600;">Top Network</div>
          <div style="font-size: 18px; font-weight: 700; color: #4F46E5; margin-top: 6px;">${this.escapeHtml(String(params.stats.topNetwork ?? 'Multi'))}</div>
        </div>
      </div>
    `;

    const html = this.wrapInBaseTemplate(`
      <div style="text-align: left;">
        <h2 style="margin: 0 0 8px 0; color: #0F172A; font-size: 20px; font-weight: 700;">
          Performance Summary (${this.escapeHtml(params.period)})
        </h2>
        <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px;">
          Here is your social content performance digest${brandLabel}.
        </p>

        ${statCards}

        <div style="margin-top: 24px; text-align: center;">
          <a href="${url}" style="background-color: #4F46E5; color: #FFFFFF; padding: 12px 24px; font-weight: 600; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 14px;">
            Explore Full Analytics
          </a>
        </div>
      </div>
    `);

    return this.sendMail({
      to: params.to,
      subject: `[Rally] ${params.period} Social Performance Digest`,
      html,
    });
  }

  /**
   * Team Member Invite Email
   */
  public async sendTeamInviteEmail(params: {
    to: string;
    inviterName: string;
    teamName: string;
    role?: string;
    inviteUrl: string;
  }): Promise<EmailResult> {
    const html = this.wrapInBaseTemplate(`
      <div style="text-align: left;">
        <h2 style="margin: 0 0 16px 0; color: #0F172A; font-size: 20px; font-weight: 700;">
          Join ${this.escapeHtml(params.teamName)} on Rally
        </h2>
        <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">
          <strong>${this.escapeHtml(params.inviterName)}</strong> has invited you to collaborate on <strong>${this.escapeHtml(params.teamName)}</strong> as a <strong>${this.escapeHtml(params.role || 'Member')}</strong>.
        </p>

        <div style="margin: 28px 0; text-align: center;">
          <a href="${this.safeUrl(params.inviteUrl)}" style="background-color: #4F46E5; color: #FFFFFF; padding: 12px 28px; font-weight: 600; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 15px;">
            Accept Invitation
          </a>
        </div>
      </div>
    `);

    return this.sendMail({
      to: params.to,
      subject: `${params.inviterName} invited you to join ${params.teamName} on Rally`,
      html,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Helper / Layout Methods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Wraps email body content with responsive, brand-styled HTML wrapper.
   */
  private wrapInBaseTemplate(contentHtml: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rally</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F1F5F9; padding: 36px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px; background: linear-gradient(135deg, #1E1B4B 0%, #312E81 100%); text-align: left;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.02em;">Rally</span>
                    <span style="font-size: 12px; color: #A5B4FC; margin-left: 8px; font-weight: 500;">Social Media Hub</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #F8FAFC; border-top: 1px solid #F1F5F9; text-align: center; color: #94A3B8; font-size: 12px;">
              <p style="margin: 0 0 6px 0;">© ${new Date().getFullYear()} Rally. All rights reserved.</p>
              <p style="margin: 0;">Sent via Rally Automated Email Service</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }


  /**
   * A URL safe to drop into an `href`: http(s) only, then attribute-escaped.
   * Anything else (`javascript:`, `data:`, garbage) becomes a harmless `#`.
   */
  private safeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return this.escapeHtml(parsed.toString());
      }
    } catch {
      /* fall through */
    }
    return '#';
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
  }
}

export const emailService = new EmailService();
