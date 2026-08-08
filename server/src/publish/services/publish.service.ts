import { postRepository } from '../../repositories/post.repository';
import { socialAccountRepository } from '../../repositories/social-account.repository';
import { activityService } from '../../services/activity.service';
import { getProvider, isKnownProvider, getCatalogEntry } from '../../providers';
import { ProviderError, type Provider, type ProviderId } from '../../providers';
// LinkedIn's permalink is a pure function of its URN, so it can be rebuilt on
// every read. Instagram's cannot — see `resolvePlatformUrl`.
import { toPostUrl } from '../../providers/linkedin/formatter';
import { resolvePostMedia, MediaResolutionError } from './media.service';
import { PostStatus, SocialAccountStatus } from '../../generated/prisma/enums';
import type { Post } from '../../generated/prisma/client';

/**
 * Publishing a draft to a social network.
 *
 * This is the only module that knows what publishing *means*: which post,
 * whose account, whether it may go out, what to record when it does and what
 * to say when it doesn't. The layers either side of it are deliberately
 * ignorant —
 *
 *   • `providers/linkedin/publisher.ts` knows LinkedIn's HTTP and nothing else;
 *   • `publish.controller.ts` knows Express and nothing else.
 *
 * The two rules that shape everything below:
 *
 *  1. **A decrypted token exists for exactly one call.** It is read from the
 *     repository immediately before the provider call and passed straight in.
 *     Nothing here stores it, logs it, or puts it in an error.
 *  2. **Nothing LinkedIn says reaches the browser.** Provider errors carry
 *     diagnostic messages that quote our own request; they go to the log, and
 *     {@link toMemberFacingError} decides what the member reads instead.
 */

/** A publish failure with a message written for a member. */
export class PublishError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    /** Set when the post should be left as-is rather than marked FAILED. */
    readonly leavesPostUnchanged = false,
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

/** What a successful publish reports back to the controller. */
export interface PublishResult {
  postId: string;
  provider: ProviderId;
  status: 'published';
  /** The network's own id, e.g. `urn:li:share:…`. */
  publishedId: string;
  /** A permalink, or null when one cannot be constructed. */
  url: string | null;
  publishedAt: string;
}

/**
 * Publishes one post to one network.
 *
 * The order of operations is not arbitrary. Ownership is checked before
 * anything is loaded on the post's behalf; the attempt is *claimed* before any
 * work is done, so a duplicate request is rejected before it can decrypt a
 * token; and the claim is released rather than failed for problems found on our
 * side, so a post never carries a LinkedIn-shaped error for something LinkedIn
 * never saw.
 */
