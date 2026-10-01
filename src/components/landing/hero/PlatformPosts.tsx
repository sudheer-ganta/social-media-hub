import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Bookmark,
  ChartNoAxesColumn,
  Globe,
  Heart,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Play,
  Repeat2,
  Send,
  Share2,
  ThumbsUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SWATCHES, type PostPlatform, type StyleName } from "../data";
import { EASE } from "../primitives";

/**
 * Posts as each network actually presents them, for a placeholder account.
 * `instant` skips the "develop" reveal for places that show them at rest.
 */
export interface PostProps {
  text: string;
  photo: string;
  style: StyleName;
  swatch: number;
  instant?: boolean;
  className?: string;
}

const IMAGE_LOOK: Record<StyleName, string> = {
  Editorial: "contrast-[1.08] saturate-[0.9]",
  Minimal: "saturate-[0.7] brightness-[1.05]",
  Warm: "sepia-[0.3] saturate-[1.15]",
};

function accentStyle(swatch: number): CSSProperties {
  return { textDecorationColor: SWATCHES[swatch].value };
}

function Avatar({ round = true, size = 24 }: { round?: boolean; size?: number }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-rl-ink font-bold text-rl-surface",
        round ? "rounded-full" : "rounded-[5px]",
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      B
    </span>
  );
}

/**
 * The generation moment: the photo is revealed from the bottom up while it
 * resolves from blur to sharp, as if it were being rendered.
 */
