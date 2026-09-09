import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import axios, { type AxiosError } from 'axios';
import sharp from 'sharp';
import type { InlineImage } from '../types';

/**
 * Turns a post's image URL into bytes the model can look at.
 *
 * This file exists because of one fact that was quietly breaking every
 * generation before it: **a model cannot open a URL.** Passing
 * `https://…/wedding.jpg` in a prompt gives Gemini a string, not a picture, so
 * it wrote from the topic alone and the image may as well not have been there.
 * The fix is to download the image here and send it as an image part.
 *
 * ─── Why this is the careful file ────────────────────────────────────────────
 * The URL comes from a form field, which makes this the one place in the
 * backend that fetches an address a user chose. That is a server-side request
 * forgery primitive if it is written naively: `http://169.254.169.254/…` is a
 * cloud metadata endpoint, and `http://localhost:5432` is the database. So the
 * fetch is pinned to public addresses at the socket level — the DNS result is
 * checked, not the hostname, which is what makes rebinding and a redirect
 * chain equally uninteresting.
 *
 * A failure here is never fatal. The caller catches it and generates from the
 * brief alone; a missing image degrades the caption, it does not break it.
 */

/** What Gemini accepts as an inline image part. AVIF is deliberately absent — Gemini's own image-input support for it is not guaranteed, so an AVIF response is converted to PNG (see `convertAvifIfNeeded`/`cloudinaryAvifWorkaroundUrl` below) rather than added here and passed straight through. */
const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
]);

/**
 * Comfortably above a phone photo, well under the request ceiling. Base64
 * inflates by a third, so this is ~8MB on the wire to the model.
 */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/**
 * ─── Two callers, one fetcher ────────────────────────────────────────────────
 *
 * The guard below is the only vetted way this backend dials a user-supplied
 * address, so publishing reuses it rather than growing a second downloader.
 * The AI path wants base64 for a model part; the publish path wants a Buffer
 * to PUT at LinkedIn. Both go through {@link fetchImageBytes}, which is where
 * the SSRF protection lives — the format each caller needs is a detail layered
 * on top, never a reason to fetch differently.
 */

/** The user is watching a spinner, and two model calls still have to happen. */
const FETCH_TIMEOUT_MS = 10_000;

/** A redirect or two is normal for object storage; a chain is not. */
const MAX_REDIRECTS = 3;

/** Who we say we are when downloading someone's image. See the call below. */
const IMAGE_FETCH_USER_AGENT =
  'SocialContentHub/1.0 (+image analysis for the post being composed)';

/**
 * Why a fetch failed.
 *
 * Callers act on these differently, which is the whole reason they are
 * distinguished: `format` is the one a caller can sometimes *fix* by asking
 * the host for different bytes, where `address` and `size` are final. Without
 * this the publish path would have to pattern-match on message text to know
 * whether a retry could possibly help.
 */
export type ImageFetchReason =
  | 'address' // bad URL, wrong scheme, or an address we refuse to dial
  | 'format' // fetched fine, but not a content type the caller accepts
  | 'size' // empty, or past the byte ceiling
  | 'network'; // timeout, DNS failure, 404, 5xx

/** Raised when an image cannot be used. Always recoverable — see the caller. */
export class ImageFetchError extends Error {
  constructor(
    message: string,
    /** For the log. Can quote a URL or a vendor message. */
    readonly detail?: string,
    readonly reason: ImageFetchReason = 'network',
  ) {
    super(message);
    this.name = 'ImageFetchError';
  }
}

/**
 * True for any address that is not routable on the public internet.
 *
 * Covers loopback, private ranges, link-local (including the metadata address
 * every cloud exposes at 169.254.169.254), carrier-grade NAT, and the IPv6
 * equivalents — plus IPv4-mapped IPv6, which is how a blocked address sneaks
 * past a check that only reads the family.
 */
function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) return true; // Not an IP at all — nothing we should dial.

  if (family === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 || // "this network"
      a === 10 ||
      a === 127 || // loopback
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local + cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // multicast and reserved
    );
  }

  const normalised = address.toLowerCase().split('%')[0];

  // ::ffff:10.0.0.1 is 10.0.0.1 wearing a hat — and `new URL()` rewrites it to
  // the hex form `::ffff:a00:5`, so both spellings have to be unwrapped.
  const mapped = normalised.match(/^::ffff:(.+)$/);
  if (mapped) {
    const suffix = mapped[1];

    if (suffix.includes('.')) return isPrivateAddress(suffix);

    const groups = suffix.split(':');
    if (groups.length === 2 && groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) {
      const [high, low] = groups.map((group) => Number.parseInt(group, 16));
      return isPrivateAddress(
        [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.'),
      );
    }

    // An ::ffff: address we cannot decompose is not one we should dial.
    return true;
  }

  return (
    normalised === '::' ||
    normalised === '::1' ||
    normalised.startsWith('fc') || // unique local
    normalised.startsWith('fd') ||
    normalised.startsWith('fe80') || // link-local
    normalised.startsWith('ff') // multicast
  );
}

