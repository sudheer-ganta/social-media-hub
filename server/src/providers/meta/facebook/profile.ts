import axios from 'axios';
import { ProviderError } from '../../provider.interface';
import { facebookConfig } from './config';
import { REQUEST_TIMEOUT_MS, toProviderError } from './http';
import type { FacebookPageNode, FacebookPageProfile } from './types';

/**
 * "Who is this Page?" — asked with the Page's own access token.
 *
 * All Facebook profile HTTP lives here. Callers get a provider-neutral shape
 * back and nothing in this module touches Prisma or our tables.
 *
 * ─── Why `/me` and not `/{page-id}` ──────────────────────────────────────────
 *
 * A Page access token *is* the Page as far as Graph is concerned: `/me` with
 * one resolves to the Page node, not to the human who minted it. That matters
 * because {@link Provider.verify} takes an access token and nothing else — it
 * has no Page id to interpolate — so `/me` is what lets Facebook satisfy the
 * shared interface without widening it for one network.
 *
 * It also makes the check strictly stronger than a `/{page-id}` read would be:
 * a token that resolves to a *different* id than the one stored is a token that
 * belongs to another Page, and the caller can see that and refuse.
 */

/** Everything the Integrations card needs, in one request. */
const PROFILE_FIELDS = ['id', 'name', 'username', 'picture'].join(',');

/**
 * Fetches the connected Page's profile using its own Page token.
 *
 * `id` is the field that matters: it is the Page id every publishing path is
 * built from, and it must equal `social_accounts.provider_account_id`.
 */
export async function fetchPageProfile(
  pageAccessToken: string,
): Promise<FacebookPageProfile> {
  let node: FacebookPageNode;

  try {
    const response = await axios.get<FacebookPageNode>(
      `${facebookConfig.graphUrl}/me`,
      {
        params: { fields: PROFILE_FIELDS, access_token: pageAccessToken },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    node = response.data;
  } catch (error) {
    // toProviderError keeps Meta's diagnostic in the message for the log and
    // carries the upstream status so `verify` can tell a dead token from a Meta
    // outage. The URL — which holds the token — is never logged.
    throw toProviderError(error, 'page profile request');
  }

  const providerAccountId = node?.id?.toString().trim();
  if (!providerAccountId) {
    throw new ProviderError(
      'Facebook page profile response is missing the page id',
      502,
      'facebook',
    );
  }

  return {
    providerAccountId,
    displayName: node.name?.trim() || null,
    username: node.username?.trim() || null,
    profileImage: node.picture?.data?.url?.trim() || null,
  };
}

export const facebookProfileService = { fetchPageProfile };
