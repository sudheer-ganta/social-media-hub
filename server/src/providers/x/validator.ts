import { ProviderError } from '../provider.interface';
import { X_PUBLISH_SCOPE } from './config';
import type { ProviderMediaAsset } from '../provider.interface';

/**
 * What X will and will not accept, checked before we spend a request on finding
 * out.
 *
 * Pure and provider-local: no HTTP, no database. Same contract as LinkedIn's and
 * Instagram's validators — a post that cannot possibly succeed fails here with a
 * message a member can act on, rather than as an opaque X error we would have to
 * translate.
 */

/**
 * The standard post ceiling.
 *
 * ponytail: counted in Unicode code points, not X's weighted count (which bills
 * CJK and emoji at 2 and URLs at a flat 23). The two agree for ordinary Latin
 * text, and the weighted count only ever counts *higher* — so this can pass a
 * post X rejects for length, never the reverse. Port twitter-text's weighting if
 * that rejection ever shows up in practice.
 *
 * Also deliberately not 25,000: that ceiling belongs to X Premium accounts, and
 * assuming it for everyone would replace a clear local error with a remote one.
 */
export const X_MAX_TEXT_LENGTH = 280;

/**
 * True when a connection's *granted* scopes allow publishing.
 *
 * A member can decline a permission on the consent screen and still complete the
 * connection, producing an account that looks healthy and cannot post.
 */
export function canPublish(scopes: string[]): boolean {
  return scopes.includes(X_PUBLISH_SCOPE);
}

/** Counts the way the ceiling above is defined — code points, not UTF-16 units. */
export function countCharacters(text: string): number {
  return [...text].length;
}

/**
 * Checks a post is publishable and returns the text that will be sent.
 *
 * Throws {@link ProviderError} with status 400 and no `upstreamStatus`, which is
 * how the publish service recognises a validation failure it should surface
 * verbatim and leave the post untouched.
 */
export function validatePost(input: {
  caption: string;
  media?: ProviderMediaAsset[];
}): { text: string } {
  const text = input.caption.trim();

  if (!text) {
    throw new ProviderError(
      'An X post needs some text — X has no image-only posts through this API.',
      400,
      'x',
    );
  }

  const length = countCharacters(text);
  if (length > X_MAX_TEXT_LENGTH) {
    throw new ProviderError(
      `This post is ${length} characters. X allows ${X_MAX_TEXT_LENGTH} — ` +
        `trim ${length - X_MAX_TEXT_LENGTH}.`,
      400,
      'x',
    );
  }

  // Media is refused, loudly, rather than dropped.
  //
  // Attaching an image to a post on X means uploading it first, and the upload
  // endpoint is not part of the v2 surface this integration is built on — it is
  // a separate media API whose availability depends on the app's access tier. We
  // have not verified what this app's tier grants, and building an upload
  // pipeline against an endpoint that may answer 403 would be inventing a
  // capability rather than integrating one.
  //
  // So: a member who attached an image is told their image cannot go out, and
  // nothing is published. A post that quietly lost its image would be a worse
  // answer than one that fails with a reason.
  if (input.media && input.media.length > 0) {
    throw new ProviderError(
      'FlowPost can only publish text posts to X right now. ' +
        'Remove the image, or publish this post to another network.',
      400,
      'x',
    );
  }

  return { text };
}
