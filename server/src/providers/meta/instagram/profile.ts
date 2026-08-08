import axios from 'axios';
import { ProviderError } from '../../provider.interface';
import { instagramConfig } from './config';
import { REQUEST_TIMEOUT_MS, toProviderError } from './http';
import type { InstagramProfile, InstagramUserNode } from './types';

/**
 * Step 3 of the callback: ask Instagram who this is.
 *
 * All Instagram profile HTTP lives here — routes and services call
 * {@link fetchProfile} and get a provider-neutral shape back. Nothing in this
 * module touches Prisma or our tables.
 */

/** Everything the Integrations card and the publisher need, in one request. */
const PROFILE_FIELDS = [
  'user_id',
  'username',
  'name',
  'account_type',
  'profile_picture_url',
].join(',');

/**
 * Fetches the connected account's profile.
 *
 * `user_id` is the field that matters: it is the app-scoped id every publishing
 * path is built from, and it becomes `provider_account_id`. The node also
 * carries a legacy `id`, and the two are not always the same value — Meta's own
 * content-publishing examples use `user_id`, so that is what is preferred here,
 * with `id` as a fallback rather than a co-equal.
 *
 * A member with no name or picture still connects successfully; the UI renders
 * an initials avatar in that case.
 */
export async function fetchProfile(
  accessToken: string,
): Promise<InstagramProfile> {
  let node: InstagramUserNode;

  try {
    const response = await axios.get<InstagramUserNode>(
      `${instagramConfig.graphUrl}/me`,
      {
        params: { fields: PROFILE_FIELDS, access_token: accessToken },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    node = response.data;
  } catch (error) {
    // toProviderError keeps Meta's diagnostic in the message for the log and
    // carries the upstream status so `verify` can tell a dead token from a
    // Meta outage. The URL — which holds the token — is never logged.
    throw toProviderError(error, 'profile request');
  }

  const providerAccountId =
    firstId(node?.user_id) ?? firstId(node?.id) ?? null;

  if (!providerAccountId) {
    throw new ProviderError(
      'Instagram profile response is missing the account id',
      502,
      'instagram',
    );
  }

  return {
    providerAccountId,
    displayName: node.name?.trim() || node.username?.trim() || null,
    username: node.username?.trim() || null,
    profileImage: node.profile_picture_url?.trim() || null,
    accountType: node.account_type?.trim() || null,
  };
}

/** Meta sends ids as either a string or a number depending on the field. */
function firstId(value: string | number | undefined): string | null {
  if (value === undefined || value === null) return null;
  const asString = String(value).trim();
  return asString.length > 0 ? asString : null;
}

export const instagramProfileService = { fetchProfile };
