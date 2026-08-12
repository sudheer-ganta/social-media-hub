import axios from 'axios';
import { ProviderError } from '../provider.interface';
import { capabilityFor } from '../capabilities';
import { xConfig } from './config';
import { REQUEST_TIMEOUT_MS, toProviderError } from './http';
import { uploadMedia } from './media-upload';
import { isRecoverableMediaFailure, mediaDropReason } from './media-fallback';
import { validatePost } from './validator';
import type {
  XCreateTweetRequest,
  XCreateTweetResponse,
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
 * ─── Media ───────────────────────────────────────────────────────────────────
 *
 * X is the only network here that wants the **bytes**, like LinkedIn, rather
 * than fetching a URL, like Meta. Everything is uploaded first and the post then
 * references the ids that come back, in order:
 *
 *   «upload»       → media id, or ids
 *   POST /2/tweets { text, media: { media_ids: [...] } }
 *
 * Uploads come first for the same reason they do on LinkedIn: an uploaded image
 * nobody references expires on X's side and is invisible, where a post
 * referencing an id that never arrived is not expressible at all.
 *
 * *How* the bytes get there is `media-upload.ts`'s problem and deliberately not
 * this file's: a photo is one multipart POST, and a video or GIF is X's
 * four-step INIT/APPEND/FINALIZE/STATUS protocol streamed a chunk at a time.
 * From here they are the same call returning the same kind of id.
 *
 * Uploading needs the `media.write` scope, which is newer than this integration.
 * A connection made before it was requested posts text exactly as it always did
 * and is refused, with a message naming the fix, the moment it tries to attach
 * media — never quietly downgraded to a text post.
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
  // The format's rules, resolved here rather than inside the validator — the
  // validator is what `capabilities.ts` is built from, so it must not import it
  // back. See the import note in `validator.ts`.
  //
  // A caller that named no content type falls back to the count-based
  // resolution, which is what publishing did before the field existed.
  const contentType =
    input.contentType ?? ((input.media?.length ?? 0) > 1 ? 'CAROUSEL' : 'IMAGE');
  const capability = capabilityFor('x', contentType);

  const { text, media } = validatePost({
    caption: input.caption,
    media: input.media,
    capability,
  });

  // In order, and before the post exists: `media_ids` order is render order.
  //
  // The one recovery, and its boundary. This `try` wraps the uploads and
  // nothing else — deliberately, because a failure *after* this point is a
  // rejected post rather than rejected media, and stripping the images to
  // retry a duplicate-content refusal would neither fix it nor be wanted.
  //
  // Only a narrow allowlist of upload rejections recovers; a rate limit, a
  // dead token, an empty API balance or an X outage still fails the whole
  // publish, because for all of those the text would go out *instead of* the
  // real post rather than *as much of it as X would take*. See
  // `media-fallback.ts` for the full list and the reasoning.
  let mediaIds: string[] = [];
  let mediaDropped = false;
  let dropReason: string | undefined;

  try {
    for (const asset of media) {
      mediaIds.push(await uploadMedia(input.accessToken, asset));
    }
  } catch (error) {
    if (!isRecoverableMediaFailure(error)) throw error;

    // Whatever uploaded before the rejection is abandoned rather than attached:
    // a carousel missing its third image is not what the member composed, and
    // publishing a partial set would be a silent edit. Unreferenced media
    // expires on X's side on its own.
    mediaIds = [];
    mediaDropped = true;
    dropReason = mediaDropReason(media);

    // The diagnostics, kept here where they are safe. The member-facing
    // sentence carries none of this.
    console.warn('[x] media rejected — publishing text only', {
      items: media.length,
      mimeTypes: media.map((asset) => asset.mimeType),
      byteLengths: media.map((asset) => asset.byteLength),
      upstreamStatus:
        error instanceof ProviderError ? error.upstreamStatus : undefined,
    });
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
    // Only ever set when something was actually lost. `mediaDropped` and
    // `reason` travel together by construction — see `ProviderPublishResult`.
    ...(mediaDropped
      ? {
          publishedAs: 'text_only_fallback' as const,
          mediaDropped: true,
          reason: dropReason,
        }
      : {}),
    // `/i/web/status/<id>` is X's own handle-independent permalink and it
    // redirects to the canonical URL. Using it means the link does not break
    // when a member changes their handle, and it can be built without spending a
    // profile request to learn what the handle currently is.
    url: `https://x.com/i/web/status/${id}`,
    endpoint: 'tweets',
    mediaUrns: mediaIds,
  };
}

export const xPublisherService = { publish };
