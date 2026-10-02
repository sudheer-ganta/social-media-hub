import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * One unboxed block of a settings tab. Hierarchy is the heading and the
 * hairlines inside `children`, not a card around it.
 */
export function SettingsSection({
  title,
  description,
  actions,
  children,
  className,
}: SettingsSectionProps) {
  return (
    <section className={cn("space-y-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          {description && (
            <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

interface SettingsGroupProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A form group: the label column on the left, the controls on the right.
 * Collapses to a single column below `lg`. Groups are separated by a single
 * top hairline, so the page reads as a ruled sheet rather than a stack of cards.
 */
export function SettingsGroup({
  title,
  description,
  children,
  className,
}: SettingsGroupProps) {
  return (
    <div
      className={cn(
        "grid gap-x-10 gap-y-5 border-t py-8 first:border-t-0 first:pt-0 lg:grid-cols-[200px_minmax(0,1fr)]",
        className,
      )}
    >
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
