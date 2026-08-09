import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Building2, RefreshCw, User } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderCard } from "@/components/integrations/ProviderCard";
import { FacebookPageDialog } from "@/components/integrations/FacebookPageDialog";
import { ActivityTimeline } from "@/components/integrations/ActivityTimeline";
import { useIntegrationActivity, useIntegrations } from "@/hooks";
import { useBrands } from "@/hooks/useBrands";
import { cn } from "@/lib/utils";
import {
  PERSONAL_CONTEXT,
  brandContext,
  type AccountContext,
  type IntegrationId,
} from "@/constants/integrations";

export default function Integrations() {
  const { brands } = useBrands();

  /**
   * Which publishing context the page is showing. Connections made while a
   * brand is selected belong to that brand; the account lists are filtered
   * server-side, so the two contexts never share a card.
   */
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const selectedBrand = selectedBrandId
    ? (brands.find((b) => b.id === selectedBrandId) ?? null)
    : null;
  const context: AccountContext = selectedBrand
    ? brandContext(selectedBrand.id)
    : PERSONAL_CONTEXT;

  const {
    integrations,
    loading,
    error,
    refresh,
    refreshConnection,
    disconnect,
  } = useIntegrations(context);
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
  const callbackBrandId =
    searchParams.get("context") === "brand"
      ? searchParams.get("brandId")
      : null;

  /**
   * A pending Facebook Page selection, when the callback came back with one.
   * Facebook is the only provider whose OAuth cannot finish on its own — the
   * member manages several Pages and has to choose. See FacebookPageDialog.
   */
  const [pageSelection, setPageSelection] = useState<string | null>(null);

  useEffect(() => {
    if (!provider || !status || handledCallback.current) return;
    handledCallback.current = true;

    // Return to the context the connect started from, so a brand connection
    // does not land the member on the Personal tab wondering what happened.
    // Only Facebook sends these params today.
    if (callbackBrandId) setSelectedBrandId(callbackBrandId);

    if (status === "connected") {
      // The provider's display name lives on the server, and the list may not
      // have loaded yet, so the toast stays neutral rather than guessing.
      toast.success("Account connected.");
      void refresh();
      void refreshActivity();
    } else if (status === "select") {
      // Not connected yet, and deliberately no toast: the dialog *is* the
      // message, and a "nearly there" toast under it would be noise.
      const selection = searchParams.get("selection");
      if (selection) {
        setPageSelection(selection);
      } else {
        toast.error("Could not connect that account. Please try again.");
      }
    } else {
      // The backend deliberately does not tell the browser *why*; the detail is
      // in the server log, where it cannot leak anything the provider sent us.
      toast.error("Could not connect that account. Please try again.");
    }

    setSearchParams({}, { replace: true });
    // `refreshActivity` rather than the whole `activity` object: the hook
    // returns a fresh object every render, which would re-run this effect on
    // each one. The callback itself is stable.
  }, [
    provider,
    status,
    callbackBrandId,
    searchParams,
    refresh,
    refreshActivity,
    setSearchParams,
  ]);

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
      {/* Context switcher: Personal plus one pill per brand. Which context is
          active decides which accounts are listed AND which context a new
          connection joins. */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <ContextPill
          active={!selectedBrand}
          onClick={() => setSelectedBrandId(null)}
        >
          <User className="h-3.5 w-3.5" />
          Personal
        </ContextPill>
        {brands.map((brand) => (
          <ContextPill
            key={brand.id}
            active={selectedBrandId === brand.id}
            onClick={() => setSelectedBrandId(brand.id)}
          >
            <Building2 className="h-3.5 w-3.5" />
            {brand.name}
          </ContextPill>
        ))}
        <span className="text-xs text-muted-foreground">
          Manage brands in Settings.
        </span>
      </div>

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
                  key={`${context.contextType}:${context.brandId ?? ""}:${integration.provider}`}
                  integration={integration}
                  context={context}
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

      {/* Facebook only, and only when the member manages more than one Page.
          A single eligible Page is connected by the callback itself and this
          never opens. */}
      {pageSelection && (
        <FacebookPageDialog
          selection={pageSelection}
          contextLabel={selectedBrand ? selectedBrand.name : "Personal"}
          open
          onOpenChange={(next) => !next && setPageSelection(null)}
          onConnected={(displayName) => {
            toast.success(
              displayName
                ? `${displayName} connected.`
                : "Facebook Page connected.",
            );
            setPageSelection(null);
            void refresh();
            void refreshActivity();
          }}
          onError={(message) => {
            toast.error(message);
            setPageSelection(null);
          }}
        />
      )}
    </PageContainer>
  );
}

function ContextPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary/60 bg-primary/10 text-primary"
          : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
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
