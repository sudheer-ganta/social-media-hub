import type {
  ProviderPublishInput,
  ProviderPublishResult,
} from '../provider.interface';

/**
 * X's wire shapes, and the provider-neutral ones this folder maps them onto.
 *
 * Everything here describes bytes on the wire to or from api.x.com. Nothing in
 * this file knows about Prisma, Express or our tables.
 */

/** The OAuth 2.0 scopes FlowPost requests. See `config.ts` for why each one. */
export type XScope =
  | 'tweet.read'
  | 'tweet.write'
  | 'users.read'
  | 'offline.access';

/** Query parameters on the authorization request. All required by X. */
export interface XAuthorizationParams {
  response_type: 'code';
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
  /** base64url(SHA-256(code_verifier)). */
  code_challenge: string;
  code_challenge_method: 'S256';
}

/** Form body for the authorization-code exchange. */
export interface XTokenRequest {
  grant_type: 'authorization_code';
  code: string;
  redirect_uri: string;
  /** Sent alongside the Basic auth header — X wants both for a confidential client. */
  client_id: string;
  code_verifier: string;
}

/** Form body for a refresh. */
export interface XRefreshRequest {
  grant_type: 'refresh_token';
  refresh_token: string;
  client_id: string;
}

/** X's token response, for both grants. */
export interface XTokenResponse {
  token_type?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

/**
 * A token exchange, normalised.
 *
 * `refreshToken` is non-null in practice because `offline.access` is requested,
 * but it is typed nullable: X omits it if the scope was declined on the consent
 * screen, and pretending otherwise would put an `undefined` into storage.
 */
export interface XAccessToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
}

/** `GET /2/users/me` — X wraps every resource in `data`. */
export interface XUserResponse {
  data?: {
    id?: string;
    name?: string;
    username?: string;
    profile_image_url?: string;
  };
}

/** The provider-neutral profile this folder hands back. */
export interface XProfile {
  providerAccountId: string;
  displayName: string | null;
  username: string | null;
  profileImage: string | null;
}

/** `POST /2/tweets` request body. Text-only today — see `publisher.ts`. */
export interface XCreateTweetRequest {
  text: string;
}

/** `POST /2/tweets` response. */
export interface XCreateTweetResponse {
  data?: {
    id?: string;
    text?: string;
  };
}

/**
 * X's error envelope. Two shapes, both real: OAuth endpoints answer with
 * `{ error, error_description }`, the v2 API with `{ title, detail, errors }`.
 */
export interface XErrorBody {
  error?: string;
  error_description?: string;
  title?: string;
  detail?: string;
  reason?: string;
  errors?: Array<{ message?: string; detail?: string }>;
}

export type XPublishInput = ProviderPublishInput;
export type XPublishResult = ProviderPublishResult;
