import type { SafeSocialAccount } from '../repositories/social-account.repository';
import type { ProviderCatalogEntry } from '../providers/catalog';

/**
 * How a stored connection becomes something a member can read at a glance.
 *
 * Pure functions over a row plus its catalogue entry — no database, no network,
 * no clock beyond the `now` passed in. That is what lets the same logic answer
 * "what does the card say?" and, later, "which connections should the nightly
 * sweep re-check?" without one of them drifting.
 *
 * The distinction the whole module exists to preserve: **stored status is what
 * the provider last told us, derived status is what is true right now.** A row
 * can say CONNECTED while its `expiresAt` is in the past — nobody has looked
 * since it lapsed. The member must see "Needs Reconnect", not "Connected", and
 * we must not have to write to the database to say so.
 */

/**
 * The status vocabulary the API speaks. Deliberately wider than the database
 * enum: `needs_reconnect`, `expiring_soon` and `publishing_disabled` are
 * *derived*, and `not_connected` describes the absence of a row entirely.
 */
export type IntegrationStatus =
  | 'not_connected'
  | 'connected'
  | 'expiring_soon'
  | 'expired'
  | 'needs_reconnect'
  | 'publishing_disabled'
  | 'revoked'
  | 'error';

/**
 * The three colours the UI paints. Every status maps to exactly one, so a new
 * status added later cannot produce a card with no colour.
 */
export type StatusTone = 'healthy' | 'attention' | 'disconnected' | 'neutral';

export interface HealthCheck {
  id: string;
  label: string;
  passed: boolean;
  /** Shown when the check fails, in the member's language. */
  detail: string;
}

export interface ConnectionHealth {
  /** Checks passed, 0–5. Rendered as stars. */
  rating: number;
  /** Out of how many. Kept explicit so the UI never hardcodes 5. */
  maxRating: number;
  label: 'Excellent' | 'Good' | 'Fair' | 'At Risk' | 'Unavailable';
  checks: HealthCheck[];
}

/**
 * A token inside this window is fine, but worth warning about.
 *
 * The default, for the long-lived providers it was written for: LinkedIn and
 * Meta both issue 60-day tokens, and a week's notice is a week to act. A
 * provider whose tokens are far shorter overrides it with
 * `expiryWarningMs` on its catalogue entry — see `providers/catalog.ts`.
 */
export const DEFAULT_EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

/** Past this, a connection has not been verified recently enough to trust. */
const STALE_SYNC_MS = 30 * 24 * 60 * 60 * 1000;

/** Which permissions the member granted, matched against the catalogue. */
export interface GrantedPermission {
  label: string;
  description: string;
  scope: string | null;
  required: boolean;
  planned: boolean;
  /** Null for planned capabilities — nothing was granted or withheld yet. */
  granted: boolean | null;
}

/**
 * Matches the catalogue's permission list against the scopes actually stored.
 *
 * An empty `scopes` array means "we don't know" rather than "nothing granted":
 * it is what a connection made before Sprint 3.3 looks like, and what a
 * provider that declines to echo `scope` back leaves us with. Those are
 * reported as granted, because refusing to publish over missing bookkeeping
 * would break working accounts.
 */
export function resolvePermissions(
  catalog: ProviderCatalogEntry,
  account: SafeSocialAccount | null,
): GrantedPermission[] {
  const scopesUnknown = !account || account.scopes.length === 0;
  const granted = new Set(account?.scopes ?? []);

  return catalog.permissions.map((permission) => ({
    label: permission.label,
    description: permission.description,
    scope: permission.scope,
    required: permission.required,
    planned: Boolean(permission.planned),
    granted: permission.planned
      ? null
      : !account
        ? false
        : scopesUnknown
          ? true
          : permission.scope !== null && granted.has(permission.scope),
  }));
}

/** True when every permission the product depends on is in hand. */
function hasRequiredPermissions(permissions: GrantedPermission[]): boolean {
  return permissions
    .filter((permission) => permission.required && !permission.planned)
    .every((permission) => permission.granted === true);
}

/**
 * The status a member should see, which is not always the one in the database.
 *
 * Order matters and encodes severity: a revoked connection is revoked whatever
 * its expiry says, and an expired token is worth reporting before a missing
 * scope. First match wins.
 */
export function deriveStatus(
  account: SafeSocialAccount | null,
  permissions: GrantedPermission[],
  now: Date = new Date(),
  /**
   * How long before expiry to start warning. Defaults to the week that suits
   * the long-lived providers; X passes its own. See
   * {@link DEFAULT_EXPIRY_WARNING_MS}.
   */
  expiryWarningMs: number = DEFAULT_EXPIRY_WARNING_MS,
): IntegrationStatus {
  if (!account) return 'not_connected';

  if (account.status === 'REVOKED') return 'revoked';
  if (account.status === 'ERROR') return 'error';

  const expired =
    account.expiresAt !== null && account.expiresAt.getTime() <= now.getTime();

  // The stored EXPIRED flag and a lapsed timestamp are two routes to the same
  // truth; either is enough. `needs_reconnect` is the member-facing word for
  // both, because "expired" describes the token and they care about the fix.
  if (expired || account.status === 'EXPIRED') return 'needs_reconnect';

  if (!hasRequiredPermissions(permissions)) return 'publishing_disabled';

  if (
    account.expiresAt !== null &&
    account.expiresAt.getTime() - now.getTime() <= expiryWarningMs
  ) {
    return 'expiring_soon';
  }

  return 'connected';
}

