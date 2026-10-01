import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { Facebook, Instagram, Linkedin, Youtube } from "lucide-react";
import { SiThreads, SiX } from "@icons-pack/react-simple-icons";
import { cn } from "@/lib/utils";

export const EASE = [0.2, 0.8, 0.2, 1] as const;
export const SPRING = { type: "spring", stiffness: 120, damping: 20 } as const;

/* The app locks html/body to overflow:hidden, so the landing page scrolls
   inside its own container. Scroll-linked motion needs that element. */
export const LandingScrollContext = createContext<RefObject<HTMLDivElement | null> | null>(
  null,
);

export function useLandingScroll() {
  const ref = useContext(LandingScrollContext);
  if (!ref) throw new Error("useLandingScroll must be used inside the landing page.");
  return ref;
}

/* ---------------------------------------------------------------- reveals */

type From = "up" | "left" | "right" | "scale";

const FROM: Record<From, { opacity: number; x?: number; y?: number; scale?: number }> = {
  up: { opacity: 0, y: 28 },
  left: { opacity: 0, x: -40 },
  right: { opacity: 0, x: 40 },
  scale: { opacity: 0, scale: 0.94, y: 12 },
};

/** Scroll reveal. `from` varies the entrance so sections do not all behave alike. */
export function Reveal({
  children,
  delay = 0,
  from = "up",
  className,
}: {
  children: ReactNode;
  delay?: number;
  from?: From;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : FROM[from]}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.75, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export interface HeadlineLine {
  text: string;
  accent?: boolean;
}

/**
 * Headline lines rise out of a mask, one after another.
 * With `inView`, the trigger watches the wrapper: the lines start translated
 * inside an overflow-hidden mask, so an observer on them would never fire.
 */
export function MaskLines({
  lines,
  delay = 0,
  inView = false,
  className,
}: {
  lines: HeadlineLine[];
  delay?: number;
  inView?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const shown = !inView || seen;

  return (
    <span ref={ref} className={cn("block", className)}>
      {lines.map((line, i) => (
        // pb/-mb keeps descenders (g, y, p) from being clipped by the mask.
        <span key={line.text} className="-mb-[0.12em] -mr-[0.12em] block overflow-hidden pb-[0.12em] pr-[0.12em]">
          <motion.span
            className={cn("block", line.accent && "text-rl-accent")}
            initial={reduce ? false : { y: "112%" }}
            animate={{ y: shown ? "0%" : "112%" }}
            transition={{ duration: 0.95, delay: delay + i * 0.09, ease: EASE }}
          >
            {line.text}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("rl-eyebrow", className)}>{children}</p>;
}

/* --------------------------------------------------------------- magnetic */

/**
 * Pulls its child a few pixels toward the cursor. Desktop pointers only, and
 * driven entirely by motion values so it never re-renders React.
 */
export function Magnetic({
  children,
  strength = 6,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(rawY, { stiffness: 220, damping: 18, mass: 0.4 });

  const onMove = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    rawX.set(Math.max(-1, Math.min(1, dx)) * strength);
    rawY.set(Math.max(-1, Math.min(1, dy)) * strength);
  };
  const onLeave = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <motion.div
      ref={ref}
      style={{ x, y }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cn("inline-block", className)}
    >
      <motion.div
        whileHover={reduce ? undefined : { y: -2 }}
        whileTap={reduce ? undefined : { scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 24 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ stage */

/** Lays out a fixed-size stage and scales it down to fit narrow columns. */
export function ScaledStage({
  width,
  height,
  children,
  className,
}: {
  width: number;
  height: number;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={ref} className={className}>
      <div style={{ width: width * scale, height: height * scale }}>
        <div
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ brand */

export function RallyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="2" y="5" width="20" height="11" rx="5.5" transform="rotate(-18 12 10.5)" fill="rgb(var(--rl-accent))" />
      <rect x="10" y="15" width="20" height="11" rx="5.5" transform="rotate(-18 20 20.5)" fill="rgb(var(--rl-accent))" opacity="0.82" />
    </svg>
  );
}

export type Platform = "instagram" | "linkedin" | "x" | "youtube" | "facebook" | "threads";

const PLATFORM_BG: Record<Platform, string> = {
  instagram: "bg-gradient-to-tr from-[#f6a93b] via-[#d62976] to-[#5b51d8]",
  linkedin: "bg-[#0a66c2]",
  x: "bg-[#111111]",
  youtube: "bg-[#e00000]",
  facebook: "bg-[#1877f2]",
  threads: "bg-[#111111]",
};

const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
  youtube: "YouTube",
  facebook: "Facebook",
  threads: "Threads",
};

const BADGE_SIZE = {
  sm: { box: "h-5 w-5 rounded-[6px]", icon: 11 },
  md: { box: "h-7 w-7 rounded-[8px]", icon: 15 },
  lg: { box: "h-9 w-9 rounded-[10px]", icon: 19 },
} as const;

export function PlatformBadge({
  platform,
  size = "md",
  className,
}: {
  platform: Platform;
  size?: keyof typeof BADGE_SIZE;
  className?: string;
}) {
  const { box, icon } = BADGE_SIZE[size];
  const glyph = (() => {
    switch (platform) {
      case "instagram":
        return <Instagram size={icon} strokeWidth={2} />;
      case "linkedin":
        return <Linkedin size={icon} strokeWidth={2} />;
      case "facebook":
        return <Facebook size={icon} strokeWidth={2} />;
      case "youtube":
        return <Youtube size={icon} strokeWidth={2} />;
      case "x":
        return <SiX size={icon - 2} color="#ffffff" />;
      case "threads":
        return <SiThreads size={icon - 2} color="#ffffff" />;
    }
  })();
  return (
    <span
      role="img"
      aria-label={PLATFORM_LABEL[platform]}
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-white",
        PLATFORM_BG[platform],
        box,
        className,
      )}
    >
      {glyph}
    </span>
  );
}
