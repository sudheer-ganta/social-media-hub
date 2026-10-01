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
import { ArrowRight, Image as ImageIcon, Megaphone, Quote, Sparkles } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { POST_COPY, photos } from "./data";
import { InstagramPost, LinkedInPost, XPost } from "./hero/PlatformPosts";
import {
  EASE,
  Eyebrow,
  Magnetic,
  MaskLines,
  Reveal,
  useLandingScroll,
} from "./primitives";

/** Scroll thresholds (0 to 1 of the pinned distance) at which each state begins. */
const STATE_AT = [0, 0.18, 0.4, 0.62] as const;
const STATE_LABELS = ["Voice", "Style", "Patterns", "Output"] as const;

const VOICE = ["Direct", "Warm", "Confident"];
const STYLE = ["Editorial", "Minimal", "Natural"];
const PATTERNS = [
  { icon: Quote, text: "Short, impactful openings" },
  { icon: ImageIcon, text: "Product-first imagery" },
  { icon: Megaphone, text: "Strong CTA endings" },
];

/* ------------------------------------------------------------------ panel */

/** A chip that "gets selected" after its group appears, one after another. */
function LearnedChip({ label, on, delay }: { label: string; on: boolean; delay: number }) {
  return (
    <span
      className={cn(
        "rounded-[8px] border px-3 py-1.5 text-[12px] font-medium leading-none transition-colors duration-500",
        on ? "border-rl-ink bg-rl-ink text-rl-surface" : "border-rl-line bg-rl-bg text-rl-muted",
      )}
      style={{ transitionDelay: on ? `${delay}s` : "0s" }}
    >
      {label}
    </span>
  );
}

