import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Integration } from "@/constants/integrations";

interface DisconnectDialogProps {
  integration: Integration;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rejects on failure; the dialog stays open so the member can retry. */
  onConfirm: () => Promise<void>;
}

/**
 * Confirmation before disconnecting a network.
 *
 * The dialog exists to answer the question a member actually has, which is
 * never "are you sure?" — it is "what am I about to lose?". So it states both
 * halves plainly: posts survive, publishing stops. Guessing at that is what
 * makes people avoid the button and leave dead connections in place.
 *
 * Stays open on failure. Closing on error would leave someone believing a
 * disconnect happened when the tokens are still stored.
 */
export function DisconnectDialog({
  integration,
  open,
  onOpenChange,
  onConfirm,
}: DisconnectDialogProps) {
  const [working, setWorking] = useState(false);
  const account = integration.account;

  const handleConfirm = async () => {
    setWorking(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The caller has already surfaced the reason as a toast; leaving the
      // dialog open is what tells the member nothing has changed yet.
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog
      open={open}
      // A dismissal mid-request would strand the spinner, so the dialog is
      // modal in the real sense while the disconnect is in flight.
      onOpenChange={(next) => !working && onOpenChange(next)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 text-red-500" />
          </div>
          <DialogTitle>Disconnect {integration.displayName}?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1">
              <p>
                {account?.displayName
                  ? `${account.displayName} will be removed from FlowPost.`
                  : `This ${integration.displayName} account will be removed from FlowPost.`}
              </p>
              <ul className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
                <li className="flex gap-2">
                  <span aria-hidden="true" className="text-emerald-500">
                    ✓
                  </span>
                  <span>
                    You won't lose any posts — drafts, scheduled and published
                    posts all stay.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span aria-hidden="true" className="text-amber-500">
                    !
                  </span>
                  <span>
                    Publishing to {integration.displayName} will stop
                    immediately.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span aria-hidden="true" className="text-muted-foreground">
                    ↻
                  </span>
                  <span>
                    You can reconnect at any time — it takes a few seconds.
                  </span>
                </li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            disabled={working}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {/* Destructive styling on the confirm, and Cancel first in the DOM so
              the safe action is what a keyboard lands on. */}
          <Button
            variant="destructive"
            disabled={working}
            onClick={handleConfirm}
          >
            {working ? "Disconnecting…" : "Disconnect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
