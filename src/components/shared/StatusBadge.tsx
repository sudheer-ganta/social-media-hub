import { WORKFLOW_META } from "@/constants";
import { getWorkflowStatus } from "@/utils/workflow";
import { cn } from "@/lib/utils";
import type { Post } from "@/types";

interface StatusBadgeProps {
  post: Post;
  className?: string;
}

/** Shows the post's derived pipeline stage (Draft → … → Published/Failed). */
export function StatusBadge({ post, className }: StatusBadgeProps) {
  const meta = WORKFLOW_META[getWorkflowStatus(post)];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        meta.className,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dotClassName)} />
      {meta.label}
    </span>
  );
}
