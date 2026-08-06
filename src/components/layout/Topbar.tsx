import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Calendar,
  FileText,
  LayoutDashboard,
  Menu,
  Plus,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/posts": "Posts",
  "/posts/new": "Create Post",
  "/calendar": "Calendar",
  "/analytics": "Analytics",
  "/settings": "Settings",
};

const MOBILE_NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/posts", label: "Posts", icon: FileText },
  { to: "/calendar", label: "Calendar", icon: Calendar },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Topbar() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = PAGE_TITLES[location.pathname] ?? "Social Content Hub";

  return (
    <header className="glass sticky top-0 z-20 border-b">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X /> : <Menu />}
          </Button>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary lg:hidden">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        </div>

        <Button asChild size="sm" className="shadow-glow">
          <Link to="/posts/new">
            <Plus />
            <span className="hidden sm:inline">Create Post</span>
            <span className="sm:hidden">New</span>
          </Link>
        </Button>
      </div>

      {/* Mobile navigation drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t lg:hidden"
          >
            <div className="space-y-1 p-3">
              {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/60",
                    )
                  }
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {label}
                </NavLink>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
