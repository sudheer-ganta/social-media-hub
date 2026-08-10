import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Logo } from "@/components/brand/Logo";

const SEEN_KEY = "fp-boot-seen";

/**
 * Twelve scattered fragments — the raw material of a feed. Each starts
 * somewhere loose and lands in one of three columns, so the settling reads as
 * organisation rather than decoration.
 */
const FRAGMENTS = Array.from({ length: 12 }, (_, i) => {
  const column = i % 3;
  const row = Math.floor(i / 3);
  return {
    id: i,
    // Where it starts: scattered, off-grid.
    fromX: (i * 67) % 260 - 130,
    fromY: (i * 43) % 180 - 90,
    fromR: (i % 5) * 9 - 18,
    // Where it lands: three tidy columns.
    toX: (column - 1) * 44,
    toY: row * 15 - 22,
    wide: i % 4 === 0,
  };
});

/**
 * FlowPost's opening moment: content fragments scatter, settle into columns,
 * the columns draw into a single rail, the rail collapses into the mark.
 * "All your social workflows. One flow." ~1.2s.
 *
 * It is a cover, not a gate — the workspace mounts and fetches underneath, so
 * nobody waits on it. Shown once per browser session, and not at all under
 * reduced motion, where the workspace is simply already there.
 */
export function BootSequence() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(
    () => !reduced && sessionStorage.getItem(SEEN_KEY) !== "1",
  );

  useEffect(() => {
    if (!visible) return;
    sessionStorage.setItem(SEEN_KEY, "1");
    const t = setTimeout(() => setVisible(false), 1200);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="boot"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
          aria-hidden="true"
        >
          <div className="relative flex h-56 w-72 items-center justify-center">
            {FRAGMENTS.map((f) => (
              <motion.span
                key={f.id}
                initial={{
                  x: f.fromX,
                  y: f.fromY,
                  rotate: f.fromR,
                  opacity: 0,
                  scaleX: 1,
                }}
                animate={{
                  // scatter → settle into columns → collapse to the rail
                  x: [f.fromX, f.toX, 0],
                  y: [f.fromY, f.toY, 0],
                  rotate: [f.fromR, 0, 0],
                  opacity: [0, 1, 0],
                  scaleX: [1, 1, 0.12],
                }}
                transition={{
                  duration: 0.92,
                  times: [0, 0.55, 1],
                  ease: [0.32, 0.72, 0, 1],
                  delay: (f.id % 4) * 0.03,
                }}
                className="absolute h-[3px] rounded-full bg-foreground/25"
                style={{ width: f.wide ? 34 : 22 }}
              />
            ))}

            {/* The rail the columns collapse into. */}
            <motion.span
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: [0, 1, 0], opacity: [0, 1, 0] }}
              transition={{
                duration: 0.5,
                delay: 0.5,
                times: [0, 0.5, 1],
                ease: [0.32, 0.72, 0, 1],
              }}
              className="absolute h-[3px] w-40 rounded-full bg-foreground/50"
            />

            {/* The mark, exactly as supplied. */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.78, ease: [0.32, 0.72, 0, 1] }}
            >
              <Logo size="lg" />
            </motion.div>

            {/* The masthead rule drawing across as the workspace arrives. */}
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.35, delay: 0.92, ease: [0.4, 0, 0.2, 1] }}
              className="absolute inset-x-0 bottom-[38%] h-px origin-left bg-border"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
