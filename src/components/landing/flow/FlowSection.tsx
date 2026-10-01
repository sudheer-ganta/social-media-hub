import { useRef, useState } from "react";
import {
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Eyebrow, EASE, MaskLines, Reveal, useLandingScroll } from "../primitives";
import { FLOW_STAGES } from "./FlowVisuals";

/** Where in the pinned scroll (0 to 1) each stage locks in. Create appears on entry. */
const REVEAL_AT = [0, 0.2, 0.4, 0.6, 0.8] as const;
/** Small vertical offsets so the row reads as a composition, not a table. */
const OFFSETS = [0, 24, -4, 28, 6] as const;

function FlowHeading() {
  return (
    <div className="max-w-[640px]">
      <Eyebrow>The flow</Eyebrow>
      <h2 className="rl-section-title mt-5">
        <MaskLines
          inView
          lines={[{ text: "From brand to" }, { text: "everywhere.", accent: true }]}
        />
      </h2>
      <Reveal delay={0.15}>
        <p className="mt-6 max-w-[34rem] text-[17px] leading-[1.6] text-rl-muted">
          A complete content workflow designed for brands, creators and teams, with AI at
          every step.
        </p>
      </Reveal>
    </div>
  );
}

function StageCaption({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="mt-5">
      <p className="flex items-baseline gap-2.5">
        <span className="text-[12px] font-medium tabular-nums text-rl-accent">{n}</span>
        <span className="text-[19px] font-semibold tracking-[-0.04em]">{title}</span>
      </p>
      <p className="mt-1.5 max-w-[17rem] text-[14px] leading-[1.55] text-rl-muted">{body}</p>
    </div>
  );
}

/** A hand-drawn arrow whose line is scrubbed by scroll, not timed. */
function FlowConnector({ progress }: { progress: MotionValue<number> }) {
  return (
    <svg
      viewBox="0 0 40 24"
      width={40}
      height={24}
      fill="none"
      className="text-rl-ink/60"
      aria-hidden="true"
    >
      <motion.path
        d="M2 13 C 12 8, 22 17, 34 12"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        style={{ pathLength: progress }}
      />
      <motion.path
        d="M29 6 L35 12 L28 17"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: progress }}
      />
    </svg>
  );
}

/* ----------------------------------------------------------- desktop, pinned */

function PinnedFlow() {
  const scrollRef = useLandingScroll();
  const outerRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const entered = useInView(innerRef, { amount: 0.35 });
  const [passed, setPassed] = useState(0);

  const { scrollYProgress } = useScroll({
    container: scrollRef,
    target: outerRef,
    offset: ["start start", "end end"],
  });

  // Discrete "how many stages are active" is real UI state, so it is state.
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    setPassed(REVEAL_AT.filter((t) => p >= t).length);
  });

  const active = entered ? Math.max(passed, 1) : 0;

  // Each connector draws between the moment its stage locks in and the next one.
  const c0 = useTransform(scrollYProgress, [0.06, 0.2], [0, 1]);
  const c1 = useTransform(scrollYProgress, [0.26, 0.4], [0, 1]);
  const c2 = useTransform(scrollYProgress, [0.46, 0.6], [0, 1]);
  const c3 = useTransform(scrollYProgress, [0.66, 0.8], [0, 1]);
  const connectors = [c0, c1, c2, c3];

  return (
    <section ref={outerRef} id="flow" className="relative h-[250dvh] scroll-mt-20">
      <div ref={innerRef} className="sticky top-0 flex h-[100dvh] items-center">
        <div className="rl-container pt-16">
          <FlowHeading />

          <ol className="mt-12 grid grid-cols-5 gap-x-8 xl:gap-x-10">
            {FLOW_STAGES.map(({ n, title, body, Visual }, i) => {
              const on = i < active;
              return (
                <motion.li
                  key={n}
                  className="relative"
                  initial={false}
                  animate={{
                    opacity: on ? 1 : 0,
                    x: on ? 0 : -28,
                    y: on ? OFFSETS[i] : OFFSETS[i] + 24,
                  }}
                  transition={{ type: "spring", stiffness: 110, damping: 20 }}
                >
                  <Visual play={on} />
                  <StageCaption n={n} title={title} body={body} />
                  {i < FLOW_STAGES.length - 1 && (
                    <span className="absolute -right-[36px] top-[78px] hidden xl:block">
                      <FlowConnector progress={connectors[i]} />
                    </span>
                  )}
                </motion.li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------ static, reduced motion */

function StaticFlow() {
  return (
    <section id="flow" className="scroll-mt-20 py-32">
      <div className="rl-container">
        <FlowHeading />
        <ol className="mt-12 grid grid-cols-2 gap-x-8 gap-y-14 lg:grid-cols-5">
          {FLOW_STAGES.map(({ n, title, body, Visual }) => (
            <li key={n}>
              <Visual play />
              <StageCaption n={n} title={title} body={body} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- phones, timeline */

function TimelineItem({
  n,
  title,
  body,
  Visual,
}: (typeof FLOW_STAGES)[number]) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { amount: 0.5, once: true });
  const reduce = useReducedMotion();
  return (
    <motion.li
      ref={ref}
      className="relative pl-9"
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.7, ease: EASE }}
    >
      <span
        className="absolute left-0 top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-rl-ink text-[10px] font-semibold tabular-nums text-rl-surface"
        aria-hidden="true"
      >
        {n.slice(1)}
      </span>
      <p className="text-[19px] font-semibold tracking-[-0.04em]">{title}</p>
      <p className="mb-4 mt-1 text-[14px] leading-[1.55] text-rl-muted">{body}</p>
      <div className="max-w-[360px]">
        <Visual play={inView} />
      </div>
    </motion.li>
  );
}

function TimelineFlow() {
  const scrollRef = useLandingScroll();
  const listRef = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({
    container: scrollRef,
    target: listRef,
    offset: ["start 70%", "end 60%"],
  });
  return (
    <section id="flow" className="scroll-mt-20 py-20">
      <div className="rl-container">
        <FlowHeading />
        <div className="relative mt-12">
          <div className="absolute bottom-0 left-[10px] top-2 w-px bg-rl-line" aria-hidden="true" />
          <motion.div
            className="absolute bottom-0 left-[10px] top-2 w-px origin-top bg-rl-ink"
            style={{ scaleY: scrollYProgress }}
            aria-hidden="true"
          />
          <ol ref={listRef} className="space-y-14">
            {FLOW_STAGES.map((s) => (
              <TimelineItem key={s.n} {...s} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function FlowSection() {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const reduce = useReducedMotion();
  if (!desktop) return <TimelineFlow />;
  return reduce ? <StaticFlow /> : <PinnedFlow />;
}
