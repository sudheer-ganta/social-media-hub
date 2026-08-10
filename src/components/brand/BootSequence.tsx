import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FlowPostIcon } from "@/components/brand/Logo";

const SEEN_KEY = "fp-boot-seen";

export function BootSequence() {
  const [visible, setVisible] = useState(
    () => localStorage.getItem(SEEN_KEY) !== "1",
  );

  useEffect(() => {
    if (!visible) return;
    localStorage.setItem(SEEN_KEY, "1");
    // Auto-dismiss after animation completes (1.8s)
    const t = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="boot"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background"
          aria-hidden="true"
        >
          {/* Ripple rings */}
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute rounded-full border border-primary/30"
              initial={{ width: 56, height: 56, opacity: 0.7 }}
              animate={{ width: 56 + (i + 1) * 48, height: 56 + (i + 1) * 48, opacity: 0 }}
              transition={{
                duration: 1.4,
                delay: i * 0.3,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
          ))}

          {/* Logo icon — scale in then float */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <FlowPostIcon className="h-14 w-14 drop-shadow-[0_0_18px_rgba(99,102,241,0.6)]" />
            </motion.div>
          </motion.div>

          {/* Brand name */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="mt-5 text-xl font-extrabold tracking-tight text-foreground select-none"
          >
            Flow<span className="text-[#2563EB]">Post</span>
          </motion.p>

          {/* Gradient progress bar */}
          <motion.div
            className="absolute bottom-12 left-1/2 h-[3px] -translate-x-1/2 rounded-full"
            style={{
              background: "linear-gradient(90deg, #4F46E5, #818CF8, #C084FC)",
              boxShadow: "0 0 12px rgba(99,102,241,0.7)",
            }}
            initial={{ width: 0, opacity: 1 }}
            animate={{ width: 160, opacity: [1, 1, 0] }}
            transition={{ duration: 1.6, ease: [0.4, 0, 0.2, 1] }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
