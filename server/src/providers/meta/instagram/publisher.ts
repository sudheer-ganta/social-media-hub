import axios from 'axios';
import { ProviderError } from '../../provider.interface';
import type { MetaErrorBody } from '../config';
import { instagramConfig } from './config';
import { REQUEST_TIMEOUT_MS, toProviderError } from './http';
import { INSTAGRAM_MIN_CAROUSEL_ITEMS, validatePost } from './validator';
import type {
  InstagramCarouselContainerRequest,
  InstagramContainerStatusNode,
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
 * ─── Two images or more: a carousel ──────────────────────────────────────────
 *
 * The same two steps with a layer in between, not a different API:
 *
 *   1. one container per image, each with `is_carousel_item=true` — these are
 *      *children* and are never published on their own;
 *   2. one more container with `media_type=CAROUSEL` and `children` naming them
 *      in order, which is where the caption goes;
 *   3. `media_publish` on that parent.
 *
 * Order is `children` order, which is the order the composer stored. Alt text
 * belongs on each child, because that is the image it describes; a caption on a
 * child is ignored by Meta, so it is only ever sent on the parent.
 *
 * Readiness is polled on every container, children included. A child that is
 * still being fetched is exactly the condition that makes the parent fail with
 * the same "media not ready" error a single image used to fail with, and it is
 * cheaper to find out per child than to unpick which of ten Meta was unhappy
 * about.
 *
 * ─── Ordering, and what a failure leaves behind ──────────────────────────────
 *
 * The container is created first and published second, which is the safe order:
 * a container that is never published simply expires after 24 hours, whereas
 * the reverse is not expressible. A failure between the two steps therefore
 * leaves nothing visible on the member's profile.
 *
 * Between the two steps the container's `status_code` is polled until it is
 * FINISHED. An earlier revision skipped the poll on the theory that image
 * containers are ready when `/media` returns; production said otherwise —
 * `media_publish` answered "Media ID is not available" (code 9007, subcode
 * 2207027) because Meta was still fetching and processing the image. The poll
 * is bounded ({@link CONTAINER_POLL_DELAYS_MS}), and because Meta's readiness
 * signal has itself been observed to run ahead of the publish endpoint, a
 * publish that still answers 9007 after FINISHED is retried a couple of times
 * ({@link PUBLISH_NOT_READY_RETRIES}) before the failure is real. Retrying
 * that error is safe: it means no post was created, so a retry cannot
 * double-post.
 */

/**
 * How long we wait before each status check, in order. ~30s total, then we
 * give up. The first entries are short because a JPEG container is usually
 * ready within a second or two; the tail backs off so a slow fetch on Meta's
 * side gets a real window without us hammering the Graph API.
 */
const CONTAINER_POLL_DELAYS_MS = [1000, 2000, 3000, 4000, 5000, 5000, 5000, 5000];

/** Extra `media_publish` attempts when Meta answers "media not ready" (9007). */
const PUBLISH_NOT_READY_RETRIES = 2;
const PUBLISH_NOT_READY_DELAY_MS = 2000;

/**
 * The one clock this module reads. Overridable so the offline verify script
 * can run the whole poll-until-timeout path without actually sleeping 30s.
 * Production code never touches it.
 */
export const timing = {
  wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

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

  const accessToken = input.accessToken;
  const igUserId = input.providerAccountId;

  // Every image gets a container. For one image that container *is* the post;
  // for several they are children and a parent is built over them below.
  const isCarousel = media.length >= INSTAGRAM_MIN_CAROUSEL_ITEMS;
  const childIds: string[] = [];

  for (const image of media) {
    const containerId = await createMediaContainer({
      accessToken,
      igUserId,
      body: {
        image_url: image.sourceUrl,
        // A child's caption is ignored by Meta — the parent carries the post's
        // text — so it is only sent when this container is the post itself.
        ...(caption && !isCarousel ? { caption } : {}),
        ...(image.altText ? { alt_text: image.altText } : {}),
        ...(isCarousel ? { is_carousel_item: true } : {}),
      },
    });

    // Polled per child. A parent built over a container Meta is still fetching
    // fails with the same not-ready error, and it does not say which child.
    await waitForContainerReady({ accessToken, containerId });
    childIds.push(containerId);
  }

  const publishableId = isCarousel
    ? await createCarouselContainer({ accessToken, igUserId, childIds, caption })
    : childIds[0];

  if (isCarousel) {
    // The parent has its own processing step: Meta assembles the carousel from
    // children it has already fetched, and `media_publish` refuses it until
    // that finishes.
    await waitForContainerReady({ accessToken, containerId: publishableId });
  }

  const mediaId = await publishContainer({
    accessToken,
    igUserId,
    containerId: publishableId,
  });

  return {
    urn: mediaId,
    // Best-effort: the post is already live, so a failed permalink read must
    // not fail the publish. See fetchPermalink.
    url: await fetchPermalink(accessToken, mediaId),
    endpoint: 'media_publish',
    // Children first, then the container that was actually published — which
    // for a single image is the one and only entry, exactly as before.
    mediaUrns: isCarousel ? [...childIds, publishableId] : childIds,
  };
}

/**
 * The carousel parent: the container that becomes the post.
 *
 * Carries no image of its own. `children` is a comma-delimited list of child
 * container ids and its order is the order they render in, which is why the
 * caller builds it from the stored media order rather than from anything Meta
 * returns.
 */
async function createCarouselContainer(args: {
  accessToken: string;
  igUserId: string;
  childIds: string[];
  caption: string;
}): Promise<string> {
  const body: InstagramCarouselContainerRequest = {
    media_type: 'CAROUSEL',
    children: args.childIds.join(','),
    ...(args.caption ? { caption: args.caption } : {}),
  };

  let response;
  try {
    response = await axios.post<InstagramCreatedNode>(
      `${instagramConfig.graphUrl}/${encodeURIComponent(args.igUserId)}/media`,
      null,
      {
        params: { ...body, access_token: args.accessToken },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
  } catch (error) {
    throw toProviderError(error, 'carousel container creation');
  }

  const id = response.data?.id;
  if (!id) {
    throw new ProviderError(
      'Instagram accepted the carousel but did not return a container id',
      502,
      'instagram',
      response.status,
    );
  }

  console.info('[instagram] carousel container created', {
    children: args.childIds.length,
  });

  return String(id);
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

/**
 * Step 1½ — wait for Meta to finish fetching and processing the image.
 *
 * Polls the container node's `status_code` on a bounded schedule. FINISHED
 * proceeds to publish; ERROR and EXPIRED fail with whatever detail Meta put in
 * the `status` field; IN_PROGRESS — and any status this code does not know —
 * waits for the next check. Running out of schedule is a clear failure, not an
 * infinite loop.
 */
async function waitForContainerReady(args: {
  accessToken: string;
  containerId: string;
}): Promise<void> {
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= CONTAINER_POLL_DELAYS_MS.length; attempt++) {
    await timing.wait(CONTAINER_POLL_DELAYS_MS[attempt - 1]);

    let response;
    try {
      response = await axios.get<InstagramContainerStatusNode>(
        `${instagramConfig.graphUrl}/${encodeURIComponent(args.containerId)}`,
        {
          params: { fields: 'status_code,status', access_token: args.accessToken },
          timeout: REQUEST_TIMEOUT_MS,
        },
      );
    } catch (error) {
      throw toProviderError(error, 'container status check');
    }

    const statusCode = response.data?.status_code?.toUpperCase();
    console.info('[instagram] container status', {
      containerId: args.containerId,
      status: statusCode ?? 'unknown',
      attempt,
      elapsedMs: Date.now() - startedAt,
    });

    if (statusCode === 'FINISHED') return;

    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      const detail = response.data?.status?.trim();
      throw new ProviderError(
        `Instagram could not process the image (container ${statusCode}${detail ? `: ${detail}` : ''})`,
        502,
        'instagram',
        response.status,
      );
    }
  }

  throw new ProviderError(
    `Instagram did not finish processing the image within ${Math.round(
      CONTAINER_POLL_DELAYS_MS.reduce((sum, ms) => sum + ms, 0) / 1000,
    )}s (container ${args.containerId})`,
    502,
    'instagram',
  );
}

/**
 * "Media ID is not available" — Meta's publish endpoint saying the container
 * is not ready *even though* the status poll said FINISHED. Code 9007 covers
 * the family; subcode 2207027 is the one seen in production.
 */
function isMediaNotReady(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const body = error.response?.data as MetaErrorBody | undefined;
  return body?.error?.code === 9007;
}

/** Step 2 — the container becomes a post. */
async function publishContainer(args: {
  accessToken: string;
  igUserId: string;
  containerId: string;
}): Promise<string> {
  const startedAt = Date.now();

  for (let attempt = 1; ; attempt++) {
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
      // A not-ready answer means no post was created, so retrying cannot
      // double-post — unlike every other failure here, which is thrown as-is.
      if (attempt <= PUBLISH_NOT_READY_RETRIES && isMediaNotReady(error)) {
        console.info('[instagram] publish answered "media not ready" — retrying', {
          containerId: args.containerId,
          attempt,
          elapsedMs: Date.now() - startedAt,
        });
        await timing.wait(PUBLISH_NOT_READY_DELAY_MS);
        continue;
      }
      throw toProviderError(error, 'publish');
    }

    const id = response.data?.id;
    if (!id) {
      // A 2xx with no id is not a success we can record: without the media id
      // we cannot link to the post or delete it later.
      throw new ProviderError(
        'Instagram accepted the post but did not return its id',
        502,
        'instagram',
        response.status,
      );
    }

    return String(id);
  }
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
