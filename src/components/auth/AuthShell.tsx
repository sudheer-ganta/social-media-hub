import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import "@fontsource-variable/geist";
import "@/components/landing/landing.css";
import { photos } from "@/components/landing/data";
import { EASE, MaskLines, RallyMark } from "@/components/landing/primitives";
import { SupabaseNotice } from "@/components/shared/SupabaseNotice";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * Sign-in as a darkroom wall. Photo prints sit around the page undeveloped
 * (blurred, grey, pale) and develop as light passes over them: the pointer on
 * a desktop, a slow wandering beam on touch. Filling in the form develops the
 * whole wall too, so signing in is literally how the page comes to life.
 * Always cream and ink, whatever the app theme is.
 */

const RADIUS = 380;

interface WallContextValue {
  px: MotionValue<number>;
  py: MotionValue<number>;
  /** 0 to 1: how far the form has been filled in. Develops every print. */
  progress: MotionValue<number>;
}
const WallContext = createContext<WallContextValue | null>(null);

function useWall() {
  const ctx = useContext(WallContext);
  if (!ctx) throw new Error("Print must be used inside the wall.");
  return ctx;
}

interface PrintProps {
  src: string;
  /** Position and size, as Tailwind classes, so each print can respond to breakpoints. */
  className: string;
  ratio: string;
  rotate: number;
  position?: string;
  delay: number;
}

function Print({ src, className, ratio, rotate, position, delay }: PrintProps) {
  const reduce = useReducedMotion();
  const { px, py, progress } = useWall();
  const ref = useRef<HTMLDivElement>(null);
  const center = useRef({ x: 0, y: 0 });

  // Print centres are measured once and on resize, never per frame.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const developed = useTransform([px, py, progress], (v: number[]) => {
    if (reduce) return 1;
    const d = Math.hypot(v[0] - center.current.x, v[1] - center.current.y);
    const near = Math.max(0, 1 - d / RADIUS);
    const eased = near * near * (3 - 2 * near);
    return Math.max(eased, v[2]);
  });
  const filter = useTransform(
    developed,
    (v) => `blur(${((1 - v) * 11).toFixed(2)}px) grayscale(${(1 - v).toFixed(3)}) brightness(${(1 + (1 - v) * 0.2).toFixed(3)})`,
  );
  const opacity = useTransform(developed, (v) => 0.5 + 0.5 * v);
  const lift = useTransform(developed, (v) => (1 - v) * 12);

  return (
    <motion.div
      ref={ref}
      className={`absolute ${className}`}
      initial={reduce ? false : { opacity: 0, y: 40, rotate: rotate + 5 }}
      animate={{ opacity: 1, y: 0, rotate }}
      transition={{ type: "spring", stiffness: 70, damping: 18, delay }}
    >
      <motion.div
        className="rounded-[6px] bg-rl-surface p-[7px] pb-[26px] shadow-[0_20px_50px_rgb(23_23_23/0.14)]"
        style={{ y: lift, opacity }}
      >
        <div className="overflow-hidden rounded-[3px]" style={{ aspectRatio: ratio }}>
          <motion.img
            src={src}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            style={{ filter, objectPosition: position }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

function Wall({ develop }: { develop: number }) {
  const reduce = useReducedMotion();
  const rawX = useMotionValue(-1000);
  const rawY = useMotionValue(-1000);
  const px = useSpring(rawX, { stiffness: 60, damping: 20, mass: 0.7 });
  const py = useSpring(rawY, { stiffness: 60, damping: 20, mass: 0.7 });
  const rawProgress = useMotionValue(0);
  const progress = useSpring(rawProgress, { stiffness: 50, damping: 22 });
  const [hasMouse, setHasMouse] = useState(false);

  useEffect(() => {
    rawProgress.set(develop);
  }, [develop, rawProgress]);

  // The light follows a real mouse...
  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      setHasMouse(true);
      rawX.set(e.clientX);
      rawY.set(e.clientY);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, rawX, rawY]);

  // ...and otherwise drifts slowly around the page by itself.
  useEffect(() => {
    if (reduce || hasMouse) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const path = [
      [0.12, 0.2],
      [0.86, 0.22],
      [0.9, 0.78],
      [0.5, 0.92],
      [0.1, 0.72],
      [0.5, 0.18],
      [0.12, 0.2],
    ];
    const opts = { duration: 32, ease: "linear" as const, repeat: Infinity };
    const a = animate(rawX, path.map((p) => p[0] * w), opts);
    const b = animate(rawY, path.map((p) => p[1] * h), opts);
    return () => {
      a.stop();
      b.stop();
    };
  }, [reduce, hasMouse, rawX, rawY]);

  return (
    <WallContext.Provider value={{ px, py, progress }}>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <Print src={photos.lamp} ratio="3/4" rotate={-6} delay={0.1} position="50% 40%" className="left-[3%] top-[12%] w-[min(19vw,290px)]" />
        <Print src={photos.vase} ratio="3/4" rotate={4} delay={0.25} className="left-[8%] top-[56%] hidden w-[min(13vw,200px)] md:block" />
        <Print src={photos.living} ratio="4/3" rotate={3} delay={0.2} className="right-[2%] top-[6%] w-[min(23vw,350px)]" />
        <Print src={photos.chair} ratio="1/1" rotate={-5} delay={0.35} position="35% 55%" className="right-[6%] top-[55%] hidden w-[min(16vw,250px)] md:block" />
        <Print src={photos.console} ratio="4/3" rotate={-3} delay={0.45} className="bottom-[3%] left-[19%] hidden w-[min(14vw,210px)] xl:block" />
        <Print src={photos.dusk} ratio="21/9" rotate={2} delay={0.5} className="bottom-[4%] right-[12%] hidden w-[min(19vw,290px)] xl:block" />
      </div>
    </WallContext.Provider>
  );
}

