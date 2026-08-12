/**
 * What each network can publish, as the browser receives it.
 *
 * ─── This file holds no rules ────────────────────────────────────────────────
 *
 * Only their *shape*. Every number, format and limit arrives from
 * `GET /api/integrations`, which serves the same declaration the publish path
 * validates against — `server/src/providers/capabilities.ts`.
 *
 * That is deliberate and it is the point of the whole arrangement. There is no
 * `InstagramRules.ts` here, no list of which networks do Reels, no copy of
 * Meta's duration window. A frontend that held those would be a second source
 * of truth for the same facts, and the two would disagree the first time either
 * changed — which the member would experience as a composer that cheerfully
 * offers something the publish button then refuses.
 *
 * So the browser's job is to *render* capabilities and to stop the member
 * reaching a request that cannot succeed. It is not the authority on any of it:
 * the backend re-validates every publish, because a rule the browser respects
 * is a convenience and a rule the server enforces is a rule.
 */

/**
 * What a member is publishing, in provider-neutral terms.
 *
 * The same six words the backend uses and the same six the `media_type`
 * database enum uses, so "requested REEL" and "observed REEL" are comparable
 * without a translation table.
 *
 * Not to be confused with an uploaded file's kind. One video is a REEL, a STORY
 * or a VIDEO; only the member knows which.
 */
export type ContentType =
  | "TEXT"
  | "IMAGE"
  | "CAROUSEL"
  | "VIDEO"
  | "REEL"
  | "STORY";

export const CONTENT_TYPES: ContentType[] = [
  "TEXT",
  "IMAGE",
  "CAROUSEL",
  "VIDEO",
  "REEL",
  "STORY",
];

/** How the bytes reach the network. Informational here; the backend acts on it. */
export type MediaTransport = "url" | "bytes" | "chunked";

export interface AspectRatioRange {
  /** Hard: outside this the network refuses the post. */
  min: number;
  max: number;
  /** The shape the format is designed around, e.g. `9:16`. */
  recommended: string;
  /** Soft: outside this it publishes but does not fill the frame. */
  recommendedMin?: number;
  recommendedMax?: number;
}

export interface MediaConstraints {
  mimeTypes: string[];
  maxBytes: number;
  /** Formats that may only ever be the sole item — X's animated GIF. */
  soloMimeTypes?: string[];
  soloMaxBytes?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  /** Below this the composer warns. A warning, never a block. */
  recommendedMinWidth?: number;
  recommendedMinHeight?: number;
}

export interface ContentTypeCapability {
  /** The member's word for it — "Reel", "Multi-image post", "Story". */
  label: string;
  description: string;
  minItems: number;
  maxItems: number;
  requiresMedia: boolean;
  maxCaptionLength: number | null;
  image?: MediaConstraints;
  video?: MediaConstraints;
  aspectRatio?: AspectRatioRange;
  transport: MediaTransport;
  metricsHorizonMs?: number;
}

/**
 * Every format one network publishes.
 *
 * **An absent key is unsupported.** There is no `planned` and no
 * `supported: false` — a format the network cannot publish simply is not here,
 * which is why the composer can build its options from `Object.keys` and be
 * right by construction.
 */
export type ProviderCapabilities = Partial<
  Record<ContentType, ContentTypeCapability>
>;
