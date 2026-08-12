import { ProviderError, type ProviderId } from './provider.interface';
import type {
  AspectRatioRange,
  ContentTypeCapability,
  MediaConstraints,
} from './capabilities';
import type { ProviderMediaAsset } from './provider.interface';

/**
 * Checking media against a capability — once, for every network.
 *
 * ─── Why this is not four validators ─────────────────────────────────────────
 *
 * Because the rules are already written down. `capabilities.ts` states what
 * Instagram takes on a Reel and what X takes on a video; a per-provider
 * function that restates "mp4 only, under a gigabyte, three seconds to fifteen
 * minutes" is a second copy of a fact that is going to drift from the first.
 * Each provider's validator keeps the checks that are genuinely *its own* —
 * Instagram's hashtag count, LinkedIn's pixel ceiling, X's weighted characters
 * — and delegates the media to this.
 *
 * ─── What a member reads ─────────────────────────────────────────────────────
 *
 * Every message here is a sentence a person can act on. No `media_type=REELS`,
 * no HTTP status, no Cloudinary URL, no vendor JSON — those go to
 * `console.error` where support can find them. "This video is 18 seconds.
 * Instagram Reels need at least 3." is the whole contract.
 *
 * ─── Warnings are not errors ─────────────────────────────────────────────────
 *
 * {@link inspectQuality} returns advice and throws nothing. A 720p video is
 * soft on a large screen and every network will publish it, so it is a warning
 * the composer shows and the member overrules. Only a limit the network itself
 * enforces is allowed to stop a publish — the difference between the two is the
 * difference between a product that guides and one that nags.
 */

/**
 * Refuses media this content type cannot carry.
 *
 * Throws {@link ProviderError} with status 400 and no `upstreamStatus`, which
 * is how the publish service recognises a validation failure it should surface
 * verbatim and leave the post untouched.
 */
export function validateAgainstCapability(
  capability: ContentTypeCapability,
  assets: readonly ProviderMediaAsset[],
  provider: ProviderId,
  networkName: string,
): void {
  assertCount(capability, assets.length, provider, networkName);

  for (const asset of assets) {
    const constraints =
      asset.kind === 'video' ? capability.video : capability.image;

    if (!constraints) {
      throw new ProviderError(
        asset.kind === 'video'
          ? `${capability.label} on ${networkName} can't carry video. ` +
            `${describeAlternative(capability)}`
          : `${capability.label} on ${networkName} needs a video, not an image.`,
        400,
        provider,
      );
    }

    assertMime(constraints, asset, assets.length, capability, provider, networkName);
    assertBytes(constraints, asset, provider, networkName);
    if (asset.kind === 'video') {
      assertDuration(constraints, asset, capability, provider, networkName);
    }
    if (capability.aspectRatio) {
      assertAspectRatio(capability.aspectRatio, asset, provider, networkName);
    }
  }
}

/** What else this format takes, so a refusal names a way forward. */
function describeAlternative(capability: ContentTypeCapability): string {
  return capability.image
    ? 'Use an image, or choose a format that publishes video.'
    : 'Choose a format that publishes video.';
}

function assertCount(
  capability: ContentTypeCapability,
  count: number,
  provider: ProviderId,
  networkName: string,
): void {
  if (count === 0 && capability.requiresMedia) {
    throw new ProviderError(
      `${capability.label} on ${networkName} needs ${
        capability.video && !capability.image ? 'a video' : 'media'
      }. Add one and try again.`,
      400,
      provider,
    );
  }

  if (count > capability.maxItems) {
    throw new ProviderError(
      capability.maxItems === 0
        ? `${capability.label} on ${networkName} can't carry media.`
        : `${capability.label} on ${networkName} holds ${capability.maxItems} ` +
          `${capability.maxItems === 1 ? 'item' : 'items'}. This post has ${count} — ` +
          `remove ${count - capability.maxItems} and try again.`,
      400,
      provider,
    );
  }

  if (count < capability.minItems) {
    throw new ProviderError(
      `${capability.label} on ${networkName} needs at least ${capability.minItems} items. ` +
        `This post has ${count}.`,
      400,
      provider,
    );
  }
}

