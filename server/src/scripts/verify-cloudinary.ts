/**
 * Isolated Cloudinary smoke test — no Gemini call. Uploads a tiny 1×1 PNG
 * through the exact same `cloudinaryService.uploadImageBuffer` the creative
 * pipeline uses, then deletes that one test asset. Proves whether the
 * *current* process's environment can reach Cloudinary, independent of
 * whether some other already-running server process has stale env.
 *
 *   cd server && npx ts-node --transpile-only src/scripts/verify-cloudinary.ts
 */
import { createHash } from 'crypto';
import { env } from '../config/env';
import { cloudinaryService, CloudinaryUploadError } from '../services/cloudinary.service';

// The smallest possible valid PNG: 1x1 transparent pixel.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function destroy(publicId: string) {
  const timestamp = Math.round(Date.now() / 1000).toString();
  const toSign = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = createHash('sha1').update(`${toSign}${env.CLOUDINARY_API_SECRET}`).digest('hex');

  const form = new URLSearchParams({
    public_id: publicId,
    api_key: env.CLOUDINARY_API_KEY,
    timestamp,
    signature,
  });

  const res = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, result: body.result };
}

async function run() {
  console.log('cloudNamePresent:', !!env.CLOUDINARY_CLOUD_NAME);
  console.log('apiKeyPresent:', !!env.CLOUDINARY_API_KEY);
  console.log('apiSecretPresent:', !!env.CLOUDINARY_API_SECRET);
  console.log('isConfigured():', cloudinaryService.isConfigured());

  if (!cloudinaryService.isConfigured()) {
    console.log('\nSTOPPING — Cloudinary is not configured in this process\'s environment.');
    process.exit(1);
  }

  const testId = `test-${Date.now()}`;
  console.log(`\nUploading tiny test PNG as flowpost/generated/${testId}...`);

  try {
    const uploaded = await cloudinaryService.uploadImageBuffer(
      Buffer.from(TINY_PNG_BASE64, 'base64'),
      'image/png',
      'flowpost/generated',
    );
    console.log('SUCCESS');
    console.log('  publicId:', uploaded.publicId);
    console.log('  url:', uploaded.url);
    console.log('  width/height/format:', uploaded.width, uploaded.height, uploaded.format);

    console.log('\nDeleting the test asset...');
    const del = await destroy(uploaded.publicId);
    console.log('  destroy status:', del.status, 'result:', del.result);
  } catch (error) {
    if (error instanceof CloudinaryUploadError) {
      console.error('CLOUDINARY UPLOAD FAILED');
      console.error('  message:', error.message);
      console.error('  detail:', error.detail);
    } else {
      console.error('UNEXPECTED ERROR', error);
    }
    process.exit(1);
  }
}

run();
