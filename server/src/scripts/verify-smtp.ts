import { emailService } from '../services/email.service';
import { env } from '../config/env';

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       Rally SMTP End-to-End Verification          ');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`SMTP Host:       ${env.SMTP_HOST}`);
  console.log(`SMTP Port:       ${env.SMTP_PORT}`);
  console.log(`SMTP Secure:     ${env.SMTP_SECURE}`);
  console.log(`SMTP User:       ${env.SMTP_USER}`);
  console.log(`Sender Name:     ${env.SMTP_FROM_NAME}`);
  console.log(`Sender Email:    ${env.SMTP_FROM_EMAIL}`);
  console.log('───────────────────────────────────────────────────');

  // Step 1: Verify Connection Handshake
  console.log('\n[1/2] Testing SMTP Handshake & Authentication...');
  const verifyResult = await emailService.verifyConnection();
  if (!verifyResult.success) {
    console.error('❌ SMTP Connection Failed:');
    console.error(verifyResult.message);
    process.exit(1);
  }
  console.log('✅ SMTP Connection & Authentication Successful!');
  console.log(`    ${verifyResult.message}`);

  // Step 2: Send End-to-End Test Email
  console.log('\n[2/2] Sending End-to-End Verification Email to ' + env.SMTP_USER + '...');
  const sendResult = await emailService.sendAlertEmail({
    to: env.SMTP_USER,
    alertType: 'success',
    title: '🎉 Rally SMTP Integration Verified!',
    message: 'Your Google SMTP connection is active and fully verified. Rally can now send system alerts, password resets, analytics digests, and notifications directly to your inbox.',
    details: {
      'App Name': 'Rally',
      'Environment': 'Development / Verified',
      'Verified At': new Date().toUTCString(),
      'Transport': `Gmail (${env.SMTP_HOST}:${env.SMTP_PORT})`,
      'Sender': `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
    },
    actionUrl: env.FRONTEND_URL,
    actionText: 'Open Rally Hub',
  });

  if (!sendResult.success) {
    console.error('❌ Failed to send email:');
    console.error(sendResult.error);
    process.exit(1);
  }

  console.log('✅ Email Delivered Successfully!');
  console.log(`    Message ID: ${sendResult.messageId}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌟 All SMTP verifications passed with 100% success!');
}

main().catch((err) => {
  console.error('Unexpected error during verification:', err);
  process.exit(1);
});