function assertMime(
  constraints: MediaConstraints,
  asset: ProviderMediaAsset,
  totalItems: number,
  capability: ContentTypeCapability,
  provider: ProviderId,
  networkName: string,
): void {
  const mime = asset.mimeType?.toLowerCase() ?? '';

  if (!constraints.mimeTypes.includes(mime)) {
    throw new ProviderError(
      `${networkName} doesn't accept ${describeFormat(mime)} for a ` +
        `${capability.label.toLowerCase()}. Accepted: ${constraints.mimeTypes
          .map(friendlyFormat)
          .join(', ')}.`,
      400,
      provider,
    );
  }

  // The GIF rule, stated as data rather than as an `if (provider === 'x')`.
  if (constraints.soloMimeTypes?.includes(mime) && totalItems > 1) {
    throw new ProviderError(
      `${networkName} publishes a ${friendlyFormat(mime)} on its own. ` +
        'Remove the other media, or remove it and post the rest.',
      400,
      provider,
    );
  }
}

function assertBytes(
  constraints: MediaConstraints,
  asset: ProviderMediaAsset,
  provider: ProviderId,
  networkName: string,
): void {
  if (asset.byteLength === 0) {
    throw new ProviderError(
      `That ${asset.kind === 'video' ? 'video' : 'image'} file is empty. ` +
        'Re-upload it and try again.',
      400,
      provider,
    );
  }

  const isSolo =
    constraints.soloMimeTypes?.includes(asset.mimeType?.toLowerCase() ?? '') ??
    false;
  const ceiling =
    isSolo && constraints.soloMaxBytes !== undefined
      ? constraints.soloMaxBytes
      : constraints.maxBytes;

  if (asset.byteLength > ceiling) {
    throw new ProviderError(
      `That ${asset.kind === 'video' ? 'video' : 'image'} is ${formatBytes(asset.byteLength)}, ` +
        `over ${networkName}'s ${formatBytes(ceiling)} limit.`,
      400,
      provider,
    );
  }
}

/**
 * Duration, when it is known.
 *
 * A null duration passes. It means Cloudinary did not report one, which is not
 * evidence the video is wrong — and refusing a publish because *our* metadata
 * was thin would fail posts the network would have taken. The network still
 * checks the file itself.
 */
function assertDuration(
  constraints: MediaConstraints,
  asset: ProviderMediaAsset,
  capability: ContentTypeCapability,
  provider: ProviderId,
  networkName: string,
): void {
  const durationMs = asset.durationMs;
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) return;

  if (
    constraints.minDurationMs !== undefined &&
    durationMs < constraints.minDurationMs
  ) {
    throw new ProviderError(
      `This video is ${formatDuration(durationMs)}. ${networkName} ` +
        `${capability.label}s need at least ${formatDuration(constraints.minDurationMs)}.`,
      400,
      provider,
    );
  }

  if (
    constraints.maxDurationMs !== undefined &&
    durationMs > constraints.maxDurationMs
  ) {
    throw new ProviderError(
      `This video is ${formatDuration(durationMs)} — too long for a ` +
        `${networkName} ${capability.label}, which takes up to ` +
        `${formatDuration(constraints.maxDurationMs)}. Trim it and try again.`,
      400,
      provider,
    );
  }
}

/**
 * Aspect ratio, against the network's *accepted* range only.
 *
 * The recommended window is deliberately not enforced — see
 * {@link AspectRatioRange}. Unknown dimensions pass, for the same reason an
 * unknown duration does.
 */
