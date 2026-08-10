import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LogOut, Monitor, Moon, PenLine, Settings, Sun } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/hooks/useTheme";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/app/AuthProvider";
import { initialsOf } from "@/utils/text";
import { cn } from "@/lib/utils";
import type { Theme } from "@/types";

/**
 * The product's sections, in workflow order — plan, then make, then look back.
 * Compose is deliberately absent: it is the primary action on the right, not a
 * destination competing with the places you keep returning to.
 */
export const SECTIONS = [
  { to: "/", label: "Today" },
  { to: "/calendar", label: "Plan" },
  { to: "/posts", label: "Library" },
  { to: "/analytics", label: "Insights" },
  { to: "/integrations", label: "Accounts" },
];

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function sectionFor(pathname: string): string {
  if (pathname === "/") return "/";
  const match = SECTIONS.find((s) => s.to !== "/" && pathname.startsWith(s.to));
  return match?.to ?? "";
}

/**
 * The masthead — FlowPost's only navigation on desktop.
 *
 * There is no sidebar. That 248px belongs to content permanently, which is the
 * whole point: a publishing workspace should give its width to what is being
 * published. The active section is marked by an ink underline that slides
 * between items rather than a filled pill, so navigation never introduces a
 * colour the product does not otherwise have.
 */
export function Masthead() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { settings } = useSettings();
  const { user, signOut } = useAuth();

  const active = sectionFor(location.pathname);

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    settings.fullName ||
    "Your profile";
  const displayEmail = user?.email || settings.email || "Free plan";

  const ThemeIcon = THEME_OPTIONS.find((o) => o.value === theme)?.icon ?? Monitor;

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Signed out");
    } catch (error) {
      toast.error("Sign out failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <header className="glass sticky top-0 z-30 border-b">
      <div className="flex h-14 items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link to="/" aria-label="FlowPost home" className="shrink-0">
          {/* Supplied brand asset. Rendered, never restyled. */}
          <Logo size="sm" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {SECTIONS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={cn(
                "relative px-3 py-2 text-sm transition-colors",
                active === to
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              {active === to && (
                <motion.span
                  layoutId="masthead-underline"
                  className="absolute inset-x-3 -bottom-px h-0.5 bg-foreground"
                  transition={{ type: "spring", bounce: 0.18, duration: 0.4 }}
                />
              )}
            </NavLink>
          ))}
        </nav>

        {/* Current section, for the narrow viewports that hide the nav. */}
        <span className="text-meta lg:hidden">
          {SECTIONS.find((s) => s.to === active)?.label ?? "Compose"}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            className="hidden lg:inline-flex"
            onClick={() => navigate("/posts/new")}
          >
            <PenLine />
            Compose
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Appearance">
                <ThemeIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel>Appearance</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn(theme === value && "bg-accent")}
                >
                  <Icon />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="Account menu" className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {initialsOf(displayName)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {displayEmail}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <Settings />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleSignOut}
              >
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
