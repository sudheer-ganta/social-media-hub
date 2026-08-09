import axios from 'axios';
import { ProviderError } from '../../provider.interface';
import { facebookConfig } from './config';
import { REQUEST_TIMEOUT_MS, toProviderError } from './http';
import type {
  FacebookAccountsResponse,
  FacebookPage,
  FacebookPageChoice,
  FacebookPageNode,
} from './types';

/**
 * Step 3 of the callback: which Pages may this member publish to?
 *
 * `GET /me/accounts` is the only way to obtain a Page access token, and the
 * token it returns inherits the lifetime of the user token used to ask. This
 * function must therefore only ever be called with a **long-lived** user
 * token — see `token.ts`. Passing the short-lived one typechecks perfectly and
 * yields Page tokens that expire within hours.
 *
 * Nothing here touches Prisma or our tables.
 */

/** Everything the picker, the connection row and the publisher need. */
const PAGE_FIELDS = ['id', 'name', 'username', 'access_token', 'tasks'].join(',');

/** Meta caps this at 100 per page of results; we ask for the maximum. */
const PAGE_LIMIT = 100;

/**
 * How many pages of results to walk.
 *
 * Bounded rather than "until `paging.next` is absent": a follow-the-cursor loop
 * against a remote API is an unbounded outbound request count driven by data we
 * do not control. Someone managing more than 300 Pages is not a case this
 * product serves, and the alternative failure — a connect that hangs — is worse
 * than a picker that shows the first 300.
 */
const MAX_PAGES_OF_RESULTS = 3;

/**
 * Lists the Pages this member may publish to.
 *
 * Filtered by the `CREATE_CONTENT` task, not merely by presence: `/me/accounts`
 * happily returns Pages where the member is an Analyst or a Moderator, and
 * connecting one of those produces an account that looks healthy on the
 * Integrations page and fails on first publish. That is the same class of bug
 * Instagram's account-type check exists to prevent, caught in the same place —
 * before the connection is stored.
 *
 * A Page with no `tasks` array is kept. An absent field means Meta did not tell
 * us, not that the member has no permissions, and refusing on missing
 * information would block a legitimate connection over a field we merely failed
 * to read.
 */
export async function fetchPublishablePages(
  userAccessToken: string,
): Promise<FacebookPage[]> {
  const nodes = await fetchAllPageNodes(userAccessToken);

  return nodes
    .filter((node) => canCreateContent(node))
    .map(toPage)
    .filter((page): page is FacebookPage => page !== null);
}

/** True when the member may create posts on this Page. */
function canCreateContent(node: FacebookPageNode): boolean {
  if (!node.tasks || node.tasks.length === 0) return true;
  return node.tasks.some(
    (task) => task?.toUpperCase() === facebookConfig.publishTask,
  );
}

/**
 * A Page node as a normalised {@link FacebookPage}, or null when it is unusable.
 *
 * A Page without an id or without its own access token cannot be published to,
 * so it is dropped rather than offered — a picker entry that cannot become a
 * working connection is worse than one fewer choice.
 */
function toPage(node: FacebookPageNode): FacebookPage | null {
  const id = node.id?.toString().trim();
  const accessToken = node.access_token?.trim();
  if (!id || !accessToken) return null;

  return {
    id,
    name: node.name?.trim() || `Page ${id}`,
    username: node.username?.trim() || null,
    profileImage: node.picture?.data?.url?.trim() || null,
    accessToken,
  };
}

/** Walks `/me/accounts`, bounded. */
async function fetchAllPageNodes(
  userAccessToken: string,
): Promise<FacebookPageNode[]> {
  const nodes: FacebookPageNode[] = [];
  let url: string | undefined = `${facebookConfig.graphUrl}/me/accounts`;
  // Only the first request carries params; Meta's `paging.next` is a complete
  // URL with the cursor and the token already on it.
  let params: Record<string, unknown> | undefined = {
    fields: PAGE_FIELDS,
    limit: PAGE_LIMIT,
    access_token: userAccessToken,
  };

  for (let page = 0; page < MAX_PAGES_OF_RESULTS && url; page++) {
    let response: { data: FacebookAccountsResponse };
    try {
      response = await axios.get<FacebookAccountsResponse>(url, {
        ...(params && { params }),
        timeout: REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      throw toProviderError(error, 'page list request');
    }

    nodes.push(...(response.data?.data ?? []));

    url = response.data?.paging?.next;
    params = undefined;
  }

  return nodes;
}

/**
 * Strips the Page access tokens off a list on its way to the browser.
 *
 * The picker needs a name and a picture; it must never receive a credential.
 * This is the only function that produces the browser-facing shape, so there is
 * one place to check that the token does not travel — the same role
 * `toSafe` plays in the social-account repository.
 */
export function toPageChoices(pages: FacebookPage[]): FacebookPageChoice[] {
  return pages.map((page) => ({
    id: page.id,
    name: page.name,
    username: page.username,
    profileImage: page.profileImage,
  }));
}

/**
 * Picks one Page out of a list by id.
 *
 * Returns null for an id that is not in the list, which the caller turns into a
 * refusal — the member may only connect a Page that this particular OAuth
 * exchange actually returned, never one named freely in a request body.
 */
export function selectPage(
  pages: FacebookPage[],
  pageId: string,
): FacebookPage | null {
  return pages.find((page) => page.id === pageId) ?? null;
}

/** Raised when the member has no Page this integration can use. */
export function noPublishablePagesError(): ProviderError {
  return new ProviderError(
    'This Facebook account has no Page that FlowPost can publish to. ' +
      'Create a Facebook Page, or ask an admin to give you content permissions on one, then try again.',
    400,
    'facebook',
  );
}

export const facebookPagesService = {
  fetchPublishablePages,
  toPageChoices,
  selectPage,
};