function DevelopImage({
  src,
  style,
  instant,
  className,
}: {
  src: string;
  style: StyleName;
  instant?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const skip = instant || reduce;
  return (
    <div className={cn("relative overflow-hidden bg-rl-line/60", className)}>
      <motion.img
        src={src}
        alt=""
        loading="lazy"
        className={cn("h-full w-full object-cover", IMAGE_LOOK[style])}
        initial={skip ? false : { clipPath: "inset(100% 0% 0% 0%)", filter: "blur(14px)", scale: 1.12 }}
        animate={{ clipPath: "inset(0% 0% 0% 0%)", filter: "blur(0px)", scale: 1 }}
        transition={{ duration: 1.05, delay: 0.45, ease: EASE }}
      />
    </div>
  );
}

/** Copy settles in after the image has started to resolve. */
function Rise({ children, delay = 0.9, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

const shell = "rl-card rl-card-hover flex h-full flex-col overflow-hidden";

export function InstagramPost({ text, photo, style, swatch, instant, className }: PostProps) {
  return (
    <div className={cn(shell, className)}>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <Avatar />
        <span className="text-[11px] font-semibold">yourbrand</span>
        <MoreHorizontal className="ml-auto h-3.5 w-3.5 text-rl-muted" aria-hidden="true" />
      </div>
      <DevelopImage src={photo} style={style} instant={instant} className="min-h-0 flex-1" />
      <Rise delay={instant ? 0 : 0.9}>
        <div className="flex items-center gap-2.5 px-2.5 pt-2 text-rl-ink">
          <Heart className="h-[15px] w-[15px]" aria-hidden="true" />
          <MessageCircle className="h-[15px] w-[15px]" aria-hidden="true" />
          <Send className="h-[15px] w-[15px]" aria-hidden="true" />
          <Bookmark className="ml-auto h-[15px] w-[15px]" aria-hidden="true" />
        </div>
        <p className="line-clamp-3 px-2.5 pb-2.5 pt-1.5 text-[10.5px] leading-[1.35]">
          <span className="font-semibold">yourbrand</span> {text}{" "}
          <span className="underline decoration-2 underline-offset-2" style={accentStyle(swatch)}>
            Link in bio
          </span>
        </p>
      </Rise>
    </div>
  );
}

export function LinkedInPost({ text, photo, style, swatch, instant, className }: PostProps) {
  return (
    <div className={cn(shell, className)}>
      <div className="flex items-center gap-2 px-3 pb-1.5 pt-2.5">
        <Avatar round={false} size={30} />
        <p className="leading-tight">
          <span className="block text-[11px] font-semibold">Your Brand</span>
          <span className="block text-[9px] text-rl-muted">Company page</span>
        </p>
      </div>
      <Rise delay={instant ? 0 : 0.7}>
        <p className="line-clamp-3 px-3 pb-2 text-[10.5px] leading-[1.35]">
          {text}{" "}
          <span className="font-semibold underline decoration-2 underline-offset-2" style={accentStyle(swatch)}>
            Learn more
          </span>
        </p>
      </Rise>
      <DevelopImage src={photo} style={style} instant={instant} className="min-h-0 flex-1" />
      <div className="flex items-center justify-between px-3 py-2 text-[9px] text-rl-muted">
        {[
          [ThumbsUp, "Like"],
          [MessageSquare, "Comment"],
          [Repeat2, "Repost"],
          [Send, "Send"],
        ].map(([Icon, label]) => {
          const I = Icon as typeof ThumbsUp;
          return (
            <span key={label as string} className="inline-flex items-center gap-1">
              <I className="h-3 w-3" aria-hidden="true" />
              {label as string}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function XPost({ text, photo, style, swatch, instant, className }: PostProps) {
  return (
    <div className={cn(shell, className)}>
      <div className="flex gap-2 px-3 pt-2.5">
        <Avatar size={26} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] leading-tight">
            <span className="font-bold">Your Brand</span>{" "}
            <span className="text-rl-muted">@yourbrand</span>
          </p>
          <Rise delay={instant ? 0 : 0.7}>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-[1.3]">
              {text}{" "}
              <span className="underline decoration-2 underline-offset-2" style={accentStyle(swatch)}>
                yourbrand.com
              </span>
            </p>
          </Rise>
        </div>
      </div>
      <div className="min-h-0 flex-1 px-3 pt-2">
        <DevelopImage src={photo} style={style} instant={instant} className="h-full rounded-[12px]" />
      </div>
      <div className="flex items-center justify-between px-3.5 py-2 text-rl-muted">
        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
        <Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />
        <Heart className="h-3.5 w-3.5" aria-hidden="true" />
        <ChartNoAxesColumn className="h-3.5 w-3.5" aria-hidden="true" />
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
      </div>
    </div>
  );
}

export function FacebookPost({ text, photo, style, swatch, instant, className }: PostProps) {
  const a = SWATCHES[swatch];
  return (
    <div className={cn(shell, className)}>
      <div className="flex items-center gap-2 px-3 pb-1.5 pt-2.5">
        <Avatar size={28} />
        <p className="leading-tight">
          <span className="block text-[11px] font-semibold">Your Brand</span>
          <span className="flex items-center gap-1 text-[9px] text-rl-muted">
            Just now <Globe className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
        </p>
      </div>
      <Rise delay={instant ? 0 : 0.7}>
        <p className="line-clamp-2 px-3 pb-2 text-[10.5px] leading-[1.35]">{text}</p>
      </Rise>
      <DevelopImage src={photo} style={style} instant={instant} className="min-h-0 flex-1" />
      <div className="flex items-center justify-between bg-rl-bg px-3 py-1.5">
        <span className="text-[9px] text-rl-muted">yourbrand.com</span>
        <span
          className="rounded-[6px] px-2 py-1 text-[9px] font-semibold"
          style={{ backgroundColor: a.value, color: a.fg }}
        >
          Shop now
        </span>
      </div>
      <div className="flex items-center justify-around px-3 py-1.5 text-[9.5px] text-rl-muted">
        <span className="inline-flex items-center gap-1">
          <ThumbsUp className="h-3 w-3" aria-hidden="true" />
          Like
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="h-3 w-3" aria-hidden="true" />
          Comment
        </span>
        <span className="inline-flex items-center gap-1">
          <Share2 className="h-3 w-3" aria-hidden="true" />
          Share
        </span>
      </div>
    </div>
  );
}

export function YouTubePost({ text, photo, style, instant, className }: PostProps) {
  return (
    <div className={cn(shell, className)}>
      <div className="relative">
        <DevelopImage src={photo} style={style} instant={instant} className="aspect-video w-full" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <p className="absolute bottom-2 left-2.5 right-12 text-[14px] font-bold leading-[1.05] tracking-[-0.03em] text-white">
          {text}
        </p>
        <span className="absolute bottom-2 right-2 rounded-[4px] bg-black/75 px-1 py-0.5 text-[9px] font-medium tabular-nums text-white">
          0:42
        </span>
        <span className="absolute left-1/2 top-1/2 flex h-7 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[8px] bg-[#e00000] text-white">
          <Play className="h-3.5 w-3.5 fill-white" aria-hidden="true" />
        </span>
      </div>
      <Rise delay={instant ? 0 : 0.9} className="flex gap-2 px-2.5 pt-2">
        <Avatar size={26} />
        <p className="leading-tight">
          <span className="line-clamp-2 block text-[11px] font-semibold">{text}</span>
          <span className="block text-[9.5px] text-rl-muted">Your Brand, new video</span>
        </p>
      </Rise>
    </div>
  );
}

export const POST_COMPONENTS: Record<PostPlatform, (p: PostProps) => React.JSX.Element> = {
  instagram: InstagramPost,
  linkedin: LinkedInPost,
  x: XPost,
  facebook: FacebookPost,
  youtube: YouTubePost,
};
