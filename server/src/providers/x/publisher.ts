import axios from 'axios';
import { ProviderError } from '../provider.interface';
import { xConfig } from './config';
import { REQUEST_TIMEOUT_MS, toProviderError } from './http';
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
 * One endpoint, one call: `POST /2/tweets` with a JSON `{ text }`. There is no
 * container flow (Instagram), no second endpoint for media (Facebook) and no
 * versioned header (LinkedIn) — X's v2 create-post is genuinely this small, and
 * adding structure "for symmetry" would be inventing a state machine the API
 * does not have.
 *
 * Text only. See `validator.ts` for why media is refused rather than uploaded.
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
  const { text } = validatePost({ caption: input.caption, media: input.media });

  const body: XCreateTweetRequest = { text };

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
    mediaUrns: [],
  };
}

export const xPublisherService = { publish };