export async function publishPost(
  userId: string,
  postId: string,
  providerId: string,
): Promise<PublishResult> {
  if (!isKnownProvider(providerId)) {
    throw new PublishError(`Unknown network: ${providerId}`, 404, true);
  }
  const provider = getProvider(providerId);
  const catalog = getCatalogEntry(providerId);
  const networkName = catalog?.displayName ?? providerId;

  if (!provider?.publish) {
    throw new PublishError(
      `Publishing to ${networkName} isn't available yet.`,
      501,
      true,
    );
  }

  // 1–3. Load the draft, and prove it is this user's. `findByIdForUser`
  // filters on created_by in the query: the backend connects as the database
  // owner and bypasses RLS, so ownership is never implied by the connection.
  const post = await postRepository.findByIdForUser(postId, userId);
  if (!post) {
    // Deliberately the same answer as a post that exists but belongs to
    // someone else — a 403 here would confirm the id is real.
    throw new PublishError('That post could not be found.', 404, true);
  }

  // 4. Claimed *before* the connection is loaded. Everything after this point
  // has to either publish or clean up, which is why it is the first write.
  const claim = await postRepository.claimPlatformPublish(postId, providerId);
  if (!claim.claimed) {
    throw new PublishError(
      claim.reason === 'already_published'
        ? `This post has already been published to ${networkName}.`
        : `This post is already being published to ${networkName}.`,
      409,
      true,
    );
  }

  try {
    const account = await loadPublishableAccount(
      userId,
      providerId,
      networkName,
      provider,
    );

    // 5. Decrypted here and nowhere earlier — as late as it can be and still
    // be handed to the provider. Never assigned to anything that outlives this
    // function, never logged, never included in a thrown error.
    const tokens = await socialAccountRepository.getDecryptedTokens(
      userId,
      providerId,
    );
    if (!tokens) {
      throw new PublishError(
        `Connect your ${networkName} account before publishing.`,
        400,
      );
    }

    await postRepository.updateStatus(postId, PostStatus.PUBLISHING);
    await activityService.logPublishStarted(userId, providerId, {
      postId,
      title: post.title,
    });

    const caption = resolveCaption(post);

    // 6. Media, if the draft has any. Resolved *here* rather than inside the
    // provider: fetching a member-supplied URL is a security-sensitive step
    // that must have one implementation across every network, and providers
    // take bytes. See `media.service.ts`.
    const media = await resolveMedia(post, caption, provider);

    // 7–8. One call whether or not there is media — the provider branches, and
    // this layer never learns which of LinkedIn's endpoints answered. Validation
    // lives in the provider (it is network-specific) and throws a ProviderError,
    // which the catch below translates.
    const result = await provider.publish({
      accessToken: tokens.accessToken,
      providerAccountId: account.providerAccountId,
      caption,
      media,
    });

    // 9–10. The two writes that make the publish real. The permalink is stored
    // alongside the id because some networks — Instagram among them — return a
    // URL that cannot be reconstructed from the id afterwards.
    await postRepository.markPlatformPublished(
      postId,
      providerId,
      result.urn,
      result.url,
    );
    const publishedAt = new Date();
    await postRepository.updateStatus(postId, PostStatus.PUBLISHED, {
      publishedAt,
    });

    // 11. Audit. Never allowed to fail the publish — the post is already live
    // on LinkedIn, and throwing here would report a failure that did not happen.
    await activityService.logPublish(userId, providerId, {
      postId,
      title: post.title,
      publishedId: result.urn,
      url: result.url,
      endpoint: result.endpoint,
    });

    console.log('[publish] post published', {
      postId,
      provider: providerId,
      publishedId: result.urn,
      endpoint: result.endpoint,
      mediaCount: result.mediaUrns?.length ?? 0,
    });

    return {
      postId,
      provider: providerId,
      status: 'published',
      publishedId: result.urn,
      url: result.url,
      publishedAt: publishedAt.toISOString(),
    };
  } catch (error) {
    await recordFailure(userId, post, providerId, networkName, error);
    throw error instanceof PublishError
      ? error
      : toMemberFacingError(error, networkName);
  }
}

/**
 * The user's connection for a network, if it is in a state that can publish.
 *
 * Everything here is a *pre-flight* check — LinkedIn remains the authority, and
 * a token it rejects is handled by the error mapping regardless. The value of
 * checking first is the message: "Reconnect your LinkedIn account" is something
 * a member can act on, where a translated 401 is not.
 */
