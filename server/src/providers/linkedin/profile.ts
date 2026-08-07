import axios from 'axios';
import { ProviderError } from '../provider.interface';
import { linkedinConfig } from './config';
import type { LinkedInProfile, LinkedInUserInfo } from './types';

/**
 * Step 3 of the callback: ask LinkedIn who the member is.
 *
 * All LinkedIn profile HTTP lives here — routes and services call
 * {@link fetchProfile} and get a provider-neutral shape back. Nothing in this
 * module touches Prisma or our tables.
 */

const PROFILE_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Fetches the member's profile with a freshly-issued access token.
 *
 * Uses the OpenID Connect userinfo endpoint, which is what the `openid` +
 * `profile` scopes on our enabled products grant. `sub` is the only field
 * LinkedIn guarantees, and it is the only one we actually need — it becomes
 * `provider_account_id`, the key the account row upserts on. A member with no
 * display name or photo still connects successfully; the UI renders an
 * initials avatar in that case.
 */
export async function fetchProfile(
  accessToken: string,
): Promise<LinkedInProfile> {
  let userInfo: LinkedInUserInfo;

  try {
    const response = await axios.get<LinkedInUserInfo>(
      linkedinConfig.userinfoUrl,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: PROFILE_REQUEST_TIMEOUT_MS,
      },
    );
    userInfo = response.data;
  } catch (error) {
    // Status only. LinkedIn's error bodies are not reproduced, and the token in
    // the Authorization header must never reach a log line.
    const upstreamStatus = axios.isAxiosError(error)
      ? error.response?.status
      : undefined;
    const status = axios.isAxiosError(error)
      ? (upstreamStatus ?? error.code ?? 'no response')
      : 'unknown';
    throw new ProviderError(
      `LinkedIn profile request failed (HTTP ${status})`,
      502,
      'linkedin',
      // Carried so a health check can tell a dead token from a bad minute at
      // LinkedIn. The OAuth callback ignores it and behaves exactly as before.
      upstreamStatus,
    );
  }

  if (!userInfo?.sub) {
    throw new ProviderError(
      'LinkedIn profile response is missing the "sub" claim',
      502,
      'linkedin',
    );
  }

  return {
    providerAccountId: userInfo.sub,
    displayName: resolveDisplayName(userInfo),
    profileImage: userInfo.picture?.trim() || null,
  };
}

/**
 * `name` is the claim LinkedIn normally sends. Falling back to the given/family
 * pair covers members whose locale settings leave the combined claim empty.
 */
function resolveDisplayName(userInfo: LinkedInUserInfo): string | null {
  const full = userInfo.name?.trim();
  if (full) return full;

  const parts = [userInfo.given_name, userInfo.family_name]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(' ') : null;
}

export const linkedinProfileService = { fetchProfile };