interface AuthShellProps {
  /** Two display lines. The second one is set in Rally orange. */
  heading: [string, string];
  subtitle: string;
  /** 0 to 1. How far the form has been filled in; develops the photo wall. */
  develop?: number;
  children: ReactNode;
}

export function AuthShell({ heading, subtitle, develop = 0, children }: AuthShellProps) {
  const reduce = useReducedMotion();
  return (
    <div className="rl fixed inset-0 overflow-y-auto overflow-x-hidden">
      <Wall develop={develop} />

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1440px] flex-col px-4 py-5 sm:px-8 sm:py-7">
        <Link to="/" className="inline-flex w-fit items-center gap-2" aria-label="Rally home">
          <RallyMark className="h-8 w-8" />
          <span className="text-[22px] font-semibold tracking-[-0.04em]">Rally</span>
        </Link>

        <div className="flex flex-1 items-center justify-center py-10">
          <motion.div
            className="relative w-full max-w-[440px]"
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
          >
            <motion.p
              className="absolute -left-[190px] top-10 hidden w-[160px] -rotate-6 font-hand text-[28px] leading-[1] text-rl-ink/80 2xl:block"
              initial={reduce ? false : { clipPath: "inset(0 100% 0 0)" }}
              animate={{ clipPath: "inset(0 0% 0 0)" }}
              transition={{ duration: 1, delay: 1.2, ease: EASE }}
              aria-hidden="true"
            >
              Pick up where you left off.
            </motion.p>

            <div className="rl-card p-7 sm:p-9">
              <h1 className="text-[clamp(40px,3.8vw,54px)] font-extrabold leading-[0.92] tracking-[-0.065em]">
                <MaskLines lines={[{ text: heading[0] }, { text: heading[1], accent: true }]} />
              </h1>
              <p className="mt-4 text-[16px] leading-[1.55] text-rl-muted">{subtitle}</p>

              <div className="mt-8">{isSupabaseConfigured() ? children : <SupabaseNotice />}</div>
            </div>
          </motion.div>
        </div>

        <p className="flex items-center justify-center gap-6 text-[13px] text-rl-muted">
          <Link to="/privacy" className="transition-colors hover:text-rl-ink">
            Privacy
          </Link>
          <Link to="/terms" className="transition-colors hover:text-rl-ink">
            Terms
          </Link>
          <span>&copy; {new Date().getFullYear()} Rally</span>
        </p>
      </div>
    </div>
  );
}
