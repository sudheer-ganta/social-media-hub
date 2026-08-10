import { useCallback, useRef, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  GripHorizontal,
  ImageIcon,
  ImagePlus,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cloudinaryService } from "@/services";
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_SIZE_BYTES } from "@/constants";
import { reorderMedia } from "@/utils/media";
import { cn } from "@/lib/utils";
import type { PostMediaItem } from "@/types";

/**
 * The composer's media rail: upload, order, select, remove.
 *
 * ─── What this owns, and what it does not ────────────────────────────────────
 * It owns the *list* — which images are attached and in what order — and the
 * uploads that add to it. It does not own framing: a crop belongs to an item
 * and is edited in the format panel, which is why nothing here reads or writes
 * `item.crop` except to carry it through a reorder untouched.
 *
 * ─── Ordering ────────────────────────────────────────────────────────────────
 * Array position is the order, and the array is what gets published. A drag
 * moves the item in the array immediately, so the thumbnails, the preview and
 * the publish payload cannot disagree about what comes first — there is only
 * one place the answer is written down.
 *
 * Native HTML5 drag and drop rather than a library: the whole interaction is
 * "pick a tile up, drop it on another", the browser already implements it, and
 * it comes with keyboard-independent semantics we would otherwise reimplement.
 * Keyboard reordering is provided separately, below, because native DnD offers
 * a keyboard user nothing.
 */

interface MediaUploaderProps {
  items: PostMediaItem[];
  onChange: (items: PostMediaItem[]) => void;
  /** Index of the item being edited, or -1 when the list is empty. */
  selected: number;
  onSelect: (index: number) => void;
  /**
   * The largest number of images any selected network accepts.
   *
   * Read from the API by the composer, never assumed here. Reaching it hides
   * "Add more" rather than letting someone attach images that could only fail
   * at publish time.
   */
  maxItems: number;
}

/** One in-flight upload. Rendered as a placeholder tile in the rail. */
interface PendingUpload {
  id: string;
  name: string;
  /** 0–100, or null once the upload has failed. */
  progress: number | null;
  error: string | null;
}

/**
 * The file's own decoded dimensions.
 *
 * Read from the browser rather than asked of Cloudinary: it is one fewer
 * request and it is the same two numbers. Resolves to zeroes if the decode
 * fails, which the rest of the composer treats as "unmeasured" and falls back
 * to a square aspect for — a wrong-looking preview, never a broken one.
 */
function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

function rejectionMessage(rejection: FileRejection): string {
  const code = rejection.errors[0]?.code;
  return code === "file-too-large"
    ? `${rejection.file.name} is over 20MB.`
    : `${rejection.file.name} is not a PNG, JPG or WEBP.`;
}

