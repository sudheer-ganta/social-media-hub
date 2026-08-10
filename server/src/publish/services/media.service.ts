import { providerForRole } from '../../ai/providers';
import { generateAltText } from '../../ai/generators/alt-text.generator';
import { fetchImageBytes, ImageFetchError } from '../../ai/vision/image-source';
import type {
  ProviderMediaAsset,
  ProviderMediaRequirements,
} from '../../providers';
import type { Post } from '../../generated/prisma/client';

/**
 * Turning a draft into the media that goes out with it.
 *
 * This is the seam between *our* storage and *a network's* upload. Providers
 * receive bytes; deciding which bytes, fetching them safely, and describing
 * them for a screen reader all happen here, once, for every network.
 *
 * ─── Why the provider does not fetch the URL itself ──────────────────────────
 * `post.image_url` is a member-supplied address, and fetching one of those is a
 * server-side request forgery primitive. The backend has exactly one vetted
 * fetcher for it — `ai/vision/image-source.ts`, which pins DNS results to
 * public addresses at the socket level — and routing every provider through
 * this service is what keeps that one implementation the only one.
 *
 * Providers that *send* a URL rather than bytes — Instagram's Content
 * Publishing API takes an `image_url` and fetches it from Meta's servers, with
 * no byte-upload endpoint at all — read {@link ProviderMediaAsset.sourceUrl},
 * which is the URL these exact bytes came from. They still get the format and
 * size guarantees, because the check ran against what was actually downloaded.
 * What they do not get is permission to fetch an arbitrary address themselves.
 *
 * ─── Whose rules ─────────────────────────────────────────────────────────────
 * The format allow-list and byte ceiling come from the *provider*, not from
 * this file. They used to be LinkedIn's constants applied to everything, which
 * was invisible while LinkedIn was the only network and wrong the moment
 * Instagram arrived: LinkedIn takes JPEG, PNG and GIF, Instagram takes JPEG and
 * nothing else. See `Provider.mediaRequirements`.
 *
 * ─── One post, N images ──────────────────────────────────────────────────────
 * `posts.media` is an ordered JSON array of everything attached, and its order
 * *is* the publish order — an Instagram carousel, a Facebook multi-photo story
 * and a LinkedIn multi-image post all render in it. {@link resolvePostMedia}
 * turns that array into assets in the same order.
 *
 * A post written before that column existed has a single `image_url` and a null
 * `media`, and reads here as exactly one item framed by `platform_media`. That
 * fallback is not legacy debt to be cleaned up later: it is what keeps every
 * post already in the database publishable, and it is the path a single-image
 * post still takes today.
 *
 * ─── Nothing is dropped quietly ──────────────────────────────────────────────
 * A post carrying more images than the target network accepts fails here, with
 * a message naming both numbers. It is tempting to send the first N instead —
 * that is precisely the silent data loss this service exists to prevent, on a
 * feed where correcting it means deleting and reposting.
 */

/**
 * How long the whole media step may take before we give up on the publish.
 *
 * Generous, because it covers a download the member is waiting on. Alt text is
 * *not* under this budget — it has its own, below, because a slow model must
 * never be the reason an image fails to publish.
 */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * The alt-text budget.
 *
 * Short on purpose. This is an enhancement running inline with a publish the
 * member is watching; past a few seconds the accessible thing to do is publish
 * the image without a description rather than keep them waiting for one.
 */
const ALT_TEXT_TIMEOUT_MS = 8_000;

