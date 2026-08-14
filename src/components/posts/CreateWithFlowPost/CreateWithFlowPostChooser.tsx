import { useState } from "react";
import { Sparkles, Upload, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreateWithFlowPostDialog } from "./CreateWithFlowPostDialog";
import type { PostMediaItem } from "@/types";

/**
 * "How do you want to create?" — shown once, above the media step, before
 * anything has been added. Upload and Manual are the composer's existing
 * behaviour and are not changed by this component; picking either simply
 * dismisses this chooser and reveals the uploader that was always there.
 * Create with FlowPost is the only genuinely new path.
 */

interface CreateWithFlowPostChooserProps {
  contextType: "personal" | "brand";
  brandId?: string;
  onUseInPost: (item: PostMediaItem) => void;
}

const OPTIONS = [
  { id: "flowpost", icon: Sparkles, label: "Create with FlowPost", hint: "AI, tuned to your brand" },
  { id: "upload", icon: Upload, label: "Upload your content", hint: "Your own photo or video" },
  { id: "manual", icon: PenLine, label: "Create manually", hint: "Start from scratch" },
] as const;

export function CreateWithFlowPostChooser({ contextType, brandId, onUseInPost }: CreateWithFlowPostChooserProps) {
  const [dismissed, setDismissed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (dismissed) return null;

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <p className="text-sm font-semibold">How do you want to create?</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {OPTIONS.map(({ id, icon: Icon, label, hint }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (id === "flowpost") {
                setDialogOpen(true);
              } else {
                setDismissed(true);
              }
            }}
            className={cn(
              "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
              "hover:bg-accent hover:border-accent-foreground/20",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="text-xs font-semibold">{label}</span>
            <span className="text-[11px] text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>

      <CreateWithFlowPostDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contextType={contextType}
        brandId={brandId}
        onUseInPost={(item) => {
          onUseInPost(item);
          setDismissed(true);
        }}
      />
    </div>
  );
}
