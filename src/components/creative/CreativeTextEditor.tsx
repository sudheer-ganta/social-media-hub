import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { EditableText } from "@/components/posts/CreateWithFlowPost/EditableText";
import { EditableTextLine } from "@/components/posts/CreateWithFlowPost/EditableTextLine";
import { creativeService, type EditableTextField, type TextLineChange } from "@/services/creative.service";
import type { GeneratedAsset } from "@/types/creative";

/** What each editable line is called to the member. */
const TEXT_LINE_LABEL: Record<EditableTextField, string> = {
  headline: "Headline",
  supportingLine: "Supporting line",
  offerText: "Offer",
  eventBadge: "Event badge",
  brandMessage: "Brand message",
  cta: "Button text",
};

interface CreativeTextEditorProps {
  asset: GeneratedAsset;
  /** Called with the new version of the creative after a change. The previous one stays in history. */
  onAssetChange: (asset: GeneratedAsset) => void;
  /** Lets the host disable its own controls while a change is in flight. */
  onBusyChange?: (busy: boolean) => void;
  /** True while the host has something else running on this creative. */
  disabled?: boolean;
}

/**
 * Edits the text on a finished creative: wording, font, weight, size and colour
 * per line. Used wherever a creative can be opened, so it behaves the same in
 * the generator and in the creative history.
 *
 * Changes re-typeset the creative's saved layout over its saved picture: only
 * the lines touched change, nothing is regenerated, and a failure leaves the
 * creative exactly as it was. A creative made before that was possible falls
 * back to a redraw, which the hint on the line says.
 */
export function CreativeTextEditor({ asset, onAssetChange, onBusyChange, disabled }: CreativeTextEditorProps) {
  const [working, setWorking] = useState(false);
  const busy = working || Boolean(disabled);

  const editable = useQuery({
    queryKey: ["creative-editable-text", asset.id],
    queryFn: () => creativeService.fetchEditableText(asset.id),
    staleTime: Infinity,
    retry: false,
  });

  async function run(work: () => Promise<GeneratedAsset>, failure: string): Promise<boolean> {
    setWorking(true);
    onBusyChange?.(true);
    try {
      onAssetChange(await work());
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : failure);
      return false;
    } finally {
      setWorking(false);
      onBusyChange?.(false);
    }
  }

  const retype = (field: EditableTextField, change: TextLineChange) =>
    run(() => creativeService.retypeCreative(asset.id, { [field]: change }), "Could not change that text. Your creative is unchanged.");

  /** Older creatives cannot be re-typeset in place: fall back to a redraw with exactly that headline. */
  const redrawHeadline = (text: string) =>
    run(
      () =>
        creativeService.refineCreative(
          asset.id,
          `Change the headline text on the image to exactly "${text}". Keep the scene, composition, logo and every other element unchanged.`,
        ),
      "Refinement failed. Your previous creative is unchanged.",
    );

  const marketing = asset.creativeBrief.marketingCreative;

  return (
    <div className="space-y-2.5">
      {editable.isLoading ? (
        <div className="h-[74px] animate-pulse rounded-xl border bg-card" aria-hidden />
      ) : editable.data?.canEdit ? (
        editable.data.lines.map((line) => (
          <EditableTextLine
            key={`${asset.id}:${line.field}`}
            label={TEXT_LINE_LABEL[line.field]}
            line={line}
            fonts={editable.data.fonts ?? []}
            palette={editable.data.palette ?? []}
            busy={busy}
            onApply={(change) => retype(line.field, change)}
          />
        ))
      ) : asset.creativeBrief.headline ? (
        <EditableText
          label="Headline"
          value={asset.creativeBrief.headline}
          maxLength={120}
          hint="This creative was made before in-place editing, so Rally redraws it with your wording."
          busy={busy}
          onApply={redrawHeadline}
        />
      ) : null}

      {marketing?.brandMessage && !editable.data?.lines.some((line) => line.field === "brandMessage") && (
        <p className="text-xs text-muted-foreground">"{marketing.brandMessage}"</p>
      )}
    </div>
  );
}
