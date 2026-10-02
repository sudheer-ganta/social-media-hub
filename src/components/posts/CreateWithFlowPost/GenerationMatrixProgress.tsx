import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Two waits, two animations, because they do different jobs:
 *   "concepts" - the brief fans out into candidate directions, then narrows.
 *   "image"    - one sheet assembles itself layer by layer.
 * Both share the stage clock and the stepper so they read as one family.
 */
export type GenerationVariant = "concepts" | "image";

interface GenerationMatrixProgressProps {
  variant: GenerationVariant;
  onCancel?: () => void;
}

interface Stage {
  label: string;
  maxPercent: number;
  /** 0 on the last entry: it stays active until the request resolves. */
  durationMs: number;
}

const STAGES: Record<GenerationVariant, Stage[]> = {
  concepts: [
    { label: "Reading your brief and brand", maxPercent: 22, durationMs: 4000 },
    { label: "Researching the idea", maxPercent: 45, durationMs: 6000 },
    { label: "Exploring creative angles", maxPercent: 72, durationMs: 8000 },
    { label: "Narrowing to the strongest directions", maxPercent: 92, durationMs: 9000 },
    { label: "Writing up each direction", maxPercent: 98, durationMs: 0 },
  ],
  image: [
    { label: "Laying out the sheet", maxPercent: 24, durationMs: 5000 },
    { label: "Art directing image and depth", maxPercent: 52, durationMs: 14000 },
    { label: "Setting type and hierarchy", maxPercent: 76, durationMs: 12000 },
    { label: "Balancing palette and polish", maxPercent: 94, durationMs: 14000 },
    { label: "Rendering the final image", maxPercent: 98, durationMs: 0 },
  ],
};

const EASE = [0.16, 1, 0.3, 1] as const;

/** Advances through the timed stages, then holds on the last and creeps. */
function useStagedProgress(stages: Stage[]) {
  const [percent, setPercent] = useState(8);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const last = stages.length - 1;
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      let accumulated = 0;
      let found = false;

      for (let i = 0; i < last; i++) {
        const s = stages[i];
        if (elapsed <= accumulated + s.durationMs) {
          const progress = (elapsed - accumulated) / s.durationMs;
          const prevMax = stages[i - 1]?.maxPercent ?? 8;
          const target = Math.round(prevMax + progress * (s.maxPercent - prevMax));
          setPercent(Math.min(97, Math.max(8, target)));
          setStage(i);
          found = true;
          break;
        }
        accumulated += s.durationMs;
      }

      if (!found) {
        setStage(last);
        setPercent((prev) => Math.min(98, prev + 1));
      }
    }, 400);

    return () => clearInterval(interval);
  }, [stages]);

  return { percent, stage };
}

const sheetShell =
  "relative mx-auto aspect-[4/5] w-full max-w-[250px] overflow-hidden rounded-xl border bg-card p-4 shadow-md";

function makeTransition(reduce: boolean) {
  return (delay = 0) => (reduce ? { duration: 0 } : { duration: 0.7, ease: EASE, delay });
}

