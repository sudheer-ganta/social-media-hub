import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowRight,
  Check,
  Languages,
  Megaphone,
  Mic2,
  Scissors,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { photos } from "./data";
import { GhostCursor } from "./hero/GhostCursor";
import { EASE, Eyebrow, Magnetic, MaskLines, PlatformBadge, RallyMark, Reveal } from "./primitives";

interface AIAction {
  id: string;
  label: string;
  icon: LucideIcon;
  caption: string;
}

const ORIGINAL =
  "Good design lasts longer. This lamp is made to be the last one you buy for the room.";

const ACTIONS: AIAction[] = [
  { id: "shorter", label: "Make it shorter", icon: Scissors, caption: "Good design lives longer. Made to be your last lamp." },
  { id: "engaging", label: "More engaging", icon: Wand2, caption: "Which piece would you keep for twenty years? Good design lives longer, and this lamp is proof." },
  { id: "tone", label: "Change tone", icon: Mic2, caption: "Some pieces just belong. Good design lives longer, and this lamp is meant to stay." },
  { id: "cta", label: "Add a CTA", icon: Megaphone, caption: "Good design lives longer. Meet the lamp built to last, and shop the new collection today." },
  { id: "translate", label: "Translate", icon: Languages, caption: "अच्छा डिज़ाइन लंबे समय तक चलता है। यह लैंप आपके कमरे का आख़िरी लैंप होने के लिए बना है।" },
];

const CHECKS = ["On-brand", "Platform-ready", "Audience aware", "Saves hours"];

