import { useId } from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "default" | "white" | "dark";
}

export function FlowPostIcon({ className = "h-8 w-8" }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const g1 = `fpG1${uid}`;
  const g2 = `fpG2${uid}`;
  const gGlow = `fpGlow${uid}`;

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={g1} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="50%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>
        <linearGradient id={g2} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3730A3" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>
        <linearGradient id={gGlow} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#C084FC" />
        </linearGradient>
      </defs>

      {/* Outer subtle guide ring */}
      <circle cx="50" cy="50" r="42" stroke={`url(#${g2})`} strokeWidth="1.5" strokeOpacity="0.4" fill="none" />

      {/* Overlapping Spiraling Rings (Swirl Node Pattern) */}
      <circle cx="50" cy="38" r="26" stroke={`url(#${g1})`} strokeWidth="2.5" fill="none" strokeOpacity="0.9" />
      <circle cx="60" cy="46" r="26" stroke={`url(#${g1})`} strokeWidth="2.5" fill="none" strokeOpacity="0.9" />
      <circle cx="54" cy="58" r="26" stroke={`url(#${gGlow})`} strokeWidth="2.5" fill="none" strokeOpacity="0.9" />
      <circle cx="42" cy="54" r="26" stroke={`url(#${g1})`} strokeWidth="2.5" fill="none" strokeOpacity="0.9" />
      <circle cx="38" cy="44" r="26" stroke={`url(#${g1})`} strokeWidth="2.5" fill="none" strokeOpacity="0.9" />

      {/* Inner ring */}
      <circle cx="50" cy="50" r="18" stroke={`url(#${gGlow})`} strokeWidth="2.5" fill="none" />

      {/* Central Solid Circle matching UI Accent/Primary */}
      <circle cx="50" cy="50" r="12" fill={`url(#${g1})`} />
    </svg>
  );
}

export function Logo({
  className,
  iconOnly = false,
  size = "md",
  variant = "default",
}: LogoProps) {
  const sizeClasses = {
    sm: { icon: "h-7 w-7", text: "text-lg" },
    md: { icon: "h-8 w-8", text: "text-xl" },
    lg: { icon: "h-10 w-10", text: "text-2xl" },
    xl: { icon: "h-16 w-16", text: "text-4xl" },
  }[size];

  const textColor = {
    default: "text-foreground",
    white: "text-white",
    dark: "text-slate-900",
  }[variant];

  return (
    <div className={cn("inline-flex items-center gap-2.5 font-bold tracking-tight select-none", className)}>
      <FlowPostIcon className={sizeClasses.icon} />
      {!iconOnly && (
        <span className={cn(sizeClasses.text, textColor, "font-extrabold tracking-tight")}>
          {/* Pinned to the brand blue the wordmark has always rendered as.
              It read `text-primary` when `--primary` happened to be this
              colour; now that actions are ink, pinning is what preserves the
              asset unchanged. */}
          Flow<span className="text-[#2563EB]">Post</span>
        </span>
      )}
    </div>
  );
}
