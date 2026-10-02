import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { loadFontPreviews, previewFontStack, previewWeight } from "@/lib/font-preview";
import type { EditableTextLine as LineData, FontOption, TextLineChange } from "@/services/creative.service";

interface EditableTextLineProps {
  /** What this line is, in the member's words: "Headline", "Button text". */
  label: string;
  line: LineData;
  fonts: FontOption[];
  palette: string[];
  /** True while any change to the creative is in flight. */
  busy: boolean;
  /** Resolves true when the creative now carries the change. */
  onApply: (change: TextLineChange) => Promise<boolean>;
}

const AUTO = "auto";
const SIZE_MIN = 60;
const SIZE_MAX = 180;

const WEIGHT_NAME: Record<number, string> = {
  100: "Thin",
  200: "Extra light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra bold",
  900: "Black",
};
const weightName = (weight: number) => `${WEIGHT_NAME[weight] ?? weight}`;

const CATEGORY_LABEL: Record<string, string> = {
  "sans-serif": "Sans serif",
  serif: "Serif",
  display: "Display",
  handwritten: "Handwriting",
  monospace: "Monospace",
};

/** Perceived brightness of a #rrggbb colour, to pick a readable tick mark. */
function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

const nearest = (weights: number[], target: number) =>
  weights.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), weights[0] ?? target);

/**
 * One line of the creative's text, editable in place: its wording, font, weight,
 * size and colour. Nothing here regenerates the picture; the server re-fits only
 * the text, so applying is quick and the scene cannot change.
 */
