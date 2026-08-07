import axios, { type AxiosResponse } from 'axios';
import { ProviderError } from '../provider.interface';
import { linkedinConfig } from './config';
import {
  buildLegacyMediaPostBody,
  buildLegacyTextPostBody,
  buildMediaPostBody,
  buildTextPostBody,
  toPersonUrn,
  toPostUrl,
} from './formatter';
import {
  REQUEST_TIMEOUT_MS,
  legacyHeaders,
  shouldFallBack,
  toProviderError,
  versionedHeaders,
} from './http';
import { uploadMedia } from './media';
import { validatePost } from './validator';
import type {
  LinkedInMediaAsset,
  LinkedInMediaEndpoint,
  LinkedInPublishInput,
  LinkedInPublishResult,
  LinkedInUploadedMedia,
} from './types';

/**
 * Publishing a post to LinkedIn. This module is the *only* thing in the
 * codebase that knows how a share is created.
 *
 * It obeys the same contract as the rest of `providers/linkedin/`: it takes an
 * access token and some data, it talks to LinkedIn, it returns a
 * provider-neutral result. No Prisma, no Express, no `PostPlatform`, no
 * `ActivityLog` — deciding what any of this *means* is the publish service's
 * job, and keeping that line sharp is what will let Instagram reuse the shape.
 *
 * ─── One entry point ─────────────────────────────────────────────────────────
 *
 * {@link publish} is the whole surface. Callers hand it a caption and, if there
 * is any, media; whether that becomes a text post or an image post is decided
 * here and nowhere above. The publish service has no `if (post.image_url)` in
 * it, and when video arrives it still won't.
 *
 * ─── On the two endpoint families ────────────────────────────────────────────
 *
 * LinkedIn documents member publishing in two places that disagree:
 *
 *   • the versioned Posts API (`/rest/posts`), which supersedes everything
 *     else and is what a new integration should use — paired with `/rest/images`
 *     for media;
 *   • the consumer *Share on LinkedIn* guide, which still describes the older
 *     `/v2/ugcPosts` and `/v2/assets`, and is the surface some self-serve apps
 *     are admitted to.
 *
 * Both are authorized by the same `w_member_social` scope. Which one a given
 * app can reach is not discoverable from our side — the developer portal does
 * not say, and the products list is identical either way. So the versioned
 * endpoint is tried first, and *only* a rejection that specifically indicates
 * the version or the endpoint is wrong falls back to the legacy one. A 401, a
 * rate limit or a bad caption is a real failure and is never retried, because
 * retrying those would double-post.
 *
 * The families do not mix. A `urn:li:image:…` belongs in a `/rest/posts` body
 * and a `urn:li:digitalmediaAsset:…` belongs in a `/v2/ugcPosts` body; the ids
 * inside them look interchangeable and are not documented to be. So for a post
 * with media the choice is made once — by `media.ts`, whose first call is the
 * probe that answers it — and this module simply publishes to whichever family
 * the URNs came from. That is also why a media post never falls back at post
 * time: by then bytes have moved, and a retry on the other door would strand
 * the upload or duplicate the post.
 */

/**
 * Creates a post on the member's LinkedIn feed.
 *
 * The access token is a parameter and is never stored, logged, or included in
 * an error — it exists inside this call and nowhere else. Callers are expected
 * to decrypt it immediately before calling and to hold no reference after.
 *
 * Resolves with the created post's URN. Throws {@link ProviderError} on any
 * failure, carrying `upstreamStatus` so the service layer can tell a dead token
 * (401/403) from a bad minute at LinkedIn (5xx) — the same distinction
 * `verify.ts` relies on, and for the same reason.
 */
export async function publish(
  input: LinkedInPublishInput,
): Promise<LinkedInPublishResult> {
  // Everything knowable without a network call, checked before we spend one —
  // including on the media, so an unsupported format costs nothing.
  const { caption, media } = validatePost({
    caption: input.caption,
    media: input.media,
  });
  const authorUrn = toPersonUrn(input.providerAccountId);

  return media.length === 0
    ? publishText({ accessToken: input.accessToken, authorUrn, caption })
    : publishWithMedia({
        accessToken: input.accessToken,
        authorUrn,
        caption,
        media,
      });
}

/**
 * A text-only post.
 *
 * The one path that may fall back at post time: nothing has been uploaded, so
 * a second attempt on the other endpoint costs one request and risks nothing.
 */
