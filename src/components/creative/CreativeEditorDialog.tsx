import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreativeTextEditor } from "@/components/creative/CreativeTextEditor";
import type { GeneratedAsset } from "@/types/creative";

interface CreativeEditorDialogProps {
  /** The creative to open, or null when closed. */
  asset: GeneratedAsset | null;
  onOpenChange: (open: boolean) => void;
  /** A change produced a new version: the host adds it to its list. The dialog follows it. */
  onVersionCreated: (asset: GeneratedAsset) => void;
  onUseInPost: (asset: GeneratedAsset) => void;
}

/**
 * A creative from the history, opened for editing: the picture beside its text
 * lines, each editable in place (wording, font, weight, size, colour). Every
 * change makes a new version and the dialog moves to it; the version you opened
 * stays in the history untouched.
 */
export function CreativeEditorDialog({ asset, onOpenChange, onVersionCreated, onUseInPost }: CreativeEditorDialogProps) {
  const [current, setCurrent] = useState<GeneratedAsset | null>(asset);
  const [busy, setBusy] = useState(false);

  useEffect(() => setCurrent(asset), [asset]);

  const shown = current ?? asset;

  return (
    <Dialog open={Boolean(asset)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col gap-0 overflow-hidden bg-background p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 space-y-0.5 border-b px-6 py-4 pr-14 text-left">
          <DialogTitle className="font-display text-base leading-tight">
            {shown?.creativeBrief.concept ?? "Creative"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-snug">
            Click a line to change its wording, font, size or colour. Only the text changes; the picture stays as it is.
          </DialogDescription>
        </DialogHeader>

        {shown && (
          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="md:sticky md:top-0 md:self-start">
              {shown.imageUrl && (
                <div className="overflow-hidden rounded-xl border bg-secondary/50 shadow-sm">
                  <img
                    src={shown.imageUrl}
                    alt={shown.creativeBrief.concept ?? "Creative"}
                    className="max-h-[68dvh] w-full object-contain"
                  />
                </div>
              )}
            </div>

            <CreativeTextEditor
              key={shown.id}
              asset={shown}
              disabled={busy}
              onBusyChange={setBusy}
              onAssetChange={(next) => {
                setCurrent(next);
                onVersionCreated(next);
              }}
            />
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-background px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Close
          </Button>
          <Button onClick={() => shown && onUseInPost(shown)} disabled={busy || !shown?.imageUrl}>
            Use in a new post
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
