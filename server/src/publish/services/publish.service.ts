import { postRepository } from '../../repositories/post.repository';
import { socialAccountRepository } from '../../repositories/social-account.repository';
import { activityService } from '../../services/activity.service';
import { getProvider, isKnownProvider, getCatalogEntry } from '../../providers';
import { ProviderError, type Provider, type ProviderId } from '../../providers';
// LinkedIn's permalink is a pure function of its URN, so it can be rebuilt on
// every read. Instagram's cannot — see `resolvePlatformUrl`.
import { toPostUrl } from '../../providers/linkedin/formatter';
import { resolvePostMedia, MediaResolutionError } from './media.service';
import { resolveContentType, type ResolverMediaItem } from './content-type';
import { capabilitiesFor, type MediaTransport } from '../../providers/capabilities';
// What was uploaded, mapped to a normalised format. An inference until the
// first metrics sync hears the network's own answer — see the call site.
import { inferMediaTypeFromUpload } from '../../analytics/normalise';
import { analyticsSyncService } from '../../services/analytics-sync.service';
import {
  refreshAccountTokens,
  isExpiringSoon,
  TOKEN_REFRESH_SKEW_MS,
} from '../../services/token-refresh';
import {
  MediaType,
  PostStatus,
  SocialAccountStatus,
} from '../../generated/prisma/enums';
import type { Post } from '../../generated/prisma/client';
import { PublishError } from './publish-error';

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

// Lives in its own module because the content-type resolver and the media rules
// both raise it and are imported *by* this file — see `publish-error.ts`.
// Re-exported so every existing importer is untouched.
export { PublishError } from './publish-error';

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

  /**
   * What went out, when it is not what was composed.
   *
   * `text_only_fallback` means the network refused the attached media and the
   * text was published without it — see `providers/x/media-fallback.ts`.
   * Absent on every ordinary publish.
   */
  publishedAs?: 'full' | 'text_only_fallback';
  /** True when media the member attached is not on the publication. */
  mediaDropped?: boolean;
  /**
   * Why, written for a member. Present whenever {@link mediaDropped} is true —
   * the whole point is that nothing is dropped silently.
   */
  reason?: string;
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
export interface PublishOptions {
  /**
   * The caller already owns this attempt.
   *
   * Set only by the scheduler, which claims the destination itself — it has to,
   * because its claim is also where the attempt counter and the backoff clock
   * are written, and those cannot be done after the fact by a process that may
   * not survive the publish. Skipping the claim here rather than claiming twice
   * is what keeps *one* row in PUBLISHING per (post, network): the second claim
   * would refuse, and this function would report a race against itself.
   *
   * Everything else below is unchanged and unconditional. The scheduler runs
   * the same ownership check, the same connection resolution, the same token
   * refresh, the same media pipeline and the same provider call as a member
   * pressing Publish — there is no second publishing implementation and this
   * flag is deliberately the only thing it may vary.
   */
  preClaimed?: boolean;

  /**
   * What the member chose to publish this as, on this network.
   *
   * Set by a manual publish, where the composer's current choice is newer than
   * anything stored. Absent for the scheduler, which reads what was recorded
   * when the schedule was armed — and absent for every post that predates the
   * choice existing, which is the case the whole resolver is built around.
   */
  contentType?: string | null;
}

