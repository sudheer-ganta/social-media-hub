import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { AnimatePresence, motion } from "framer-motion";
import { CloudUpload, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { ImagePreview } from "./ImagePreview";
import { cloudinaryService } from "@/services";
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_SIZE_BYTES } from "@/constants";
import { cn } from "@/lib/utils";

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
}

export function ImageUploader({ value, onChange }: ImageUploaderProps) {
  const [progress, setProgress] = useState<number | null>(null);
  const uploading = progress !== null;

  const handleDrop = useCallback(
    async (accepted: File[], rejections: FileRejection[]) => {
      if (rejections.length > 0) {
        const code = rejections[0].errors[0]?.code;
        toast.error(
          code === "file-too-large"
            ? "Image is too large — maximum size is 20MB."
            : "Unsupported file — use PNG, JPG or WEBP.",
        );
        return;
      }
      const file = accepted[0];
      if (!file) return;

      const previousUrl = value;
      setProgress(0);
      try {
        const { url } = await cloudinaryService.uploadImage(file, setProgress);
        onChange(url);
        toast.success("Image uploaded");
        if (previousUrl && previousUrl !== url) {
          // Replacing: clean up the old asset (best-effort).
          cloudinaryService.deleteImage(previousUrl);
        }
      } catch (error) {
        toast.error("Upload failed", {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setProgress(null);
      }
    },
    [value, onChange],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleDrop,
    accept: ACCEPTED_IMAGE_TYPES,
    maxSize: MAX_IMAGE_SIZE_BYTES,
    multiple: false,
    disabled: uploading,
    noClick: Boolean(value),
    noKeyboard: Boolean(value),
  });

  const handleDelete = useCallback(() => {
    const url = value;
    onChange("");
    cloudinaryService.deleteImage(url);
  }, [value, onChange]);

  return (
    <div {...getRootProps({ className: "outline-none" })}>
      <input {...getInputProps()} />
      <AnimatePresence mode="wait" initial={false}>
        {value && !uploading ? (
          <ImagePreview
            key="preview"
            src={value}
            onReplace={open}
            onDelete={handleDelete}
          />
        ) : (
          <motion.button
            key="dropzone"
            type="button"
            onClick={open}
            disabled={uploading}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "relative flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border-2 border-dashed bg-muted/40 p-8 text-center transition-colors duration-200",
              isDragActive
                ? "border-primary bg-accent"
                : "hover:border-primary/50 hover:bg-accent/50",
              uploading && "cursor-default",
            )}
          >
            <motion.div
              animate={
                isDragActive
                  ? { scale: 1.15, rotate: 3 }
                  : uploading
                    ? { y: [0, -6, 0] }
                    : { scale: 1, rotate: 0 }
              }
              transition={
                uploading
                  ? { repeat: Infinity, duration: 0.9 }
                  : { type: "spring", stiffness: 300, damping: 20 }
              }
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-2xl transition-colors",
                isDragActive || uploading
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "bg-accent text-accent-foreground",
              )}
            >
              {uploading ? (
                <CloudUpload className="h-7 w-7" />
              ) : (
                <ImagePlus className="h-7 w-7" />
              )}
            </motion.div>

            {uploading ? (
              <div className="w-full max-w-xs">
                <p className="text-sm font-semibold">
                  Uploading… {progress}%
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ ease: "easeOut", duration: 0.2 }}
                  />
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm font-semibold">
                  {isDragActive ? "Drop it here" : "Drag & drop an image"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  or click to browse · PNG, JPG, WEBP · up to 20MB
                </p>
              </div>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
