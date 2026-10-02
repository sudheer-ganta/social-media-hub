import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "default" | "white" | "dark";
}

export function RallyIcon({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <rect x="2" y="5" width="20" height="11" rx="5.5" transform="rotate(-18 12 10.5)" fill="#FF4D32" />
      <rect x="10" y="15" width="20" height="11" rx="5.5" transform="rotate(-18 20 20.5)" fill="#FF4D32" opacity="0.82" />
    </svg>
  );
}

export const FlowPostIcon = RallyIcon;
export const RallyMark = RallyIcon;

export function Logo({
  className,
  iconOnly = false,
  size = "md",
  variant = "default",
}: LogoProps) {
  const sizeClasses = {
    sm: { icon: "h-6 w-6", text: "text-[18px]" },
    md: { icon: "h-7 w-7", text: "text-[20px]" },
    lg: { icon: "h-9 w-9", text: "text-[24px]" },
    xl: { icon: "h-12 w-12", text: "text-[32px]" },
  }[size];

  const textColor = {
    default: "text-foreground",
    white: "text-white",
    dark: "text-slate-900",
  }[variant];

  return (
    <div className={cn("inline-flex items-center gap-2.5 font-semibold tracking-[-0.04em] select-none", className)}>
      <RallyIcon className={sizeClasses.icon} />
      {!iconOnly && (
        <span className={cn(sizeClasses.text, textColor, "font-semibold tracking-[-0.04em]")}>
          Rally
        </span>
      )}
    </div>
  );
}

