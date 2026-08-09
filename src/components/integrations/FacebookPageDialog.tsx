import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { integrationsService } from "@/services";
import type { FacebookPageChoice } from "@/services/integrations.service";
import { cn } from "@/lib/utils";

interface FacebookPageDialogProps {
  /** The pending-selection id the OAuth callback handed back. */
  selection: string;
  /** "Personal" or the brand's name — which context this Page will join. */
  contextLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the connection is stored. */
  onConnected: (displayName: string | null) => void;
  onError: (message: string) => void;
}

/**
 * Which Facebook Page should this context publish to?
 *
 * The only provider-specific dialog in Integrations, and it exists because
 * Facebook is the only network where finishing OAuth does not identify an
 * account: a member can manage any number of Pages, and only they know which
 * one this context is for. The backend parks the result of the exchange and
 * sends the browser here with a selection id.
 *
 * The list is fetched rather than passed through the URL for the obvious
 * reason — it is keyed to a server-side entry holding live tokens, and the only
 * thing that crosses the wire is a name, a picture and a Page id.
 *
 * One Page per context. Choosing a second one later replaces the first, which
 * the footnote says out loud rather than surprising someone with it.
 */
export function FacebookPageDialog({
  selection,
  contextLabel,
  open,
  onOpenChange,
  onConnected,
  onError,
}: FacebookPageDialogProps) {
  const [pages, setPages] = useState<FacebookPageChoice[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setPages(null);
    setChosen(null);

    void (async () => {
      try {
        const result = await integrationsService.fetchPendingPages(selection);
        if (cancelled) return;
        setPages(result);
        // Pre-select the first so the primary button is never a dead end, and
        // a member who just wants their only real Page can press it once.
        setChosen(result[0]?.id ?? null);
      } catch (error) {
        if (cancelled) return;
        // An expired selection is the common failure and it is recoverable by
        // pressing Connect again — the backend's message says so.
        onError(
          error instanceof Error
            ? error.message
            : "Could not load your Facebook Pages.",
        );
        onOpenChange(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `onError`/`onOpenChange` are stable callbacks from the page; including
    // them would re-run the fetch on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selection]);

  const handleConnect = async () => {
    if (!chosen) return;
    setConnecting(true);
    try {
      const { displayName } = await integrationsService.selectFacebookPage(
        selection,
        chosen,
      );
      onConnected(displayName);
      onOpenChange(false);
    } catch (error) {
      // The selection is single-use, so a failed attempt cannot be retried
      // from this dialog — say so and close rather than leaving a button that
      // will fail identically every time.
      onError(
        error instanceof Error
          ? error.message
          : "Could not connect that Facebook Page.",
      );
      onOpenChange(false);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !connecting && onOpenChange(next)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a Facebook Page</DialogTitle>
          <DialogDescription>
            You manage more than one Page. Pick the one {contextLabel} should
            publish to.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-2 overflow-y-auto py-1">
          {pages === null
            ? Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-lg" />
              ))
            : pages.map((page) => {
                const selected = chosen === page.id;
                return (
                  <button
                    key={page.id}
                    type="button"
                    disabled={connecting}
                    onClick={() => setChosen(page.id)}
                    aria-pressed={selected}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50",
                    )}
                  >
                    <Avatar className="h-9 w-9">
                      {page.profileImage && (
                        <AvatarImage src={page.profileImage} alt="" />
                      )}
                      <AvatarFallback>
                        {page.name.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {page.name}
                      </span>
                      {/* The username when the Page has one, the id when it
                          does not — the id is only ever a fallback, never the
                          headline. */}
                      <span className="block truncate text-xs text-muted-foreground">
                        {page.username ? `@${page.username}` : `ID ${page.id}`}
                      </span>
                    </span>
                    {selected && (
                      <Check
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-primary"
                      />
                    )}
                  </button>
                );
              })}
        </div>

        <p className="text-xs text-muted-foreground">
          FlowPost connects one Page per context. Connecting another Page later
          replaces this one.
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            disabled={connecting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={connecting || !chosen} onClick={handleConnect}>
            {connecting ? "Connecting…" : "Connect Page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
