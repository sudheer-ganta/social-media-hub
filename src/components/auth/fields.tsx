import { useState, type ComponentProps, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Form pieces for the sign-in family of pages. They carry the landing page's
 * language (cream, ink, one orange underline) and work with react-hook-form's
 * `register()` by spreading it straight onto <Field>.
 */

const fieldClass =
  "h-[52px] w-full rounded-[12px] border border-rl-line bg-rl-surface px-4 text-[16px] text-rl-ink outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-rl-muted/70 hover:border-rl-ink/30 focus:border-rl-ink focus:ring-4 focus:ring-rl-ink/10 aria-[invalid=true]:border-[#b42318]";

interface FieldProps extends ComponentProps<"input"> {
  id: string;
  label: string;
  error?: string;
  /** Sits opposite the label, e.g. a "Forgot password?" link. */
  aside?: ReactNode;
}

export function Field({ id, label, error, aside, className, ...rest }: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor={id} className="block text-[14px] font-medium">
          {label}
        </label>
        {aside}
      </div>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className={cn(fieldClass, className)}
        {...rest}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-[13px] font-medium text-[#b42318]">
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField(props: Omit<FieldProps, "type">) {
  const [show, setShow] = useState(false);
  const { id, label, error, aside, className, ...rest } = props;
  const errorId = `${id}-error`;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor={id} className="block text-[14px] font-medium">
          {label}
        </label>
        {aside}
      </div>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={cn(fieldClass, "pr-12", className)}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[10px] text-rl-muted transition-colors hover:text-rl-ink"
        >
          {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-[13px] font-medium text-[#b42318]">
          {error}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({
  loading,
  loadingLabel,
  children,
}: {
  loading: boolean;
  loadingLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="group inline-flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[12px] bg-rl-ink text-[15px] font-medium text-rl-surface transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {loadingLabel}
        </>
      ) : (
        <>
          {children}
          <ArrowRight
            className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </>
      )}
    </button>
  );
}

/** Inline link with the orange underline used across the page. */
export function FormLink({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "font-medium underline decoration-rl-accent decoration-2 underline-offset-4 transition-colors hover:text-rl-accent",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Quiet confirmation block for "check your inbox" style states. */
export function Notice({
  icon,
  children,
  action,
}: {
  icon: ReactNode;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rl-ink text-rl-surface">
        {icon}
      </span>
      <p className="mt-4 text-[15px] leading-[1.55] text-rl-muted">{children}</p>
      <div className="mt-6">{action}</div>
    </div>
  );
}

export function NoticeButton({
  to,
  children,
  variant = "solid",
}: {
  to: string;
  children: ReactNode;
  variant?: "solid" | "outline";
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[12px] text-[15px] font-medium transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]",
        variant === "solid"
          ? "bg-rl-ink text-rl-surface"
          : "border border-rl-line bg-rl-surface hover:border-rl-ink/40",
      )}
    >
      {children}
    </Link>
  );
}

/** Lets the photo wall finish developing before the page changes. Skipped for reduced motion. */
export function afterShutter(ms = 650) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/** 0 to 1 completion of a text value against a target length. */
export function filled(value: string | undefined, target: number) {
  return Math.min((value ?? "").length, target) / target;
}