/** A line that is drawn in left to right over a ghost track. */
function Line({
  w,
  h = "h-1.5",
  solid,
  on,
  delay,
  t,
}: {
  w: string;
  h?: string;
  solid: string;
  on: boolean;
  delay: number;
  t: (d?: number) => object;
}) {
  return (
    <div className={cn("relative rounded-full bg-muted", h)} style={{ width: w }}>
      <motion.span
        className={cn("absolute inset-0 origin-left rounded-full", solid)}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: on ? 1 : 0 }}
        transition={t(delay)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Concepts: brief -> several directions -> a shortlist               */
/* ------------------------------------------------------------------ */

/**
 * Three deliberately different compositions, so the fan-out reads as
 * "several ideas" rather than one idea three times. They are abstract: no
 * thumbnail stands for a category of brief.
 */
function ThumbType({ on, t }: { on: boolean; t: (d?: number) => object }) {
  return (
    <div className="space-y-1.5 p-2">
      <Line w="90%" h="h-2" solid="bg-foreground" on={on} delay={0} t={t} />
      <Line w="60%" h="h-2" solid="bg-foreground" on={on} delay={0.1} t={t} />
      <div className="pt-2" />
      <Line w="80%" h="h-1" solid="bg-muted-foreground/45" on={on} delay={0.2} t={t} />
      <Line w="55%" h="h-1" solid="bg-muted-foreground/45" on={on} delay={0.28} t={t} />
    </div>
  );
}

function ThumbImage({ on, t }: { on: boolean; t: (d?: number) => object }) {
  return (
    <div className="flex h-full flex-col gap-1.5 p-1.5">
      <motion.div
        className="flex-1 rounded bg-gradient-to-br from-primary via-primary/55 to-accent"
        initial={{ opacity: 0 }}
        animate={{ opacity: on ? 1 : 0 }}
        transition={t()}
      />
      <Line w="70%" h="h-1.5" solid="bg-foreground" on={on} delay={0.15} t={t} />
    </div>
  );
}

function ThumbSplit({ on, t }: { on: boolean; t: (d?: number) => object }) {
  return (
    <div className="grid h-full grid-cols-2 gap-1.5 p-1.5">
      <motion.div
        className="rounded bg-foreground/85"
        initial={{ opacity: 0 }}
        animate={{ opacity: on ? 1 : 0 }}
        transition={t()}
      />
      <div className="flex flex-col justify-end gap-1.5 pb-1">
        <Line w="100%" h="h-1.5" solid="bg-primary" on={on} delay={0.15} t={t} />
        <Line w="70%" h="h-1" solid="bg-muted-foreground/45" on={on} delay={0.23} t={t} />
        <Line w="85%" h="h-1" solid="bg-muted-foreground/45" on={on} delay={0.31} t={t} />
      </div>
    </div>
  );
}

function ConceptsVisual({ stage, reduce }: { stage: number; reduce: boolean }) {
  const t = makeTransition(reduce);
  const [focus, setFocus] = useState(0);

  // The shortlist ring walks across the options while Rally chooses.
  useEffect(() => {
    if (stage < 3 || reduce) return;
    const id = setInterval(() => setFocus((f) => (f + 1) % 3), 1100);
    return () => clearInterval(id);
  }, [stage, reduce]);

  const thumbs = [ThumbType, ThumbImage, ThumbSplit];

  return (
    <div aria-hidden className={cn(sheetShell, "flex flex-col")}>
      {/* The brief: written in at stage 0, tagged at stage 1 */}
      <div className="relative overflow-hidden rounded-lg border bg-background/60 p-3">
        <div className="space-y-2">
          <Line w="92%" solid="bg-foreground" on delay={0} t={t} />
          <Line w="78%" solid="bg-foreground/80" on delay={0.18} t={t} />
          <Line w="46%" solid="bg-foreground/60" on delay={0.36} t={t} />
        </div>
        <div className="mt-3 flex gap-1.5">
          {["w-8", "w-6", "w-10"].map((w, i) => (
            <motion.span
              key={w}
              className={cn("h-2 rounded-full bg-primary/35", w)}
              initial={{ scale: 0 }}
              animate={{ scale: stage >= 1 ? 1 : 0 }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 20, delay: i * 0.08 }}
            />
          ))}
        </div>
        {!reduce && stage < 2 && (
          <motion.span
            className="pointer-events-none absolute inset-y-0 w-10 bg-gradient-to-r from-transparent to-primary/15"
            initial={{ left: "-20%" }}
            animate={{ left: "100%" }}
            transition={{ duration: 1.8, ease: "linear", repeat: Infinity }}
          />
        )}
      </div>

      {/* Branches: draw out of the brief at stage 2 */}
      <div className="grid grid-cols-3 gap-2.5 px-0.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex justify-center">
            <motion.span
              className="h-8 w-px origin-top bg-primary/40"
              initial={{ scaleY: 0 }}
              animate={{ scaleY: stage >= 2 ? 1 : 0 }}
              transition={t(i * 0.12)}
            />
          </div>
        ))}
      </div>

      {/* Candidate directions */}
      <div className="grid flex-1 grid-cols-3 gap-2.5">
        {thumbs.map((Thumb, i) => (
          <motion.div
            key={i}
            className={cn(
              "relative overflow-hidden rounded-lg border bg-card transition-shadow duration-300",
              stage < 3 && "border-dashed border-primary/40",
              stage >= 3 && focus === i && "ring-2 ring-primary ring-offset-1 ring-offset-card",
            )}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: stage >= 2 ? 1 : 0, y: stage >= 2 ? 0 : 12 }}
            transition={t(0.2 + i * 0.14)}
          >
            <Thumb on={stage >= 3} t={t} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Image: one sheet, assembled layer by layer                         */
/* ------------------------------------------------------------------ */

function ImageVisual({ stage, reduce }: { stage: number; reduce: boolean }) {
  const t = makeTransition(reduce);

  return (
    <div aria-hidden className={sheetShell}>
      {/* Layout guides draw in straight away: this wait begins at layout */}
      <motion.span
        className="absolute inset-x-4 top-[14%] h-px origin-left bg-primary/30"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={t()}
      />
      <motion.span
        className="absolute inset-x-4 bottom-[26%] h-px origin-left bg-primary/30"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={t(0.12)}
      />
      <motion.span
        className="absolute inset-y-4 left-4 w-px origin-top bg-primary/30"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={t(0.24)}
      />

      <div className="relative flex h-full flex-col">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-foreground" />
          <span className="h-1.5 w-10 rounded-full bg-muted" />
        </div>

        {/* Image block: dashed frame, filled at stage 1 */}
        <div className="relative mt-4 h-[44%] overflow-hidden rounded-lg border border-dashed border-primary/40">
          <motion.div
            className="absolute inset-0 bg-gradient-to-br from-primary via-primary/55 to-accent"
            initial={{ opacity: 0 }}
            animate={{ opacity: stage >= 1 ? 1 : 0 }}
            transition={t()}
          />
          {stage >= 1 && !reduce && (
            <motion.span
              className="absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/25"
              animate={{ x: ["0%", "400%"] }}
              transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity, repeatDelay: 1.2 }}
            />
          )}
        </div>

        {/* Type: stage 2 */}
        <div className="mt-4 space-y-2">
          <Line w="86%" h="h-2.5" solid="bg-foreground" on={stage >= 2} delay={0} t={t} />
          <Line w="58%" h="h-2.5" solid="bg-foreground" on={stage >= 2} delay={0.15} t={t} />
          <div className="space-y-1.5 pt-1">
            <Line w="94%" solid="bg-muted-foreground/45" on={stage >= 2} delay={0.3} t={t} />
            <Line w="80%" solid="bg-muted-foreground/45" on={stage >= 2} delay={0.42} t={t} />
            <Line w="62%" solid="bg-muted-foreground/45" on={stage >= 2} delay={0.54} t={t} />
          </div>
        </div>

        {/* Palette: stage 3 */}
        <div className="mt-auto flex items-center gap-2">
          {["bg-primary", "bg-foreground", "bg-accent", "bg-secondary"].map((color, i) => (
            <motion.span
              key={color}
              className={cn("h-5 w-5 rounded-full border border-border/70", color)}
              initial={{ scale: 0 }}
              animate={{ scale: stage >= 3 ? 1 : 0 }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 20, delay: i * 0.08 }}
            />
          ))}
        </div>
      </div>

      {/* Scan: Rally reading the sheet. Stops once the image is in. */}
      {!reduce && stage < 1 && (
        <motion.span
          className="pointer-events-none absolute inset-x-0 h-12 bg-gradient-to-b from-transparent to-primary/15"
          initial={{ top: "-15%" }}
          animate={{ top: "100%" }}
          transition={{ duration: 2.2, ease: "linear", repeat: Infinity }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function GenerationMatrixProgress({ variant }: GenerationMatrixProgressProps) {
  const reduce = useReducedMotion() ?? false;
  const stages = STAGES[variant];
  const { percent, stage } = useStagedProgress(stages);

  return (
    <div className="mx-auto grid w-full max-w-[640px] items-center gap-8 py-2 md:grid-cols-[250px_minmax(0,1fr)] md:gap-12">
      {variant === "concepts" ? (
        <ConceptsVisual stage={stage} reduce={reduce} />
      ) : (
        <ImageVisual stage={stage} reduce={reduce} />
      )}

      <div>
        <p role="status" className="sr-only">
          {stages[stage]?.label}
        </p>

        <ol className="space-y-3.5">
          {stages.map((s, i) => {
            const done = i < stage;
            const active = i === stage;
            return (
              <li key={s.label} className="flex items-center gap-3">
                <span
                  className={cn(
                    "relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] transition-colors duration-300",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary bg-card",
                    !done && !active && "border-border bg-transparent",
                  )}
                >
                  {done ? (
                    <Check className="h-3 w-3" strokeWidth={3} />
                  ) : active ? (
                    <>
                      {!reduce && <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" />}
                      <span className="relative h-2 w-2 rounded-full bg-primary" />
                    </>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "text-sm transition-colors duration-300",
                    active && "font-medium text-foreground",
                    done && "text-muted-foreground",
                    !done && !active && "text-muted-foreground/60",
                  )}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-7 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-meta tnum w-9 text-right normal-case tracking-normal">{percent}%</span>
        </div>
      </div>
    </div>
  );
}