async function loadPublishableAccount(
  userId: string,
  providerId: ProviderId,
  networkName: string,
  provider: Provider,
) {
  const account = await socialAccountRepository.findByUserAndProvider(
    userId,
    providerId,
  );

  if (!account) {
    throw new PublishError(
      `Connect your ${networkName} account before publishing.`,
      400,
    );
  }

  if (
    account.status === SocialAccountStatus.REVOKED ||
    account.status === SocialAccountStatus.EXPIRED
  ) {
    throw new PublishError(
      `Your ${networkName} connection needs reconnecting before you can publish.`,
      400,
    );
  }

  // A stored expiry already in the past. Worth catching here rather than
  // spending a request to be told the same thing, and it lets us name the fix.
  if (account.expiresAt && account.expiresAt.getTime() <= Date.now()) {
    throw new PublishError(
      `Your ${networkName} connection has expired. Reconnect it and try again.`,
      400,
    );
  }

  // Scope check. A member can decline a permission on the consent screen and
  // still complete the connection, which produces an account that looks
  // healthy and cannot publish.
  //
  // Asked of the provider rather than branched on its id: the scope name
  // differs per network (`w_member_social`, `instagram_business_content_publish`)
  // and a chain of ifs here is how this layer stops being provider-neutral.
  if (provider.canPublish && !provider.canPublish(account.scopes)) {
    throw new PublishError(
      `FlowPost isn't allowed to post to your ${networkName} account. ` +
        'Reconnect it and approve publishing permission.',
      403,
    );
  }

  return account;
}

/**
 * The text that goes out.
 *
 * The caption the member edited wins over the AI's original: the editor is the
 * source of truth for what they actually want published, and `ai_caption` is
 * the provenance record of what was suggested. Falling back to it covers a post
 * generated and approved without ever being opened in the editor.
 */
function resolveCaption(post: Post): string {
  const edited = post.caption?.trim();
  if (edited) return edited;
  return post.ai_caption?.trim() ?? '';
}

/**
 * The media that goes out with the post.
 *
 * Wraps {@link resolvePostMedia} for one reason: to decide what a failure here
 * means. It means the publish stops. A member who attached an image and got a
 * text-only post has silently been given something they did not ask for, on a
 * feed where correcting it means deleting and reposting — so a broken image is
 * reported, with the reason, and nothing is sent.
 *
 * `leavesPostUnchanged` is true because it is: this runs before the provider is
 * called, so LinkedIn has seen nothing and the claim is handed back for a retry
 * rather than the post being marked FAILED.
 */
async function resolveMedia(post: Post, caption: string, provider: Provider) {
  try {
    // The format and size rules are the *network's*, taken from the provider —
    // LinkedIn accepts JPEG, PNG and GIF, Instagram JPEG only.
    return await resolvePostMedia(post, {
      caption,
      requirements: provider.mediaRequirements,
    });
  } catch (error) {
    if (error instanceof MediaResolutionError) {
      console.error('[publish] media could not be prepared', {
        postId: post.id,
        detail: error.detail,
      });
      throw new PublishError(error.message, 400, true);
    }
    throw error;
  }
}

/**
 * Records a failed attempt, then gets out of the way.
 *
 * Every write in here is best-effort. This runs while an error is already
 * propagating, and something thrown from the bookkeeping would replace a
 * precise failure with a confusing one.
 */
async function recordFailure(
  userId: string,
  post: Post,
  providerId: ProviderId,
  networkName: string,
  error: unknown,
): Promise<void> {
  const memberFacing =
    error instanceof PublishError
      ? error
      : toMemberFacingError(error, networkName);

  // Diagnostics — including LinkedIn's own words — stay here.
  console.error('[publish] attempt failed', {
    postId: post.id,
    provider: providerId,
    upstreamStatus:
      error instanceof ProviderError ? error.upstreamStatus : undefined,
    error: error instanceof Error ? error.message : error,
  });

  try {
    if (memberFacing.leavesPostUnchanged) {
      // Nothing was sent and the post's own state was never touched. Hand the
      // claim back so the member can fix the problem and retry, rather than
      // leaving the row stuck in PUBLISHING.
      await postRepository.releasePlatformClaim(post.id, providerId);
    } else {
      await postRepository.markPlatformFailed(
        post.id,
        providerId,
        memberFacing.message,
      );
      await postRepository.updateStatus(post.id, PostStatus.FAILED);
    }
  } catch (cause) {
    console.error('[publish] could not record the failure', {
      postId: post.id,
      error: cause instanceof Error ? cause.message : cause,
    });
  }

  await activityService.logPublishFailed(userId, providerId, {
    postId: post.id,
    title: post.title,
    reason: memberFacing.message,
  });
}

