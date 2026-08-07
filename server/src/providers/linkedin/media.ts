import axios, { type AxiosResponse } from 'axios';
import { ProviderError } from '../provider.interface';
import { linkedinConfig } from './config';
import {
  UPLOAD_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  legacyHeaders,
  shouldFallBack,
  toProviderError,
  versionedHeaders,
} from './http';
import type {
  LinkedInMediaAsset,
  LinkedInMediaEndpoint,
  LinkedInUploadedMedia,
} from './types';

/**
 * Getting bytes onto LinkedIn and getting URNs back.
 *
 * This is the only module that knows how media is uploaded, the same way
 * `publisher.ts` is the only one that knows how a post is created. The split
 * matters more than it looks: uploading and publishing fail differently, and an
 * upload that half-succeeded must never be retried by code whose job is
 * publishing.
 *
 * ─── The flow ────────────────────────────────────────────────────────────────
 *
 *   POST /rest/images?action=initializeUpload   → uploadUrl + urn:li:image:…
 *   PUT  {uploadUrl}  «raw bytes»               → 201
 *   …the URN then goes into the post body, which is the publisher's job.
 *
 * The PUT carries the bearer token. That is not an oversight to be tidied away
 * later: LinkedIn's image upload *requires* the Authorization header and their
 * video upload *rejects* it. When video lands here, that asymmetry is the first
 * thing to get right.
 *
 * ─── Who picks the endpoint ──────────────────────────────────────────────────
 *
 * This module does, and it tells the publisher which one it used. The versioned
 * Images API pairs with `/rest/posts` and the legacy Assets API pairs with
 * `/v2/ugcPosts`; a URN from one family cannot be assumed to work in the
 * other's post body. Since the probe that answers "which family?" *is* the
 * first upload call, the decision can only be made here — and it is made before
 * a single byte moves, so no path can strand a half-uploaded asset.
 *
 * ─── What we cannot do ───────────────────────────────────────────────────────
 *
 * With only `w_member_social` the versioned gateway is write-only, so there is
 * no `GET /rest/images/{urn}` available to confirm processing finished — and
 * the Images API does not support the Assets API's `SYNCHRONOUS_UPLOAD` either.
 * LinkedIn warns that a post created before its image finishes processing may
 * not be visible to members. The only ordering guarantee available on that path
 * is the 201 on the PUT, so {@link uploadMedia} resolves on it and never
 * earlier, and the publisher builds no post body until it has.
 */

/** What one upload run produced, and which family produced it. */
export interface MediaUploadResult {
  endpoint: LinkedInMediaEndpoint;
  media: LinkedInUploadedMedia[];
}

/**
 * Uploads every asset for one post and returns their URNs in the same order.
 *
 * Throws {@link ProviderError}. A failure means nothing usable was created; the
 * caller must not publish a post that references a URN it did not receive.
 */
export async function uploadMedia(input: {
  accessToken: string;
  ownerUrn: string;
  assets: LinkedInMediaAsset[];
}): Promise<MediaUploadResult> {
  const { accessToken, ownerUrn, assets } = input;

  for (const asset of assets) {
    if (asset.kind !== 'image') {
      // Reached only if the validator's supported-kind list and this branch
      // drift apart. Loud rather than silent: publishing a post that quietly
      // dropped the member's video would be worse than failing.
      throw new ProviderError(
        `LinkedIn ${asset.kind} upload is not implemented yet`,
        501,
        'linkedin',
      );
    }
  }

  // One probe decides the family for the whole post. Two images must never end
  // up as one image URN and one asset URN — no post body can express that.
  const initialized = await initializeImageUpload(accessToken, ownerUrn);
  const endpoint: LinkedInMediaEndpoint = initialized ? 'images' : 'assets';

  const media: LinkedInUploadedMedia[] = [];

  for (const [index, asset] of assets.entries()) {
    // The probe already registered an upload slot; the first asset fills it
    // rather than wasting it and registering another.
    const target =
      index === 0 && initialized
        ? initialized
        : endpoint === 'images'
          ? await requireImageUpload(accessToken, ownerUrn)
          : await registerAssetUpload(accessToken, ownerUrn);

    await putBytes(target.uploadUrl, accessToken, asset);

    media.push({
      kind: asset.kind,
      urn: target.urn,
      altText: asset.altText,
      endpoint,
    });
  }

  return { endpoint, media };
}

/** An upload slot: where to PUT, and what the result will be called. */
interface UploadTarget {
  uploadUrl: string;
  urn: string;
}

/**
 * Asks whether the versioned Images API will serve this app at all.
 *
 * Returns an upload slot, or null when LinkedIn's answer means "not this door"
 * — the cue to run the legacy family instead. Anything else throws, because a
 * 401 or a 500 is a real failure and retrying it on the other endpoint would
 * only produce a second, more confusing one.
 *
 * Safe as a probe precisely because an initialized upload that is never filled
 * simply expires. There is nothing to clean up if the answer is no.
 */
