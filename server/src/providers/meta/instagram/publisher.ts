import axios from 'axios';
import { ProviderError } from '../../provider.interface';
import { instagramConfig } from './config';
import { REQUEST_TIMEOUT_MS, toProviderError } from './http';
import { validatePost } from './validator';
import type {
  InstagramCreatedNode,
  InstagramMediaContainerRequest,
  InstagramMediaNode,
  InstagramPublishInput,
  InstagramPublishResult,
} from './types';

/**
 * Publishing a post to Instagram. The only module that knows how that happens.
 *
 * Same contract as `providers/linkedin/publisher.ts`: takes an access token and
 * primitives, talks to Meta, returns a provider-neutral result. No Prisma, no
 * Express, no `PostPlatform`.
 *
 * ─── Why this looks nothing like the LinkedIn publisher ──────────────────────
 *
 * Instagram's Content Publishing API is a **two-step container flow**, and the
 * image is **pulled, not pushed**:
 *
 *   1. `POST /{ig-id}/media` with `image_url` — Meta fetches the image from
 *      that URL onto its own servers and returns a *container* id.
 *   2. `POST /{ig-id}/media_publish` with `creation_id` — the container becomes
 *      a real post.
 *
 * There is no byte-upload endpoint for feed images. This is why
 * `ProviderMediaAsset` carries `sourceUrl` alongside the bytes: the bytes are
 * what let us validate format and size before spending a request, and the URL
 * is what actually gets sent. Handing Meta a URL we have not fetched ourselves
 * would mean publishing an image nobody checked.
 *
 * ─── Ordering, and what a failure leaves behind ──────────────────────────────
 *
 * The container is created first and published second, which is the safe order:
 * a container that is never published simply expires after 24 hours, whereas
 * the reverse is not expressible. A failure between the two steps therefore
 * leaves nothing visible on the member's profile.
 *
 * The container's `status_code` is deliberately **not** polled. Meta documents
 * polling as a troubleshooting step for *video* containers, where transcoding
 * takes real time; a single JPEG container is ready when the call returns, and
 * a poll loop would add a second of latency to every publish to guard against a
 * case that does not arise for images. If image containers ever start coming
 * back IN_PROGRESS, the fix is a poll here and nowhere else.
 */

/**
 * Creates a post on the connected Instagram account.
 *
 * The access token is a parameter and is never stored, logged, or included in
 * an error — it exists inside this call and nowhere else.
 *
 * Resolves with the published media's id and its permalink. Throws
 * {@link ProviderError} on any failure, carrying `upstreamStatus` so the
 * service layer can tell a dead token from a bad minute at Meta.
 */
export async function publish(
  input: InstagramPublishInput,
): Promise<InstagramPublishResult> {
  // Everything knowable without a network call, checked before we spend one.
  // Includes the "Instagram has no text-only post" rule — see the validator.
  const { caption, media } = validatePost({
    caption: input.caption,
    media: input.media,
  });

  const [image] = media;

  const containerId = await createMediaContainer({
    accessToken: input.accessToken,
    igUserId: input.providerAccountId,
    body: {
      image_url: image.sourceUrl,
      ...(caption ? { caption } : {}),
      ...(image.altText ? { alt_text: image.altText } : {}),
    },
  });

  const mediaId = await publishContainer({
    accessToken: input.accessToken,
    igUserId: input.providerAccountId,
    containerId,
  });

  return {
    urn: mediaId,
    // Best-effort: the post is already live, so a failed permalink read must
    // not fail the publish. See fetchPermalink.
    url: await fetchPermalink(input.accessToken, mediaId),
    endpoint: 'media_publish',
    mediaUrns: [containerId],
  };
}

/** Step 1 — Meta fetches the image and hands back a container id. */
async function createMediaContainer(args: {
  accessToken: string;
  igUserId: string;
  body: InstagramMediaContainerRequest;
}): Promise<string> {
  let response;
  try {
    response = await axios.post<InstagramCreatedNode>(
      `${instagramConfig.graphUrl}/${encodeURIComponent(args.igUserId)}/media`,
      null,
      {
        // Meta takes these as query parameters on the publishing edges. The
        // token rides along here, which is why nothing logs a Graph URL.
        params: { ...args.body, access_token: args.accessToken },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
  } catch (error) {
    throw toProviderError(error, 'media container creation');
  }

  const id = response.data?.id;
  if (!id) {
    throw new ProviderError(
      'Instagram accepted the image but did not return a container id',
      502,
      'instagram',
      response.status,
    );
  }

  return String(id);
}

/** Step 2 — the container becomes a post. */
async function publishContainer(args: {
  accessToken: string;
  igUserId: string;
  containerId: string;
}): Promise<string> {
  let response;
  try {
    response = await axios.post<InstagramCreatedNode>(
      `${instagramConfig.graphUrl}/${encodeURIComponent(args.igUserId)}/media_publish`,
      null,
      {
        params: {
          creation_id: args.containerId,
          access_token: args.accessToken,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
  } catch (error) {
    throw toProviderError(error, 'publish');
  }

  const id = response.data?.id;
  if (!id) {
    // A 2xx with no id is not a success we can record: without the media id we
    // cannot link to the post or delete it later.
    throw new ProviderError(
      'Instagram accepted the post but did not return its id',
      502,
      'instagram',
      response.status,
    );
  }

  return String(id);
}

/**
 * Reads the published media's permalink.
 *
 * A separate request because Meta does not return one from `media_publish`, and
 * an Instagram permalink cannot be constructed from the media id — it contains
 * an opaque shortcode. That is the whole reason `post_platforms.permalink`
 * exists: LinkedIn's URL is derivable on every read, Instagram's is knowable
 * exactly once.
 *
 * Never throws. The post is already live at this point; failing the publish
 * because a follow-up read timed out would report a failure that did not
 * happen, and would leave the member with a post on Instagram marked FAILED in
 * FlowPost. A null here costs them the "View on Instagram" link and nothing
 * else.
 */
async function fetchPermalink(
  accessToken: string,
  mediaId: string,
): Promise<string | null> {
  try {
    const response = await axios.get<InstagramMediaNode>(
      `${instagramConfig.graphUrl}/${encodeURIComponent(mediaId)}`,
      {
        params: { fields: 'permalink', access_token: accessToken },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    return response.data?.permalink?.trim() || null;
  } catch (error) {
    console.warn('[instagram] published, but the permalink could not be read', {
      mediaId,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

export const instagramPublisher = { publish };