export function EditableTextLine({ label, line, fonts, palette, busy, onApply }: EditableTextLineProps) {
  const initialFamily = line.style.fontFamily ?? AUTO;
  const initialSize = Math.round(line.style.sizeScale * 100);

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(line.text);
  const [family, setFamily] = useState(initialFamily);
  const [weight, setWeight] = useState<number | null>(line.style.fontWeight ?? null);
  const [weightTouched, setWeightTouched] = useState(false);
  const [size, setSize] = useState(initialSize);
  const [color, setColor] = useState<string | null>(line.style.color ?? null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const textId = useId();
  const sizeId = useId();

  const reset = () => {
    setText(line.text);
    setFamily(initialFamily);
    setWeight(line.style.fontWeight ?? null);
    setWeightTouched(false);
    setSize(initialSize);
    setColor(line.style.color ?? null);
  };

  // A change returns a new asset with new values: follow it, unless mid-edit.
  useEffect(() => {
    if (!editing) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, editing]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const families = useMemo(() => {
    const allowed = new Set(line.fonts);
    const groups = new Map<string, FontOption[]>();
    for (const font of fonts) {
      if (!allowed.has(font.family)) continue;
      groups.set(font.category, [...(groups.get(font.category) ?? []), font]);
    }
    return [...groups.entries()];
  }, [fonts, line.fonts]);

  const familyDef = fonts.find((f) => f.family === (family === AUTO ? line.style.fontFamily : family));
  const weights = familyDef?.weights ?? [];

  // Show the chosen family in its own faces: every weight it has, so the weight menu and the preview are real.
  useEffect(() => {
    if (!editing || !familyDef) return;
    void loadFontPreviews(familyDef.weights.map((w) => ({ family: familyDef.family, weight: w, url: familyDef.files[w] })));
  }, [editing, familyDef]);

  // Opening the font menu loads one face per listed family, a few at a time; each file is fetched once per browser.
  function warmFontMenu(open: boolean) {
    if (!open) return;
    void loadFontPreviews(
      families.flatMap(([, items]) => items).map((font) => {
        const weight = previewWeight(font.weights);
        return { family: font.family, weight, url: font.files[weight] };
      }),
    );
  }

  function chooseFamily(next: string) {
    setFamily(next);
    // Keep the weight valid for the new family, showing the nearest one, until the member picks their own.
    const def = fonts.find((f) => f.family === next);
    if (def && !weightTouched && weight !== null) setWeight(nearest(def.weights, weight));
  }

  const trimmedText = text.replace(/\s+/g, " ").trim();
  const change: TextLineChange = {};
  if (trimmedText && trimmedText !== line.text) change.text = trimmedText;
  const style: NonNullable<TextLineChange["style"]> = {};
  if (family !== AUTO && family !== initialFamily) style.fontFamily = family;
  if (weightTouched && weight !== null && weight !== line.style.fontWeight) style.fontWeight = weight;
  if (size !== initialSize) style.sizeScale = size / 100;
  if (color && color !== line.style.color) style.color = color;
  if (Object.keys(style).length) change.style = style;
  const changed = Boolean(change.text || change.style);

  async function commit() {
    if (!changed || busy) return;
    if (await onApply(change)) setEditing(false);
  }

  function cancel() {
    reset();
    setEditing(false);
  }

  if (!editing) {
    const meta = [
      line.style.fontFamily ?? "Automatic font",
      line.style.fontWeight ? weightName(line.style.fontWeight) : null,
      `${initialSize}%`,
    ].filter(Boolean);
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
          {line.text}
          {"”"}
        </span>
        <span className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          {line.style.color && (
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: line.style.color }}
            />
          )}
          {meta.join(", ")}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-foreground/30 bg-card p-3.5 ring-2 ring-ring/30">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor={textId} className="font-medium text-muted-foreground">
            {label}
          </label>
          <span className="tabular-nums text-muted-foreground">
            {text.length}/{line.maxLength}
          </span>
        </div>
        <Textarea
          id={textId}
          ref={inputRef}
          value={text}
          rows={2}
          maxLength={line.maxLength}
          disabled={busy}
          onChange={(e) => setText(e.target.value.replace(/\n/g, " "))}
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
      </div>

      <div
        aria-hidden
        className={cn(
          "flex min-h-[72px] items-center overflow-hidden rounded-lg border px-4 py-3",
          color && isLight(color) ? "bg-foreground" : "bg-secondary/60",
        )}
      >
        <span
          className="block max-w-full break-words leading-tight"
          style={{
            fontFamily: previewFontStack(familyDef?.family ?? "", familyDef?.category),
            fontWeight: weight ?? undefined,
            fontSize: `${Math.round(22 * (size / 100))}px`,
            color: color ?? undefined,
          }}
        >
          {trimmedText || line.text}
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)] gap-3">
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Font</span>
          <Select value={family} onValueChange={chooseFamily} onOpenChange={warmFontMenu} disabled={busy}>
            <SelectTrigger className="h-9 bg-card text-sm" aria-label={`${label} font`}>
              <SelectValue placeholder="Automatic" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={AUTO} disabled={initialFamily !== AUTO}>
                Automatic
              </SelectItem>
              {families.map(([category, items]) => (
                <SelectGroup key={category}>
                  <SelectLabel>{CATEGORY_LABEL[category] ?? category}</SelectLabel>
                  {items.map((font) => (
                    <SelectItem key={font.family} value={font.family}>
                      <span
                        style={{
                          fontFamily: previewFontStack(font.family, font.category),
                          fontWeight: previewWeight(font.weights),
                          fontSize: "15px",
                        }}
                      >
                        {font.family}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Weight</span>
          <Select
            value={weight !== null && weights.includes(weight) ? String(weight) : undefined}
            onValueChange={(value) => {
              setWeight(Number(value));
              setWeightTouched(true);
            }}
            disabled={busy || weights.length === 0}
          >
            <SelectTrigger className="h-9 bg-card text-sm" aria-label={`${label} weight`}>
              <SelectValue placeholder="Automatic" />
            </SelectTrigger>
            <SelectContent>
              {weights.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  <span style={{ fontFamily: previewFontStack(familyDef?.family ?? "", familyDef?.category), fontWeight: w }}>
                    {weightName(w)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor={sizeId} className="font-medium text-muted-foreground">
            Size
          </label>
          <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
            {size}%
            {size !== 100 && (
              <button
                type="button"
                onClick={() => setSize(100)}
                disabled={busy}
                className="text-foreground underline-offset-2 hover:underline"
              >
                Auto
              </button>
            )}
          </span>
        </div>
        <input
          id={sizeId}
          type="range"
          min={SIZE_MIN}
          max={SIZE_MAX}
          step={5}
          value={size}
          disabled={busy}
          onChange={(e) => setSize(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Larger sizes stop where they would touch other text, the logo or the edge.
        </p>
      </div>

      {palette.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Colour</span>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={`${label} colour`}>
            {palette.map((swatch) => {
              const selected = color === swatch;
              return (
                <button
                  key={swatch}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={swatch}
                  disabled={busy}
                  onClick={() => setColor(swatch)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border border-border transition-shadow",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
                  )}
                  style={{ backgroundColor: swatch }}
                >
                  {selected && (
                    <Check
                      className="h-3.5 w-3.5"
                      strokeWidth={3}
                      style={{ color: isLight(swatch) ? "#111111" : "#ffffff" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-xs leading-relaxed text-muted-foreground">Only the text changes. The picture stays as it is.</p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" size="sm" loading={busy} disabled={!changed} onClick={() => void commit()}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