/** The colour a status paints. Exhaustive by construction. */
export function statusTone(status: IntegrationStatus): StatusTone {
  switch (status) {
    case 'connected':
      return 'healthy';
    case 'expiring_soon':
    case 'publishing_disabled':
    case 'needs_reconnect':
      return 'attention';
    case 'expired':
    case 'revoked':
    case 'error':
      return 'disconnected';
    case 'not_connected':
      return 'neutral';
  }
}

/** Short label for the status pill. */
export function statusLabel(status: IntegrationStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'expiring_soon':
      return 'Expiring Soon';
    case 'publishing_disabled':
      return 'Publishing Disabled';
    case 'needs_reconnect':
      return 'Needs Reconnect';
    case 'expired':
      return 'Expired';
    case 'revoked':
      return 'Disconnected';
    case 'error':
      return 'Needs Attention';
    case 'not_connected':
      return 'Not Connected';
  }
}

/**
 * The one-line recovery message for a connection that is not healthy.
 *
 * Written as an instruction, never as a failure: "LinkedIn needs your
 * permission again" tells a member what to do; "Failed" tells them we broke.
 * Returns null when there is nothing to fix.
 */
export function statusGuidance(
  status: IntegrationStatus,
  displayName: string,
): string | null {
  switch (status) {
    case 'needs_reconnect':
    case 'expired':
      return `${displayName} needs your permission again. Reconnect to keep publishing.`;
    case 'revoked':
      return `Access to ${displayName} was withdrawn. Reconnect to restore publishing.`;
    case 'publishing_disabled':
      return `${displayName} is connected, but not all publishing permissions were granted. Reconnect to grant them.`;
    case 'expiring_soon':
      return `This ${displayName} connection expires soon. Refresh it, or reconnect to extend it.`;
    case 'error':
      return `Something went wrong with ${displayName}. Refresh the connection to check again.`;
    case 'connected':
    case 'not_connected':
      return null;
  }
}

/**
 * The five checks behind the star rating.
 *
 * Each is a plain yes/no a member could verify themselves, which is the point —
 * "★★★★☆" alone is decoration, but "Token Valid ✓ / Recently Verified ✗" tells
 * them what a refresh would fix.
 */
export function assessHealth(
  account: SafeSocialAccount | null,
  permissions: GrantedPermission[],
  now: Date = new Date(),
  /** Passed straight through to {@link deriveStatus} so the two never disagree. */
  expiryWarningMs: number = DEFAULT_EXPIRY_WARNING_MS,
): ConnectionHealth {
  if (!account) {
    return {
      rating: 0,
      maxRating: 5,
      label: 'Unavailable',
      checks: [],
    };
  }

  const status = deriveStatus(account, permissions, now, expiryWarningMs);
  const tokenValid =
    status === 'connected' ||
    status === 'expiring_soon' ||
    status === 'publishing_disabled';

  const publishPermission = permissions.find(
    (permission) => permission.required && !permission.planned,
  );

  const lastVerified = account.lastHealthCheck ?? account.lastSyncedAt;
  const recentlyVerified =
    lastVerified !== null &&
    now.getTime() - lastVerified.getTime() < STALE_SYNC_MS;

  const checks: HealthCheck[] = [
    {
      id: 'token',
      label: 'Token Valid',
      passed: tokenValid,
      detail: 'The stored access token is no longer accepted.',
    },
    {
      id: 'publishing',
      label: 'Publishing Ready',
      passed: tokenValid && publishPermission?.granted === true,
      detail: 'Publishing permission is missing, so posts cannot be sent.',
    },
    {
      id: 'profile',
      label: 'Profile Synced',
      passed: account.displayName !== null && account.lastSyncedAt !== null,
      detail: 'The profile has not been read from the provider yet.',
    },
    {
      id: 'permissions',
      label: 'Permissions Granted',
      passed: hasRequiredPermissions(permissions),
      detail: 'One or more required permissions were not granted.',
    },
    {
      id: 'freshness',
      label: 'Recently Verified',
      passed: recentlyVerified,
      detail: 'This connection has not been checked in over a month.',
    },
  ];

  const rating = checks.filter((check) => check.passed).length;

  return {
    rating,
    maxRating: checks.length,
    label: healthLabel(rating, checks.length),
    checks,
  };
}

function healthLabel(rating: number, max: number): ConnectionHealth['label'] {
  if (rating === max) return 'Excellent';
  if (rating >= max - 1) return 'Good';
  if (rating >= max - 2) return 'Fair';
  return 'At Risk';
}

export const integrationHealth = {
  resolvePermissions,
  deriveStatus,
  statusTone,
  statusLabel,
  statusGuidance,
  assessHealth,
};
