import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Layers, PenLine, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { photos } from "../data";
import { EASE, PlatformBadge, type Platform } from "../primitives";

/**
 * The five workflow objects. Each plays its own short animation when `play`
 * flips true (its stage became active) and rests otherwise. Nothing loops.
 */
interface VisualProps {
  play: boolean;
}

function Thumb({ src, className, position }: { src: string; className?: string; position?: string }) {
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={cn("rounded-[8px] object-cover", className)}
      style={{ objectPosition: position }}
    />
  );
}

/** Staggered entrance driven by `play`, with a reduced-motion fallback of "already there". */
function Pop({
  play,
  delay,
  children,
  className,
  from = "up",
}: {
  play: boolean;
  delay: number;
  children: React.ReactNode;
  className?: string;
  from?: "up" | "left" | "scale";
}) {
  const reduce = useReducedMotion();
  const hidden =
    from === "left" ? { opacity: 0, x: -10 } : from === "scale" ? { opacity: 0, scale: 0.85 } : { opacity: 0, y: 10 };
  const shown = { opacity: 1, x: 0, y: 0, scale: 1 };
  return (
    <motion.div
      className={className}
      initial={false}
      animate={reduce || play ? shown : hidden}
      transition={{ duration: 0.5, delay: play ? delay : 0, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ----------------------------------------------------------------- Create */

const CREATE_ROWS = [
  { icon: Sparkles, label: "Generate ideas" },
  { icon: PenLine, label: "Write captions" },
  { icon: Layers, label: "Create variations" },
];

export function CreateVisual({ play }: VisualProps) {
  return (
    <div className="rl-card w-full p-3.5">
      <div className="flex gap-3">
        <Thumb src={photos.lamp} className="h-[112px] w-[84px] shrink-0" />
        <div className="flex flex-1 flex-col justify-center gap-1.5">
          {CREATE_ROWS.map(({ icon: Icon, label }, i) => (
            <Pop key={label} play={play} delay={0.15 + i * 0.14} from="left">
              <div className="flex items-center gap-1.5 rounded-[8px] border border-rl-line bg-rl-bg px-2 py-1.5 text-[10.5px] text-rl-ink">
                <Icon className="h-3 w-3 shrink-0 text-rl-muted" aria-hidden="true" />
                {label}
              </div>
            </Pop>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {[photos.lamp, photos.chair, photos.vase].map((src, i) => (
          <Pop key={src} play={play} delay={0.7 + i * 0.12} from="scale">
            <Thumb src={src} className="aspect-square w-full" />
          </Pop>
        ))}
        <Pop play={play} delay={1.06} from="scale">
          <span className="flex aspect-square items-center justify-center rounded-[8px] border border-dashed border-rl-line text-rl-muted">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </Pop>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Adapt */

const ADAPT_ROWS: { platform: Platform; src: string; ratio: string; pos: string }[] = [
  { platform: "instagram", src: photos.lamp, ratio: "aspect-[4/5]", pos: "50% 40%" },
  { platform: "linkedin", src: photos.chair, ratio: "aspect-square", pos: "30% 50%" },
  { platform: "x", src: photos.vase, ratio: "aspect-[16/10]", pos: "50% 45%" },
  { platform: "youtube", src: photos.living, ratio: "aspect-video", pos: "50% 50%" },
];

export function AdaptVisual({ play }: VisualProps) {
  return (
    <div className="rl-card w-full p-3.5">
      <div className="grid grid-cols-[28px_1fr] gap-x-3 gap-y-2.5">
        {ADAPT_ROWS.map((row, i) => (
          <div key={row.platform} className="contents">
            <Pop play={play} delay={0.1 + i * 0.32} from="scale" className="pt-0.5">
              <PlatformBadge platform={row.platform} size="md" />
            </Pop>
            <Pop play={play} delay={0.22 + i * 0.32}>
              <Thumb
                src={row.src}
                position={row.pos}
                className={cn("w-full", row.ratio, i === 0 ? "max-h-[92px]" : "max-h-[64px]")}
              />
            </Pop>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Schedule */

const DAYS = [
  { d: "Mon", n: 5 },
  { d: "Tue", n: 6 },
  { d: "Wed", n: 7 },
  { d: "Thu", n: 8 },
  { d: "Fri", n: 9 },
];

export function ScheduleVisual({ play }: VisualProps) {
  const reduce = useReducedMotion();
  return (
    <div className="rl-card w-full p-3.5">
      <p className="mb-2.5 text-[11px] font-semibold tracking-[-0.01em]">October 2026</p>
      <div className="grid grid-cols-5 gap-1.5 text-center">
        {DAYS.map(({ d, n }) => (
          <div key={d}>
            <p className="text-[9px] text-rl-muted">{d}</p>
            <p className="mt-0.5 text-[10px] tabular-nums">{n}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {DAYS.map(({ d }, i) => (
          <div
            key={d}
            className="relative flex aspect-[3/4] items-start justify-center rounded-[8px] border border-dashed border-rl-line p-0.5"
          >
            {i === 0 && <Thumb src={photos.chair} className="h-full w-full" />}
            {i === 2 && (
              // The post travels into Wednesday's slot: the point of this stage.
              <motion.div
                className="h-full w-full"
                initial={false}
                animate={
                  reduce || play
                    ? { x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }
                    : { x: 64, y: -96, opacity: 0, scale: 1.25, rotate: 6 }
                }
                transition={{ type: "spring", stiffness: 90, damping: 16, delay: play ? 0.6 : 0 }}
              >
                <Thumb src={photos.lamp} className="h-full w-full shadow-[0_10px_20px_-8px_rgba(23,23,23,0.3)]" />
              </motion.div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-rl-muted">
        <PlatformBadge platform="instagram" size="sm" />
        Wed, 7 Oct at 9:30
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Publish */

const PUBLISH_ROWS: { platform: Platform; label: string }[] = [
  { platform: "instagram", label: "Instagram" },
  { platform: "facebook", label: "Facebook" },
  { platform: "linkedin", label: "LinkedIn" },
  { platform: "x", label: "X" },
];

export function PublishVisual({ play }: VisualProps) {
  const reduce = useReducedMotion();
  const [done, setDone] = useState(0);

  // Rows flip from Scheduled to Published one after another when the stage starts.
  useEffect(() => {
    if (reduce) {
      setDone(PUBLISH_ROWS.length);
      return;
    }
    if (!play) {
      setDone(0);
      return;
    }
    const timers = PUBLISH_ROWS.map((_, i) =>
      window.setTimeout(() => setDone(i + 1), 700 + i * 650),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [play, reduce]);

  return (
    <div className="rl-card w-full p-3.5">
      <ul className="space-y-2.5">
        {PUBLISH_ROWS.map((row, i) => {
          const published = i < done;
          return (
            <li key={row.platform} className="flex items-center gap-2.5 text-[11px]">
              <PlatformBadge platform={row.platform} size="md" />
              <span className="relative h-4 flex-1 overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={published ? "published" : "scheduled"}
                    className={cn(
                      "absolute inset-0 flex items-center",
                      published ? "font-medium text-rl-ink" : "text-rl-muted",
                    )}
                    initial={{ y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -12, opacity: 0 }}
                    transition={{ duration: 0.28, ease: EASE }}
                  >
                    {published ? "Published" : "Scheduled"}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span
                className={cn(
                  "flex h-[18px] w-[18px] items-center justify-center rounded-full border transition-colors duration-300",
                  published ? "border-rl-ink bg-rl-ink text-rl-surface" : "border-rl-line text-transparent",
                )}
                aria-hidden="true"
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ Learn */

export function LearnVisual({ play }: VisualProps) {
  const reduce = useReducedMotion();
  const draw = (delay: number) => ({
    initial: false as const,
    animate: { pathLength: reduce || play ? 1 : 0 },
    transition: { duration: 1.5, delay: play ? delay : 0, ease: EASE },
  });
  return (
    <div className="rl-card w-full p-3.5">
      <p className="mb-2 text-[11px] font-semibold tracking-[-0.01em]">What is working</p>
      <svg viewBox="0 0 200 84" className="w-full" fill="none" aria-hidden="true">
        <path d="M0 83 H200" stroke="rgb(var(--rl-line))" strokeWidth="1" />
        <motion.path
          d="M2 70 C 28 66, 40 58, 62 56 S 100 46, 124 36 S 170 20, 198 10"
          stroke="rgb(var(--rl-ink))"
          strokeWidth="2"
          strokeLinecap="round"
          {...draw(0.2)}
        />
        <motion.path
          d="M2 76 C 30 74, 48 70, 70 66 S 108 62, 134 52 S 172 40, 198 32"
          stroke="rgb(var(--rl-accent))"
          strokeWidth="2"
          strokeLinecap="round"
          {...draw(0.5)}
        />
      </svg>
      <div className="mt-1 flex gap-4 text-[10px] text-rl-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[3px] w-3 rounded-full bg-rl-ink" aria-hidden="true" />
          Reach
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[3px] w-3 rounded-full bg-rl-accent" aria-hidden="true" />
          Engagement
        </span>
      </div>
      <Pop play={play} delay={1.4} className="mt-3">
        <div className="flex items-center gap-2.5 rounded-[8px] bg-rl-bg p-1.5">
          <Thumb src={photos.lamp} className="h-9 w-9 shrink-0" />
          <p className="text-[10.5px] leading-tight">
            <span className="block font-medium">Best post this week</span>
            <span className="text-rl-muted">Product-first imagery</span>
          </p>
        </div>
      </Pop>
    </div>
  );
}

export const FLOW_STAGES = [
  { n: "01", title: "Create", body: "Turn your brand into content with AI assistance.", Visual: CreateVisual },
  { n: "02", title: "Adapt", body: "Automatically adapt for every platform and format.", Visual: AdaptVisual },
  { n: "03", title: "Schedule", body: "Plan and organise your content with a visual calendar.", Visual: ScheduleVisual },
  { n: "04", title: "Publish", body: "Go live across Instagram, Facebook, LinkedIn, X, YouTube and Threads.", Visual: PublishVisual },
  { n: "05", title: "Learn", body: "See what is working and create more of what works.", Visual: LearnVisual },
] as const;
