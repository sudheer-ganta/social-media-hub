/**
 * Server-side signed Cloudinary uploads — the path AI-generated images use
 * to land in the SAME Cloudinary account the frontend's unsigned uploads
 * already use. Nothing here talks to a real Cloudinary account: `fetch` is
 * mocked, and what is asserted is the request FlowPost actually sends
 * (folder, resource type, signed params) and how it degrades when Cloudinary
 * itself misbehaves.
 *
 * Run: cd server && npx vitest run src/services/cloudinary.service.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
});

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { cloudinaryService, CloudinaryUploadError } from './cloudinary.service';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('isConfigured', () => {
  it('is true when the existing server-side Cloudinary variables are set — no new ones introduced', () => {
    expect(cloudinaryService.isConfigured()).toBe(true);
  });
});

describe('uploadImageBuffer', () => {
  it('uploads into the flowpost/generated folder, as an image resource, on the same account', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/flowpost/generated/x.png', public_id: 'flowpost/generated/x', width: 1024, height: 1024, format: 'png' }),
    );

    const result = await cloudinaryService.uploadImageBuffer(Buffer.from('fake'), 'image/png');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.cloudinary.com/v1_1/test-cloud/image/upload');
    const form = init.body as FormData;
    expect(form.get('folder')).toBe('flowpost/generated');
    expect(form.get('api_key')).toBe('test-key');
    // The secret itself never rides in the request body — only its signature does.
    expect(form.get('api_secret')).toBeNull();

    expect(result.url).toContain('flowpost/generated');
    expect(result.publicId).toBe('flowpost/generated/x');
    expect(result.width).toBe(1024);
    expect(result.format).toBe('png');
  });

  it('hits the video resource endpoint when resourceType is passed, without a second adapter', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ secure_url: 'https://res.cloudinary.com/x.mp4', public_id: 'flowpost/generated/x' }));
    await cloudinaryService.uploadImageBuffer(Buffer.from('fake'), 'video/mp4', 'flowpost/generated', 'video');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.cloudinary.com/v1_1/test-cloud/video/upload');
  });

  it('retries once on a transient failure before giving up — a Cloudinary blip does not require re-calling Gemini', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(jsonResponse({ secure_url: 'https://res.cloudinary.com/x.png', public_id: 'flowpost/generated/x' }));

    const result = await cloudinaryService.uploadImageBuffer(Buffer.from('fake'), 'image/png');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.url).toBe('https://res.cloudinary.com/x.png');
  });

  it('throws CloudinaryUploadError, not a generic error, after every attempt fails', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    await expect(cloudinaryService.uploadImageBuffer(Buffer.from('fake'), 'image/png')).rejects.toBeInstanceOf(
      CloudinaryUploadError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws when Cloudinary rejects the upload with a 4xx', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Invalid image file' } }, false, 400));

    await expect(cloudinaryService.uploadImageBuffer(Buffer.from('fake'), 'image/png')).rejects.toBeInstanceOf(
      CloudinaryUploadError,
    );
  });
});
