import { useCallback, useEffect, useState } from "react";
import { integrationsService } from "@/services";
import {
  PERSONAL_CONTEXT,
  type AccountContext,
  type Integration,
  type IntegrationId,
} from "@/constants/integrations";

/**
 * The signed-in user's integrations for one publishing context, and the two
 * things you can do to one.
 *
 * A single request covers every network, because `GET /api/integrations` is
 * provider-agnostic — adding Instagram changes nothing here. The context is
 * part of the request, filtered server-side: Personal never sees a brand's
 * accounts and a brand never sees Personal's. Mutations return the rebuilt
 * card and are patched into the list in place, so a refresh or a disconnect
 * updates one card without the whole page flickering through a loading state.
 */
export function useIntegrations(context: AccountContext = PERSONAL_CONTEXT) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Primitive deps so a caller passing a fresh object literal every render
  // doesn't refetch in a loop.
  const { contextType, brandId } = context;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setIntegrations(
        await integrationsService.fetchIntegrations({ contextType, brandId }),
      );
      setError(null);
    } catch (cause) {
      // A failed load is not a failed connection: the page shows why rather
      // than rendering cards that would claim nothing is connected.
      console.error("[integrations] failed to load connections", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load your connected accounts.",
      );
    } finally {
      setLoading(false);
    }
  }, [contextType, brandId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Swaps one card for its updated self, leaving the rest untouched. */
  const replace = useCallback((updated: Integration) => {
    setIntegrations((current) =>
      current.map((integration) =>
        integration.provider === updated.provider ? updated : integration,
      ),
    );
  }, []);

  /**
   * Verifies one connection with its provider. Resolves with the message the
   * backend wrote — which explains a failed check as well as a passing one —
   * and rejects only when the request itself could not be made.
   */
  const refreshConnection = useCallback(
    async (provider: IntegrationId) => {
      const result = await integrationsService.refreshIntegration(provider, {
        contextType,
        brandId,
      });
      replace(result.integration);
      return result;
    },
    [replace, contextType, brandId],
  );

  const disconnect = useCallback(
    async (provider: IntegrationId) => {
      const result = await integrationsService.disconnectIntegration(provider, {
        contextType,
        brandId,
      });
      replace(result.integration);
      return result;
    },
    [replace, contextType, brandId],
  );

  return {
    integrations,
    loading,
    error,
    refresh,
    refreshConnection,
    disconnect,
  };
}
