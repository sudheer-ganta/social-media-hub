import { createHash } from 'crypto';
import { env } from '../config/env';

/**
 * Signed, backend-side Cloudinary uploads — for pushing bytes the server
 * already holds (a Gemini-generated image) into the SAME Cloudinary account
 * the frontend's unsigned `cloudinaryService.uploadMedia` already uploads to.
 * `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` (server/src/config/env.ts) name
 * that account — same cloud, a signed upload path rather than the browser's
 * unsigned preset, because these bytes never passed through a browser.
 *
 * This is the ONLY place FlowPost stores media: no Supabase Storage, no S3,
 * no second CDN. A generated image becomes a Cloudinary asset exactly like an
 * uploaded one, so every downstream system — crop (`src/utils/crop.ts`),
 * `MediaFormatPanel`, the publish pipeline — sees an ordinary URL and cannot
 * tell the two apart.
 *
 * No `cloudinary` SDK: this is one POST, Node has had a global `fetch` and
 * `FormData` since 18, and a dependency here would be one more thing to keep
 * patched for a single request — the same call `gemini.provider.ts` makes
 * about not pulling in `@google/generative-ai`.
 *
 * Cloudinary's signing rule: SHA-1 of every param that will ride the request
 * *except* `file`, `cloud_name`, `resource_type` and `api_key`, sorted by key,
 * joined `key=value&key=value`, with the API secret appended — hex-encoded.
 * https://cloudinary.com/documentation/authentication_signatures
 */

export class CloudinaryUploadError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'CloudinaryUploadError';
  }
}

function isConfigured(): boolean {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
  );
}

function sign(params: Record<string, string>): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(`${toSign}${env.CLOUDINARY_API_SECRET}`).digest('hex');
}

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
}

interface CloudinaryApiResponse {
  secure_url: string;
  public_id: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  error?: { message?: string };
}

type CloudinaryResourceType = 'image' | 'video' | 'raw';

/**
 * Two attempts, same tolerance `gemini.provider.ts` has for a transient
 * vendor failure — and the reason it matters more here: a retry that had to
 * re-run the model call as well would burn a second, real Gemini generation
 * just because Cloudinary blipped. This keeps that cost out of the retry.
 */
const MAX_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function uploadOnce(
  data: Buffer,
  mimeType: string,
  folder: string,
  resourceType: CloudinaryResourceType,
): Promise<CloudinaryApiResponse> {
  const timestamp = Math.round(Date.now() / 1000).toString();
  const signature = sign({ folder, timestamp });

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(data)], { type: mimeType }));
  form.append('api_key', env.CLOUDINARY_API_KEY);
  form.append('timestamp', timestamp);
  form.append('folder', folder);
  form.append('signature', signature);

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
      { method: 'POST', body: form },
    );
  } catch (error) {
    throw new CloudinaryUploadError(
      'Could not reach image storage. Please try again.',
      error instanceof Error ? error.message : String(error),
    );
  }

  const body = (await response.json().catch(() => ({}))) as CloudinaryApiResponse;

  if (!response.ok || !body.secure_url) {
    throw new CloudinaryUploadError(
      'Image storage rejected the upload.',
      body.error?.message ?? `HTTP ${response.status}`,
    );
  }

  return body;
}

export const cloudinaryService = {
  isConfigured,

  /**
   * Uploads bytes the backend already holds — a Gemini-generated image, not
   * a browser file — into the same Cloudinary account and folder convention
   * as everything else. `folder` groups generated creatives apart from
   * member uploads in the Cloudinary console — purely organisational, not a
   * distinct account or delivery path. `resourceType` defaults to `image`,
   * the only kind this phase produces; kept as a parameter so a future video
   * generation path is an argument, not a second adapter.
   */
  async uploadImageBuffer(
    data: Buffer,
    mimeType: string,
    folder = 'flowpost/generated',
    resourceType: CloudinaryResourceType = 'image',
  ): Promise<CloudinaryUploadResult> {
    if (!isConfigured()) {
      throw new CloudinaryUploadError(
        'Image storage is not configured on this server.',
        'CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET is empty',
      );
    }

    let lastError: CloudinaryUploadError | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const body = await uploadOnce(data, mimeType, folder, resourceType);
        return {
          url: body.secure_url,
          publicId: body.public_id,
          ...(body.width ? { width: body.width } : {}),
          ...(body.height ? { height: body.height } : {}),
          ...(body.bytes ? { bytes: body.bytes } : {}),
          ...(body.format ? { format: body.format } : {}),
        };
      } catch (error) {
        lastError = error instanceof CloudinaryUploadError ? error : undefined;
        if (attempt === MAX_ATTEMPTS) break;
        console.warn('[cloudinary] upload attempt failed, retrying', {
          attempt,
          detail: lastError?.detail,
        });
        await sleep(RETRY_BACKOFF_MS * attempt);
      }
    }

    throw lastError ?? new CloudinaryUploadError('Image storage rejected the upload.');
  },
};
