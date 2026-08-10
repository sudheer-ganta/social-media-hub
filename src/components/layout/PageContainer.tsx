import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Standard page wrapper: consistent max width, padding and an
 * animated entrance shared by every route.
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
      className={cn("w-full min-w-0 overflow-x-hidden px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8", className)}
    >
      {(title || actions) && (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </motion.div>
  );
}
