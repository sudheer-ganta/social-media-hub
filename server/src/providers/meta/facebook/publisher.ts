import axios from 'axios';
import { ProviderError } from '../../provider.interface';
import { facebookConfig } from './config';
import { REQUEST_TIMEOUT_MS, toProviderError } from './http';
import { FACEBOOK_MIN_MULTI_PHOTO_ITEMS, validatePost } from './validator';
import type {
  FacebookCreatedNode,
  FacebookMediaAsset,
  FacebookPostNode,
  FacebookPublishInput,
  FacebookPublishResult,
} from './types';

/**
 * Publishing a post to a Facebook Page. The only module that knows how that
 * happens.
 *
 * Same contract as the LinkedIn and Instagram publishers: takes an access token
 * and primitives, talks to Meta, returns a provider-neutral result. No Prisma,
 * no Express, no `PostPlatform`.
 *
 * ─── Why this is so much simpler than the Instagram publisher ────────────────
 *
 * Instagram's Content Publishing API is a two-step container flow with a
 * readiness poll, because Meta fetches the image asynchronously and will not
 * tell you it is done. The Pages API has no such thing: one request creates the
 * post, and Meta either accepts the image or fails the call. So there is no
 * container, no `status_code` poll, no not-ready retry — and adding any of that
 * "for symmetry" would be inventing a state machine the API does not have.
 *
 * Three shapes, chosen by how many images the draft carries:
 *
 *   • text only    → `POST /{page-id}/feed`   with `message`
 *   • one image    → `POST /{page-id}/photos` with `url` + `caption`
 *   • two or more  → one `POST /{page-id}/photos` per image with
 *                    `published=false`, then `POST /{page-id}/feed` with
 *                    `message` + `attached_media`
 *
 * The third is Facebook's own multi-photo story and not a workaround: an
 * unpublished photo is an object that exists on the Page without appearing in
 * the feed, and `attached_media` is the documented way to gather several of
 * them into one post. Order is `attached_media` order, which is the order the
 * composer stored.
 *
 * An unpublished photo that never gets attached — because the feed call fails —
 * is invisible to followers and expires from the Page's unpublished pool on
 * Meta's own schedule. That is why the photos go up first: the reverse order
 * cannot be expressed, and this one leaves nothing visible behind on failure.
 *
 * The image is **pulled, not pushed**, exactly like Instagram's: `url` is the
 * public address Meta fetches from, which is why `ProviderMediaAsset` carries
 * `sourceUrl` alongside the bytes. The bytes are what let the validator check
 * format and size before we spend a request; the URL is what actually gets
 * sent. Nothing is re-uploaded or duplicated — the Cloudinary delivery URL the
 * media service resolved is handed straight over.
 *
 * ─── Which id is the post ────────────────────────────────────────────────────
 *
 * The two endpoints answer differently and the difference is load-bearing:
 * `/feed` returns the post id as `id`, while `/photos` returns the **photo** id
 * as `id` and the post id separately as `post_id`. Storing a photo id would
 * give us a value that no permalink read accepts, so `post_id` wins wherever it
 * is present.
 */

/**
 * Creates a post on the connected Facebook Page.
 *
 * The access token is a parameter and is never stored, logged, or included in
 * an error — it exists inside this call and nowhere else.
 *
 * Resolves with the Page post's id and its permalink. Throws
 * {@link ProviderError} on any failure, carrying `upstreamStatus` so the
 * service layer can tell a dead token from a bad minute at Meta.
 */
export async function publish(
  input: FacebookPublishInput,
): Promise<FacebookPublishResult> {
  // Everything knowable without a network call, checked before we spend one.
  const { caption, media } = validatePost({
    caption: input.caption,
    media: input.media,
  });

  const accessToken = input.accessToken;
  const pageId = input.providerAccountId;
  const isMultiPhoto = media.length >= FACEBOOK_MIN_MULTI_PHOTO_ITEMS;

  const created = isMultiPhoto
    ? await createMultiPhotoPost({ accessToken, pageId, media, caption })
    : media.length === 1
      ? await createPhotoPost({
          accessToken,
          pageId,
          imageUrl: media[0].sourceUrl,
          altText: media[0].altText,
          caption,
        })
      : await createFeedPost({ accessToken, pageId, message: caption });

  return {
    urn: created.postId,
    // Best-effort: the post is already live, so a failed permalink read must
    // not fail the publish. See fetchPermalink.
    url: await fetchPermalink(accessToken, created.postId),
    // A multi-photo story is created on `/feed`, same as a text post — the
    // photos went up separately and unpublished.
    endpoint: media.length === 1 ? 'photos' : 'feed',
    mediaUrns: created.photoIds,
  };
}

/**
 * Two or more images: upload each unpublished, then attach them to one post.
 *
 * The photos are uploaded in order and attached in that order, because that is
 * the order Facebook renders them in and the order the member arranged in the
 * composer.
 */
async function createMultiPhotoPost(args: {
  accessToken: string;
  pageId: string;
  media: FacebookMediaAsset[];
  caption: string;
}): Promise<{ postId: string; photoIds: string[] }> {
  const photoIds: string[] = [];

  for (const image of args.media) {
    photoIds.push(
      await uploadUnpublishedPhoto({
        accessToken: args.accessToken,
        pageId: args.pageId,
        imageUrl: image.sourceUrl,
        altText: image.altText,
      }),
    );
  }

  console.info('[facebook] photos uploaded for a multi-photo post', {
    count: photoIds.length,
  });

  const created = await createFeedPost({
    accessToken: args.accessToken,
    pageId: args.pageId,
    message: args.caption,
    attachedMedia: photoIds,
  });

  return { postId: created.postId, photoIds };
}

