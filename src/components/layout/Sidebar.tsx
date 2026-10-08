import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Calendar,
  CalendarClock,
  ChevronDown,
  ChevronsLeft,
  CreditCard,
  FileText,
  Images,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  PenLine,
  Plug,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import dayjs from "dayjs";
import { toast } from "sonner";
import "@fontsource-variable/geist";
import "./sidebar.css";
import { Logo } from "@/components/brand/Logo";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBrands } from "@/hooks/useBrands";
import { useDashboardStats, useUpcomingPosts } from "@/hooks/useDashboard";
import { useTheme } from "@/hooks/useTheme";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/app/AuthProvider";
import { publishDayjs } from "@/utils/date";
import { initialsOf } from "@/utils/text";
import { cn } from "@/lib/utils";

type CountKey = "scheduled" | "drafts";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Real workspace count, shown only when above zero. */
  count?: CountKey;
  /** Overrides the default "path starts with `to`" test. */
  match?: (path: string) => boolean;
}

const NAV_MAIN: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, match: (p) => p === "/" },
  { to: "/posts/new", label: "Create", icon: PenLine },
  { to: "/calendar", label: "Plan", icon: Calendar },
  { to: "/scheduled", label: "Schedule", icon: CalendarClock, count: "scheduled" },
  {
    to: "/posts",
    label: "Library",
    icon: FileText,
    count: "drafts",
    match: (p) => p.startsWith("/posts") && !p.startsWith("/posts/new"),
  },
  { to: "/creatives", label: "Creatives", icon: Images },
  { to: "/analytics", label: "Insights", icon: BarChart3 },
  { to: "/integrations", label: "Accounts", icon: Plug },
];

