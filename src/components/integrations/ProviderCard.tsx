import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Plug, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { IntegrationLogo } from "@/components/integrations/IntegrationLogo";
import { StatusPill } from "@/components/integrations/StatusPill";
import { ConnectionHealthMeter } from "@/components/integrations/ConnectionHealthMeter";
import { PermissionList } from "@/components/integrations/PermissionList";
import { DisconnectDialog } from "@/components/integrations/DisconnectDialog";
import { integrationsService } from "@/services";
import type { Integration, IntegrationId } from "@/constants/integrations";
import {
  formatAbsolute,
  formatCalendarDay,
  formatRelative,
} from "@/utils/date";

interface ProviderCardProps {
  integration: Integration;
  onRefresh: (provider: IntegrationId) => Promise<{
    verified: boolean;
    message: string;
  }>;
  onDisconnect: (provider: IntegrationId) => Promise<{ message: string }>;
}

/**
 * One network's card: identity, status, health, permissions and the actions.
 *
 * Every word on it comes from the API — name, description, brand colour, status
 * label, guidance, permission labels. The component contributes layout and the
 * brand glyph, nothing else, which is what lets a new network render correctly
 * the moment the backend catalogues it.
 *
 * Three shapes, chosen by data rather than by provider:
 *   • unavailable → Coming Soon, action disabled
 *   • available, no connection → Connect
 *   • connected → profile, health, permissions, Refresh + Disconnect
 */
export function ProviderCard({
  integration,
  onRefresh,
  onDisconnect,
}: ProviderCardProps) {
  const { displayName, description, brandColor, account, health } = integration;
  const comingSoon = !integration.available;
  const connected = integration.connected;
  /** Connected but unhealthy — the card leads with recovery, not with status. */
  const needsAttention = connected && integration.tone !== "healthy";

  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  /**
   * Hands the browser to the backend, which 302s on to the provider. On success
   * this navigation never returns, so `connecting` is only reset on failure.
   */
  const handleConnect = async () => {
    setConnecting(true);
    try {
      await integrationsService.startConnect(integration);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not start the ${displayName} connection.`,
      );
      setConnecting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await onRefresh(integration.provider);
      // The backend's message explains a *failed* check as usefully as a
      // passing one, so it is shown either way — just with the right severity.
      if (result.verified) toast.success(result.message);
      else toast.warning(result.message);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not check the ${displayName} connection.`,
      );
    } finally {
      setRefreshing(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const result = await onDisconnect(integration.provider);
      toast.success(result.message);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not disconnect ${displayName}.`,
      );
      // Rethrown so the dialog stays open — see DisconnectDialog.
      throw error;
    }
  };

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: brandColor }}
          >
            <IntegrationLogo id={integration.provider} className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              {displayName}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <StatusPill
          label={comingSoon ? "Coming Soon" : integration.statusLabel}
          tone={comingSoon ? "neutral" : integration.tone}
          className="shrink-0"
        />
      </div>

      {/* Recovery copy, when there is something to recover from. Phrased as an
          instruction by the backend — "LinkedIn needs your permission again",
          never "Failed". */}
      {needsAttention && integration.guidance && (
        <div className="mt-4 flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500"
          />
          <p className="text-xs leading-relaxed">{integration.guidance}</p>
        </div>
      )}

      {account && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
          <Avatar className="h-9 w-9">
            {account.profileImage && (
              <AvatarImage
                src={account.profileImage}
                alt={account.displayName ?? displayName}
              />
            )}
            {/* Shown whenever there is no photo, or the photo fails to load —
                LinkedIn's CDN URLs are signed and do expire. */}
            <AvatarFallback className="text-xs font-medium">
              {getInitials(account.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">
              {account.displayName ?? `${displayName} account`}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {account.username ? `${account.username} · ` : ""}
              {displayName}
            </p>
          </div>
        </div>
      )}

      {account && (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Connected
            </dt>
            <dd
              className="mt-0.5 truncate font-medium"
              title={formatAbsolute(account.connectedAt)}
            >
              {formatCalendarDay(account.connectedAt)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Last Sync
            </dt>
            <dd
              className="mt-0.5 truncate font-medium"
              title={
                account.lastSyncedAt
                  ? formatAbsolute(account.lastSyncedAt)
                  : undefined
              }
            >
              {account.lastSyncedAt
                ? formatRelative(account.lastSyncedAt)
                : "Never"}
            </dd>
          </div>
        </dl>
      )}

      {health && (
        <div className="mt-4">
          <ConnectionHealthMeter health={health} />
        </div>
      )}

      <div className="mt-4">
        <PermissionList
          permissions={integration.permissions}
          connected={connected}
        />
      </div>

      {/* Provider metadata. Quiet by design — useful when something is wrong,
          invisible the rest of the time. */}
      {(integration.apiVersion || account) && (
        <p className="mt-3 truncate text-[11px] text-muted-foreground">
          {[
            integration.apiVersion && `API v${integration.apiVersion}`,
            account?.scopes.length
              ? `${account.scopes.length} scope${account.scopes.length === 1 ? "" : "s"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {/* `flex-1 items-end` pins the actions to the bottom, so cards of
          differing content height still line their buttons up across the grid. */}
      <div className="mt-5 flex flex-1 items-end gap-2">
        {comingSoon ? (
          <Button className="w-full" variant="outline" disabled>
            Coming Soon
          </Button>
        ) : connected ? (
          <>
            <Button
              className="flex-1"
              variant="outline"
              disabled={refreshing}
              onClick={handleRefresh}
            >
              <RefreshCw
                aria-hidden="true"
                className={refreshing ? "animate-spin" : undefined}
              />
              {refreshing ? "Checking…" : "Refresh"}
            </Button>
            {needsAttention ? (
              /* Reconnect is the primary action on a broken connection — it is
                 the thing that fixes it, and it is the same OAuth flow. */
              <Button
                className="flex-1"
                disabled={connecting}
                onClick={handleConnect}
              >
                {connecting ? "Opening…" : "Reconnect"}
              </Button>
            ) : (
              <Button
                className="flex-1"
                variant="outline"
                onClick={() => setConfirmingDisconnect(true)}
              >
                Disconnect
              </Button>
            )}
          </>
        ) : (
          <Button
            className="w-full"
            disabled={connecting}
            onClick={handleConnect}
          >
            <Plug aria-hidden="true" />
            {connecting ? "Opening…" : `Connect ${displayName}`}
          </Button>
        )}
      </div>

      {/* A connection needing attention still has to be removable — the
          Disconnect button gave its slot to Reconnect, so it drops below. */}
      {connected && needsAttention && (
        <Button
          className="mt-2 w-full text-muted-foreground"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmingDisconnect(true)}
        >
          Disconnect
        </Button>
      )}

      {connected && (
        <DisconnectDialog
          integration={integration}
          open={confirmingDisconnect}
          onOpenChange={setConfirmingDisconnect}
          onConfirm={handleDisconnect}
        />
      )}
    </Card>
  );
}

/**
 * The generated avatar for members with no profile photo. Up to two initials
 * from the display name, with a neutral glyph when even that is missing.
 */
function getInitials(displayName: string | null): string {
  const initials = (displayName ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "—";
}
