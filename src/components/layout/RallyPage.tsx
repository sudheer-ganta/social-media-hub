import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import "@fontsource-variable/geist";
import "@/components/dashboard/dashboard.css";
import { cn } from "@/lib/utils";

interface RallyPageProps {
  title: string;
  description?: string;
  onBack?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

const EASE = [0.2, 0.8, 0.2, 1] as const;

/** Page shell for Library and Create: the dashboard's paper, type and header rhythm. */
export function RallyPage({ title, description, onBack, actions, children, className }: RallyPageProps) {
  const reduce = useReducedMotion();
  const rise = (delay: number) => ({
    initial: reduce ? (false as const) : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay, ease: EASE },
  });

  return (
    <div
      className={cn(
        "rd rd-app min-h-full w-full min-w-0 overflow-x-clip bg-rl-bg px-4 pb-12 pt-8 sm:px-8 lg:px-10 lg:pt-10",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[1320px]">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div className="min-w-0">
            {onBack && (
              <motion.button
                {...rise(0)}
                type="button"
                onClick={onBack}
                className="mb-5 inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-rl-line bg-rl-surface px-3 text-[13.5px] font-semibold transition-colors hover:border-rl-ink"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </motion.button>
            )}
            <motion.h1
              {...rise(0.04)}
              className="text-[clamp(44px,5.6vw,76px)] font-extrabold leading-[0.95] tracking-[-0.06em]"
            >
              {title}
              <span className="text-rl-accent">.</span>
            </motion.h1>
            {description && (
              <motion.p
                {...rise(0.1)}
                className="mt-3 max-w-[58ch] text-[17px] leading-relaxed tracking-[-0.01em] text-rl-muted"
              >
                {description}
              </motion.p>
            )}
          </div>
          {actions && (
            <motion.div {...rise(0.14)} className="flex items-center gap-2">
              {actions}
            </motion.div>
          )}
        </header>

        <motion.div {...rise(0.18)}>{children}</motion.div>
      </div>
    </div>
  );
}