export async function publishPost(
  userId: string,
  postId: string,
  providerId: string,
  options: PublishOptions = {},
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
  const claim = options.preClaimed
    ? ({ claimed: true } as const)
    : await postRepository.claimPlatformPublish(postId, providerId);
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
    // The post's stored context decides which connection may publish it —
    // never anything in the request, so the browser cannot cross contexts. A
    // personal post resolves only personal accounts; a brand post only that
    // brand's.
    const context = { contextType: post.context_type, brandId: post.brand_id };

    const account = await loadPublishableAccount(
      userId,
      providerId,
      networkName,
      provider,
      context,
    );

    // 5. Decrypted here and nowhere earlier — as late as it can be and still
    // be handed to the provider. Never assigned to anything that outlives this
    // function, never logged, never included in a thrown error. Fetched by the
    // selected account's id so the token and the providerAccountId handed to
    // the provider can never come from different rows.
    const tokens = await socialAccountRepository.getDecryptedTokensById(
      account.id,
    );
    if (!tokens) {
      throw new PublishError(
        `Connect your ${networkName} account before publishing.`,
        400,
      );
    }

    // Renewed here if the network's tokens are short-lived and this one is
    // spent. A no-op for every provider that does not implement `refreshTokens`.
    // `account.status` is passed because a row already flagged EXPIRED is
    // exactly the case that has to be renewed rather than refused.
    const accessToken = await ensureFreshAccessToken(
      account.id,
      provider,
      networkName,
      tokens,
      account.status,
    );

    await postRepository.updateStatus(postId, PostStatus.PUBLISHING);
    await activityService.logPublishStarted(userId, providerId, {
      postId,
      title: post.title,
    });

    const caption = resolveCaption(post);

    // 5½. What this post is being published *as*, before anything is fetched.
    //
    // Resolved here rather than in the provider because it is the one decision
    // that depends on both the member's intent and the network's capabilities,
    // and because the answer decides how the media is fetched a line later — a
    // Reel must not take the download path an image takes.
    //
    // A destination with no stored `content_type` resolves exactly as it did
    // before this column existed: no media is a text post, one item an image,
    // several a carousel. Every post already in the database and every schedule
    // already queued takes that branch. See `content-type.ts`.
    // What the member asked for wins over what is stored — a manual publish
    // carries the composer's current choice, and the stored value is what a
    // *scheduled* post recorded when it was armed. Neither invents one: absent
    // on both sides is the null path, and the null path is today's behaviour.
    const platformRow = await postRepository.findPlatformForPost(
      postId,
      providerId,
    );
    const requestedContentType = options.contentType ?? platformRow?.contentType;

    // ── TEMPORARY DIAGNOSTIC (remove after Reel regression is resolved) ─────
    console.log('[publish:diag] received', {
      postId,
      provider: providerId,
      // What the controller read from req.body.contentType
      optionsContentType: options.contentType ?? null,
      // What was stored on the platform row from a previous attempt
      platformRowContentType: platformRow?.contentType ?? null,
      // The winner — what resolveContentType will be called with
      requestedContentType: requestedContentType ?? null,
      mediaKinds: readMediaKinds(post).map((m) => m.kind),
      mediaCount: readMediaKinds(post).length,
    });
    // ── END TEMPORARY DIAGNOSTIC ────────────────────────────────────────────

    const { contentType, capability, explicit } = resolveContentType(
      requestedContentType,
      readMediaKinds(post),
      capabilitiesFor(providerId),
      networkName,
    );

    // ── TEMPORARY DIAGNOSTIC (remove after Reel regression is resolved) ─────
    console.log('[publish:diag] resolved', {
      postId,
      provider: providerId,
      requestedContentType: requestedContentType ?? null,
      resolvedContentType: contentType,
      explicit,
      capabilityLabel: capability?.label ?? null,
      capabilityHasVideo: Boolean(capability?.video),
      capabilityHasImage: Boolean(capability?.image),
    });
    // ── END TEMPORARY DIAGNOSTIC ────────────────────────────────────────────

    // 6. Media, if the draft has any. Resolved *here* rather than inside the
    // provider: fetching a member-supplied URL is a security-sensitive step
    // that must have one implementation across every network, and providers
    // take bytes. See `media.service.ts`.
    const media = await resolveMedia(post, caption, provider, capability?.transport);

    // 7–8. One call whether or not there is media — the provider branches, and
    // this layer never learns which of LinkedIn's endpoints answered. Validation
    // lives in the provider (it is network-specific) and throws a ProviderError,
    // which the catch below translates.
    const result = await provider.publish({
      accessToken,
      providerAccountId: account.providerAccountId,
      caption,
      media,
      contentType,
    });

    // 9–10. The two writes that make the publish real. The permalink is stored
    // alongside the id because some networks — Instagram among them — return a
    // URL that cannot be reconstructed from the id afterwards.
    //
    // The connection and the format are recorded here for the same reason: both
    // are knowable now and neither can be recovered later. A reconnect replaces
    // the `social_accounts` row, and nothing about a published post says what
    // format it went out as. The media type is an *inference* from the upload
    // — the network has not been asked — so the first analytics sync is free to
    // correct it. See `analytics/normalise.ts`.
    await postRepository.markPlatformPublished(postId, providerId, result.urn, {
      permalink: result.url,
      socialAccountId: account.id,
      // What this publication *is*, as best we can tell without asking the
      // network. An explicit choice is the better inference and is used when
      // there is one: a post the member published as a Reel is a REEL, where
      // guessing from the upload could only ever say VIDEO. Still recorded as
      // an inference (`media_type_from_platform` stays false), so the first
      // analytics sync is free to correct it.
      // A publication whose media the network refused is a text post *on that
      // network*, whatever was composed. Recording the requested format here
      // would tell analytics this account publishes Reels that get no video
      // engagement. The member's own request survives in `contentType` below,
      // which is exactly the requested-vs-observed split this pair exists for.
      mediaType: result.mediaDropped
        ? MediaType.TEXT
        : explicit
          ? (contentType as MediaType)
          : inferMediaTypeFromUpload(post.media),
      // Only what was actually *asked for*. An inferred type is not recorded:
      // writing "IMAGE" onto a row whose member never chose a format would turn
      // a resolution rule into a claim about a decision nobody made, and would
      // make "requested vs observed" meaningless for exactly the rows where the
      // two are most likely to differ. Null stays null.
      contentType: explicit ? contentType : null,
      // Null on the overwhelming majority of publishes, and cleared by any
      // later clean retry.
      notice: result.reason ?? null,
    });
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

    // 12. A first analytics reading, so the member does not open the post and
    // find "collecting" for an hour on a network that would have answered now.
    //
    // Deliberately **not awaited**, and last. The publish is complete and
    // recorded above this line: there is no path from a failed read back to a
    // failed publish, and none from a slow one back to a slow response. This is
    // the whole reason it is a detached call rather than a step — the cadence
    // does the real work, and this only fills the first hour.
    analyticsSyncService.scheduleFirstObservation(account.id);

    return {
      postId,
      provider: providerId,
      status: 'published',
      publishedId: result.urn,
      url: result.url,
      publishedAt: publishedAt.toISOString(),
      // Carried straight through to the browser so a member pressing Publish
      // is told immediately, rather than discovering the missing image later.
      // The scheduler has no response to read, which is why the same sentence
      // is also persisted as `post_platforms.notice`.
      ...(result.mediaDropped
        ? {
            publishedAs: result.publishedAs ?? 'text_only_fallback',
            mediaDropped: true,
            ...(result.reason ? { reason: result.reason } : {}),
          }
        : {}),
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
  context: { contextType: string; brandId: string | null },
) {
  const account = await socialAccountRepository.findByUserAndProvider(
    userId,
    providerId,
    context,
  );

  if (!account) {
    throw new PublishError(
      context.contextType === 'brand'
        ? `Connect a ${networkName} account for this brand before publishing.`
        : `Connect your ${networkName} account before publishing.`,
      400,
    );
  }

  // REVOKED always blocks: the member withdrew access at the network, and no
  // token we hold can undo that.
  //
  // EXPIRED does *not* block a provider that can refresh. On X the row reaches
  // EXPIRED routinely — a health check two hours after connecting gets a 401
  // from a spent access token and records it — while the refresh token beside
  // it is still perfectly good. Refusing here is what made a recoverable
  // connection permanently unpublishable; `ensureFreshAccessToken` renews it a
  // few lines later, and a refresh that genuinely fails still lands the member
  // on this same message.
  const blockedByStatus =
    account.status === SocialAccountStatus.REVOKED ||
    (account.status === SocialAccountStatus.EXPIRED && !provider.refreshTokens);

  if (blockedByStatus) {
    throw new PublishError(
      `Your ${networkName} connection needs reconnecting before you can publish.`,
      400,
    );
  }

  // A stored expiry already in the past. Worth catching here rather than
  // spending a request to be told the same thing, and it lets us name the fix.
  //
  // Skipped for a provider that can refresh: X's access tokens last two hours,
  // so a past-due expiry there is the *normal* state of a connection between
  // publishes, not a broken one. `ensureFreshAccessToken` renews it below, and
  // a refresh that fails still lands the member on the same "reconnect it"
  // message. Providers without `refreshTokens` — LinkedIn, Instagram,
  // Facebook — take exactly the branch they always did.
  if (
    !provider.refreshTokens &&
    account.expiresAt &&
    account.expiresAt.getTime() <= Date.now()
  ) {
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
 * The access token to publish with — renewed first if it is spent and the
 * network can renew it.
 *
 * Returns the stored token untouched for every provider without
 * `refreshTokens`, which is all of them but X: LinkedIn's tokens last sixty
 * days and Meta's are extended by presenting themselves, so neither has
 * anything for this to do.
 *
 * Two things trigger a renewal, and the second is the one that was missing:
 *
 *  • the stored expiry is spent, or inside the skew window;
 *  • the row is flagged EXPIRED. That flag is written by Refresh Connection
 *    when the network rejects an access token, and on X it happens as a matter
 *    of routine two hours after connecting. Renewing on it is what lets a
 *    connection heal instead of demanding a reconnect it never needed.
 *
 * Persistence is `refreshAccountTokens`' job — including rotation, and
 * including moving the row back to CONNECTED. Nothing here logs a token, and a
 * failure names the fix rather than what the network said about it.
 */
async function ensureFreshAccessToken(
  accountId: string,
  provider: Provider,
  networkName: string,
  tokens: { accessToken: string; refreshToken: string | null; expiresAt: Date | null },
  status: SocialAccountStatus,
): Promise<string> {
  if (!provider.refreshTokens) return tokens.accessToken;

  const needsRefresh =
    isExpiringSoon(tokens.expiresAt, TOKEN_REFRESH_SKEW_MS) ||
    status === SocialAccountStatus.EXPIRED;
  if (!needsRefresh) return tokens.accessToken;

  const outcome = await refreshAccountTokens(
    accountId,
    provider,
    tokens.refreshToken,
  );

  if (outcome.ok) return outcome.accessToken;

  // Only a network that *rejected* the refresh token proves the connection is
  // finished. `no_refresh_token` says we never had one to try, which is the
  // same dead end for the member but is recorded honestly.
  if (outcome.reason === 'rejected') {
    await markConnectionExpired(accountId);
  }

  // Nothing was published, so the claim is handed back rather than the post
  // being marked FAILED.
  throw new PublishError(
    `Your ${networkName} connection needs reconnecting before you can publish.`,
    400,
    true,
  );
}

/**
 * Flags a connection as needing a reconnect after its refresh token was
 * rejected.
 *
 * Best-effort: this runs while a publish failure is already on its way up, and
 * a write that throws here would replace a precise error with a confusing one.
 */
async function markConnectionExpired(accountId: string): Promise<void> {
  try {
    await socialAccountRepository.updateStatus(
      accountId,
      SocialAccountStatus.EXPIRED,
    );
  } catch (error) {
    console.error('[publish] could not flag the connection as expired', {
      accountId,
      error: error instanceof Error ? error.message : error,
    });
  }
}

/**
 * The text that goes out.
 *
 * The caption the member edited wins over the AI's original: the editor is the
 * source of truth for what they actually want published, and `ai_caption` is
 * the provenance record of what was suggested. Falling back to it covers a post
 * generated and approved without ever being opened in the editor.
 */
/**
 * What is attached, as much of it as the content-type resolver needs.
 *
 * Deliberately count-and-kind only. `posts.media` is browser-written JSON that
 * has been through more than one shape, so a malformed entry is skipped rather
 * than trusted — the same rule `media.service.ts` reads it by, for the same
 * reason. Anything without a `type` of `"video"` is an image, which is every
 * row written before the uploader accepted video.
 */
function readMediaKinds(post: Post): ResolverMediaItem[] {
  if (!Array.isArray(post.media)) {
    // No media array at all: a post from before that column, which carries at
    // most the one `image_url`. Exactly what the media service resolves it to.
    return post.image_url?.trim() ? [{ kind: 'image' }] : [];
  }

  const items: ResolverMediaItem[] = [];
  for (const entry of post.media) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.url !== 'string' || !record.url.trim()) continue;
    items.push({
      kind: record.type === 'video' ? 'video' : 'image',
      mimeType:
        typeof record.mimeType === 'string'
          ? record.mimeType.toLowerCase()
          : undefined,
    });
  }
  return items;
}

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
async function resolveMedia(
  post: Post,
  caption: string,
  provider: Provider,
  transport?: MediaTransport,
) {
  try {
    // The format and size rules are the *network's*, taken from the provider —
    // LinkedIn accepts JPEG, PNG and GIF, Instagram JPEG only.
    return await resolvePostMedia(post, {
      caption,
      requirements: provider.mediaRequirements,
      // Which network is being published to, so this network's stored framing
      // is the one delivered. A post with no framing is unaffected.
      providerId: provider.id,
      // Video only — see the parameter's own note. Images are unaffected by
      // this on every network.
      transport,
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
      // The network is up, the token is fine, and the API plan has run out.
      // X answers `402 credits depleted` on `POST /2/tweets` once a pay-per-use
      // balance is spent — reads and media uploads keep working, so the first
      // thing that fails is publishing.
      //
      // Without this case it fell to `default`, which says "couldn't be
      // reached — try again in a moment". Every word of that is wrong here:
      // the network *was* reached, waiting changes nothing, and a member who
      // retries spends another upload against a balance that is already empty.
      // A billing problem has to name itself or it gets debugged as an outage.
      case 402:
        return new PublishError(
          `${networkName} declined the post because the API plan has no credit left. ` +
            `Top up the ${networkName} developer account, then publish again.`,
          402,
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
    /**
     * A notice about a publication that *succeeded* — today, only that the
     * network refused the attached media and the text went out alone.
     *
     * Separate from `errorMessage` because the row is PUBLISHED and the post is
     * live; rendering this where failures are rendered would report a broken
     * publish that is not broken.
     */
    notice: string | null;
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
      // Likewise composed for a member by the provider, and never carrying a
      // status code or a response body.
      notice: platform.notice,
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

// Exported for the unit tests. `toMemberFacingError` is the one function here
// that is pure — a provider failure in, a member's sentence out — and it is
// where the mapping bugs live, so it is worth testing without standing up a
// post, a connection and a network.
export const __testables = { toMemberFacingError };