/**
 * Translates anything thrown below this layer into something a member should
 * read.
 *
 * This is the function that keeps rule 2. A {@link ProviderError} carries
 * LinkedIn's status and often its response text; none of that is returned. What
 * is returned is chosen from `upstreamStatus`, which is the only part of a
 * provider failure that reliably means the same thing every time.
 */
function toMemberFacingError(error: unknown, networkName: string): PublishError {
  if (error instanceof PublishError) return error;

  if (error instanceof ProviderError) {
    // A validation failure the provider raised before sending anything. These
    // messages are written for members — see `linkedin/validator.ts` — and the
    // post is untouched, so the claim is released rather than failed.
    if (error.status === 400 && error.upstreamStatus === undefined) {
      return new PublishError(error.message, 400, true);
    }

    switch (error.upstreamStatus) {
      case 401:
      case 403:
        return new PublishError(
          `${networkName} rejected the connection. Reconnect your account and try again.`,
          400,
        );
      case 422:
        return new PublishError(
          `${networkName} wouldn't accept this post. Try editing the caption and publishing again.`,
          422,
        );
      case 429:
        return new PublishError(
          `${networkName} is rate limiting posts right now. Try again a little later.`,
          429,
        );
      default:
        return new PublishError(
          `${networkName} couldn't be reached. Your post wasn't published — try again in a moment.`,
          502,
        );
    }
  }

  return new PublishError(
    'Something went wrong while publishing. Your post was not published.',
    500,
  );
}

/**
 * The publish state of one post across every network.
 *
 * Read by the UI after a publish and on load, so a post that went out from
 * another tab shows as published here too. Never includes anything from the
 * provider beyond the id and a link built from it.
 */
export async function getPublishState(
  userId: string,
  postId: string,
): Promise<{
  postId: string;
  status: string;
  publishedAt: string | null;
  platforms: Array<{
    provider: string;
    providerName: string;
    status: string;
    publishedId: string | null;
    url: string | null;
    errorMessage: string | null;
  }>;
}> {
  const post = await postRepository.findByIdForUser(postId, userId);
  if (!post) throw new PublishError('That post could not be found.', 404, true);

  const platforms = await postRepository.listPlatformsForPost(postId);

  return {
    postId,
    status: post.status,
    publishedAt: post.published_at?.toISOString() ?? null,
    platforms: platforms.map((platform) => ({
      provider: platform.provider,
      providerName:
        getCatalogEntry(platform.provider)?.displayName ?? platform.provider,
      status: platform.status,
      publishedId: platform.publishedId,
      url: resolvePlatformUrl(platform),
      // Already member-facing: only translated messages are ever stored here.
      errorMessage: platform.errorMessage,
    })),
  };
}

/**
 * The "View on …" link for one published platform row.
 *
 * Two kinds of network, and the difference is why the stored value wins:
 *
 *  • **Derivable.** A LinkedIn permalink is its URN on the end of a fixed
 *    prefix, so it can be rebuilt on any read — including for the rows that
 *    were published before `permalink` existed as a column.
 *  • **Opaque.** An Instagram permalink contains a shortcode only Meta knows.
 *    It is captured once, at publish time, and if it were not stored it would
 *    cost an API call and a live token to recover.
 *
 * So: use what was stored, and fall back to reconstructing a LinkedIn URL.
 * A row with neither yields null, and the UI hides the link rather than
 * offering one that goes nowhere.
 */
function resolvePlatformUrl(platform: {
  provider: string;
  publishedId: string | null;
  permalink: string | null;
}): string | null {
  if (platform.permalink) return platform.permalink;
  if (platform.provider !== 'linkedin' || !platform.publishedId) return null;
  return toPostUrl(platform.publishedId);
}

export const publishService = { publishPost, getPublishState };
