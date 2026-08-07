import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import axios, { type AxiosError } from 'axios';
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

/** What Gemini accepts as an inline image part. */
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

/** The user is watching a spinner, and two model calls still have to happen. */
const FETCH_TIMEOUT_MS = 10_000;

/** A redirect or two is normal for object storage; a chain is not. */
const MAX_REDIRECTS = 3;

/** Who we say we are when downloading someone's image. See the call below. */
const IMAGE_FETCH_USER_AGENT =
  'SocialContentHub/1.0 (+image analysis for the post being composed)';

/** Raised when an image cannot be used. Always recoverable — see the caller. */
export class ImageFetchError extends Error {
  constructor(
    message: string,
    /** For the log. Can quote a URL or a vendor message. */
    readonly detail?: string,
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
 * Downloads one image and returns it base64 encoded.
 *
 * Throws {@link ImageFetchError} for anything that means "we cannot show this
 * to the model": a bad scheme, an internal address, the wrong content type, an
 * oversized file, a timeout, a 404.
 */
export async function fetchInlineImage(url: string): Promise<InlineImage> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ImageFetchError('The image address could not be read.', url);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ImageFetchError(
      'Only http and https images can be analysed.',
      parsed.protocol,
    );
  }

  assertPublicHost(parsed.hostname);

  try {
    const response = await axios.get<ArrayBuffer>(parsed.toString(), {
      responseType: 'arraybuffer',
      timeout: FETCH_TIMEOUT_MS,
      maxRedirects: MAX_REDIRECTS,
      // Axios aborts the download once the declared or actual length passes
      // this, so an enormous file costs us a few packets rather than memory.
      maxContentLength: MAX_IMAGE_BYTES,
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

    const mimeType = readMimeType(response.headers['content-type']);
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      throw new ImageFetchError(
        'That file is not an image format the AI can read.',
        `content-type: ${mimeType || 'none'}`,
      );
    }

    const buffer = Buffer.from(response.data);
    if (buffer.byteLength === 0) {
      throw new ImageFetchError('The image was empty.', parsed.hostname);
    }
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new ImageFetchError(
        'The image is too large to analyse.',
        `${buffer.byteLength} bytes`,
      );
    }

    return {
      mimeType,
      data: buffer.toString('base64'),
      sizeBytes: buffer.byteLength,
    };
  } catch (error) {
    if (error instanceof ImageFetchError) throw error;

    const axiosError = error as AxiosError;
    throw new ImageFetchError('The image could not be downloaded.', [
      axiosError.code ?? '',
      axiosError.response?.status ? `status ${axiosError.response.status}` : '',
      axiosError.message,
    ]
      .filter(Boolean)
      .join(' · '));
  }
}
