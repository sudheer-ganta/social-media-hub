import axios from 'axios';
import { ProviderError } from '../provider.interface';
import type { ProviderMediaAsset } from '../provider.interface';
import { xConfig } from './config';
import { REQUEST_TIMEOUT_MS, UPLOAD_TIMEOUT_MS, toProviderError } from './http';
import { validatePost } from './validator';
import type {
  XCreateTweetRequest,
  XCreateTweetResponse,
  XMediaUploadResponse,
  XPublishInput,
  XPublishResult,
} from './types';

/**
 * Publishing a post to X. The only module that knows how that happens.
 *
 * Same contract as the LinkedIn, Instagram and Facebook publishers: takes an
 * access token and primitives, talks to the network, returns a provider-neutral
 * result. No Prisma, no Express, no `PostPlatform`.
 *
 * A text post is one call: `POST /2/tweets` with a JSON `{ text }`. There is no
 * container flow (Instagram), no second endpoint for the post itself (Facebook)
 * and no versioned header (LinkedIn) — X's v2 create-post is genuinely this
 * small, and adding structure "for symmetry" would be inventing a state machine
 * the API does not have.
 *
 * ─── Images ──────────────────────────────────────────────────────────────────
 *
 * X is the only network here that wants the **bytes**, like LinkedIn, rather
 * than fetching a URL, like Meta. Each image is uploaded to `/2/media/upload`
 * first and the post then references the ids that come back, in order:
 *
 *   POST /2/media/upload  «multipart bytes»  → media id
 *   POST /2/tweets        { text, media: { media_ids: [...] } }
 *
 * Uploads come first for the same reason they do on LinkedIn: an uploaded image
 * nobody references expires on X's side and is invisible, where a post
 * referencing an id that never arrived is not expressible at all.
 *
 * Uploading needs the `media.write` scope, which is newer than this integration.
 * A connection made before it was requested posts text exactly as it always did
 * and is refused, with a message naming the fix, the moment it tries to attach
 * an image — never quietly downgraded to a text post.
 */

/**
 * Creates a post on the connected X account.
 *
 * The access token is a parameter and is never stored, logged, or included in an
 * error — it exists inside this call and nowhere else. `providerAccountId` is
 * *not* sent: `/2/tweets` posts as whoever the bearer token authenticates, which
 * is by construction the account this connection was made for.
 *
 * Resolves with the post's id and a permalink. Throws {@link ProviderError} on
 * any failure, carrying `upstreamStatus` so the service layer can tell a dead
 * token from a bad minute at X.
 */
export async function publish(input: XPublishInput): Promise<XPublishResult> {
  // Everything knowable without a network call, checked before we spend one.
  const { text, media } = validatePost({
    caption: input.caption,
    media: input.media,
  });

  // In order, and before the post exists: `media_ids` order is render order.
  const mediaIds: string[] = [];
  for (const asset of media) {
    mediaIds.push(await uploadImage(input.accessToken, asset));
  }

  const body: XCreateTweetRequest = {
    text,
    ...(mediaIds.length > 0 ? { media: { media_ids: mediaIds } } : {}),
  };

  let response: { data: XCreateTweetResponse };
  try {
    response = await axios.post<XCreateTweetResponse>(
      `${xConfig.apiUrl}/tweets`,
      body,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.accessToken}`,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
  } catch (error) {
    throw toProviderError(error, 'post publish');
  }

  const id = response.data?.data?.id?.trim();
  if (!id) {
    // A 2xx with no id is not a success we can record: without it we cannot
    // link to the post or delete it later.
    throw new ProviderError('X accepted the post but returned no id', 502, 'x');
  }

  return {
    urn: id,
    // `/i/web/status/<id>` is X's own handle-independent permalink and it
    // redirects to the canonical URL. Using it means the link does not break
    // when a member changes their handle, and it can be built without spending a
    // profile request to learn what the handle currently is.
    url: `https://x.com/i/web/status/${id}`,
    endpoint: 'tweets',
    mediaUrns: mediaIds,
  };
}

/**
 * Uploads one image and returns the id a post references it by.
 *
 * Multipart, because that is what the endpoint takes — the bytes are already in
 * memory, checked by the validator against X's own format and size rules, so
 * nothing here re-reads or re-fetches anything.
 *
 * A 401 or 403 on this call is translated rather than passed through. The
 * overwhelmingly likely cause is a connection made before `media.write` was
 * requested, and "X media upload failed (HTTP 403)" tells a member nothing they
 * can act on where "reconnect X" tells them exactly what to do.
 */
async function uploadImage(
  accessToken: string,
  asset: ProviderMediaAsset,
): Promise<string> {
  const form = new FormData();
  // `new Uint8Array(...)` rather than the Buffer itself: a Buffer is a view
  // over a possibly-shared ArrayBuffer, which is not a BlobPart. This copies
  // nothing — it is a second view over the same memory.
  form.append(
    'media',
    new Blob([new Uint8Array(asset.data)], { type: asset.mimeType }),
  );
  // Tells X what the upload is for. Without it the media is accepted but not
  // necessarily attachable to a post.
  form.append('media_category', 'tweet_image');

  let response;
  try {
    response = await axios.post<XMediaUploadResponse>(
      xConfig.mediaUploadUrl,
      form,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: UPLOAD_TIMEOUT_MS,
        // The bytes are already bounded by the validator; axios' own default
        // body cap would reject them a second time.
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      },
    );
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 401 || status === 403) {
      throw new ProviderError(
        'FlowPost needs permission to upload images to X. Reconnect your X ' +
          'account under Integrations, then publish again.',
        400,
        'x',
        status,
      );
    }
    throw toProviderError(error, 'media upload');
  }

  // The string id, never the numeric one: X publishes both because the number
  // is too large for a JavaScript float to hold exactly.
  const id =
    response.data?.data?.id?.trim() || response.data?.media_id_string?.trim();

  if (!id) {
    throw new ProviderError(
      'X accepted the image but returned no media id',
      502,
      'x',
      response.status,
    );
  }

  return id;
}

export const xPublisherService = { publish };
