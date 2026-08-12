import {
  isContentType,
  type ContentType,
  type ContentTypeCapability,
  type ProviderCapabilities,
} from '../../providers/capabilities';
import { PublishError } from './publish-error';

/**
 * Deciding what a post is being published *as*.
 *
 * One function, and the whole feature's compatibility story lives in it.
 *
 * ─── The rule that matters ───────────────────────────────────────────────────
 *
 * A post that never named a content type must publish exactly as it would have
 * before content types existed. Not "approximately" and not "sensibly" —
 * exactly. Every post already in the database is one of these, every schedule
 * already queued is one of these, and any drift here is a change to what
 * someone's scheduled post does at 09:00 tomorrow without them touching it.
 *
 * So there are two paths and they are deliberately asymmetric:
 *
 *   • **Explicit.** The member chose. Validate it hard — a Reel with no video,
 *     a Story on LinkedIn and a carousel of one are all refused here, before a
 *     token is decrypted, with a message written for a person.
 *   • **Null.** Nobody chose. Infer from the count, the way the publish path
 *     always has, and **validate nothing**. That last part is the load-bearing
 *     one: adding a check to this path could only ever turn a post that used to
 *     publish into one that does not.
 */

/** What the resolver decided, and the rules that follow from it. */
export interface ResolvedContentType {
  contentType: ContentType;
  /**
   * The network's rules for this format, or undefined.
   *
   * Undefined only ever comes out of the null path — an inferred TEXT on
   * Instagram, say, which the Instagram validator already refuses with a
   * message about needing an image. The explicit path never returns undefined:
   * an unsupported choice throws instead.
   */
  capability: ContentTypeCapability | undefined;
  /** True when the member chose, false when this was inferred from the count. */
  explicit: boolean;
}

/** As much of an attached item as the resolver needs. */
export interface ResolverMediaItem {
  kind: 'image' | 'video' | 'document';
  mimeType?: string;
}

/**
 * The format this post publishes as on this network.
 *
 * `requested` is `post_platforms.content_type`, which is null for everything
 * written before the composer offered a choice.
 */
export function resolveContentType(
  requested: string | null | undefined,
  mediaItems: readonly ResolverMediaItem[],
  capabilities: ProviderCapabilities,
  networkName = 'this network',
): ResolvedContentType {
  if (requested === null || requested === undefined || requested === '') {
    const contentType = inferFromCount(mediaItems.length);
    return {
      contentType,
      capability: capabilities[contentType],
      explicit: false,
    };
  }

  if (!isContentType(requested)) {
    // Not a value this vocabulary has. A stored row cannot produce this — the
    // column is an enum — so it means a client sent something invented.
    throw new PublishError(
      `FlowPost doesn't publish "${requested}" posts.`,
      400,
      true,
    );
  }

  const capability = capabilities[requested];
  if (!capability) {
    throw new PublishError(
      unsupportedMessage(requested, networkName, capabilities),
      400,
      true,
    );
  }

  assertItemCount(requested, capability, mediaItems.length, networkName);

  return { contentType: requested, capability, explicit: true };
}

/**
 * The pre-content-type rule, unchanged.
 *
 * Count only — deliberately not the media *kinds*. "One video must be a Reel"
 * is exactly the inference this whole feature exists to stop making on a
 * member's behalf, and in any case no post that predates this column has a
 * video attached: the composer could not upload one.
 */
export function inferFromCount(count: number): ContentType {
  if (count === 0) return 'TEXT';
  if (count === 1) return 'IMAGE';
  return 'CAROUSEL';
}

/** Refuses a count this format cannot carry, in the member's terms. */
function assertItemCount(
  contentType: ContentType,
  capability: ContentTypeCapability,
  count: number,
  networkName: string,
): void {
  if (count === 0 && capability.requiresMedia) {
    throw new PublishError(
      `${capability.label} posts need ${
        capability.video && !capability.image
          ? 'a video'
          : capability.video
            ? 'an image or a video'
            : 'an image'
      }. Add one and try again.`,
      400,
      true,
    );
  }

  if (count > 0 && capability.maxItems === 0) {
    throw new PublishError(
      `A ${networkName} ${capability.label.toLowerCase()} can't carry media. ` +
        'Remove it, or choose a different format.',
      400,
      true,
    );
  }

  if (count < capability.minItems) {
    throw new PublishError(
      `${capability.label} needs at least ${capability.minItems} items. ` +
        `This post has ${count}.`,
      400,
      true,
    );
  }

  if (count > capability.maxItems) {
    throw new PublishError(
      `${capability.label} holds ${capability.maxItems} ${
        capability.maxItems === 1 ? 'item' : 'items'
      }. This post has ${count} — remove ${count - capability.maxItems} and try again.`,
      400,
      true,
    );
  }
}

/**
 * Why a format is unavailable, and what is.
 *
 * Never "unsupported content type": a member reading that learns nothing they
 * can act on. Naming what the network *does* publish turns a dead end into a
 * choice.
 */
function unsupportedMessage(
  contentType: ContentType,
  networkName: string,
  capabilities: ProviderCapabilities,
): string {
  const available = Object.values(capabilities)
    .map((entry) => entry.label)
    .join(', ');

  const noun = FRIENDLY_NAMES[contentType];

  return available
    ? `${networkName} doesn't publish ${noun}. It publishes ${available}.`
    : `FlowPost can't publish to ${networkName} yet.`;
}

/** The member's word for a format we are refusing, in a sentence. */
const FRIENDLY_NAMES: Record<ContentType, string> = {
  TEXT: 'text-only posts',
  IMAGE: 'image posts',
  CAROUSEL: 'carousels',
  VIDEO: 'video',
  REEL: 'Reels',
  STORY: 'Stories',
};
