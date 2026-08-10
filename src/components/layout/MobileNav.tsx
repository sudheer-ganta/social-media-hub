import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart3,
  CalendarDays,
  Home,
  Images,
  PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Four destinations plus Compose. Not the desktop sections shrunk — Accounts
 * and Settings move into the masthead's account menu, because on a phone the
 * bottom bar is reserved for what someone opens the app to do, and nobody
 * opens a publishing app to manage OAuth tokens.
 */
const ITEMS = [
  { to: "/", label: "Today", icon: Home },
  { to: "/calendar", label: "Plan", icon: CalendarDays },
  { to: "/posts", label: "Library", icon: Images },
  { to: "/analytics", label: "Insights", icon: BarChart3 },
];

export function MobileNav() {
  const location = useLocation();
  const composing = location.pathname.startsWith("/posts/new");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur-md lg:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-lg grid-cols-5 items-center px-2 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5">
        {ITEMS.slice(0, 2).map((item) => (
          <Item key={item.to} {...item} />
        ))}

        <NavLink
          to="/posts/new"
          aria-label="Compose"
          className="flex items-center justify-center py-1"
        >
          <span
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full shadow-soft transition-transform active:scale-95",
              composing
                ? "bg-secondary text-foreground ring-1 ring-border"
                : "bg-primary text-primary-foreground",
            )}
          >
            <PenLine className="h-[18px] w-[18px]" />
          </span>
        </NavLink>

        {ITEMS.slice(2).map((item) => (
          <Item key={item.to} {...item} />
        ))}
      </div>
    </nav>
  );
}

function Item({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: typeof Home;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "relative flex flex-col items-center gap-1 py-1.5 transition-colors",
          isActive ? "text-foreground" : "text-muted-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="mobile-nav-marker"
              className="absolute -top-1.5 h-0.5 w-7 rounded-full bg-foreground"
              transition={{ type: "spring", bounce: 0.18, duration: 0.4 }}
            />
          )}
          <Icon className="h-[18px] w-[18px]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.06em]">
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}
