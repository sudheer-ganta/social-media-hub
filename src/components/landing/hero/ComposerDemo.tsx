import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useInView, useMotionValue, useReducedMotion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { EASE, PlatformBadge, type Platform } from "../primitives";
import { GhostCursor } from "./GhostCursor";
import { BRAND_CHIPS, SCENARIOS } from "./scenarios";

/**
 * The product, performed. Steps mirror the real flow:
 * 0 describe, 1 ideas, 2 image preview, 3 caption + hashtags + publish, 4 done.
 * Every control is real: a visitor can click through it themselves, and a
 * cursor does exactly the same clicks when they do not.
 */
const STEP_LABELS = ["Prompt", "Ideas", "Preview", "Publish"] as const;
const PLATFORMS: Platform[] = ["instagram", "linkedin", "x", "facebook", "youtube"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type DoneKind = "scheduled" | "posted";

function StepBar({ step }: { step: number }) {
  const active = Math.min(step, 3);
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Progress">
      {STEP_LABELS.map((label, i) => (
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
  );
}

/** The image is revealed bottom-up while it resolves from blur, as if rendering. */
function Developing({ src, position }: { src: string; position: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative aspect-[5/4] w-full overflow-hidden rounded-[12px] bg-rl-line/60">
      <motion.img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        style={{ objectPosition: position }}
        initial={reduce ? false : { clipPath: "inset(100% 0% 0% 0%)", filter: "blur(16px)", scale: 1.12 }}
        animate={{ clipPath: "inset(0% 0% 0% 0%)", filter: "blur(0px)", scale: 1 }}
        transition={{ duration: 1.4, delay: 0.25, ease: EASE }}
      />
    </div>
  );
}

function Pane({ children, id }: { children: ReactNode; id: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={id}
      className="flex h-full flex-col"
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -10 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

const primaryBtn =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-rl-ink px-5 text-[14px] font-medium text-rl-surface transition-transform active:scale-[0.98]";
const ghostBtn =
  "inline-flex h-11 items-center justify-center rounded-[10px] border border-rl-line bg-rl-surface px-5 text-[14px] font-medium transition-colors hover:border-rl-ink/40 active:scale-[0.98]";

export function ComposerDemo() {
  const reduce = useReducedMotion();
  const wide = useMediaQuery("(min-width: 768px)");
  const boxRef = useRef<HTMLDivElement>(null);
  const inView = useInView(boxRef, { amount: 0.35 });

  const [scenarioIdx, setScenarioIdx] = useState(0);
  const sc = SCENARIOS[scenarioIdx];
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState(() => (reduce ? SCENARIOS[0].prompt : ""));
  const [picked, setPicked] = useState<number | null>(null);
  const [doneKind, setDoneKind] = useState<DoneKind>("scheduled");
  const [tagsShown, setTagsShown] = useState(0);
  const [auto, setAuto] = useState(!reduce);
  const [clicks, setClicks] = useState(0);
  const [cursorOn, setCursorOn] = useState(false);
  const timers = useRef<number[]>([]);

  const cx = useMotionValue(520);
  const cy = useMotionValue(560);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  /* ---- the real actions: used by visitors and by the demo cursor alike ---- */
  const startIdeas = useCallback(() => setStep(1), []);
  const pickIdea = useCallback(
    (i: number) => {
      setPicked(i);
      later(() => setStep(2), 700);
    },
    [later],
  );
  const approve = useCallback(() => {
    setTagsShown(0);
    setStep(3);
  }, []);
  const finish = useCallback((kind: DoneKind) => {
    setDoneKind(kind);
    setStep(4);
  }, []);
  const restart = useCallback(() => {
    setStep(0);
    setPicked(null);
    setTyped("");
    setTagsShown(0);
    setScenarioIdx((i) => (i + 1) % SCENARIOS.length);
  }, []);

  /** A real click ends the demo and leaves the visitor in control. */
  const manual = useCallback(
    (fn: () => void) => () => {
      setAuto(false);
      setCursorOn(false);
      setTyped((t) => (t.length ? t : SCENARIOS[scenarioIdx].prompt));
      fn();
    },
    [scenarioIdx],
  );

  // Hashtags appear one at a time once the caption step opens.
  useEffect(() => {
    if (step !== 3) return;
    if (reduce) {
      setTagsShown(sc.tags.length);
      return;
    }
    const ids = sc.tags.map((_, i) => window.setTimeout(() => setTagsShown(i + 1), 900 + i * 260));
    return () => ids.forEach((t) => window.clearTimeout(t));
  }, [step, sc.tags, reduce]);

  /* ---- the demo script ---- */
  useEffect(() => {
    if (!auto || reduce || !inView) return;
    let cancelled = false;
    const sleepers: number[] = [];
    const running: { stop: () => void }[] = [];
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        sleepers.push(window.setTimeout(resolve, ms));
      });

    const moveTo = async (id: string) => {
      if (!wide) return sleep(500);
      const box = boxRef.current;
      const el = box?.querySelector<HTMLElement>(`[data-target="${id}"]`);
      if (!box || !el || cancelled) return;
      const b = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const opts = { duration: 0.9, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] };
      const a = animate(cx, r.left - b.left + r.width * 0.55, opts);
      const c = animate(cy, r.top - b.top + r.height * 0.6, opts);
      running.push(a, c);
      await Promise.all([a.finished, c.finished]);
    };
    const click = () => setClicks((n) => n + 1);

    (async () => {
      let round = scenarioIdx;
      if (wide) setCursorOn(true);
      while (!cancelled) {
        const s = SCENARIOS[round % SCENARIOS.length];
        setScenarioIdx(round % SCENARIOS.length);
        setStep(0);
        setPicked(null);
        setTyped("");
        await sleep(700);

        for (let i = 1; i <= s.prompt.length; i += 1) {
          if (cancelled) return;
          setTyped(s.prompt.slice(0, i));
          await sleep(34);
        }
        await sleep(500);

        await moveTo("generate");
        if (cancelled) return;
        click();
        startIdeas();
        await sleep(1900);

        await moveTo(`idea-${s.pick}`);
        if (cancelled) return;
        click();
        pickIdea(s.pick);
        await sleep(3400);

        await moveTo("approve");
        if (cancelled) return;
        click();
        approve();
        await sleep(2300);

        await moveTo("schedule");
        if (cancelled) return;
        click();
        finish("scheduled");
        await sleep(4200);
        round += 1;
      }
    })();

    return () => {
      cancelled = true;
      sleepers.forEach((t) => window.clearTimeout(t));
      running.forEach((r) => r.stop());
      setCursorOn(false);
    };
    // scenarioIdx is read once at start; the loop advances it itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, reduce, inView, wide, cx, cy, startIdeas, pickIdea, approve, finish]);

  return (
    <div ref={boxRef} className="relative mx-auto w-full max-w-[580px] lg:mx-0">
      <div className="rl-card flex h-[580px] flex-col p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <p className="flex items-center gap-2 text-[13px] font-semibold tracking-[-0.02em]">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-rl-ink text-[11px] font-bold text-rl-surface"
              aria-hidden="true"
            >
              B
            </span>
            New post
          </p>
          <div className="flex -space-x-1">
            {PLATFORMS.map((p) => (
              <PlatformBadge key={p} platform={p} size="sm" className="ring-2 ring-rl-surface" />
            ))}
          </div>
        </div>

        <StepBar step={step} />

        <div className="relative mt-6 min-h-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            {step === 0 && (
              <Pane id="prompt" key="prompt">
                <label className="text-[12px] font-medium text-rl-muted" htmlFor="rl-prompt">
                  What do you want to post about?
                </label>
                <div
                  id="rl-prompt"
                  className="mt-2 min-h-[112px] rounded-[12px] border border-rl-line bg-rl-bg p-4 text-[16px] leading-[1.45]"
                >
                  {typed}
                  {auto && !reduce && (
                    <motion.span
                      className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] bg-rl-ink"
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      aria-hidden="true"
                    />
                  )}
                </div>

                <p className="mb-2 mt-6 text-[12px] font-medium text-rl-muted">
                  Rally reads your brand profile first
                </p>
                <div className="flex flex-wrap gap-2">
                  {BRAND_CHIPS.map((c) => (
                    <span
                      key={c}
                      className="rounded-[8px] border border-rl-line bg-rl-bg px-2.5 py-1.5 text-[12px] leading-none text-rl-ink"
                    >
                      {c}
                    </span>
                  ))}
                </div>

                <div className="mt-auto flex justify-end">
                  <button
                    type="button"
                    data-target="generate"
                    onClick={manual(startIdeas)}
                    className={cn(primaryBtn, "bg-rl-strong text-white")}
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Generate ideas
                  </button>
                </div>
              </Pane>
            )}

            {step === 1 && (
              <Pane id="ideas" key="ideas">
                <div className="flex items-baseline justify-between">
                  <p className="text-[12px] font-medium text-rl-muted">3 ideas, based on your brand</p>
                  <motion.span
                    className="font-hand -rotate-2 text-[22px] leading-none text-rl-ink/70"
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.1, duration: 0.5 }}
                  >
                    Pick the one you like.
                  </motion.span>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {sc.ideas.map((idea, i) => {
                    const on = picked === i;
                    return (
                      <motion.li
                        key={idea.title}
                        initial={reduce ? false : { opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.15 + i * 0.14, ease: EASE }}
                      >
                        <button
                          type="button"
                          data-target={`idea-${i}`}
                          onClick={manual(() => pickIdea(i))}
                          aria-pressed={on}
                          className={cn(
                            "flex w-full items-start justify-between gap-3 rounded-[12px] border p-4 text-left transition-colors duration-300",
                            on
                              ? "border-rl-ink bg-rl-soft"
                              : "border-rl-line bg-rl-surface hover:border-rl-ink/40",
                          )}
                        >
                          <span>
                            <span className="block text-[15px] font-semibold tracking-[-0.02em]">
                              {idea.title}
                            </span>
                            <span className="mt-0.5 block text-[13px] leading-snug text-rl-muted">
                              {idea.angle}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
                              on ? "border-rl-ink bg-rl-ink text-rl-surface" : "border-rl-line text-transparent",
                            )}
                            aria-hidden="true"
                          >
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                        </button>
                      </motion.li>
                    );
                  })}
                </ul>
              </Pane>
            )}

            {step === 2 && (
              <Pane id="preview" key="preview">
                <div className="mb-3 flex items-center justify-between text-[12px] text-rl-muted">
                  <span className="font-medium">Your image</span>
                  <span>{sc.ideas[sc.pick].title}</span>
                </div>
                <Developing src={sc.photo} position={sc.position} />
                <p className="mt-3 text-[13px] text-rl-muted">
                  Preview it first. Nothing is posted until you say so.
                </p>
                <div className="mt-auto flex justify-end">
                  <button
                    type="button"
                    data-target="approve"
                    onClick={manual(approve)}
                    className={primaryBtn}
                  >
                    Looks good, add a caption
                  </button>
                </div>
              </Pane>
            )}

            {step === 3 && (
              <Pane id="publish" key="publish">
                <div className="flex gap-3.5">
                  <img
                    src={sc.photo}
                    alt=""
                    className="h-[104px] w-[104px] shrink-0 rounded-[10px] object-cover"
                    style={{ objectPosition: sc.position }}
                  />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-rl-muted">Caption</p>
                    <motion.p
                      className="mt-1 text-[15px] leading-[1.4]"
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
                    >
                      {sc.caption}
                    </motion.p>
                  </div>
                </div>

                <p className="mb-2 mt-5 text-[12px] font-medium text-rl-muted">Hashtags</p>
                <div className="flex min-h-[34px] flex-wrap gap-2">
                  {sc.tags.slice(0, tagsShown).map((t) => (
                    <motion.span
                      key={t}
                      className="rounded-[8px] bg-rl-soft px-2.5 py-1.5 text-[12px] font-medium leading-none"
                      initial={reduce ? false : { opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, ease: EASE }}
                    >
                      {t}
                    </motion.span>
                  ))}
                </div>

                <p className="mb-2 mt-5 text-[12px] font-medium text-rl-muted">Posting to</p>
                <div className="flex gap-2">
                  {PLATFORMS.map((p) => (
                    <PlatformBadge key={p} platform={p} size="md" />
                  ))}
                </div>

                <div className="mt-auto flex flex-wrap justify-end gap-2.5">
                  <button type="button" onClick={manual(() => finish("posted"))} className={ghostBtn}>
                    Post now
                  </button>
                  <button
                    type="button"
                    data-target="schedule"
                    onClick={manual(() => finish("scheduled"))}
                    className={primaryBtn}
                  >
                    Schedule for {sc.when.split(",")[0]}
                  </button>
                </div>
              </Pane>
            )}

            {step === 4 && (
              <Pane id="done" key="done">
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <motion.span
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-rl-ink text-rl-surface"
                    initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 160, damping: 16 }}
                  >
                    <Check className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
                  </motion.span>
                  <p className="mt-5 text-[22px] font-semibold tracking-[-0.04em]">
                    {doneKind === "scheduled" ? `Scheduled for ${sc.when}` : "Posted to 5 platforms"}
                  </p>
                  <p className="mt-1 text-[14px] text-rl-muted">Instagram, LinkedIn, X, Facebook and YouTube</p>

                  {doneKind === "scheduled" && (
                    <div className="mt-7 grid w-full max-w-[360px] grid-cols-7 gap-1.5">
                      {DAYS.map((d, i) => (
                        <div
                          key={d}
                          className={cn(
                            "relative flex aspect-[3/4] flex-col items-center rounded-[8px] border pt-1.5 text-[10px]",
                            i === sc.day ? "border-rl-ink bg-rl-surface" : "border-rl-line text-rl-muted",
                          )}
                        >
                          {d}
                          {i === sc.day && (
                            <motion.img
                              src={sc.photo}
                              alt=""
                              className="absolute inset-x-1 bottom-1 h-[58%] w-[calc(100%-8px)] rounded-[5px] object-cover"
                              style={{ objectPosition: sc.position }}
                              initial={reduce ? false : { y: -60, opacity: 0, scale: 1.3 }}
                              animate={{ y: 0, opacity: 1, scale: 1 }}
                              transition={{ type: "spring", stiffness: 110, damping: 15, delay: 0.3 }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-center">
                  <button type="button" onClick={manual(restart)} className="text-[13px] text-rl-muted underline underline-offset-4 hover:text-rl-ink">
                    Make another post
                  </button>
                </div>
              </Pane>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 hidden md:block">
        <GhostCursor x={cx} y={cy} visible={cursorOn} clicks={clicks} />
      </div>
    </div>
  );
}
