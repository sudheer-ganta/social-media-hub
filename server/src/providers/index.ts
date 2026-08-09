import type { Provider, ProviderId } from './provider.interface';
import { linkedinProvider } from './linkedin/oauth';
import { instagramProvider } from './meta/instagram/oauth';
import { facebookProvider } from './meta/facebook/oauth';

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
export { facebookProvider } from './meta/facebook/oauth';
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
  // Meta family. Both sit under `providers/meta/` and reuse the same OAuth
  // state store, the same connection service and the same publish service —
  // but they are *different authentication models* on the same Meta app, and
  // share no host, credential or token. See `providers/meta/config.ts`.
  instagram: instagramProvider,
  facebook: facebookProvider,
} satisfies Partial<Record<ProviderId, Provider>>;

export function getProvider(id: ProviderId): Provider | undefined {
  return (providers as Partial<Record<ProviderId, Provider>>)[id];
}