/**
 * Rejects a URL whose host is a *literal* internal address.
 *
 * The DNS guard below cannot do this job. Node skips `dns.lookup` entirely
 * when the host is already an IP — `http://169.254.169.254/latest/meta-data/`
 * never resolves anything, it just connects — so a lookup-only guard passes
 * that URL straight through to the socket. It has to be checked here, on the
 * URL, and again on every redirect hop.
 */
function assertPublicHost(hostname: string): void {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) !== 0 && isPrivateAddress(host)) {
    throw new ImageFetchError(
      'That image address is not reachable.',
      `refused literal address: ${host}`,
      'address',
    );
  }
}

/**
 * A `dns.lookup` that refuses to resolve anything internal.
 *
 * Installed on the agent rather than checked up-front on purpose: this runs
 * for every hop of a redirect chain and immediately before the socket is
 * opened, so there is no window in which a name resolves to something public
 * for the check and something private for the connection. It covers hostnames;
 * `assertPublicHost` above covers the IP literals it never sees.
 */
const guardedLookup: typeof dns.lookup = ((
  hostname: string,
  options: unknown,
  callback: (
    err: NodeJS.ErrnoException | null,
    address?: string | dns.LookupAddress[],
    family?: number,
  ) => void,
) => {
  const done = typeof options === 'function' ? options : callback;

  dns.lookup(
    hostname,
    { ...(typeof options === 'object' && options ? options : {}), all: true },
    (error, addresses) => {
      if (error) return done(error);

      const allowed = addresses.filter(
        (entry) => !isPrivateAddress(entry.address),
      );

      if (allowed.length === 0) {
        return done(
          Object.assign(
            new Error(`refusing to fetch a non-public address: ${hostname}`),
            { code: 'EACCES' },
          ),
        );
      }

      // Honour the caller's `all` — axios' agents ask for one address.
      const wantsAll =
        typeof options === 'object' && options !== null && 'all' in options
          ? Boolean((options as dns.LookupOptions).all)
          : false;

      return wantsAll
        ? done(null, allowed)
        : done(null, allowed[0].address, allowed[0].family);
    },
  );
}) as typeof dns.lookup;

const httpAgent = new http.Agent({ lookup: guardedLookup });
const httpsAgent = new https.Agent({ lookup: guardedLookup });

/** Content-Type minus any `; charset=…`, lowercased. */
function readMimeType(header: unknown): string {
  return typeof header === 'string'
    ? header.split(';')[0].trim().toLowerCase()
    : '';
}

/**
 * A Cloudinary delivery URL can be re-delivered in another format on demand
 * by inserting a transformation segment right after `/upload/` — cheaper and
 * more reliable than downloading the AVIF bytes and decoding them ourselves,
 * and it works even on a host whose libvips build has no AVIF/HEIF codec.
 * Only rewrites a URL that visibly ends in `.avif` and has no transformation
 * of its own already, so an already-working (non-AVIF, or already-transformed)
 * Cloudinary reference is never touched.
 */
export function cloudinaryAvifWorkaroundUrl(url: string): string | undefined {
  if (!/\.avif(?:\?.*)?$/i.test(url)) return undefined;
  const match = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/i.exec(url);
  if (!match) return undefined;
  const [, prefix, rest] = match;
  if (/^[a-z]_[a-z0-9.:]+[,/]/i.test(rest)) return undefined; // a transformation is already present — don't stack a second one
  return `${prefix}f_jpg/${rest}`;
}

/**
 * Best-effort AVIF → PNG conversion for whatever the Cloudinary URL rewrite
 * above didn't catch (a non-Cloudinary source, or a Cloudinary "auto format"
 * response that still came back as AVIF). Never throws: a host whose libvips
 * build lacks the AVIF/HEIF codec returns `undefined`, and the caller falls
 * through to the ordinary "unsupported format" rejection rather than
 * crashing the request.
 */
export async function convertAvifIfNeeded(buffer: Buffer, mimeType: string): Promise<{ buffer: Buffer; mimeType: string } | undefined> {
  if (mimeType !== 'image/avif') return undefined;
  try {
    const converted = await sharp(buffer).png().toBuffer();
    return { buffer: converted, mimeType: 'image/png' };
  } catch {
    return undefined;
  }
}

/** One downloaded image, still as bytes. */
export interface FetchedImage {
  /** e.g. `image/jpeg`, taken from the response and lowercased. */
  mimeType: string;
  buffer: Buffer;
}

export interface FetchImageOptions {
  /**
   * What the *caller* can handle. Gemini and LinkedIn accept overlapping but
   * different sets — LinkedIn takes no webp or heic — so the allow-list is the
   * caller's to state rather than a constant in here.
   */
  allowedMimeTypes?: ReadonlySet<string>;
  /** Hard ceiling in bytes. Enforced by axios mid-download and again after. */
  maxBytes?: number;
}

/**
 * Downloads one image and returns the raw bytes.
 *
 * Throws {@link ImageFetchError} for anything that means "we cannot use this":
 * a bad scheme, an internal address, the wrong content type, an oversized
 * file, a timeout, a 404.
 */