function assertAspectRatio(
  range: AspectRatioRange,
  asset: ProviderMediaAsset,
  provider: ProviderId,
  networkName: string,
): void {
  const ratio = aspectRatioOf(asset);
  if (ratio === null) return;

  if (ratio < range.min || ratio > range.max) {
    throw new ProviderError(
      `This ${asset.kind === 'video' ? 'video' : 'image'} is ${describeRatio(ratio)}, ` +
        `which ${networkName} won't publish. Crop it to ${range.recommended} and try again.`,
      400,
      provider,
    );
  }
}

/** Width ÷ height, or null when either is unknown. */
export function aspectRatioOf(asset: {
  width: number | null;
  height: number | null;
}): number | null {
  if (!asset.width || !asset.height) return null;
  if (asset.height <= 0) return null;
  return asset.width / asset.height;
}

/** One thing worth telling the member that is not a reason to stop. */
export interface QualityAdvice {
  kind: 'resolution' | 'aspect-ratio';
  /** A sentence, already written for a person. */
  message: string;
  /** The shape to crop to, when the advice is about framing. */
  suggestedRatio?: string;
}

/**
 * Advice, not enforcement.
 *
 * Nothing here throws and nothing here blocks a publish. It answers "is this
 * going to look good?", which is a different question from "will the network
 * take it?" — and conflating the two is how a product ends up refusing a
 * perfectly publishable video because it is 720p.
 */
export function inspectQuality(
  capability: ContentTypeCapability,
  asset: Pick<ProviderMediaAsset, 'kind' | 'width' | 'height'>,
): QualityAdvice[] {
  const advice: QualityAdvice[] = [];
  const constraints = asset.kind === 'video' ? capability.video : capability.image;
  if (!constraints) return advice;

  const belowWidth =
    constraints.recommendedMinWidth !== undefined &&
    asset.width !== null &&
    asset.width > 0 &&
    asset.width < constraints.recommendedMinWidth;

  const belowHeight =
    constraints.recommendedMinHeight !== undefined &&
    asset.height !== null &&
    asset.height > 0 &&
    asset.height < constraints.recommendedMinHeight;

  if (belowWidth || belowHeight) {
    advice.push({
      kind: 'resolution',
      message: 'This may look soft on larger screens.',
    });
  }

  const range = capability.aspectRatio;
  const ratio = aspectRatioOf(asset);
  if (range && ratio !== null && range.recommendedMin !== undefined) {
    const outside =
      ratio < range.recommendedMin ||
      (range.recommendedMax !== undefined && ratio > range.recommendedMax);
    if (outside) {
      advice.push({
        kind: 'aspect-ratio',
        message: `This is ${describeRatio(ratio)}. ${capability.label}s work best in ${range.recommended}.`,
        suggestedRatio: range.recommended,
      });
    }
  }

  return advice;
}

/** "16:9", "9:16", "4:5" — the nearest common shape, or a decimal for the rest. */
export function describeRatio(ratio: number): string {
  const common: Array<[string, number]> = [
    ['9:16', 0.5625],
    ['4:5', 0.8],
    ['1:1', 1],
    ['4:3', 4 / 3],
    ['16:9', 16 / 9],
    ['1.91:1', 1.91],
  ];

  for (const [label, value] of common) {
    if (Math.abs(ratio - value) < 0.03) return label;
  }
  return `${ratio.toFixed(2)}:1`;
}

/** "0:18", "1:24", "15:00" — how a member reads a running time. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds} second${totalSeconds === 1 ? '' : 's'}`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** "12.4MB", "512MB" — sized for a sentence, not for precision. */
export function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1024) return `${(megabytes / 1024).toFixed(1)}GB`;
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)}MB`;
}

/** `image/jpeg` → `JPEG`. What a member calls the format. */
function friendlyFormat(mime: string): string {
  const subtype = mime.split('/')[1] ?? mime;
  if (subtype === 'quicktime') return 'MOV';
  if (subtype === 'jpeg') return 'JPEG';
  return subtype.toUpperCase();
}

function describeFormat(mime: string): string {
  return mime ? friendlyFormat(mime) : 'that format';
}
