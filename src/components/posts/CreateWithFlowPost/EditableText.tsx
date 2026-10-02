import { useEffect, useId, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface EditableTextProps {
  /** What this line is, in the member's words: "Headline", "Button text". */
  label: string;
  /** The wording currently on the creative. */
  value: string;
  maxLength: number;
  /** One sentence on what applying does, shown while editing. */
  hint: string;
  /** True while any change to the creative is in flight. */
  busy: boolean;
  /** Resolves true when the creative now carries the new wording. */
  onApply: (text: string) => Promise<boolean>;
}

/**
 * A line of the creative's text, editable in place: click it, type your own
 * wording, press Enter. Escape or Cancel puts the original back.
 */
export function EditableText({ label, value, maxLength, hint, busy, onApply }: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();

  // A change returns a new asset with new wording: follow it.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const trimmed = draft.replace(/\s+/g, " ").trim();
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
        aria-label={`Edit ${label.toLowerCase()}`}
        className={cn(
          "group w-full rounded-xl border bg-card p-3.5 text-left transition-colors",
          "hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          {label}
          <span className="flex items-center gap-1 transition-colors group-hover:text-foreground">
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
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={inputId} className="font-medium text-muted-foreground">
          {label}
        </label>
        <span className="tabular-nums text-muted-foreground">
          {draft.length}/{maxLength}
        </span>
      </div>
      <Textarea
        id={inputId}
        ref={inputRef}
        value={draft}
        rows={2}
        maxLength={maxLength}
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
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
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
