import type { Provider, ProviderId } from './provider.interface';
import { linkedinProvider } from './linkedin/oauth';

export type {
  Provider,
  ProviderId,
  ProviderAccountSnapshot,
  ProviderVerification,
} from './provider.interface';
export { ProviderError, notImplemented } from './provider.interface';
export { linkedinProvider } from './linkedin/oauth';
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
} satisfies Partial<Record<ProviderId, Provider>>;

export function getProvider(id: ProviderId): Provider | undefined {
  return (providers as Partial<Record<ProviderId, Provider>>)[id];
}
