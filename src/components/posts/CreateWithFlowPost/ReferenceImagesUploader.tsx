import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { cloudinaryService } from "@/services";

/**
 * "Show FlowPost what you like" — 2–6 reference/inspiration images, analysed
 * for visual LANGUAGE only (see reference-style.generator.ts server-side),
 * never treated as content to preserve. Deliberately its own small component
 * rather than a reuse of `MediaUploader`: that component owns `PostMediaItem`
 * order/crop/cover semantics built for post composition, a structurally
 * different concern from this flat, unordered reference set.
 */

export interface ReferenceImage {
  url: string;
  name: string;
  /** Optional, informational only — FlowPost infers the real role either way. */
  label?: string;
}

const LABELS = ["Inspiration", "Brand asset", "Product", "Previous campaign"] as const;

const MAX_REFERENCES = 6;

interface ReferenceImagesUploaderProps {
  images: ReferenceImage[];
  onChange: (images: ReferenceImage[]) => void;
  disabled?: boolean;
}

export function ReferenceImagesUploader({ images, onChange, disabled }: ReferenceImagesUploaderProps) {
  const [uploadingCount, setUploadingCount] = useState(0);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number | null>(null);

  const remaining = Math.max(0, MAX_REFERENCES - images.length);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const accepted = files.slice(0, remaining);
      if (accepted.length === 0) return;
      setUploadingCount((n) => n + accepted.length);
      const results = await Promise.allSettled(
        accepted.map(async (file) => {
          const uploaded = await cloudinaryService.uploadMedia(file);
          return { url: uploaded.url, name: file.name };
        }),
      );
      const succeeded = results
        .filter((r): r is PromiseFulfilledResult<ReferenceImage> => r.status === "fulfilled")
        .map((r) => r.value);
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        toast.error(failed === 1 ? "Couldn't attach one reference image" : `Couldn't attach ${failed} reference images`);
      }
      if (succeeded.length > 0) onChange([...images, ...succeeded]);
      setUploadingCount((n) => n - accepted.length);
    },
    [images, onChange, remaining],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    multiple: true,
    disabled: disabled || remaining === 0,
    onDrop: (accepted) => void uploadFiles(accepted),
  });

  function removeAt(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  function setLabelAt(index: number, label: string) {
    onChange(images.map((img, i) => (i === index ? { ...img, label: label || undefined } : img)));
  }

  function replaceAt(index: number, file: File) {
    setUploadingCount((n) => n + 1);
    cloudinaryService
      .uploadMedia(file)
      .then((uploaded) => {
        onChange(images.map((img, i) => (i === index ? { url: uploaded.url, name: file.name, label: img.label } : img)));
      })
      .catch(() => toast.error("Could not replace that image"))
      .finally(() => setUploadingCount((n) => n - 1));
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold">Show FlowPost what you like</Label>
      <p className="text-xs text-muted-foreground">
        Upload a few creatives, ads, or visuals you love. FlowPost learns the visual direction without copying the references.
      </p>

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 pt-1 sm:grid-cols-4">
          {images.map((img, i) => (
            <div key={img.url} className="space-y-1">
              <div className="group relative aspect-square overflow-hidden rounded-md border">
                <img src={img.url} alt={img.name} className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center gap-1 bg-background/0 opacity-0 transition-opacity group-hover:bg-background/60 group-hover:opacity-100">
                  <button
                    type="button"
                    className="rounded-full bg-background p-1 shadow-sm"
                    onClick={() => {
                      replaceIndexRef.current = i;
                      replaceInputRef.current?.click();
                    }}
                    aria-label="Replace image"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-background p-1 shadow-sm"
                    onClick={() => removeAt(i)}
                    aria-label="Remove image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <select
                value={img.label ?? ""}
                onChange={(e) => setLabelAt(i, e.target.value)}
                className="w-full rounded border bg-transparent px-1 py-0.5 text-[10px] text-muted-foreground"
              >
                <option value="">Auto</option>
                {LABELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <div
          {...getRootProps()}
          className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground transition-colors",
            isDragActive && "border-foreground bg-secondary",
            (disabled || uploadingCount > 0) && "pointer-events-none opacity-60",
          )}
        >
          <input {...getInputProps()} disabled={disabled} />
          {uploadingCount > 0 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {uploadingCount > 0
            ? "Uploading…"
            : images.length === 0
              ? "Drag & drop, or click to add 2–6 images"
              : `Add more (${remaining} left)`}
        </div>
      )}

      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const index = replaceIndexRef.current;
          if (file && index !== null) replaceAt(index, file);
          e.target.value = "";
          replaceIndexRef.current = null;
        }}
      />
    </div>
  );
}