async function publishText(input: {
  accessToken: string;
  authorUrn: string;
  caption: string;
}): Promise<LinkedInPublishResult> {
  const { accessToken, authorUrn, caption } = input;
  const body = { authorUrn, caption };

  let response: AxiosResponse;
  let endpoint: 'posts' | 'ugcPosts' = 'posts';

  try {
    response = await createPost(
      accessToken,
      'posts',
      buildTextPostBody(body),
    );
  } catch (error) {
    if (!shouldFallBack(error)) throw toProviderError(error, 'publish');

    console.warn('[linkedin] versioned Posts API rejected the request', {
      status: axios.isAxiosError(error) ? error.response?.status : undefined,
      apiVersion: linkedinConfig.apiVersion,
      note: 'retrying once on the legacy /v2/ugcPosts endpoint',
    });

    try {
      response = await createPost(
        accessToken,
        'ugcPosts',
        buildLegacyTextPostBody(body),
      );
      endpoint = 'ugcPosts';
    } catch (fallbackError) {
      throw toProviderError(fallbackError, 'publish');
    }
  }

  const urn = readCreatedUrn(response);
  return { urn, url: toPostUrl(urn), endpoint, mediaUrns: [] };
}

/**
 * A post with media: upload first, then publish to the matching endpoint.
 *
 * The ordering is the safety property. Media is uploaded before the post
 * exists, so a failed upload leaves nothing behind but an unreferenced asset
 * LinkedIn expires on its own — where the reverse order could publish a post
 * pointing at an image that never arrived.
 */
async function publishWithMedia(input: {
  accessToken: string;
  authorUrn: string;
  caption: string;
  media: LinkedInMediaAsset[];
}): Promise<LinkedInPublishResult> {
  const { accessToken, authorUrn, caption } = input;

  const uploaded = await uploadMedia({
    accessToken,
    ownerUrn: authorUrn,
    assets: input.media,
  });

  console.info('[linkedin] media uploaded', {
    endpoint: uploaded.endpoint,
    count: uploaded.media.length,
  });

  const body = { authorUrn, caption, media: uploaded.media };

  // No fallback past this line. See the header: the URNs belong to one family.
  const response = await publishToFamily(accessToken, uploaded.endpoint, body);
  const urn = readCreatedUrn(response);

  return {
    urn,
    url: toPostUrl(urn),
    endpoint: uploaded.endpoint === 'images' ? 'posts' : 'ugcPosts',
    mediaUrns: uploaded.media.map((asset) => asset.urn),
  };
}

/** Sends the media post body that matches the family the URNs came from. */
async function publishToFamily(
  accessToken: string,
  endpoint: LinkedInMediaEndpoint,
  body: {
    authorUrn: string;
    caption: string;
    media: LinkedInUploadedMedia[];
  },
): Promise<AxiosResponse> {
  try {
    return endpoint === 'images'
      ? await createPost(accessToken, 'posts', buildMediaPostBody(body))
      : await createPost(accessToken, 'ugcPosts', buildLegacyMediaPostBody(body));
  } catch (error) {
    throw toProviderError(error, 'publish');
  }
}

/** One create-post request, on either endpoint. */
function createPost(
  accessToken: string,
  endpoint: 'posts' | 'ugcPosts',
  body: Record<string, unknown>,
): Promise<AxiosResponse> {
  const versioned = endpoint === 'posts';
  return axios.post(
    versioned ? linkedinConfig.postsUrl : linkedinConfig.ugcPostsUrl,
    body,
    {
      headers: versioned
        ? versionedHeaders(accessToken)
        : legacyHeaders(accessToken),
      timeout: REQUEST_TIMEOUT_MS,
    },
  );
}

/**
 * Reads the created post's URN out of the response.
 *
 * LinkedIn returns it in the `x-restli-id` header, not the body — both
 * endpoints answer `201` with an empty or near-empty body. The `id` field is
 * checked as a secondary source because some responses carry it there too.
 */
function readCreatedUrn(response: AxiosResponse): string {
  const header = response.headers?.['x-restli-id'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const fromBody =
    response.data && typeof response.data === 'object'
      ? (response.data as { id?: unknown }).id
      : undefined;

  const urn =
    (typeof fromHeader === 'string' && fromHeader) ||
    (typeof fromBody === 'string' && fromBody) ||
    '';

  if (!urn) {
    // A 2xx with no id is not a success we can record: without the URN we
    // cannot link to the post or delete it later. Reported as such rather than
    // stored as a published post with an empty id.
    throw new ProviderError(
      'LinkedIn accepted the post but did not return its id',
      502,
      'linkedin',
      response.status,
    );
  }

  return urn;
}

export const linkedinPublisher = { publish };