/** The caption changes in place and the new words are briefly marked, so the edit is visible. */
function Caption({ text, marked }: { text: string; marked: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="min-h-[88px] px-4 pb-4 pt-3">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={text}
          className="text-[14px] leading-[1.55]"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          <span className={cn("box-decoration-clone px-0.5", marked && "rl-mark")}>{text}</span>
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function CreativePreview({ caption, marked }: { caption: string; marked: boolean }) {
  return (
    <div className="rl-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full bg-rl-ink text-[10px] font-bold text-rl-surface"
          aria-hidden="true"
        >
          B
        </span>
        <span className="text-[12px] font-semibold">yourbrand</span>
        <PlatformBadge platform="instagram" size="sm" className="ml-auto" />
      </div>
      <img src={photos.console} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
      <Caption text={caption} marked={marked} />
    </div>
  );
}

function AIActionPanel({
  activeId,
  onPick,
}: {
  activeId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="rl-card p-3">
      <p className="flex items-center gap-2 px-2.5 pb-2.5 pt-1.5 text-[14px] font-semibold tracking-[-0.02em]">
        <RallyMark className="h-4 w-4" />
        Improve with Rally
      </p>
      <ul className="space-y-1">
        {ACTIONS.map(({ id, label, icon: Icon }) => {
          const on = id === activeId;
          return (
            <li key={id}>
              <button
                type="button"
                data-target={`opt-${id}`}
                onClick={() => onPick(id)}
                aria-pressed={on}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13px] transition-colors duration-300",
                  on ? "bg-rl-ink text-rl-surface" : "hover:bg-rl-ink/5",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Creative first, then the AI panel, then a cursor operates the panel one option
 * at a time while the caption changes. A real click takes over and stops the demo.
 */
function AIDemo() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.55 });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [clicks, setClicks] = useState(0);
  const [cursorOn, setCursorOn] = useState(false);
  const [panelIn, setPanelIn] = useState(false);
  const cx = useMotionValue(300);
  const cy = useMotionValue(420);

  const active = ACTIONS.find((a) => a.id === activeId);
  const caption = active ? active.caption : ORIGINAL;

  useEffect(() => {
    if (!inView) return;
    const id = window.setTimeout(() => setPanelIn(true), reduce ? 0 : 900);
    return () => window.clearTimeout(id);
  }, [inView, reduce]);

  useEffect(() => {
    if (!auto || reduce || !inView || !panelIn) return;
    let cancelled = false;
    const timers: number[] = [];
    const running: { stop: () => void }[] = [];
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });

    const moveTo = async (targetId: string) => {
      const root = ref.current;
      const el = root?.querySelector<HTMLElement>(`[data-target="${targetId}"]`);
      if (!root || !el || cancelled) return;
      const a = root.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const opts = { duration: 0.85, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] };
      const mx = animate(cx, b.left - a.left + b.width * 0.35, opts);
      const my = animate(cy, b.top - a.top + b.height * 0.6, opts);
      running.push(mx, my);
      await Promise.all([mx.finished, my.finished]);
    };

    (async () => {
      await sleep(900);
      setCursorOn(true);
      while (!cancelled) {
        for (const action of ACTIONS) {
          await moveTo(`opt-${action.id}`);
          if (cancelled) return;
          setClicks((c) => c + 1);
          setActiveId(action.id);
          await sleep(3200);
          if (cancelled) return;
        }
        setActiveId(null);
        await sleep(1800);
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      running.forEach((c) => c.stop());
      setCursorOn(false);
    };
  }, [auto, reduce, inView, panelIn, cx, cy]);

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[600px] pb-6 sm:pb-0 lg:mx-0 lg:h-[520px]">
      <motion.div
        className="lg:absolute lg:left-0 lg:top-8 lg:w-[360px]"
        initial={reduce ? false : { opacity: 0, y: 48, rotate: -6 }}
        animate={inView || reduce ? { opacity: 1, y: 0, rotate: -2 } : undefined}
        transition={{ type: "spring", stiffness: 90, damping: 18 }}
      >
        <CreativePreview caption={caption} marked={activeId !== null} />
      </motion.div>

      <motion.div
        className="mt-4 lg:absolute lg:right-0 lg:top-0 lg:mt-0 lg:w-[268px]"
        initial={reduce ? false : { opacity: 0, x: 70 }}
        animate={panelIn || reduce ? { opacity: 1, x: 0 } : undefined}
        transition={{ type: "spring", stiffness: 100, damping: 19 }}
      >
        <AIActionPanel
          activeId={activeId}
          onPick={(id) => {
            setAuto(false);
            setCursorOn(false);
            setActiveId((cur) => (cur === id ? null : id));
          }}
        />
      </motion.div>

      <div className="pointer-events-none absolute inset-0 hidden lg:block">
        <GhostCursor x={cx} y={cy} visible={cursorOn} clicks={clicks} />
      </div>
    </div>
  );
}

export function AIAssistance() {
  const reduce = useReducedMotion();
  return (
    <section id="assist" className="scroll-mt-20 overflow-x-clip py-24 lg:py-40">
      <div className="rl-container grid items-center gap-16 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-6">
          <AIDemo />
        </div>

        <div className="lg:col-span-6 lg:pl-10">
          <Eyebrow>AI Assistance</Eyebrow>
          <h2 className="rl-section-title mt-5">
            <MaskLines
              inView
              lines={[
                { text: "Good creative" },
                { text: "decisions," },
                { text: "without the", accent: true },
                { text: "blank page.", accent: true },
              ]}
            />
          </h2>
          <Reveal delay={0.15}>
            <p className="mt-6 max-w-[30rem] text-[17px] leading-[1.6] text-rl-muted">
              Get caption suggestions, creative ideas, format adaptations and best time to
              post, right inside your workflow.
            </p>
          </Reveal>

          <ul className="mt-8 grid max-w-[30rem] grid-cols-2 gap-x-6 gap-y-3">
            {CHECKS.map((label, i) => (
              <motion.li
                key={label}
                className="flex items-center gap-2.5 font-hand text-[24px] leading-none text-rl-ink/80"
                initial={reduce ? false : { opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.12, ease: EASE }}
              >
                <Check className="h-5 w-5 shrink-0 text-rl-accent" strokeWidth={2.5} aria-hidden="true" />
                {label}
              </motion.li>
            ))}
          </ul>

          <Reveal delay={0.25} className="mt-10">
            <Magnetic>
              <Link
                to="/register"
                className="group inline-flex h-[52px] items-center gap-2.5 rounded-[12px] bg-rl-ink px-6 text-[15px] font-medium text-rl-surface"
              >
                Try it now
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
            </Magnetic>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
