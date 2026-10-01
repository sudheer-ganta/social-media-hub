import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

const envMock = vi.hoisted(() => ({
  CLOUDINARY_CLOUD_NAME: 'demo-cloud',
  CLOUDINARY_API_KEY: '123456',
  CLOUDINARY_API_SECRET: 'super-secret-value',
  CLOUDINARY_SIGNED_PRESET: '',
}));
vi.mock('../config/env', () => ({ env: envMock }));

import { cloudinaryService, CloudinaryUploadError } from './cloudinary.service';

// Cloudinary's documented rule, re-implemented here on purpose: sort the params,
// join key=value with &, append the secret, SHA-1.
const expected = (params: Record<string, string>) =>
  createHash('sha1')
    .update(
      Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&') + envMock.CLOUDINARY_API_SECRET,
    )
    .digest('hex');

beforeEach(() => {
  envMock.CLOUDINARY_SIGNED_PRESET = '';
  envMock.CLOUDINARY_API_SECRET = 'super-secret-value';
});

describe('cloudinaryService.signUpload', () => {
  it('signs exactly the parameters the browser will send', () => {
    const s = cloudinaryService.signUpload('user-123', 'image');
    expect(s.signature).toBe(
      expected({ allowed_formats: s.allowedFormats, folder: s.folder, timestamp: s.timestamp }),
    );
  });

  it('puts every member in their own folder, whatever the id contains', () => {
    expect(cloudinaryService.signUpload('abc-123', 'image').folder).toBe('flowpost/uploads/abc-123');
    // A hostile id cannot climb out of the uploads folder.
    expect(cloudinaryService.signUpload('../../other/../x', 'image').folder).toBe('flowpost/uploads/otherx');
  });

  it('restricts formats by resource type, inside the signature', () => {
    const image = cloudinaryService.signUpload('u', 'image');
    const video = cloudinaryService.signUpload('u', 'video');
    expect(image.allowedFormats).not.toMatch(/mp4|exe|svg|html|php/);
    expect(video.allowedFormats).toContain('mp4');
    expect(video.allowedFormats).not.toContain('png');
    expect(image.signature).not.toBe(video.signature);
  });

  it('includes a signed preset in the signature when one is configured', () => {
    envMock.CLOUDINARY_SIGNED_PRESET = 'signed_limits';
    const s = cloudinaryService.signUpload('u', 'image');
    expect(s.uploadPreset).toBe('signed_limits');
    expect(s.signature).toBe(
      expected({
        allowed_formats: s.allowedFormats,
        folder: s.folder,
        timestamp: s.timestamp,
        upload_preset: 'signed_limits',
      }),
    );
  });

  it('never returns the API secret', () => {
    const s = cloudinaryService.signUpload('u', 'image');
    expect(JSON.stringify(s)).not.toContain(envMock.CLOUDINARY_API_SECRET);
  });

  it('refuses to sign when storage is not configured', () => {
    envMock.CLOUDINARY_API_SECRET = '';
    expect(() => cloudinaryService.signUpload('u', 'image')).toThrow(CloudinaryUploadError);
  });
});
