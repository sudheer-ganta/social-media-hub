import { useCallback, useEffect, useState } from "react";
import { integrationsService } from "@/services";
import type { ActivityEvent } from "@/constants/integrations";

/**
 * The integration activity timeline.
 *
 * Kept separate from {@link useIntegrations} so the feed and the cards fail
 * independently — an activity query that errors leaves the provider cards fully
 * usable, which is the right trade for a panel that is context rather than
 * control.
 */
export function useIntegrationActivity(limit = 12) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await integrationsService.fetchActivity({ limit }));
      setError(null);
    } catch (cause) {
      console.error("[integrations] failed to load activity", cause);
      setError(
        cause instanceof Error ? cause.message : "Could not load recent activity.",
      );
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { events, loading, error, refresh };
}