export function MediaUploader({
  items,
  onChange,
  selected,
  onSelect,
  maxItems,
}: MediaUploaderProps) {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  /**
   * The list as it stands *right now*.
   *
   * Uploads resolve one after another and each one appends to the list, so a
   * handler that closed over `items` would drop every image but the last. The
   * ref is what makes concurrent uploads add up rather than overwrite.
   */
  const latest = useRef(items);
  latest.current = items;

  const remaining = Math.max(0, maxItems - items.length - pending.length);

  const handleDrop = useCallback(
    async (accepted: File[], rejections: FileRejection[]) => {
      for (const rejection of rejections) {
        toast.error(rejectionMessage(rejection));
      }

      // Anything past the ceiling is refused here, with the reason, rather than
      // uploaded and rejected at publish time.
      const room = Math.max(
        0,
        maxItems - latest.current.length - pending.length,
      );
      const files = accepted.slice(0, room);
      if (accepted.length > room) {
        toast.error(
          room === 0
            ? `This post already has the ${maxItems} images your networks accept.`
            : `Only ${room} more ${room === 1 ? "image fits" : "images fit"} on this post.`,
        );
      }
      if (files.length === 0) return;

      await Promise.all(
        files.map(async (file) => {
          const id = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
          setPending((current) => [
            ...current,
            { id, name: file.name, progress: 0, error: null },
          ]);

          const setProgress = (progress: number) =>
            setPending((current) =>
              current.map((entry) =>
                entry.id === id ? { ...entry, progress } : entry,
              ),
            );

          try {
            const [{ url }, dimensions] = await Promise.all([
              cloudinaryService.uploadImage(file, setProgress),
              readDimensions(file),
            ]);

            onChange([
              ...latest.current,
              {
                id,
                url,
                type: "image",
                width: dimensions.width,
                height: dimensions.height,
                // Unframed on arrival. The format panel is where a crop is
                // chosen, and "no crop" is a real answer — it publishes the
                // picture at the shape it was uploaded.
                crop: null,
              },
            ]);
            setPending((current) => current.filter((entry) => entry.id !== id));
          } catch (error) {
            // Left in the rail as a failed tile rather than vanishing: an
            // upload that disappears looks like one that worked.
            setPending((current) =>
              current.map((entry) =>
                entry.id === id
                  ? {
                      ...entry,
                      progress: null,
                      error:
                        error instanceof Error ? error.message : "Upload failed",
                    }
                  : entry,
              ),
            );
            toast.error(`${file.name} could not be uploaded.`);
          }
        }),
      );
    },
    [maxItems, onChange, pending.length],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleDrop,
    accept: ACCEPTED_IMAGE_TYPES,
    maxSize: MAX_IMAGE_SIZE_BYTES,
    multiple: true,
    disabled: remaining === 0,
    // With images on screen the tiles are the click targets; a click anywhere
    // in the rail opening a file dialog would fight every other control.
    noClick: items.length > 0,
    noKeyboard: items.length > 0,
  });

  const removeAt = (index: number) => {
    const item = items[index];
    onChange(items.filter((_, at) => at !== index));
    // Best-effort, and only for assets uploaded in this session — see the
    // service. An orphan costs storage, never correctness.
    cloudinaryService.deleteImage(item.url);
    // Keep a valid selection: the item that took its place, or the new last.
    onSelect(Math.min(index, items.length - 2));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    onChange(reorderMedia(items, from, to));
    // The selection follows the picture, not the position — dragging the item
    // you are editing must not switch you to editing a different one.
    if (selected === from) onSelect(to);
    else if (selected === to) onSelect(from > to ? to + 1 : to - 1);
  };

  // ── Empty ────────────────────────────────────────────────────────────────
  if (items.length === 0 && pending.length === 0) {
    return (
      <div {...getRootProps({ className: "outline-none" })}>
        <input {...getInputProps()} />
        <button
          type="button"
          onClick={open}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-muted/30 px-6 py-12 text-center transition-colors",
            isDragActive
              ? "border-primary bg-accent"
              : "hover:border-primary/50 hover:bg-accent/40",
          )}
        >
          <motion.span
            animate={isDragActive ? { scale: 1.12, rotate: 3 } : { scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-2xl transition-colors",
              isDragActive
                ? "bg-primary text-primary-foreground shadow-glow"
                : "bg-accent text-accent-foreground",
            )}
          >
            <ImagePlus className="h-7 w-7" />
          </motion.span>
          <span>
            <span className="block text-sm font-semibold">
              {isDragActive ? "Drop them here" : "Add media"}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Drag &amp; drop files here or click to browse
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              PNG, JPG, WEBP up to 20MB each
            </span>
          </span>
        </button>
      </div>
    );
  }

  // ── The rail ─────────────────────────────────────────────────────────────
  return (
    <div {...getRootProps({ className: "space-y-2 outline-none" })}>
      <input {...getInputProps()} />

      <div
        role="listbox"
        aria-label="Attached media"
        aria-orientation="horizontal"
        // Scrolls rather than wraps, and the negative margin lets tiles reach
        // the card's edge while their focus rings stay visible.
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2"
      >
        <AnimatePresence initial={false}>
          {items.map((item, index) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragOver={(event) => {
                // Without this the drop never fires — the default is "reject".
                event.preventDefault();
                if (dragIndex !== null && dragIndex !== index) {
                  setOverIndex(index);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragIndex !== null) move(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={cn(
                "group relative h-28 w-24 shrink-0 cursor-grab overflow-hidden rounded-lg border-2 bg-muted transition-all active:cursor-grabbing",
                selected === index
                  ? "border-primary shadow-glow"
                  : "border-transparent hover:border-border",
                overIndex === index && "ring-2 ring-primary/60",
                dragIndex === index && "opacity-50",
              )}
            >
              <button
                type="button"
                role="option"
                aria-selected={selected === index}
                aria-label={`Media ${index + 1}`}
                onClick={() => onSelect(index)}
                onKeyDown={(event) => {
                  // The keyboard route to the same reorder. Native drag and
                  // drop gives a keyboard user nothing at all, and ordering is
                  // not a decorative capability — it decides what a follower
                  // sees first.
                  if (event.altKey && event.key === "ArrowLeft") {
                    event.preventDefault();
                    move(index, index - 1);
                  }
                  if (event.altKey && event.key === "ArrowRight") {
                    event.preventDefault();
                    move(index, index + 1);
                  }
                }}
                className="block h-full w-full focus-visible:outline-none"
              >
                <img
                  src={item.url}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              </button>

              <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                {index + 1}
              </span>

              {selected === index && (
                <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}

              {/* Says what the tile is. One kind today; the badge is here so a
                  video's play indicator has an obvious home later. */}
              <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/65 p-1 text-white">
                <ImageIcon className="h-3 w-3" />
              </span>

              <button
                type="button"
                aria-label={`Remove media ${index + 1}`}
                onClick={() => removeAt(index)}
                className="absolute bottom-1.5 right-1.5 rounded bg-black/65 p-1 text-white opacity-0 transition-opacity hover:bg-destructive focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {pending.map((upload) => (
          <div
            key={upload.id}
            className={cn(
              "flex h-28 w-24 shrink-0 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-2 text-center",
              upload.error ? "border-destructive/50" : "border-border",
            )}
          >
            {upload.error ? (
              <>
                <AlertCircle className="h-5 w-5 text-destructive" />
                <span className="text-[10px] leading-tight text-muted-foreground">
                  Upload failed
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPending((current) =>
                      current.filter((entry) => entry.id !== upload.id),
                    )
                  }
                  className="text-[10px] font-medium text-primary hover:underline"
                >
                  Dismiss
                </button>
              </>
            ) : (
              <>
                <span className="text-[10px] font-semibold tabular-nums">
                  {upload.progress}%
                </span>
                <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <motion.span
                    className="block h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${upload.progress}%` }}
                    transition={{ ease: "easeOut", duration: 0.2 }}
                  />
                </span>
                <span className="w-full truncate text-[10px] text-muted-foreground">
                  {upload.name}
                </span>
              </>
            )}
          </div>
        ))}

        {remaining > 0 && (
          <button
            type="button"
            onClick={open}
            className={cn(
              "flex h-28 w-24 shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-muted-foreground transition-colors",
              isDragActive
                ? "border-primary bg-accent text-foreground"
                : "hover:border-primary/50 hover:bg-accent/40 hover:text-foreground",
            )}
          >
            <Plus className="h-5 w-5" />
            <span className="text-[11px] font-medium">Add more</span>
          </button>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <GripHorizontal className="h-3.5 w-3.5" />
        Drag to reorder — or focus a tile and press Alt + ← / →
      </p>
    </div>
  );
}
