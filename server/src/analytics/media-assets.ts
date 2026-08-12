/**
 * What FlowPost knows about the media on a post, as analytics can use it.
 *
 * ─── What this is for, and what it is not ────────────────────────────────────
 *
 * No network FlowPost integrates returns per-asset metrics — see
 * `metric-support.ts`. So this describes the *assets*, never their performance:
 * shape, format, duration, order. Nothing here carries a number that came from
 * a platform, and nothing here divides a post's metrics across its media.
 *
 * That division is the specific thing being refused. A carousel with 126
 * interactions and 3 slides has no per-slide figure; "42 each" would be
 * arithmetic presented as measurement, and every later "which image works"
 * answer would be built on it.
 *
 * What this *does* enable is the comparison that is honest: a post's format
 * against its outcome. "Reels average 6.8%, single images 4.1%" needs only the
 * publication's own metrics and the shape of what was attached, both of which
 * are real. The per-asset question stays unanswered until a network answers it.
 *
 * ─── Why the parsing is defensive ────────────────────────────────────────────
 *
 * `posts.media` is a JSONB column the browser writes, and it has been through
 * more than one shape: the earliest posts have no `media` at all and carry one
 * image in `image_url`, and rows written before the video composer have no
 * `mimeType`, `bytes` or `durationMs`. Every field here is therefore optional
 * and every unreadable value becomes null rather than throwing — a malformed
 * entry must not take out the analytics page for a whole post.
 */

/** One media asset on a post, described rather than measured. */
export interface MediaAssetSummary {
  /** The composer's own id for this asset. Stable across saves. */
  id: string | null;
  /** Zero-based position in the post. This *is* the publish order. */
  position: number;
  kind: 'image' | 'video' | 'unknown';
  mimeType: string | null;
  width: number | null;
  height: number | null;
  /**
   * Width ÷ height, or null when either dimension is unknown.
   *
   * A number rather than a label so callers can bucket it however they need;
   * {@link aspectRatioLabel} gives the human form.
   */
  aspectRatio: number | null;
  /** "9:16", "1:1", "1.91:1" — the nearest common shape. */
  aspectRatioLabel: string | null;
  /** Video only, and null when nothing measured it. Never guessed. */
  durationMs: number | null;
  byteLength: number | null;
  /** A still frame for video, where Cloudinary derived one. */
  posterUrl: string | null;
  url: string | null;
  /** Whether this asset was cropped for delivery. */
  cropped: boolean;
}

/** As much of one `posts.media` entry as this module reads. */
interface StoredMediaItem {
  id?: unknown;
  url?: unknown;
  type?: unknown;
  mimeType?: unknown;
  width?: unknown;
  height?: unknown;
  bytes?: unknown;
  durationMs?: unknown;
  posterUrl?: unknown;
  crop?: unknown;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * "16:9", "9:16", "4:5" — the nearest common shape, or a decimal for the rest.
 *
 * Deliberately the same table and tolerance as `providers/media-rules.ts`, so a
 * video the composer called 9:16 is not called 0.56:1 here. Kept separate
 * rather than imported because the provider layer must not be a dependency of
 * analytics — the two agree by having the same small table, not by coupling.
 */
export function aspectRatioLabel(ratio: number): string {
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

/**
 * The assets on one post, in publish order.
 *
 * Falls back to `image_url` when there is no `media` array, which is every post
 * written before the multi-image composer. Those are real single-image posts
 * and excluding them would understate the format history they belong to; the
 * fallback carries a null id and null dimensions, which is honest about how
 * little was recorded then.
 *
 * Returns an empty array for a text post — which is a fact, not a gap.
 */
export function describeMedia(post: {
  media: unknown;
  image_url?: string | null;
}): MediaAssetSummary[] {
  const raw = Array.isArray(post.media) ? post.media : null;

  if (!raw || raw.length === 0) {
    const legacy = str(post.image_url);
    if (!legacy) return [];

    return [
      {
        id: null,
        position: 0,
        kind: 'image',
        mimeType: null,
        width: null,
        height: null,
        aspectRatio: null,
        aspectRatioLabel: null,
        durationMs: null,
        byteLength: null,
        posterUrl: null,
        url: legacy,
        cropped: false,
      },
    ];
  }

  return raw
    .filter((item): item is StoredMediaItem => typeof item === 'object' && item !== null)
    .map((item, position) => {
      const width = num(item.width);
      const height = num(item.height);
      const ratio = width && height ? width / height : null;

      const type = str(item.type)?.toLowerCase();
      const kind: MediaAssetSummary['kind'] =
        type === 'video' ? 'video' : type === 'image' ? 'image' : 'unknown';

      return {
        id: str(item.id),
        position,
        kind,
        mimeType: str(item.mimeType),
        width,
        height,
        aspectRatio: ratio,
        aspectRatioLabel: ratio === null ? null : aspectRatioLabel(ratio),
        // Only meaningful on video, and only when something measured it.
        durationMs: kind === 'video' ? num(item.durationMs) : null,
        byteLength: num(item.bytes),
        posterUrl: str(item.posterUrl),
        url: str(item.url),
        cropped: item.crop !== null && item.crop !== undefined,
      };
    });
}

/** What a set of assets is, as one word. Used for the media summary line. */
export function describeShape(assets: MediaAssetSummary[]): string {
  if (assets.length === 0) return 'Text only';
  if (assets.length > 1) {
    return assets.every((asset) => asset.kind === 'image')
      ? `${assets.length} images`
      : `${assets.length} items`;
  }
  return assets[0]!.kind === 'video' ? 'Video' : 'Image';
}
