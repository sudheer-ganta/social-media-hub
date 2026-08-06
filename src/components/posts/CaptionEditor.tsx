import { useRef, useState } from "react";
import { Check, Copy, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAutoResize } from "@/hooks/useAutoResize";
import { countWords, estimateReadingTime } from "@/utils/text";
import { EMOJIS } from "@/utils/constants";
import { cn } from "@/lib/utils";

interface CaptionEditorProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
}

export function CaptionEditor({
  value,
  onChange,
  maxLength = 3000,
  placeholder = "Write something worth sharing…",
}: CaptionEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  useAutoResize(textareaRef, value);

  const words = countWords(value);
  const readingTime = estimateReadingTime(value);
  const nearLimit = value.length > maxLength * 0.9;

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      onChange(value + emoji);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + emoji.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (permissions) — nothing actionable.
    }
  };

  return (
    <div className="rounded-lg border bg-card shadow-soft transition-shadow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background">
      <textarea
        ref={textareaRef}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[220px] w-full resize-none rounded-t-lg bg-transparent px-4 py-3.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Insert emoji"
              >
                <Smile />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
              <div className="grid grid-cols-8 gap-0.5">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insertEmoji(emoji)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-base transition-transform hover:scale-125 hover:bg-accent"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={copyCaption}
            disabled={!value}
            aria-label="Copy caption"
          >
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{words} {words === 1 ? "word" : "words"}</span>
          <span aria-hidden="true">·</span>
          <span>{readingTime} read</span>
          <span aria-hidden="true">·</span>
          <span
            className={cn(
              "tabular-nums",
              nearLimit && "font-semibold text-warning",
            )}
          >
            {value.length.toLocaleString()}/{maxLength.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
