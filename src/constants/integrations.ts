/**
 * The contract the Integrations page reads, and nothing more.
 *
 * There is deliberately **no provider list in this file**. Names, descriptions,
 * brand colours, permissions, connect routes and availability all arrive from
 * `GET /api/integrations`, so adding Instagram is a backend catalogue entry —
 * the browser renders whatever it is handed. The only per-provider thing left
 * on this side is the brand glyph, which has to be an SVG path and cannot
 * sensibly travel over JSON; see `IntegrationLogo`, which falls back to a
 * neutral mark for ids it does not draw.
 */

/**
 * Where the Express backend lives. OAuth is a browser redirect, not a fetch.
 * Defined in `constants/api.ts` since Sprint 4.1 — the AI API needs it too —
 * and re-exported here so existing imports keep working.
 */
export { API_BASE_URL } from "./api";

/**
 * The one endpoint that reports what is connected, for every provider at once.
 * Every other integrations route hangs off it.
 */
export const INTEGRATIONS_ENDPOINT = "/api/integrations";

/**
 * Networks the backend catalogues today. A *hint* for the logo lookup, not a
 * gate: the page renders any id the API returns, known glyph or not.
 */
export type IntegrationId =
  | "linkedin"
  | "instagram"
  | "facebook"
  | "x"
  | "youtube"
  | "tiktok";

/**
 * Which publishing context an integrations request is scoped to. Personal and
 * Brand connections are separate rows server-side; every list/refresh/
 * disconnect/connect call names the context it means.
 */
export interface AccountContext {
  contextType: "personal" | "brand";
  /** Set exactly when contextType is 'brand'. */
  brandId: string | null;
}

export const PERSONAL_CONTEXT: AccountContext = {
  contextType: "personal",
  brandId: null,
};

export function brandContext(brandId: string): AccountContext {
  return { contextType: "brand", brandId };
}

/**
 * Derived connection status. Wider than the database's own enum because some of
 * these are computed at read time — a token whose expiry has passed reports
 * `needs_reconnect` without anything having written to the row.
 */
export type IntegrationStatus =
  | "not_connected"
  | "connected"
  | "expiring_soon"
  | "expired"
  | "needs_reconnect"
  | "publishing_disabled"
  | "revoked"
  | "error";

/** The colour a status paints. The card never maps statuses itself. */
export type StatusTone = "healthy" | "attention" | "disconnected" | "neutral";

/** One capability, matched against the scopes the provider actually granted. */
export interface IntegrationPermission {
  label: string;
  description: string;
  scope: string | null;
  required: boolean;
  /** On the roadmap. Rendered inactive, never counted against health. */
  planned: boolean;
  /** Null for planned capabilities — nothing granted or withheld yet. */
  granted: boolean | null;
}

export interface HealthCheck {
  id: string;
  label: string;
  passed: boolean;
  /** Shown when the check fails. */
  detail: string;
}

export interface ConnectionHealth {
  rating: number;
  /** Kept explicit so the star row never hardcodes a maximum. */
  maxRating: number;
  label: "Excellent" | "Good" | "Fair" | "At Risk" | "Unavailable";
  checks: HealthCheck[];
}

/**
 * A stored connection as the API returns it.
 *
 * Profile fields only. The `social_accounts` token columns are stripped in the
 * repository and are invisible to PostgREST besides, so there is no shape in
 * which an encrypted token could reach this type.
 */
export interface ConnectedAccount {
  id: string;
  providerAccountId: string;
  /** 'personal' or 'brand' — which publishing context this connection serves. */
  contextType: string;
  brandId: string | null;
  displayName: string | null;
  username: string | null;
  profileImage: string | null;
  connectedAt: string;
  /** Most recent (re)connect. */
  lastConnectedAt: string;
  lastSyncedAt: string | null;
  lastHealthCheck: string | null;
  expiresAt: string | null;
  scopes: string[];
  providerVersion: string | null;
}

/** One row of `GET /api/integrations` — a network and its connection, if any. */
export interface Integration {
  provider: IntegrationId;
  displayName: string;
  description: string;
  brandColor: string;
  /** False for catalogued-but-unbuilt networks: the Coming Soon cards. */
  available: boolean;
  /** Where to navigate to start OAuth. Null when there is nothing to connect. */
  connectPath: string | null;
  apiVersion: string | null;
  connected: boolean;
  status: IntegrationStatus;
  statusLabel: string;
  tone: StatusTone;
  /** What to do about it, or null when there is nothing to fix. */
  guidance: string | null;
  permissions: IntegrationPermission[];
  health: ConnectionHealth | null;
  account: ConnectedAccount | null;
}

/** One entry in the Activity Timeline. */
export interface ActivityEvent {
  id: string;
  action: string;
  provider: IntegrationId | null;
  providerName: string | null;
  title: string;
  description: string | null;
  tone: "positive" | "neutral" | "negative";
  createdAt: string;
}

/** The `?provider=&status=` pair the OAuth callback redirects back with. */
export type OAuthCallbackStatus = "connected" | "failed";
