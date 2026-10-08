import { motion } from "framer-motion";
import "@fontsource-variable/geist";
import "@/components/dashboard/dashboard.css";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  title?: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Standard page wrapper: consistent max width, padding and an
 * animated entrance shared by every route.
 *
 * The horizontal guard is `overflow-x-clip`, never `overflow-x-hidden`.
 * `hidden` on one axis makes the other axis compute to `auto`, which turns
 * every page into its own scroll container — and a scroll container is what
 * `position: sticky` measures against, so the composer's action bar and its
 * preview column silently stopped sticking to the viewport. `clip` blocks
 * horizontal overflow exactly the same way without creating a scrollport.
 */
export function PageContainer({
  title,
  description,
  actions,
  children,
  className,
}: PageContainerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className={cn("rd rd-app w-full min-w-0 overflow-x-clip px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10", className)}
    >
      {(title || actions) && (
        <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            {title && (
              typeof title === "string" ? (
                <h1 className="text-[clamp(32px,3.8vw,48px)] font-extrabold leading-[1.02] tracking-[-0.05em]">
                  {title}
                  <span className="text-rl-accent">.</span>
                </h1>
              ) : (
                title
              )
            )}
            {description && (
              <p className="mt-2 max-w-[62ch] text-[15.5px] leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </motion.div>
  );
}
