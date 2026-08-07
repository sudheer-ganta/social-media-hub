import type { ProviderId } from './provider.interface';
import { LINKEDIN_API_VERSION } from './linkedin/config';

/**
 * Everything the Integrations UI needs to *describe* a network, whether or not
 * it is implemented yet.
 *
 * This is the file that makes the frontend provider-agnostic. The browser does
 * not hold a list of networks, their names, their brand colours or what
 * permissions they grant — it renders whatever `GET /api/integrations` returns.
 * Bringing Instagram online is an edit here plus a provider implementation; the
 * React side does not change.
 *
 * Kept separate from the provider registry on purpose: a catalogue entry exists
 * for networks with no implementation at all (that is what `available: false`
 * means), so it cannot live on the `Provider` interface.
 */

/**
 * One capability a connection grants, in the member's language.
 *
 * `scope` is the provider's own string, which is what we match the granted
 * scopes against. It is null for capabilities that are on the roadmap but have
 * no scope yet — those render greyed out and never affect health.
 */
export interface ProviderPermission {
  scope: string | null;
  /** Shown in the Permissions list, e.g. "Publish Posts". */
  label: string;
  /** One line of explanation, for the tooltip. */
  description: string;
  /**
   * A capability the product depends on. A required permission that was not
   * granted is what turns "Connected" into "Publishing Disabled".
   */
  required: boolean;
  /** Not available yet, on this network or in FlowPost. Rendered inactive. */
  planned?: boolean;
}

export interface ProviderCatalogEntry {
  id: ProviderId;
  displayName: string;
  /** One line under the name on the card. */
  description: string;
  /** Brand colour for the logo tile. Hex, because it goes straight into CSS. */
  brandColor: string;
  /** True once OAuth is wired up. False renders the card as Coming Soon. */
  available: boolean;
  /**
   * Where the browser navigates to start OAuth, relative to the API origin.
   * Null for unavailable networks — the UI has no route to guess at, which is
   * what stops a Coming Soon card from linking to a 404.
   */
  connectPath: string | null;
  /** The provider API version we integrate against. Shown under Details. */
  apiVersion: string | null;
  permissions: ProviderPermission[];
}

/**
 * Scopes we request from LinkedIn. Mirrors `linkedin/config.ts` — that file
 * decides what to *ask* for, this one explains what each one means to a member.
 */
const LINKEDIN_PERMISSIONS: ProviderPermission[] = [
  {
    scope: 'w_member_social',
    label: 'Publish Posts',
    description: 'Share posts to your LinkedIn feed on your behalf.',
    required: true,
  },
  {
    scope: 'profile',
    label: 'Read Profile',
    description: 'Read your name and photo so FlowPost can show the account.',
    required: true,
  },
  {
    scope: 'openid',
    label: 'Verify Identity',
    description: 'Confirm which LinkedIn member this connection belongs to.',
    required: true,
  },
  {
    scope: null,
    label: 'Upload Images',
    description: 'Attach images to published posts. Arriving with media posts.',
    required: false,
    planned: true,
  },
];

/** Capabilities a video-first network will grant once it is implemented. */
const VIDEO_PERMISSIONS: ProviderPermission[] = [
  {
    scope: null,
    label: 'Publish Video',
    description: 'Upload and publish video content.',
    required: false,
    planned: true,
  },
  {
    scope: null,
    label: 'Read Profile',
    description: 'Read your account name and photo.',
    required: false,
    planned: true,
  },
];

/**
 * Every network FlowPost publishes to, present and planned.
 *
 * Ordered deliberately: implemented networks first, then the roadmap in the
 * order we intend to build them. The UI renders this order as-is.
 */
export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'linkedin',
    displayName: 'LinkedIn',
    description: 'Professional publishing',
    brandColor: '#0A66C2',
    available: true,
    connectPath: '/auth/linkedin/connect',
    // LinkedIn versions its REST surface by month, and sunsets each version
    // after about a year — 202401, which this was pinned to until Sprint 4.2,
    // is one of LinkedIn's own examples of a *deprecated* version header.
    // Reading it from the provider config means the value that publishing
    // actually sends and the value we display can never drift apart, and
    // bumping it is an environment variable rather than an edit here.
    //
    // Recorded per connection as well (`social_accounts.provider_version`), so
    // an account connected under an older version stays identifiable.
    apiVersion: LINKEDIN_API_VERSION,
    permissions: LINKEDIN_PERMISSIONS,
  },
  {
    id: 'instagram',
    displayName: 'Instagram',
    description: 'Visual storytelling & reels',
    brandColor: '#E4405F',
    available: false,
    connectPath: null,
    apiVersion: null,
    permissions: [
      {
        scope: null,
        label: 'Publish Posts',
        description: 'Share images and carousels to your feed.',
        required: false,
        planned: true,
      },
      {
        scope: null,
        label: 'Publish Stories',
        description: 'Post to Stories.',
        required: false,
        planned: true,
      },
      {
        scope: null,
        label: 'Publish Reels',
        description: 'Upload short-form video.',
        required: false,
        planned: true,
      },
    ],
  },
  {
    id: 'facebook',
    displayName: 'Facebook',
    description: 'Pages, groups & communities',
    brandColor: '#1877F2',
    available: false,
    connectPath: null,
    apiVersion: null,
    permissions: [
      {
        scope: null,
        label: 'Publish to Pages',
        description: 'Post to Pages you manage.',
        required: false,
        planned: true,
      },
      {
        scope: null,
        label: 'Read Profile',
        description: 'Read your account name and photo.',
        required: false,
        planned: true,
      },
    ],
  },
  {
    id: 'x',
    displayName: 'X',
    description: 'Real-time conversation',
    brandColor: '#111111',
    available: false,
    connectPath: null,
    apiVersion: null,
    permissions: [
      {
        scope: null,
        label: 'Publish Posts',
        description: 'Post to your timeline.',
        required: false,
        planned: true,
      },
      {
        scope: null,
        label: 'Read Profile',
        description: 'Read your account name and photo.',
        required: false,
        planned: true,
      },
    ],
  },
  {
    id: 'youtube',
    displayName: 'YouTube',
    description: 'Long-form video & shorts',
    brandColor: '#FF0000',
    available: false,
    connectPath: null,
    apiVersion: null,
    permissions: VIDEO_PERMISSIONS,
  },
  {
    id: 'tiktok',
    displayName: 'TikTok',
    description: 'Short-form video',
    brandColor: '#010101',
    available: false,
    connectPath: null,
    apiVersion: null,
    permissions: VIDEO_PERMISSIONS,
  },
];

const BY_ID = new Map<ProviderId, ProviderCatalogEntry>(
  PROVIDER_CATALOG.map((entry) => [entry.id, entry]),
);

export function getCatalogEntry(
  id: string,
): ProviderCatalogEntry | undefined {
  return BY_ID.get(id as ProviderId);
}

/** True for a string that names a network we have a catalogue entry for. */
export function isKnownProvider(id: string): id is ProviderId {
  return BY_ID.has(id as ProviderId);
}
