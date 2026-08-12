import { ProviderError } from '../provider.interface';
import type { ProviderMediaAsset } from '../provider.interface';

/**
 * When a failed media upload may become a text-only post, and when it may not.
 *
 * ─── The trade this makes ────────────────────────────────────────────────────
 *
 * A post whose media X refuses is currently a total failure: nothing goes out,
 * and the member finds a FAILED row. For a media problem specifically, the text
 * was publishable and withholding it helps nobody — so this allows one narrow
 * recovery, publishing the words alone and *saying so*.
 *
 * That recovery is dangerous in exactly one way: applied too widely it turns
 * every failure into a half-success. A rate limit, a dead token or an X outage
 * must not quietly produce a text post the member did not ask for, because the
 * right answer to all three is "nothing was published, try again" and the wrong
 * answer is unpublishable-in-reverse — you cannot un-tweet.
 *
 * Hence an **allowlist, never a denylist.** Only the statuses below recover.
 * Anything unrecognised — including anything added to X's API later — fails the
 * post exactly as it does today. A new status is safe by default.
 *
 * ─── What is deliberately excluded ───────────────────────────────────────────
 *
 *  • **401 / 403** — the connection, not the media. `media.write` missing or a
 *    dead token. Reconnecting fixes it and the member must be told to.
 *  • **402** — the API plan has no credit. Publishing text-only would spend
 *    another write against an empty balance to produce a post nobody wanted.
 *  • **429** — rate limited. The media would upload fine in ten minutes.
 *  • **5xx, timeouts, socket errors** — X is unwell. The upload may even have
 *    landed; we do not know. Never guess in the direction of publishing.
 *  • **A failed transcode** — X accepted the bytes and then reported the file
 *    itself is broken, usually with a reason worth reading ("unsupported
 *    codec"). That already produces an actionable message telling the member
 *    what to re-export, and replacing it with a silent text post would throw
 *    away the one thing that would have fixed the video.
 *  • **Our own pre-flight validation** — `media-rules.ts` refusing a GIF beside
 *    three photos is FlowPost rejecting, not X. It leaves the post untouched
 *    and names the fix, which is a better outcome than choosing text-only on
 *    the member's behalf before X has even seen the file.
 */

/**
 * Upload statuses that mean "this file is not acceptable".
 *
 *  • `400` — X's catch-all rejection on the media endpoint: unreadable file,
 *    wrong container, dimensions out of range.
 *  • `413` — over the byte ceiling for its category.
 *  • `415` — the MIME type is not one this endpoint takes.
 *  • `422` — well-formed and still unprocessable.
 *
 * Every one of them is a fact about the *file*, unchanged by waiting,
 * reconnecting or paying. That is the property that makes recovery safe: the
 * upload cannot succeed on a retry, so publishing the text loses nothing that
 * was otherwise obtainable.
 */
const RECOVERABLE_UPLOAD_STATUSES = new Set([400, 413, 415, 422]);

/**
 * Whether this upload failure may be recovered by dropping the media.
 *
 * Takes the error thrown by the upload step **only**. Scoping matters as much
 * as the status list: a 400 from `POST /2/tweets` is a rejected *post* — a
 * duplicate, say — and stripping the media and retrying would neither fix it
 * nor be wanted. The caller wraps the upload loop and nothing else.
 */
export function isRecoverableMediaFailure(error: unknown): boolean {
  if (!(error instanceof ProviderError)) return false;

  // Undefined means X never answered — a timeout, a dead socket, or an error
  // we raised ourselves before sending. None of those is evidence about the
  // file, and all of them are the "unknown" case that must fail.
  if (error.upstreamStatus === undefined) return false;

  return RECOVERABLE_UPLOAD_STATUSES.has(error.upstreamStatus);
}

/**
 * What the member is told, in their own terms.
 *
 * Names the thing they attached rather than "media", because "X couldn't attach
 * your video" is checkable against what they remember uploading and "the media
 * operation failed" is not. Carries no status code, no endpoint and nothing
 * from X's response body — the diagnostics go to the log, and this goes on
 * screen next to a post that did publish.
 */
export function mediaDropReason(media: readonly ProviderMediaAsset[]): string {
  const noun = describeMedia(media);
  return `X couldn't attach the ${noun}, so FlowPost published the text only.`;
}

function describeMedia(media: readonly ProviderMediaAsset[]): string {
  if (media.length > 1) {
    // Mixed selections are possible on X only as several photos, but the
    // wording holds either way and does not have to enumerate them.
    return media.every((asset) => asset.kind === 'image') ? 'images' : 'media';
  }

  const only = media[0];
  if (!only) return 'media';
  if (only.kind === 'video') return 'video';
  if (only.mimeType === 'image/gif') return 'GIF';
  return 'image';
}
