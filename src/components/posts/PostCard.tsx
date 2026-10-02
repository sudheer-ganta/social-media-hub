import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Copy, Eye, ImageIcon, MoreHorizontal, Pencil, Send, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlatformBadge, stageDot } from "@/components/dashboard/parts";
import { WORKFLOW_META } from "@/constants";
import { formatDisplayDate, formatDisplayTime } from "@/utils/date";
import { truncate } from "@/utils/text";
import { getWorkflowStatus } from "@/utils/workflow";
import { cn } from "@/lib/utils";
import type { Post } from "@/types";

interface PostCardProps {
  post: Post;
  onDelete: (post: Post) => void;
  onDuplicate: (post: Post) => void;
  onPublish: (post: Post) => void;
  onClick?: (post: Post) => void;
}

/** Library card. Same surface as the dashboard's recent posts. Used inside a `.rd` page. */
export function PostCard({ post, onDelete, onDuplicate, onPublish, onClick }: PostCardProps) {
  const reduce = useReducedMotion();
  const stage = getWorkflowStatus(post);

  return (
    <motion.article
      layout
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3 }}
      onClick={() => onClick?.(post)}
      className="rd-panel group flex cursor-pointer flex-col overflow-hidden transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-20px_rgb(0_0_0/0.3)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-rl-soft">
        {post.image_url ? (
          <img
            src={post.image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="h-8 w-8 text-rl-accent-strong/50" strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute bottom-3 left-3 flex gap-1.5">
          {post.platforms.slice(0, 4).map((p) => (
            <PlatformBadge key={p} platform={p} size={30} />
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-[16.5px] font-semibold leading-tight tracking-[-0.03em]">
            {post.title || "Untitled"}
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                aria-label="Post actions"
                className="-mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-rl-muted opacity-0 transition-all hover:bg-rl-bg hover:text-rl-ink focus-visible:opacity-100 group-hover:opacity-100"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {post.status === "published" ? (
                <DropdownMenuItem asChild>
                  <Link to={`/posts/${post.id}/edit`}>
                    <Eye />
                    View Details
                  </Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem asChild>
                  <Link to={`/posts/${post.id}/edit`}>
                    <Pencil />
                    Edit
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onDuplicate(post)}>
                <Copy />
                Duplicate
              </DropdownMenuItem>
              {post.status !== "published" && (
                <DropdownMenuItem onClick={() => onPublish(post)}>
                  <Send />
                  Publish now
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(post)}
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="line-clamp-2 flex-1 text-[13.5px] leading-snug text-rl-muted">
          {truncate(post.caption, 140) || "No caption yet."}
        </p>

        <div className="mt-1 flex items-center justify-between gap-2 border-t border-rl-line pt-3 text-[12.5px] text-rl-muted">
          <span className="flex items-center gap-1.5 font-medium text-rl-ink">
            <span className={cn("h-1.5 w-1.5 rounded-full", stageDot(stage))} />
            {WORKFLOW_META[stage].label}
          </span>
          <span className="tabular-nums">
            {formatDisplayDate(post.publish_date)}, {formatDisplayTime(post.publish_time)}
          </span>
        </div>
      </div>
    </motion.article>
  );
}