/**
 * One photo on the Page but not in the feed. Returns its id, for `attached_media`.
 *
 * `published=false` is the whole difference from {@link createPhotoPost}: the
 * object is created and returns an id, and nothing appears on the Page until a
 * feed post references it.
 */
async function uploadUnpublishedPhoto(args: {
  accessToken: string;
  pageId: string;
  imageUrl: string;
  altText: string | null;
}): Promise<string> {
  let response;
  try {
    response = await axios.post<FacebookCreatedNode>(
      `${facebookConfig.graphUrl}/${encodeURIComponent(args.pageId)}/photos`,
      null,
      {
        params: {
          url: args.imageUrl,
          published: false,
          ...(args.altText ? { alt_text_custom: args.altText } : {}),
          access_token: args.accessToken,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
  } catch (error) {
    throw toProviderError(error, 'photo upload');
  }

  const photoId = readId(response.data?.id);
  if (!photoId) {
    throw new ProviderError(
      'Facebook accepted an image but did not return its id',
      502,
      'facebook',
      response.status,
    );
  }

  return photoId;
}

/**
 * `POST /{page-id}/feed` — a text post, or the story that gathers already
 * uploaded photos.
 *
 * `attached_media` goes on the wire as indexed parameters —
 * `attached_media[0]={"media_fbid":"…"}` — which is the form Meta documents.
 * Index order is render order.
 */
async function createFeedPost(args: {
  accessToken: string;
  pageId: string;
  message: string;
  /** Unpublished photo ids to attach, in render order. */
  attachedMedia?: string[];
}): Promise<{ postId: string; photoIds: string[] }> {
  const attached = args.attachedMedia ?? [];
  const attachedParams = Object.fromEntries(
    attached.map((photoId, index) => [
      `attached_media[${index}]`,
      JSON.stringify({ media_fbid: photoId }),
    ]),
  );

  let response;
  try {
    response = await axios.post<FacebookCreatedNode>(
      `${facebookConfig.graphUrl}/${encodeURIComponent(args.pageId)}/feed`,
      null,
      {
        // Meta takes these as query parameters on the publishing edges. The
        // token rides along here, which is why nothing logs a Graph URL.
        params: {
          // Omitted rather than sent empty: photos with no words is a valid
          // post, and a blank `message` is a parameter Meta has no use for.
          ...(args.message ? { message: args.message } : {}),
          ...attachedParams,
          access_token: args.accessToken,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
  } catch (error) {
    throw toProviderError(error, 'feed publish');
  }

  const postId = readId(response.data?.post_id ?? response.data?.id);
  if (!postId) {
    // A 2xx with no id is not a success we can record: without it we cannot
    // link to the post or delete it later.
    throw new ProviderError(
      'Facebook accepted the post but did not return its id',
      502,
      'facebook',
      response.status,
    );
  }

  return { postId, photoIds: attached };
}

/**
 * With an image. `POST /{page-id}/photos` with `url` + `caption`.
 *
 * The caption becomes the post's own text — a photo post on a Page is a feed
 * story with the image attached, not a separate kind of object with a separate
 * description, so there is no second call to write the message.
 */
async function createPhotoPost(args: {
  accessToken: string;
  pageId: string;
  imageUrl: string;
  altText: string | null;
  caption: string;
}): Promise<{ postId: string; photoIds: string[] }> {
  let response;
  try {
    response = await axios.post<FacebookCreatedNode>(
      `${facebookConfig.graphUrl}/${encodeURIComponent(args.pageId)}/photos`,
      null,
      {
        params: {
          url: args.imageUrl,
          // Omitted rather than sent empty: a blank `caption` is a parameter
          // Meta has no use for, and an image with no words is a valid post.
          ...(args.caption ? { caption: args.caption } : {}),
          // The description a screen reader announces. Generated by the media
          // service for every network; Facebook is simply the one that names
          // the field `alt_text_custom`.
          ...(args.altText ? { alt_text_custom: args.altText } : {}),
          access_token: args.accessToken,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
  } catch (error) {
    throw toProviderError(error, 'photo publish');
  }

  const photoId = readId(response.data?.id);
  // `post_id` is the feed story; `id` is the photo. Only the former can be read
  // back for a permalink, so it is what gets stored.
  const postId = readId(response.data?.post_id);

  if (!postId) {
    throw new ProviderError(
      'Facebook accepted the image but did not return the post id',
      502,
      'facebook',
      response.status,
    );
  }

  return { postId, photoIds: photoId ? [photoId] : [] };
}

/** Meta sends ids as either a string or a number depending on the field. */
function readId(value: string | number | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const asString = String(value).trim();
  return asString.length > 0 ? asString : null;
}

/**
 * Reads the published post's permalink.
 *
 * A separate request because Meta does not return one from either publishing
 * edge. A Facebook permalink *can* very nearly be constructed from the
 * `{page-id}_{post-id}` composite — but "very nearly" is how a "View on
 * Facebook" button starts 404ing for link posts and shared stories, so the
 * canonical `permalink_url` is asked for and stored, exactly as Instagram's is.
 *
 * Never throws. The post is already live at this point; failing the publish
 * because a follow-up read timed out would report a failure that did not happen
 * and would leave the member with a post on Facebook marked FAILED in FlowPost.
 * A null here costs them the "View on Facebook" link and nothing else.
 */
async function fetchPermalink(
  accessToken: string,
  postId: string,
): Promise<string | null> {
  try {
    const response = await axios.get<FacebookPostNode>(
      `${facebookConfig.graphUrl}/${encodeURIComponent(postId)}`,
      {
        params: { fields: 'permalink_url', access_token: accessToken },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    return response.data?.permalink_url?.trim() || null;
  } catch (error) {
    console.warn('[facebook] published, but the permalink could not be read', {
      postId,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

export const facebookPublisher = { publish };
