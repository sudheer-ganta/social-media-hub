import { AnimatePresence, motion } from "framer-motion";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Calendar,
  ChevronsLeft,
  FileText,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  PenLine,
  Plug,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/useTheme";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/app/AuthProvider";
import { initialsOf } from "@/utils/text";
import { cn } from "@/lib/utils";
import type { Theme } from "@/types";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/calendar", label: "Plan", icon: Calendar },
  { to: "/posts", label: "Library", icon: FileText },
  { to: "/analytics", label: "Insights", icon: BarChart3 },
  { to: "/integrations", label: "Accounts", icon: Plug },
  { to: "/settings", label: "Settings", icon: Settings },
];

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const { settings } = useSettings();
  const { user, signOut } = useAuth();
  const location = useLocation();

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    settings.fullName ||
    "Your profile";
  const displayEmail = user?.email || settings.email || "Free plan";

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

  const ThemeIcon =
    THEME_OPTIONS.find((o) => o.value === theme)?.icon ?? Monitor;

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r bg-card lg:flex"
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-12 items-center gap-3 border-b px-6",
          collapsed && "justify-center px-0",
        )}
      >
        <Link to="/" className="flex items-center gap-2.5" aria-label="FlowPost Home">
          <Logo iconOnly={collapsed} size="md" />
        </Link>
      </div>

      {/* Compose Button */}
      <div className="p-3">
        {collapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button asChild size="icon" className="w-full shadow-glow">
                <Link to="/posts/new" aria-label="Compose">
                  <PenLine className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Compose</TooltipContent>
          </Tooltip>
        ) : (
          <Button asChild className="w-full shadow-glow">
            <Link to="/posts/new" className="flex items-center gap-2">
              <PenLine className="h-4 w-4" />
              Compose
            </Link>
          </Button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 scrollbar-thin">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const active =
            to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          const link = (
            <NavLink
              key={to}
              to={to}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-md bg-accent"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                />
              )}
              <Icon className="relative z-10 h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="relative z-10">{label}</span>}
            </NavLink>
          );

          return collapsed ? (
            <Tooltip key={to} delayDuration={0}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="space-y-1 border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <ThemeIcon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>Theme</span>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-40">
            <DropdownMenuLabel>Appearance</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <DropdownMenuItem
                key={value}
                onClick={() => setTheme(value)}
                className={cn(theme === value && "bg-accent text-accent-foreground")}
              >
                <Icon className="h-4 w-4 mr-2" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={onToggleCollapse}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <ChevronsLeft
            className={cn(
              "h-[18px] w-[18px] shrink-0 transition-transform duration-300",
              collapsed && "rotate-180",
            )}
          />
          {!collapsed && <span>Collapse</span>}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent",
                collapsed && "justify-center px-0",
              )}
              aria-label="Account menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">
                  {initialsOf(displayName)}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{displayName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {displayEmail}
                  </p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {displayEmail}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.aside>
  );
}
