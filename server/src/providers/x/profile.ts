import axios from 'axios';
import { ProviderError } from '../provider.interface';
import { xConfig } from './config';
import { REQUEST_TIMEOUT_MS, toProviderError } from './http';
import type { XProfile, XUserResponse } from './types';

/**
 * Step 3 of the callback: ask X who this is.
 *
 * All X profile HTTP lives here — the OAuth handler and `verify.ts` call
 * {@link fetchProfile} and get a provider-neutral shape back. Nothing in this
 * module touches Prisma or our tables.
 */

/** Everything the Integrations card needs, in one request. */
const USER_FIELDS = 'profile_image_url';

/**
 * Fetches the authenticated account's profile.
 *
 * `data.id` is the numeric account id and becomes `provider_account_id`. The
 * username is stored alongside it because it is what people recognise their own
 * account by — and because it is what a permalink is built from, though X's
 * `/i/web/status/…` form means publishing does not depend on having it.
 *
 * `id`, `name` and `username` come back by default; only the avatar has to be
 * asked for.
 */
export async function fetchProfile(accessToken: string): Promise<XProfile> {
  let body: XUserResponse;

  try {
    const response = await axios.get<XUserResponse>(`${xConfig.apiUrl}/users/me`, {
      params: { 'user.fields': USER_FIELDS },
      // Bearer, not a query parameter — which is why a logged URL here would be
      // harmless, and nothing logs one anyway.
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: REQUEST_TIMEOUT_MS,
    });
    body = response.data;
  } catch (error) {
    throw toProviderError(error, 'profile request');
  }

  const providerAccountId = body?.data?.id?.trim();
  if (!providerAccountId) {
    throw new ProviderError('X profile response is missing the account id', 502, 'x');
  }

  return {
    providerAccountId,
    displayName: body.data?.name?.trim() || body.data?.username?.trim() || null,
    username: body.data?.username?.trim() || null,
    profileImage: body.data?.profile_image_url?.trim() || null,
  };
}

export const xProfileService = { fetchProfile };