async function initializeImageUpload(
  accessToken: string,
  ownerUrn: string,
): Promise<UploadTarget | null> {
  let response: AxiosResponse<{
    value?: { uploadUrl?: string; image?: string };
  }>;

  try {
    response = await axios.post(
      `${linkedinConfig.imagesUrl}?action=initializeUpload`,
      { initializeUploadRequest: { owner: ownerUrn } },
      { headers: versionedHeaders(accessToken), timeout: REQUEST_TIMEOUT_MS },
    );
  } catch (error) {
    if (shouldFallBack(error)) {
      console.warn('[linkedin] versioned Images API rejected initializeUpload', {
        status: axios.isAxiosError(error) ? error.response?.status : undefined,
        apiVersion: linkedinConfig.apiVersion,
        note: 'falling back to /v2/assets + /v2/ugcPosts for this post',
      });
      return null;
    }
    throw toProviderError(error, 'image upload');
  }

  const uploadUrl = response.data?.value?.uploadUrl;
  const urn = response.data?.value?.image;

  if (!uploadUrl || !urn) {
    // A 200 without both fields is not something to fall back on — the endpoint
    // answered, it just answered with something we cannot use.
    throw new ProviderError(
      'LinkedIn accepted the image upload request but returned no upload URL',
      502,
      'linkedin',
      response.status,
    );
  }

  return { uploadUrl, urn };
}

/**
 * A second (or third) Images API slot, once the family is already settled.
 *
 * Unlike the probe, a null here is not a fallback signal — the first asset has
 * already been uploaded to this family and there is no going back. Treated as
 * the failure it is.
 */
async function requireImageUpload(
  accessToken: string,
  ownerUrn: string,
): Promise<UploadTarget> {
  const target = await initializeImageUpload(accessToken, ownerUrn);
  if (!target) {
    throw new ProviderError(
      'LinkedIn stopped accepting image uploads part-way through this post',
      502,
      'linkedin',
    );
  }
  return target;
}

/**
 * The legacy slot: `/v2/assets?action=registerUpload` → `urn:li:digitalmediaAsset:…`.
 *
 * Registers under the feedshare-image recipe because that is the only one the
 * consumer Share on LinkedIn product documents, and an asset registered under
 * the wrong recipe is rejected at post time rather than at upload time.
 *
 * `SYNCHRONOUS_UPLOAD` is requested here — the Assets API supports it and the
 * Images API does not — which makes this path, ironically, the one with the
 * stronger guarantee that the image is ready when the post goes out.
 */
async function registerAssetUpload(
  accessToken: string,
  ownerUrn: string,
): Promise<UploadTarget> {
  let response: AxiosResponse<{
    value?: {
      asset?: string;
      uploadMechanism?: Record<string, { uploadUrl?: string }>;
    };
  }>;

  try {
    response = await axios.post(
      `${linkedinConfig.assetsUrl}?action=registerUpload`,
      {
        registerUploadRequest: {
          owner: ownerUrn,
          recipes: [linkedinConfig.feedshareImageRecipe],
          serviceRelationships: [
            {
              identifier: 'urn:li:userGeneratedContent',
              relationshipType: 'OWNER',
            },
          ],
          supportedUploadMechanism: ['SYNCHRONOUS_UPLOAD'],
        },
      },
      { headers: legacyHeaders(accessToken), timeout: REQUEST_TIMEOUT_MS },
    );
  } catch (error) {
    throw toProviderError(error, 'image upload');
  }

  const urn = response.data?.value?.asset;
  // The upload URL is nested under a fully-qualified Rest.li union key. Read by
  // shape rather than by that exact string: the key is versioned in LinkedIn's
  // schema, and there is only ever one mechanism in the response.
  const mechanisms = Object.values(response.data?.value?.uploadMechanism ?? {});
  const uploadUrl = mechanisms.find((entry) => entry?.uploadUrl)?.uploadUrl;

  if (!urn || !uploadUrl) {
    throw new ProviderError(
      'LinkedIn registered the image upload but returned no upload URL',
      502,
      'linkedin',
      response.status,
    );
  }

  return { uploadUrl, urn };
}

/**
 * The upload itself, identical for both endpoint families.
 *
 * Deliberately not retried. A PUT that timed out may well have landed, and a
 * second one would either duplicate the asset or race the first — neither is
 * worth the one case where a retry would have helped, because the member can
 * retry the publish themselves and the post has not been created yet.
 */
async function putBytes(
  uploadUrl: string,
  accessToken: string,
  asset: LinkedInMediaAsset,
): Promise<void> {
  try {
    await axios.put(uploadUrl, asset.data, {
      headers: {
        // Required for images; must be *absent* for video uploads. See header.
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': asset.mimeType,
      },
      timeout: UPLOAD_TIMEOUT_MS,
      // The bytes are already in memory and already checked against our own
      // ceiling; axios' default 10MB body cap would reject them a second time.
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  } catch (error) {
    throw toProviderError(error, 'image upload');
  }
}

export const linkedinMedia = { uploadMedia };
