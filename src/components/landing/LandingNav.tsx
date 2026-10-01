import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "./data";
import { RallyMark, useLandingScroll } from "./primitives";

/** Full-width bar at the top that condenses into a floating pill once you scroll. */
export function LandingNav() {
  const scrollRef = useLandingScroll();
  const { scrollY } = useScroll({ container: scrollRef });
  const [condensed, setCondensed] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setCondensed(v > 32));

  const jump = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    scrollRef.current
      ?.querySelector(href)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <header className="pointer-events-none sticky top-0 z-40 px-4 pt-3 sm:px-6">
      <motion.nav
        layout
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        aria-label="Primary"
        className={cn(
          "pointer-events-auto mx-auto flex h-16 items-center justify-between gap-4 border px-4 sm:px-5",
          condensed
            ? "max-w-4xl rounded-full border-rl-line bg-rl-surface/80 shadow-[0_10px_30px_-14px_rgb(40_24_10/0.25)] backdrop-blur-xl"
            : "max-w-[1240px] rounded-2xl border-transparent bg-transparent",
        )}
      >
        <Link to="/" className="flex items-center gap-2" aria-label="Rally home">
          <RallyMark className="h-8 w-8" />
          <span className="text-[22px] font-semibold tracking-[-0.04em]">Rally</span>
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                onClick={jump(link.href)}
                className="rounded-full px-3.5 py-2 text-sm font-medium text-rl-muted transition-colors hover:bg-rl-ink/5 hover:text-rl-ink"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden h-10 items-center rounded-xl border border-rl-line bg-rl-surface px-5 text-sm font-medium transition-colors hover:bg-rl-ink/5 sm:inline-flex"
          >
            Login
          </Link>
          <Link
            to="/register"
            className="group inline-flex h-10 items-center gap-2 rounded-xl bg-rl-ink px-5 text-sm font-medium text-rl-bg transition-transform active:scale-[0.98]"
          >
            Get started
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </motion.nav>
    </header>
  );
}