/** Raised when attached media cannot be prepared. Always fails the publish. */
export class MediaResolutionError extends Error {
  constructor(
    message: string,
    /** For the log. May quote a URL or a vendor message. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'MediaResolutionError';
  }
}

/**
 * Resolves every piece of media attached to a post.
 *
 * Returns an empty array for a post with no media — the normal case, and the
 * one that must cost nothing.
 *
 * Throws {@link MediaResolutionError} when media *is* attached and cannot be
 * prepared. That is deliberate, and it is the one judgement call in this file:
 * a member who attached an image and gets a text-only post has been silently
 * given something they did not ask for, on a feed they cannot easily correct.
 * Failing with a reason they can act on is the better answer.
 */
export async function resolvePostMedia(
  post: Post,
  options: {
    caption?: string;
    requirements?: ProviderMediaRequirements;
    /** Which network's framing to deliver. Omitted means the whole image. */
    providerId?: string;
  } = {},
): Promise<ProviderMediaAsset[]> {
  const requirements = options.requirements ?? DEFAULT_REQUIREMENTS;
  const items = readMediaItems(post, options.providerId);
  if (items.length === 0) return [];

  const maxItems = requirements.maxItems ?? 1;
  if (items.length > maxItems) {
    // Checked before a single byte is downloaded, and *not* by taking the
    // first `maxItems`. See the header: quietly publishing a subset of what
    // someone attached is the one outcome worth failing to avoid.
    throw new MediaResolutionError(
      maxItems === 0
        ? 'This network cannot publish images from FlowPost yet. Remove them, or publish this post to another network.'
        : `This post has ${items.length} images and this network takes ${maxItems}. ` +
          'Remove the extras, or publish it to a network that takes them all.',
      `post ${post.id} carries ${items.length} media items, provider ceiling ${maxItems}`,
    );
  }

  // Sequential: the bytes of every image are held in memory at once by the time
  // this resolves, and a network taking ten of them is a reason to be careful
  // with heap rather than to race the downloads.
  // ponytail: sequential downloads, parallelise if publish latency is measured
  // to matter for large carousels.
  const assets: ProviderMediaAsset[] = [];
  for (const item of items) {
    assets.push(await resolveImage(item.url, requirements, options.caption));
  }
  return assets;
}

/** One attached image, already framed for the network being published to. */
interface ResolvedMediaItem {
  url: string;
}

/**
 * The post's images, in publish order, each as a delivery URL.
 *
 * **Every value here is member-supplied.** `posts.media` is written by the
 * browser under RLS, so this reads it the way {@link applyStoredCrop} reads a
 * crop: shape-checked field by field, and anything malformed is skipped rather
 * than trusted. An entry with no usable URL is not an error worth failing a
 * publish over — it is an entry that carries nothing.
 *
 * Falls back to `image_url` + `platform_media` when `media` is absent or holds
 * nothing usable, which is every post written before the multi-image composer
 * and every client that still writes one image.
 */
function readMediaItems(post: Post, providerId?: string): ResolvedMediaItem[] {
  const items: ResolvedMediaItem[] = [];

  if (Array.isArray(post.media)) {
    for (const entry of post.media) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;

      const url = typeof record.url === 'string' ? record.url.trim() : '';
      if (!url) continue;

      // Each item carries its own framing — this is the multi-image model,
      // where `platform_media` frames one shared image per network.
      items.push({ url: applyStoredCropValue(url, record.crop) });
    }
  }

  if (items.length > 0) return items;

  const imageUrl = post.image_url?.trim();
  if (!imageUrl) return [];

  return [
    {
      url: providerId
        ? applyStoredCrop(imageUrl, post.platform_media, providerId)
        : imageUrl,
    },
  ];
}

/**
 * One platform's crop from `posts.platform_media`, as a Cloudinary directive.
 *
 * **Every field is re-validated here.** That column is written by the browser
 * under RLS, so its contents are a member-supplied value like any other, and
 * this function is what stands between it and a URL we hand to Meta. A crop
 * that is not four finite fractions inside the unit square is dropped entirely
 * and the image is delivered whole — the safe answer, and the same one a post
 * written before this feature existed gets.
 *
 * Mirrors `src/utils/crop.ts#withCrop`, deliberately rather than by sharing:
 * the frontend copy runs in the composer's preview, this one runs against
 * untrusted stored JSON, and only this one is a trust boundary.
 */
export function applyStoredCrop(
  url: string,
  platformMedia: unknown,
  providerId: string,
): string {
  if (!platformMedia || typeof platformMedia !== 'object') return url;

  return applyStoredCropValue(
    url,
    (platformMedia as Record<string, unknown>)[providerId],
  );
}

/**
 * The same rewrite, given the crop itself rather than the map it lives in.
 *
 * Two callers, two storage shapes, one trust boundary: `platform_media` holds
 * one crop per network for a single shared image, and each entry in `media`
 * holds its own. Both are browser-written JSON and neither is trusted, so the
 * validation lives here once instead of once per shape.
 */
export function applyStoredCropValue(url: string, entry: unknown): string {
  if (!entry || typeof entry !== 'object') return url;

  const crop = entry as Record<string, unknown>;
  const read = (key: string): number | null => {
    const value = crop[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };

  const x = read('x');
  const y = read('y');
  const w = read('w');
  const h = read('h');
  if (x === null || y === null || w === null || h === null) return url;

  // Fractions only, and the window has to sit inside the image. A rectangle
  // that runs off the edge is the one shape that could make Cloudinary pad —
  // which would be an upscale by another name.
  const inRange =
    w > 0 && h > 0 && w <= 1 && h <= 1 && x >= 0 && y >= 0 && x + w <= 1.0001 && y + h <= 1.0001;
  if (!inRange) return url;

  // A window covering the whole frame needs no transformation at all. Rule:
  // transform only when the destination actually requires it.
  if (x <= 0.001 && y <= 0.001 && w >= 0.999 && h >= 0.999) return url;

  const at = url.indexOf('/image/upload/');
  if (at === -1) return url;

  const head = url.slice(0, at + '/image/upload/'.length);
  const directive = `c_crop,w_${w},h_${h},x_${x},y_${y}`;
  return `${head}${directive}/${url.slice(at + '/image/upload/'.length)}`;
}

/**
 * What a network gets when it states no rules of its own.
 *
 * Intentionally the *narrowest* common set rather than the widest: JPEG is the
 * only format every network in the catalogue accepts, so a provider that has
 * not declared its requirements gets the one thing that cannot surprise it.
 */
const DEFAULT_REQUIREMENTS: ProviderMediaRequirements = {
  imageMimeTypes: new Set(['image/jpeg']),
  maxImageBytes: 8 * 1024 * 1024,
};

/** Downloads one image, measures it, and describes it. */
async function resolveImage(
  url: string,
  requirements: ProviderMediaRequirements,
  caption?: string,
): Promise<ProviderMediaAsset> {
  let fetched: { mimeType: string; buffer: Buffer };
  // Which URL actually produced the bytes. The retry below can change it, and
  // a URL-fetching provider must be handed the one that worked, not the one we
  // started with.
  let resolvedUrl = url;

  try {
    fetched = await download(url, requirements);
  } catch (error) {
    if (!(error instanceof ImageFetchError) || error.reason !== 'format') {
      throw toMediaError(error);
    }

    // The format is wrong for this network, but the image itself is fine. If
    // the host can hand us different bytes, that is a far better answer than
    // telling someone their perfectly good photo is unpublishable — the app
    // accepted the upload, so making it work is our problem, not theirs.
    //
    // This path carries more weight now than it did with LinkedIn alone:
    // Instagram takes JPEG *only*, so every PNG in the library reaches it.
    //
    // Quality first, then fit. Transcoding is a second lossy generation on top
    // of an already-lossy source, so the first ask is the one that keeps the
    // most detail; the plain fallback exists only so an image that was
    // publishable before cannot become unpublishable now. See QUALITY_LADDER.
    const ladder = QUALITY_LADDER.map((t) => toDeliveryUrl(url, t)).filter(
      (candidate): candidate is string => candidate !== null,
    );
    if (ladder.length === 0) throw toMediaError(error);

    console.info('[publish] converting image to a format this network accepts', {
      detail: error.detail,
    });

    let converted: { mimeType: string; buffer: Buffer } | null = null;
    let lastError: unknown = error;

    for (const candidate of ladder) {
      try {
        converted = await download(candidate, requirements);
        resolvedUrl = candidate;
        break;
      } catch (retryError) {
        lastError = retryError;
        // Only a size failure is worth stepping down the ladder — a lower
        // quality setting cannot fix a bad address, a dead host or a format
        // the network still will not take.
        const isSize =
          retryError instanceof ImageFetchError && retryError.reason === 'size';
        if (!isSize) break;
        console.info('[publish] transcode too large for this network, stepping down', {
          detail: retryError.detail,
        });
      }
    }

    if (!converted) throw toMediaError(lastError);
    fetched = converted;
  }

  const { mimeType, buffer } = fetched;

  const { width, height } = probeImageSize(buffer, mimeType);

  return {
    kind: 'image',
    mimeType,
    data: buffer,
    byteLength: buffer.byteLength,
    sourceUrl: resolvedUrl,
    width,
    height,
    altText: await describeImage(buffer, mimeType, caption),
  };
}

/**
 * One guarded download, against the target network's rules.
 *
 * The allow-list is the *network's*, passed down rather than assumed: the AI
 * module happily reads webp and heic, LinkedIn accepts neither, and Instagram
 * accepts neither those nor PNG.
 */
function download(url: string, requirements: ProviderMediaRequirements) {
  return withTimeout(
    fetchImageBytes(url, {
      allowedMimeTypes: requirements.imageMimeTypes,
      maxBytes: requirements.maxImageBytes,
    }),
    FETCH_TIMEOUT_MS,
    'image download',
  );
}

/** ImageFetchError messages are already written for a member; ours are not. */
function toMediaError(error: unknown): MediaResolutionError {
  return new MediaResolutionError(
    error instanceof ImageFetchError
      ? error.message
      : "That post's image could not be downloaded. Check the link and try again.",
    error instanceof ImageFetchError
      ? error.detail
      : error instanceof Error
        ? error.message
        : String(error),
  );
}

/**
 * Transcoding a stored image for a network that will not take its format.
 *
 * Every image in this app is uploaded to Cloudinary, and the uploader accepts
 * WEBP — which neither LinkedIn nor Instagram takes. Cloudinary will transcode
 * on delivery if asked, so the fix is a URL parameter rather than a decoder in
 * this process:
 *
 *   …/image/upload/v123/photo.webp
 *     → …/image/upload/f_jpg,q_auto:best/v123/photo.webp
 *
 * `f_jpg` and not `f_auto`: auto negotiates against the `Accept` header, and we
 * send `image/*`, so it could hand back the very webp we are trying to escape.
 *
 * These return null when the URL is not a Cloudinary delivery URL, or already
 * carries a format directive someone chose deliberately. Null means "no second
 * attempt is possible" and the original failure stands.
 *
 * **The stored asset is never touched.** A Cloudinary delivery transformation
 * is a read: it derives a new representation at request time and leaves the
 * uploaded original byte-for-byte as it was, which is what keeps the member's
 * source image available at full quality for every later use.
 */

/**
 * The transcode attempts, best first.
 *
 * `q_auto:best` rather than a bare `f_jpg`, because a bare `f_jpg` re-encodes
 * at Cloudinary's default quality — a second lossy generation stacked on an
 * already-lossy source. Measured against a real uploaded WEBP: 70KB in,
 * 61KB out at the default and 108KB at `q_auto:best`, at identical pixel
 * dimensions. That missing third of the data is visible detail, and it is the
 * quality drop members were seeing on published Instagram posts.
 *
 * Note what is deliberately *absent*: no `w_`, no `c_`, no dimension directive
 * of any kind. This ladder only ever changes the encoding, never the pixels —
 * so it cannot upscale, cannot downscale and cannot crop, and an image that
 * already satisfies the network is passed through untouched (Cloudinary
 * returns the stored bytes when the requested format already matches).
 *
 * The second rung is the old behaviour, reached only when `q_auto:best` blows
 * the network's byte ceiling. It guarantees this change can never turn a
 * publishable image into a failure.
 */
const QUALITY_LADDER = ['f_jpg,q_auto:best', 'f_jpg'] as const;

/**
 * Rewrites a Cloudinary delivery URL to ask for JPEG at the best quality.
 *
 * Kept as the named export because the publish verification suite and any
 * future caller mean "give me the JPEG version of this" — the ladder above is
 * an implementation detail of the retry.
 */
export function toJpegDeliveryUrl(url: string): string | null {
  return toDeliveryUrl(url, QUALITY_LADDER[0]);
}

/** Inserts one transformation into a Cloudinary delivery URL. */
function toDeliveryUrl(url: string, transformation: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!/(^|\.)cloudinary\.com$/i.test(parsed.hostname)) return null;

  const marker = '/image/upload/';
  const at = parsed.pathname.indexOf(marker);
  if (at === -1) return null;

  const transformations = parsed.pathname.slice(at + marker.length);
  // Someone already asked for a specific format. Overriding it would be us
  // second-guessing an explicit choice, and we would still not know better.
  if (/(^|\/)f_[^/]+/.test(transformations)) return null;

  parsed.pathname = `${parsed.pathname.slice(0, at + marker.length)}${transformation}/${transformations}`;
  return parsed.toString();
}

/**
 * Asks the vision model what the image shows. Never throws, never blocks long.
 *
 * Returns null on any failure or timeout, which publishes the image with no
 * `altText` attribute — the same outcome as before this existed.
 */
async function describeImage(
  buffer: Buffer,
  mimeType: string,
  caption?: string,
): Promise<string | null> {
  try {
    return await withTimeout(
      generateAltText({
        image: {
          mimeType,
          data: buffer.toString('base64'),
          sizeBytes: buffer.byteLength,
        },
        // The light role: one sentence about one image, on every publish —
        // exactly the frequent, simple call the cheap model exists for.
        provider: providerForRole('light'),
        caption,
      }),
      ALT_TEXT_TIMEOUT_MS,
      'alt text',
    );
  } catch {
    // generateAltText already swallows its own failures; this catches only the
    // timeout. Either way the answer is the same and it is not worth a second
    // log line saying so.
    return null;
  }
}

/**
 * Reads an image's pixel dimensions out of its header.
 *
 * Deliberately a header parse rather than a decode. LinkedIn's only documented
 * image limit is a pixel count, and checking it needs width and height — not
 * the picture. Decoding a 30-megapixel JPEG to learn two integers would cost
 * more memory than the upload itself and pull in a native dependency for it.
 *
 * Returns nulls when the header is not one of the three shapes below or is
 * truncated. That is a real answer, not a failure: the validator treats unknown
 * dimensions as "let LinkedIn decide", because our probe failing is not
 * evidence the member's image is wrong.
 */
export function probeImageSize(
  buffer: Buffer,
  mimeType: string,
): { width: number | null; height: number | null } {
  try {
    if (mimeType === 'image/png') return probePng(buffer);
    if (mimeType === 'image/gif') return probeGif(buffer);
    if (mimeType === 'image/jpeg') return probeJpeg(buffer);
  } catch {
    // A malformed or truncated header. Unknown, not invalid.
  }
  return { width: null, height: null };
}

/** PNG: an 8-byte signature, then an IHDR chunk whose payload starts at 16. */
function probePng(buffer: Buffer): { width: number | null; height: number | null } {
  if (buffer.length < 24) return { width: null, height: null };
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') {
    return { width: null, height: null };
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

/** GIF: `GIF87a`/`GIF89a`, then the logical screen size as two LE shorts. */
function probeGif(buffer: Buffer): { width: number | null; height: number | null } {
  if (buffer.length < 10) return { width: null, height: null };
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  };
}

/**
 * JPEG: walk the marker segments to the frame header.
 *
 * The dimensions live in an SOFn marker, which is not at a fixed offset —
 * EXIF, ICC profiles and thumbnails all sit in front of it. So this skips
 * segment by segment, honouring each one's declared length, and reads the first
 * start-of-frame it reaches. The excluded markers are the ones that share the
 * 0xC0–0xCF range without being frame headers.
 */
function probeJpeg(buffer: Buffer): { width: number | null; height: number | null } {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) {
    return { width: null, height: null };
  }

  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      // Not aligned on a marker. Rather than guess, give up — an unknown
      // dimension is handled, a wrong one is not.
      return { width: null, height: null };
    }

    const marker = buffer[offset + 1];

    // Standalone markers: no length, no payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    // Start of scan — image data begins and there is no frame header ahead.
    if (marker === 0xda) return { width: null, height: null };

    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return { width: null, height: null };

    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 && // define Huffman table
      marker !== 0xc8 && // JPEG extension
      marker !== 0xcc; // define arithmetic coding conditioning

    if (isStartOfFrame) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }

  return { width: null, height: null };
}

/** Races a promise against a deadline. Rejects with a named timeout. */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export const mediaService = {
  resolvePostMedia,
  probeImageSize,
  toJpegDeliveryUrl,
  applyStoredCrop,
  applyStoredCropValue,
};