function Group({
  shown,
  title,
  children,
}: {
  shown: boolean;
  title: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={false}
      animate={reduce || shown ? { opacity: 1, y: 0 } : { opacity: 0.18, y: 10 }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <p className="mb-2 text-[12px] font-semibold">{title}</p>
      {children}
    </motion.div>
  );
}

/** The anchored panel. `state` is how many groups have been learned so far (0 to 4). */
export function IntelligencePanel({ state, className }: { state: number; className?: string }) {
  return (
    <div className={cn("rl-card w-full p-5", className)}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-rl-ink text-rl-surface">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="text-[14px] font-semibold tracking-[-0.02em]">Brand Intelligence</p>
      </div>

      <div className="mt-6 space-y-6">
        <Group shown={state >= 1} title="Voice">
          <div className="flex flex-wrap gap-2">
            {VOICE.map((v, i) => (
              <LearnedChip key={v} label={v} on={state >= 1} delay={0.25 + i * 0.18} />
            ))}
          </div>
        </Group>

        <Group shown={state >= 2} title="Visual style">
          <div className="flex flex-wrap gap-2">
            {STYLE.map((v, i) => (
              <LearnedChip key={v} label={v} on={state >= 2} delay={0.25 + i * 0.18} />
            ))}
          </div>
        </Group>

        <Group shown={state >= 3} title="Learned patterns">
          <ul className="space-y-2.5">
            {PATTERNS.map(({ icon: Icon, text }, i) => (
              <motion.li
                key={text}
                className="flex items-center gap-2.5 text-[13px]"
                initial={false}
                animate={state >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
                transition={{ duration: 0.5, delay: state >= 3 ? 0.2 + i * 0.16 : 0, ease: EASE }}
              >
                <Icon className="h-4 w-4 text-rl-muted" aria-hidden="true" />
                {text}
              </motion.li>
            ))}
          </ul>
        </Group>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- creatives */

/** The same native posts the hero produces, shown at rest. */
function Creative({ index }: { index: number }) {
  const copy = POST_COPY.Modern;
  if (index === 0)
    return <InstagramPost text={copy.instagram} photo={photos.lamp} style="Editorial" swatch={2} instant />;
  if (index === 1)
    return <LinkedInPost text={copy.linkedin} photo={photos.chair} style="Editorial" swatch={2} instant />;
  return <XPost text={copy.x} photo={photos.vase} style="Editorial" swatch={2} instant />;
}

/** Three creatives arrive differently: one rises and turns, one slides in, one comes from below. */
function CreativeStack({ progress }: { progress: MotionValue<number> }) {
  const largeY = useTransform(progress, [0.6, 0.82], [90, 0]);
  const largeR = useTransform(progress, [0.6, 0.82], [-7, -1]);
  const largeO = useTransform(progress, [0.6, 0.76], [0, 1]);
  const midX = useTransform(progress, [0.68, 0.9], [150, 0]);
  const midR = useTransform(progress, [0.68, 0.9], [9, 2]);
  const midO = useTransform(progress, [0.68, 0.84], [0, 1]);
  const smallY = useTransform(progress, [0.76, 0.98], [130, 0]);
  const smallR = useTransform(progress, [0.76, 0.98], [-9, -2]);
  const smallO = useTransform(progress, [0.76, 0.92], [0, 1]);

  return (
    <>
      <motion.div
        className="absolute left-[262px] top-[70px] z-10 h-[340px] w-[250px]"
        style={{ y: largeY, rotate: largeR, opacity: largeO }}
      >
        <Creative index={0} />
      </motion.div>
      <motion.div
        className="absolute left-[470px] top-[10px] z-20 h-[250px] w-[196px]"
        style={{ x: midX, rotate: midR, opacity: midO }}
      >
        <Creative index={1} />
      </motion.div>
      <motion.div
        className="absolute left-[418px] top-[290px] z-20 h-[214px] w-[170px]"
        style={{ y: smallY, rotate: smallR, opacity: smallO }}
      >
        <Creative index={2} />
      </motion.div>
    </>
  );
}

/* --------------------------------------------------------------------- copy */

function BrandCopy({ active }: { active: number }) {
  const scrollRef = useLandingScroll();
  const goToFlow = () =>
    scrollRef.current?.querySelector("#flow")?.scrollIntoView({ behavior: "smooth" });
  return (
    <div>
      <Eyebrow>Brand Intelligence</Eyebrow>
      <h2 className="rl-section-title mt-5">
        <MaskLines
          inView
          lines={[{ text: "Your brand" }, { text: "has a" }, { text: "point of view.", accent: true }]}
        />
      </h2>
      <Reveal delay={0.15}>
        <p className="mt-6 max-w-[27rem] text-[17px] leading-[1.6] text-rl-muted">
          Rally learns your brand voice, visual style and content patterns, so every post
          feels like you.
        </p>
        <div className="mt-8">
          <Magnetic>
            <button
              type="button"
              onClick={goToFlow}
              className="group inline-flex h-[52px] items-center gap-2.5 rounded-[12px] bg-rl-ink px-6 text-[15px] font-medium text-rl-surface"
            >
              See how it works
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </button>
          </Magnetic>
        </div>
      </Reveal>

      <ol className="mt-12 grid max-w-[27rem] grid-cols-4 gap-2" aria-label="What Rally has learned so far">
        {STATE_LABELS.map((label, i) => (
          <li key={label}>
            <span className="block h-[3px] overflow-hidden rounded-full bg-rl-line">
              <span
                className="block h-full origin-left bg-rl-ink transition-transform duration-700"
                style={{ transform: `scaleX(${i <= active ? 1 : 0})` }}
              />
            </span>
            <span
              className={cn(
                "mt-2 block text-[11px] transition-colors duration-500",
                i <= active ? "text-rl-ink" : "text-rl-muted",
              )}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* -------------------------------------------------------------- desktop pin */

function PinnedBrand() {
  const scrollRef = useLandingScroll();
  const outerRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({
    container: scrollRef,
    target: outerRef,
    offset: ["start start", "end end"],
  });
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    setActive(STATE_AT.filter((t) => p >= t).length - 1);
  });

  return (
    <section ref={outerRef} id="brand" className="relative h-[330dvh] scroll-mt-20">
      <div className="sticky top-0 flex h-[100dvh] items-center">
        <div className="rl-container grid w-full grid-cols-12 items-center gap-8 pt-16">
          <div className="col-span-5">
            <BrandCopy active={active} />
          </div>
          <div className="relative col-span-7 h-[540px]">
            <div className="absolute left-0 top-[34px] w-[330px]">
              <IntelligencePanel state={active + 1} />
            </div>
            <CreativeStack progress={scrollYProgress} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- stacked layout */

function StackedBrand() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { amount: 0.4, once: true });
  return (
    <section id="brand" className="scroll-mt-20 overflow-x-clip py-24 lg:py-32">
      <div className="rl-container grid gap-14 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-5">
          <BrandCopy active={3} />
        </div>
        <div className="lg:col-span-7">
          <div ref={ref} className="max-w-[420px]">
            <IntelligencePanel state={seen ? 4 : 0} />
          </div>
          <div className="mt-10 grid max-w-[420px] gap-6 sm:max-w-none sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Reveal key={i} delay={i * 0.1} from={i === 1 ? "right" : "up"}>
                <div className="h-[300px]">
                  <Creative index={i} />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function BrandIntelligence() {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const reduce = useReducedMotion();
  return desktop && !reduce ? <PinnedBrand /> : <StackedBrand />;
}
