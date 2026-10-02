import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types";

const EASE = [0.2, 0.8, 0.2, 1] as const;

/** Entrance for each block on the page. Staggered by `index`, skipped under reduced motion. */
export function Rise({
  children,
  index = 0,
  className,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.05 + index * 0.07, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Title on the left, a quiet link on the right. */
export function PanelHeader({
  title,
  to,
  linkLabel,
  aside,
  className,
}: {
  title: string;
  to?: string;
  linkLabel?: string;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <h2 className="text-[22px] font-semibold leading-none tracking-[-0.04em]">{title}</h2>
      {aside}
      {to && linkLabel && (
        <Link
          to={to}
          className="group inline-flex items-center gap-1.5 text-[14px] font-medium transition-colors hover:text-rl-accent-strong"
        >
          {linkLabel}
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

/** Empty panel: says what belongs here and how to put something in it. */
export function PanelEmpty({
  title,
  body,
  to,
  action,
}: {
  title: string;
  body: string;
  to: string;
  action: string;
}) {
  return (
    <div className="flex flex-col items-start rounded-[14px] border border-dashed border-rl-line px-5 py-7">
      <p className="text-[15px] font-semibold tracking-[-0.02em]">{title}</p>
      <p className="mt-1 max-w-[34ch] text-[13px] leading-relaxed text-rl-muted">{body}</p>
      <Link
        to={to}
        className="mt-4 inline-flex h-9 items-center rounded-[10px] border border-rl-line px-3.5 text-[13px] font-semibold transition-colors hover:border-rl-ink"
      >
        {action}
      </Link>
    </div>
  );
}

/** Network identity colours. Fixed hexes so the white glyph stays legible in both themes. */
const PLATFORM_BG: Record<string, string> = {
  instagram: "#E1306C",
  linkedin: "#0A66C2",
  facebook: "#1877F2",
  x: "#111111",
  youtube: "#FF0000",
  threads: "#111111",
};

export function PlatformBadge({
  platform,
  size = 32,
  className,
}: {
  platform: Platform;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-[10px] text-white", className)}
      style={{ width: size, height: size, background: PLATFORM_BG[platform] ?? "#171717" }}
    >
      <PlatformIcon platform={platform} className="h-[52%] w-[52%]" />
    </span>
  );
}

const TONE: Record<string, string> = {
  published: "bg-success",
  partially_published: "bg-warning",
  failed: "bg-destructive",
  scheduled: "bg-rl-accent",
  publishing: "bg-rl-accent",
};

/** The semantic dot beside a post's stage. */
export function stageDot(stage: string): string {
  return TONE[stage] ?? "bg-rl-muted";
}
