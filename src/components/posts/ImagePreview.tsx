import { motion } from "framer-motion";
import { ImageIcon, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImagePreviewProps {
  src: string;
  onReplace: () => void;
  onDelete: () => void;
  uploading?: boolean;
}

export function ImagePreview({
  src,
  onReplace,
  onDelete,
  uploading,
}: ImagePreviewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="group relative overflow-hidden rounded-lg border bg-muted"
    >
      <img
        src={src}
        alt="Post preview"
        className="aspect-[4/3] w-full object-cover"
      />

      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-medium shadow-elevated">
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            Uploading…
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <span className="flex items-center gap-1.5 text-xs font-medium text-white">
          <ImageIcon className="h-3.5 w-3.5" />
          Cover image
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onReplace}
            disabled={uploading}
          >
            <RefreshCw />
            Replace
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={onDelete}
            disabled={uploading}
          >
            <Trash2 />
            Delete
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