const NAV_FOOT: NavItem[] = [
  { to: "/billing", label: "Plans & billing", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
];

/** "42m", "3h 12m", "2d 4h", or "now" once the time has passed. */
function until(target: dayjs.Dayjs, now: dayjs.Dayjs): string {
  const mins = target.diff(now, "minute");
  if (mins <= 0) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const { settings } = useSettings();
  const { user, signOut } = useAuth();
  const { brands } = useBrands();
  const location = useLocation();
  const reduce = useReducedMotion();
  const stats = useDashboardStats();
  const upcoming = useUpcomingPosts();

  // Coarse clock for the countdown. One tick a minute is all the precision it shows.
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const id = window.setInterval(() => setNow(dayjs()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const next = useMemo(
    () =>
      (upcoming.data ?? [])
        .filter((p) => p.status === "scheduled")
        .sort((a, b) => publishDayjs(a).valueOf() - publishDayjs(b).valueOf())[0],
    [upcoming.data],
  );

  const counts: Record<CountKey, number> = {
    scheduled: stats.data?.scheduled ?? 0,
    drafts: stats.data?.drafts ?? 0,
  };

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) || settings.fullName || "Your profile";
  const displayEmail = user?.email || settings.email || displayName;
  const brand = brands[0];

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

  const nextTheme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  const tip = (key: string, label: string, node: React.ReactNode) =>
    collapsed ? (
      <Tooltip key={key} delayDuration={0}>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    ) : (
      node
    );

  const renderItem = ({ to, label, icon: Icon, count, match }: NavItem) => {
    const active = match ? match(location.pathname) : location.pathname.startsWith(to);
    const n = count ? counts[count] : 0;
    const link = (
      <NavLink
        to={to}
        aria-current={active ? "page" : undefined}
        className={cn("rs-link", collapsed && "justify-center px-0")}
      >
        {active && (
          <motion.span
            layoutId="rs-bar"
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
            className="rs-bar"
            style={collapsed ? { left: -12 } : undefined}
          />
        )}
        <Icon className="rs-icon h-[20px] w-[20px]" strokeWidth={1.7} />
        {!collapsed && (
          <>
            <span className="flex-1">{label}</span>
            {n > 0 && <span className="rs-count">{n}</span>}
          </>
        )}
      </NavLink>
    );
    return <li key={to}>{tip(to, n > 0 ? `${label} (${n})` : label, link)}</li>;
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 88 : 272 }}
      transition={{ duration: reduce ? 0 : 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      className="rs sticky top-0 z-30 hidden h-screen shrink-0 flex-col lg:flex"
    >
      {/* Brand row */}
      <div
        className={cn(
          "flex h-[72px] shrink-0 items-center justify-between px-6",
          collapsed && "flex-col justify-center gap-1 px-0 pt-2",
        )}
      >
        <Link to="/" aria-label="Rally home">
          <Logo iconOnly={collapsed} size="md" variant="white" />
        </Link>
        {tip(
          "collapse",
          collapsed ? "Expand" : "Collapse",
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rs-icon-btn"
          >
            <ChevronsLeft
              className={cn("h-4 w-4 transition-transform duration-300", collapsed && "rotate-180")}
              strokeWidth={1.75}
            />
          </button>,
        )}
      </div>

      {/* Workspace brand */}
      {brand && (
        <div className="px-3 pb-5">
          {tip(
            "brand",
            brand.name,
            <Link
              to="/settings?tab=brands"
              className={cn("rs-panel flex items-center gap-3 p-3", collapsed && "justify-center p-2")}
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[14px] font-bold tracking-[-0.02em]"
                style={{ background: "rgb(var(--rs-fg))", color: "rgb(var(--rs-bg))" }}
              >
                {brand.name.slice(0, 2).toUpperCase()}
              </span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold leading-tight tracking-[-0.02em]">
                      {brand.name}
                    </span>
                    <span className="rs-muted block truncate text-[12.5px]">
                      {brands.length} {brands.length === 1 ? "brand" : "brands"}
                    </span>
                  </span>
                  <ChevronDown className="rs-muted h-4 w-4 shrink-0" strokeWidth={1.75} />
                </>
              )}
            </Link>,
          )}
        </div>
      )}

      {/* Navigation */}
      <nav aria-label="Main" className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-3">
        <ul className="space-y-1">{NAV_MAIN.map(renderItem)}</ul>
        <ul className="mt-6 space-y-1">{NAV_FOOT.map(renderItem)}</ul>
      </nav>

      {/* Up next: the one thing worth glancing at from any page */}
      {!collapsed && (
        <div className="px-3 pt-3">
          {next ? (
            <Link to={`/posts/${next.id}/edit`} className="rs-panel block p-4">
              <span className="flex items-center justify-between">
                <span className="rs-muted text-[13px]">Up next</span>
                <span className="rs-muted flex items-center gap-1.5">
                  {next.platforms.slice(0, 3).map((p) => (
                    <PlatformIcon key={p} platform={p} className="h-3 w-3" />
                  ))}
                </span>
              </span>
              <span
                className="rs-num mt-2.5 block text-[32px]"
                style={{ color: "rgb(var(--rs-accent))" }}
              >
                {until(publishDayjs(next), now)}
              </span>
              <span className="mt-2 block truncate text-[13.5px] font-medium tracking-[-0.01em]">
                {next.title || "Untitled"}
              </span>
            </Link>
          ) : (
            <Link to="/posts/new" className="rs-panel block p-4">
              <span className="rs-muted block text-[13px]">Up next</span>
              <span className="mt-1.5 block text-[15px] font-semibold tracking-[-0.02em]">
                Nothing scheduled
              </span>
              <span className="rs-muted mt-0.5 block text-[13px]">
                Schedule a post to see it here.
              </span>
            </Link>
          )}
        </div>
      )}

      {/* Account */}
      <div
        className={cn(
          "flex items-center gap-3 p-4",
          collapsed && "flex-col gap-2 px-0",
        )}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
          style={{ background: "rgb(255 255 255 / 0.1)" }}
        >
          {initialsOf(displayName)}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium tracking-[-0.01em]">
              {displayEmail}
            </span>
            <span className="rs-muted block truncate text-[12px]">{displayName}</span>
          </span>
        )}
        {tip(
          "theme",
          `Theme: ${theme}`,
          <button
            type="button"
            onClick={() => setTheme(nextTheme)}
            aria-label={`Theme: ${theme}. Switch to ${nextTheme}`}
            className="rs-icon-btn"
          >
            <ThemeIcon className="h-4 w-4" strokeWidth={1.75} />
          </button>,
        )}
        {tip(
          "signout",
          "Sign out",
          <button type="button" onClick={handleSignOut} aria-label="Sign out" className="rs-icon-btn">
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </button>,
        )}
      </div>
    </motion.aside>
  );
}
