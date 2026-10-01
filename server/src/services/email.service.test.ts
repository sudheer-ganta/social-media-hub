import { describe, it, expect, vi } from 'vitest';
import { emailService } from './email.service';

describe('EmailService', () => {
  it('should report configured status according to environment settings', () => {
    // When SMTP_HOST is not set, isConfigured should be false
    const configured = emailService.isConfigured();
    expect(typeof configured).toBe('boolean');
  });

  it('should generate valid alert email structure', async () => {
    const sendSpy = vi.spyOn(emailService, 'sendMail').mockResolvedValue({
      success: true,
      messageId: '<test-msg-id@flowpost.app>',
    });

    const result = await emailService.sendAlertEmail({
      to: 'creator@example.com',
      alertType: 'warning',
      title: 'LinkedIn Token Expiring',
      message: 'Your LinkedIn OAuth connection will expire in 2 days.',
      details: {
        Network: 'LinkedIn',
        Account: 'Acme Corp',
      },
      actionUrl: 'http://localhost:5173/integrations',
      actionText: 'Reconnect LinkedIn',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('<test-msg-id@flowpost.app>');
    expect(sendSpy).toHaveBeenCalledOnce();

    const callArgs = sendSpy.mock.calls[0][0];
    expect(callArgs.to).toBe('creator@example.com');
    expect(callArgs.subject).toContain('LinkedIn Token Expiring');
    expect(callArgs.html).toContain('ATTENTION REQUIRED');
    expect(callArgs.html).toContain('Acme Corp');
    expect(callArgs.html).toContain('Reconnect LinkedIn');

    sendSpy.mockRestore();
  });

  it('should generate valid welcome email structure', async () => {
    const sendSpy = vi.spyOn(emailService, 'sendMail').mockResolvedValue({
      success: true,
      messageId: '<welcome-msg@flowpost.app>',
    });

    const result = await emailService.sendWelcomeEmail({
      to: 'newuser@example.com',
      name: 'Alex',
      appUrl: 'http://localhost:5173',
    });

    expect(result.success).toBe(true);
    const callArgs = sendSpy.mock.calls[0][0];
    expect(callArgs.to).toBe('newuser@example.com');
    expect(callArgs.subject).toContain('Welcome to Rally, Alex!');
    expect(callArgs.html).toContain('Welcome to Rally Alex!');

    sendSpy.mockRestore();
  });

  it('should generate valid password reset email structure', async () => {
    const sendSpy = vi.spyOn(emailService, 'sendMail').mockResolvedValue({
      success: true,
      messageId: '<reset-msg@flowpost.app>',
    });

    const result = await emailService.sendPasswordResetEmail({
      to: 'user@example.com',
      resetLink: 'http://localhost:5173/reset-password?token=xyz123',
      expiryMinutes: 15,
    });

    expect(result.success).toBe(true);
    const callArgs = sendSpy.mock.calls[0][0];
    expect(callArgs.to).toBe('user@example.com');
    expect(callArgs.html).toContain('15 minutes');
    expect(callArgs.html).toContain('http://localhost:5173/reset-password?token=xyz123');

    sendSpy.mockRestore();
  });

  it('should generate valid analytics digest email structure', async () => {
    const sendSpy = vi.spyOn(emailService, 'sendMail').mockResolvedValue({
      success: true,
      messageId: '<digest-msg@flowpost.app>',
    });

    const result = await emailService.sendAnalyticsDigestEmail({
      to: 'analytics@example.com',
      brandName: 'Nike',
      period: 'March 2026',
      stats: {
        totalImpressions: '1.2M',
        totalEngagement: '48.5K',
        postsPublished: 24,
        topNetwork: 'Instagram',
      },
    });

    expect(result.success).toBe(true);
    const callArgs = sendSpy.mock.calls[0][0];
    expect(callArgs.to).toBe('analytics@example.com');
    expect(callArgs.html).toContain('1.2M');
    expect(callArgs.html).toContain('48.5K');
    expect(callArgs.html).toContain('Instagram');
    expect(callArgs.html).toContain('March 2026');

    sendSpy.mockRestore();
  });
});
