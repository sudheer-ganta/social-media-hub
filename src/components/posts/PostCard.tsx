import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CalendarClock,
  Copy,
  ImageIcon,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDisplayDate, formatDisplayTime } from "@/utils/date";
import { truncate } from "@/utils/text";
import { PLATFORM_MAP } from "@/constants";
import type { Post } from "@/types";

interface PostCardProps {
  post: Post;
  onDelete: (post: Post) => void;
  onDuplicate: (post: Post) => void;
  onPublish: (post: Post) => void;
  onClick?: (post: Post) => void;
}

export function PostCard({ post, onDelete, onDuplicate, onPublish, onClick }: PostCardProps) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25 }}
      onClick={() => onClick?.(post)}
      className="group flex flex-col overflow-hidden rounded-lg border bg-card shadow-soft transition-shadow hover:shadow-elevated cursor-pointer"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-muted">
        {post.image_url ? (
          <img
            src={post.image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute left-3 top-3">
          <StatusBadge post={post} className="backdrop-blur-sm" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-semibold">{post.title}</h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon-sm"
                className="-mr-1 -mt-1 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                aria-label="Post actions"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={`/posts/${post.id}/edit`}>
                  <Pencil />
                  Edit
                </Link>
              </DropdownMenuItem>
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

        <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">
          {truncate(post.caption, 140) || "No caption yet."}
        </p>

        <div className="flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-1.5">
            {post.platforms.map((platform) => (
              <span
                key={platform}
                title={PLATFORM_MAP[platform]?.name ?? platform}
                className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground"
              >
                <PlatformIcon platform={platform} className="h-3 w-3" />
              </span>
            ))}
          </div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            {formatDisplayDate(post.publish_date)} ·{" "}
            {formatDisplayTime(post.publish_time)}
          </span>
        </div>
      </div>
    </motion.article>
  );
}
