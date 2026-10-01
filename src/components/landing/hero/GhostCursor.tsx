import { motion, type MotionValue } from "framer-motion";
import { MousePointer2 } from "lucide-react";

/**
 * A demo cursor that performs the product for the visitor: it selects chips,
 * then presses Rally AI. Positioned in stage coordinates via motion values.
 */
export function GhostCursor({
  x,
  y,
  visible,
  clicks,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  visible: boolean;
  clicks: number;
}) {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-30"
      style={{ x, y }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Click ring: re-keyed on every click so it replays. */}
      <motion.span
        key={clicks}
        className="absolute -left-3 -top-3 block h-6 w-6 rounded-full border-2 border-rl-ink/50"
        initial={{ scale: 0.3, opacity: clicks === 0 ? 0 : 0.8 }}
        animate={{ scale: 1.6, opacity: 0 }}
        transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
      />
      <MousePointer2
        className="relative h-[22px] w-[22px] fill-rl-ink stroke-rl-surface drop-shadow-[0_4px_8px_rgba(23,23,23,0.25)]"
        strokeWidth={1.6}
      />
    </motion.div>
  );
}