export async function fetchImageBytes(
  url: string,
  options: FetchImageOptions = {},
): Promise<FetchedImage> {
  const allowedMimeTypes = options.allowedMimeTypes ?? SUPPORTED_MIME_TYPES;
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;

  if (url.startsWith('data:image/')) {
    const match = url.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.byteLength === 0) {
        throw new ImageFetchError('The image was empty.', 'data-uri', 'size');
      }
      if (buffer.byteLength > maxBytes) {
        throw new ImageFetchError('The image is too large.', `${buffer.byteLength} bytes`, 'size');
      }
      return { mimeType, buffer };
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ImageFetchError(
      'The image address could not be read.',
      url,
      'address',
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ImageFetchError(
      'Only http and https images can be used.',
      parsed.protocol,
      'address',
    );
  }

  assertPublicHost(parsed.hostname);

  // A Cloudinary reference that's visibly stored as AVIF is re-requested in
  // JPEG delivery format up front — cheaper than downloading AVIF bytes just
  // to convert them locally, and it works even where the local AVIF/HEIF
  // codec is unavailable (see `convertAvifIfNeeded` below for that path).
  const cloudinaryRewrite = cloudinaryAvifWorkaroundUrl(parsed.toString());
  const fetchUrl = cloudinaryRewrite ?? parsed.toString();
  if (cloudinaryRewrite) {
    console.info('[image-source] requesting JPEG delivery for an AVIF-stored Cloudinary reference', { host: parsed.hostname, path: parsed.pathname });
  }

  try {
    const response = await axios.get<ArrayBuffer>(fetchUrl, {
      responseType: 'arraybuffer',
      timeout: FETCH_TIMEOUT_MS,
      maxRedirects: MAX_REDIRECTS,
      // Axios aborts the download once the declared or actual length passes
      // this, so an enormous file costs us a few packets rather than memory.
      maxContentLength: maxBytes,
      httpAgent,
      httpsAgent,
      // Every hop is a fresh chance to be pointed somewhere internal, and a
      // redirect to an IP literal would sail past the DNS guard the same way
      // the original URL would.
      beforeRedirect: (options: { hostname?: string }) => {
        assertPublicHost(options.hostname ?? '');
      },
      // We are fetching a picture; nothing here should follow a login.
      //
      // The User-Agent is not cosmetic. Plenty of hosts — Wikimedia among
      // them — answer 403 to a request that does not identify itself, which
      // surfaces here as "your image could not be analysed" for an image that
      // is perfectly fine. Identifying honestly is also the polite half of
      // being a well-behaved fetcher.
      headers: {
        Accept: 'image/*',
        'User-Agent': IMAGE_FETCH_USER_AGENT,
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });

    let mimeType = readMimeType(response.headers['content-type']);
    let buffer: Buffer = Buffer.from(response.data);
    if (buffer.byteLength === 0) {
      throw new ImageFetchError(
        'The image was empty.',
        parsed.hostname,
        'size',
      );
    }

    // The Cloudinary rewrite above catches the common case; this is the
    // fallback for everything else that still comes back as AVIF (a
    // non-Cloudinary host, or a delivery URL our rewrite regex didn't
    // match) — converted in-process rather than silently discarded.
    if (mimeType === 'image/avif') {
      const converted = await convertAvifIfNeeded(buffer, mimeType);
      if (converted) {
        buffer = converted.buffer;
        mimeType = converted.mimeType;
        console.info('[image-source] converted AVIF reference to PNG for compatibility', { host: parsed.hostname });
      } else {
        console.warn('[image-source] AVIF reference could not be converted — rejecting as unsupported', { host: parsed.hostname, path: parsed.pathname });
      }
    }

    if (!allowedMimeTypes.has(mimeType)) {
      throw new ImageFetchError(
        `That file is not a supported image format${
          mimeType ? ` (${mimeType})` : ''
        }.`,
        `content-type: ${mimeType || 'none'}`,
        'format',
      );
    }

    if (buffer.byteLength > maxBytes) {
      throw new ImageFetchError(
        'The image is too large.',
        `${buffer.byteLength} bytes`,
        'size',
      );
    }

    return { mimeType, buffer };
  } catch (error) {
    if (error instanceof ImageFetchError) throw error;

    const axiosError = error as AxiosError;
    throw new ImageFetchError('The image could not be downloaded.', [
      axiosError.code ?? '',
      axiosError.response?.status ? `status ${axiosError.response.status}` : '',
      axiosError.message,
    ]
      .filter(Boolean)
      .join(' · '), 'network');
  }
}

/**
 * The same download, base64 encoded for a model part.
 *
 * Kept as its own export because every AI caller wants exactly this shape and
 * none of them want to think about buffers.
 */
export async function fetchInlineImage(url: string): Promise<InlineImage> {
  const { mimeType, buffer } = await fetchImageBytes(url);
  return {
    mimeType,
    data: buffer.toString('base64'),
    sizeBytes: buffer.byteLength,
  };
}
