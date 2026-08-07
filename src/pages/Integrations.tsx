import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderCard } from "@/components/integrations/ProviderCard";
import { ActivityTimeline } from "@/components/integrations/ActivityTimeline";
import { useIntegrationActivity, useIntegrations } from "@/hooks";
import type { IntegrationId } from "@/constants/integrations";

export default function Integrations() {
  const {
    integrations,
    loading,
    error,
    refresh,
    refreshConnection,
    disconnect,
  } = useIntegrations();
  const activity = useIntegrationActivity();
  const { refresh: refreshActivity } = activity;
  const [searchParams, setSearchParams] = useSearchParams();

  /**
   * The OAuth callback lands here with `?provider=&status=`. Report it once,
   * reload the connections so the card catches up, then strip the params so a
   * refresh doesn't replay the toast.
   *
   * The ref guards against React 18 StrictMode running this effect twice in
   * development, which would otherwise double the toast.
   */
  const handledCallback = useRef(false);
  const provider = searchParams.get("provider");
  const status = searchParams.get("status");

  useEffect(() => {
    if (!provider || !status || handledCallback.current) return;
    handledCallback.current = true;

    if (status === "connected") {
      // The provider's display name lives on the server, and the list may not
      // have loaded yet, so the toast stays neutral rather than guessing.
      toast.success("Account connected.");
      void refresh();
      void refreshActivity();
    } else {
      // The backend deliberately does not tell the browser *why*; the detail is
      // in the server log, where it cannot leak anything the provider sent us.
      toast.error("Could not connect that account. Please try again.");
    }

    setSearchParams({}, { replace: true });
    // `refreshActivity` rather than the whole `activity` object: the hook
    // returns a fresh object every render, which would re-run this effect on
    // each one. The callback itself is stable.
  }, [provider, status, refresh, refreshActivity, setSearchParams]);

  /**
   * Mutations refresh the timeline too — a disconnect that doesn't appear in
   * Activity looks like it didn't happen. Deliberately fire-and-forget: the
   * card has already updated from the mutation's own response, and a slow
   * activity query must not hold up the toast.
   */
  const handleRefreshConnection = async (target: IntegrationId) => {
    const result = await refreshConnection(target);
    void refreshActivity();
    return result;
  };

  const handleDisconnect = async (target: IntegrationId) => {
    const result = await disconnect(target);
    void refreshActivity();
    return result;
  };

  /** Connected networks lead — what a member manages sits above what they can add. */
  const ordered = useMemo(
    () =>
      [...integrations].sort(
        (a, b) => Number(b.connected) - Number(a.connected),
      ),
    [integrations],
  );

  const connectedCount = integrations.filter((i) => i.connected).length;
  const needsAttention = integrations.filter(
    (i) => i.connected && i.tone !== "healthy",
  ).length;

  return (
    <PageContainer
      title="Integrations"
      description={
        loading
          ? "Loading your connected accounts…"
          : needsAttention > 0
            ? `${connectedCount} connected · ${needsAttention} need${needsAttention === 1 ? "s" : ""} attention`
            : connectedCount > 0
              ? `${connectedCount} account${connectedCount === 1 ? "" : "s"} connected and publishing`
              : "Connect the networks FlowPost publishes to."
      }
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => {
            void refresh();
            void refreshActivity();
          }}
        >
          <RefreshCw
            aria-hidden="true"
            className={loading ? "animate-spin" : undefined}
          />
          Reload
        </Button>
      }
    >
      {error && !loading && (
        <Card className="mb-4 border-red-500/25 bg-red-500/5 p-4">
          <p className="text-sm">{error}</p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => void refresh()}
          >
            Try again
          </Button>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-4 sm:grid-cols-2">
          {loading
            ? Array.from({ length: 4 }, (_, index) => (
                <ProviderCardSkeleton key={index} />
              ))
            : ordered.map((integration) => (
                <ProviderCard
                  key={integration.provider}
                  integration={integration}
                  onRefresh={handleRefreshConnection}
                  onDisconnect={handleDisconnect}
                />
              ))}
        </div>

        <ActivityTimeline
          events={activity.events}
          loading={activity.loading}
          error={activity.error}
        />
      </div>
    </PageContainer>
  );
}

/**
 * Placeholder matching a connected card's height, so the grid doesn't reflow
 * once real data lands.
 */
function ProviderCardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Skeleton className="mt-5 h-14 w-full rounded-lg" />
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
      <Skeleton className="mt-5 h-9 w-full rounded-md" />
    </Card>
  );
}
