import { Check, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IntegrationPermission } from "@/constants/integrations";

interface PermissionListProps {
  permissions: IntegrationPermission[];
  /** Hides the granted/withheld marks for a network with no connection. */
  connected: boolean;
}

/**
 * What this connection is allowed to do, shown rather than hidden.
 *
 * Three states, not two: granted, withheld, and planned. A planned capability
 * has no scope yet — today that is Facebook Reels alone, which needs a Meta
 * permission FlowPost has not verified against Meta's own documentation.
 * Marking it with an ✗ would read as something being broken, so it gets a clock,
 * sits greyed out, and its tooltip carries the actual reason.
 *
 * Every entry, and every one of the three states, comes from the server —
 * `providers/catalog.ts` for the labels and the member's granted scopes for the
 * marks. There is no list of capabilities in this file, which is why correcting
 * a wrong one ("Stories cannot be published through the Instagram API", which
 * was never true) was a backend edit and nothing here.
 */
export function PermissionList({ permissions, connected }: PermissionListProps) {
  if (permissions.length === 0) return null;

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Permissions
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {permissions.map((permission) => {
          const planned = permission.planned;
          // Before a connection exists, the list is a preview of what will be
          // asked for — so nothing is marked granted or withheld.
          const granted = connected && permission.granted === true;
          const withheld = connected && permission.granted === false && !planned;

          return (
            <li
              key={permission.label}
              title={
                planned
                  ? `${permission.description} (coming soon)`
                  : withheld
                    ? `Not granted. ${permission.description}`
                    : permission.description
              }
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
                planned && "border-dashed text-muted-foreground/70",
                withheld && "border-red-500/25 bg-red-500/5 text-red-600 dark:text-red-400",
                granted && "border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
                !planned && !withheld && !granted && "text-muted-foreground",
              )}
            >
              {planned ? (
                <Clock aria-hidden="true" className="h-2.5 w-2.5" />
              ) : withheld ? (
                <X aria-hidden="true" className="h-2.5 w-2.5" />
              ) : granted ? (
                <Check aria-hidden="true" className="h-2.5 w-2.5" />
              ) : null}
              {permission.label}
              <span className="sr-only">
                {planned
                  ? " — coming soon"
                  : withheld
                    ? " — not granted"
                    : granted
                      ? " — granted"
                      : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
