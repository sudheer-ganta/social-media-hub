import { Link } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";

/**
 * The top bar for signed-out pages that live outside the landing page's own
 * scrolling shell (pricing and the legal pages). One line at every width, 64px.
 */
export function PublicHeader() {
  return (
    <header className="mx-auto flex h-16 w-full max-w-[1320px] items-center justify-between px-4 sm:px-8 lg:px-10">
      <Link to="/" aria-label="Rally home">
        <Logo size="md" />
      </Link>
      <nav aria-label="Primary" className="flex items-center gap-1.5 text-[14px] font-medium">
        <Link
          to="/pricing"
          className="hidden h-10 items-center rounded-xl px-3.5 text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
        >
          Pricing
        </Link>
        <Link
          to="/login"
          className="inline-flex h-10 items-center rounded-xl px-3.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          Login
        </Link>
        <Link
          to="/register"
          className="inline-flex h-10 items-center rounded-xl bg-foreground px-4 text-background transition-opacity hover:opacity-90 active:scale-[0.98]"
        >
          Start free trial
        </Link>
      </nav>
    </header>
  );
}
