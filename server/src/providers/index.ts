import type { Provider, ProviderId } from './provider.interface';
import { linkedinProvider } from './linkedin/oauth';
import { instagramProvider } from './meta/instagram/oauth';

export type {
  Provider,
  ProviderId,
  ProviderAccountSnapshot,
  ProviderVerification,
  ProviderPublishInput,
  ProviderPublishResult,
  ProviderMediaAsset,
  ProviderMediaKind,
  ProviderMediaRequirements,
} from './provider.interface';
export { ProviderError, notImplemented } from './provider.interface';
export { linkedinProvider } from './linkedin/oauth';
export { instagramProvider } from './meta/instagram/oauth';
export {
  PROVIDER_CATALOG,
  getCatalogEntry,
  isKnownProvider,
  type ProviderCatalogEntry,
  type ProviderPermission,
} from './catalog';

/**
 * The provider registry. Routes resolve implementations through here rather
 * than importing them directly, so adding Instagram is one entry plus its
 * folder — no changes to the routing layer's shape.
 */
export const providers = {
  linkedin: linkedinProvider,
  // Meta family. Facebook Pages and Threads slot in beside this one under
  // `providers/meta/`, reusing the same OAuth state store, the same connection
  // service and the same publish service — see `providers/meta/config.ts` for
  // what they will and will not share with Instagram.
  instagram: instagramProvider,
} satisfies Partial<Record<ProviderId, Provider>>;

export function getProvider(id: ProviderId): Provider | undefined {
  return (providers as Partial<Record<ProviderId, Provider>>)[id];
}
