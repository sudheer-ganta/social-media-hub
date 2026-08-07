/**
 * LinkedIn-specific shapes. Sprint 3.1 only needs what the authorization
 * request is built from; token, profile and share payloads arrive with the
 * callback in 3.2.
 */

/** Scopes we are approved for on the LinkedIn app's products. */
export type LinkedInScope = 'openid' | 'profile' | 'w_member_social';

/**
 * The query string LinkedIn's `/oauth/v2/authorization` endpoint expects.
 * `scope` is space-delimited on the wire even though we keep it as an array in
 * config — see {@link import('./config').LINKEDIN_SCOPES}.
 */
export interface LinkedInAuthorizationParams {
  response_type: 'code';
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
}

/** One pending authorization request, held only until the callback lands. */
export interface LinkedInPendingState {
  /** Wall-clock ms at which the entry stops being accepted. */
  expiresAt: number;
  /**
   * The FlowPost user who started this connect, resolved from their Supabase
   * session before we ever left the app. LinkedIn's redirect carries no
   * identity of ours, so this binding is the only thing that tells the callback
   * whose `social_accounts` row to write.
   */
  userId: string;
}

/**
 * The form body LinkedIn's `/oauth/v2/accessToken` endpoint expects, posted as
 * `application/x-www-form-urlencoded`.
 */
export interface LinkedInTokenRequest {
  grant_type: 'authorization_code';
  code: string;
  redirect_uri: string;
  client_id: string;
  client_secret: string;
}

/**
 * LinkedIn's token response.
 *
 * Everything except `access_token` is optional on purpose: LinkedIn issues a
 * `refresh_token` only to apps approved for programmatic refresh, and the same
 * app can get one on some flows and not others. Nothing downstream may assume
 * it exists.
 */
export interface LinkedInTokenResponse {
  access_token: string;
  /** Lifetime in seconds. LinkedIn's member tokens are 60 days today. */
  expires_in?: number;
  /** Absent far more often than present. See the note above. */
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
  /** Present because we ask for `openid`. Not used — the userinfo call is authoritative. */
  id_token?: string;
}

/**
 * The OpenID Connect claims `/v2/userinfo` returns for the `openid profile`
 * scopes. Everything but `sub` is optional: LinkedIn omits `picture` for
 * members with no photo, and locale settings can leave names blank.
 */
export interface LinkedInUserInfo {
  /** The member's stable OpenID subject identifier. */
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string | { country?: string; language?: string };
}

/** The provider-neutral shape the service layer stores. */
export interface LinkedInProfile {
  /** Goes into `social_accounts.provider_account_id`. */
  providerAccountId: string;
  displayName: string | null;
  profileImage: string | null;
}

/** What a completed token exchange hands back to the callback. */
export interface LinkedInAccessToken {
  /** Plaintext. Encrypted by the repository before it reaches the database. */
  accessToken: string;
  /**
   * Plaintext, and **usually null** — see {@link LinkedInTokenResponse}. Stored
   * encrypted when LinkedIn does issue one so a later sprint has it, but no
   * code path in 3.2 reads it back.
   */
  refreshToken: string | null;
  /** Absolute expiry derived from `expires_in`, or null when LinkedIn omits it. */
  expiresAt: Date | null;
  /** Scopes LinkedIn actually granted, which can be narrower than we asked for. */
  scope: string | null;
}
