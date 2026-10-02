import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface EditableHeadlineProps {
  /** The headline currently on the creative. */
  value: string;
  /** True while any refinement is in flight. */
  busy: boolean;
  /** Resolves true when the creative was redrawn with the new text. */
  onApply: (text: string) => Promise<boolean>;
}

const MAX_LENGTH = 120;

/**
 * The headline on the creative, editable in place: click it, type your own
 * wording, press Enter. The creative is then redrawn with exactly that text
 * (the scene, logo and layout stay as they are), so the member never has to
 * know there is a "refine" step behind it.
 */
export function EditableHeadline({ value, busy, onApply }: EditableHeadlineProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // A redraw returns a new asset with a new headline: follow it.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const trimmed = draft.trim();
  const changed = trimmed.length > 0 && trimmed !== value.trim();

  async function commit() {
    if (!changed || busy) return;
    if (await onApply(trimmed)) setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={busy}
        aria-label="Edit headline"
        className={cn(
          "group w-full rounded-xl border bg-card p-3.5 text-left transition-colors",
          "hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          Headline on the image
          <span className="flex items-center gap-1 text-muted-foreground transition-colors group-hover:text-foreground">
            <Pencil className="h-3 w-3" />
            Edit
          </span>
        </span>
        <span className="mt-1 block break-words text-sm font-medium text-foreground">
          {"“"}
          {value}
          {"”"}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-foreground/30 bg-card p-3.5 ring-2 ring-ring/30">
      <label htmlFor="creative-headline" className="text-xs font-medium text-muted-foreground">
        Headline on the image
      </label>
      <Textarea
        id="creative-headline"
        ref={inputRef}
        value={draft}
        rows={2}
        maxLength={MAX_LENGTH}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value.replace(/\n/g, " "))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className="min-h-0 resize-none bg-card text-sm font-medium"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Rally redraws the creative with your wording. Enter to apply.
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" size="sm" loading={busy} disabled={!changed} onClick={() => void commit()}>
            Update text
          </Button>
        </div>
      </div>
    </div>
  );
}
