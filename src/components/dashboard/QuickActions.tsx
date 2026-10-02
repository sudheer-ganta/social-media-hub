import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, CalendarDays, Images } from "lucide-react";
import { RallyIcon } from "@/components/brand/Logo";
import { PanelHeader } from "./parts";

const ACTIONS = [
  { label: "Create with Rally", to: "/posts/new", icon: RallyIcon },
  { label: "Plan calendar", to: "/calendar", icon: CalendarDays },
  { label: "View insights", to: "/analytics", icon: BarChart3 },
  { label: "Open creatives", to: "/creatives", icon: Images },
];

export function QuickActions() {
  return (
    <section className="rd-panel p-6" aria-label="Quick actions">
      <PanelHeader title="Quick actions" />
      <ul className="mt-5 grid grid-cols-2 gap-3">
        {ACTIONS.map(({ label, to, icon: Icon }) => (
          <li key={label}>
            <Link
              to={to}
              className="group flex h-full min-h-[84px] flex-col justify-between gap-3 rounded-[14px] border border-rl-line bg-rl-surface p-3.5 transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-rl-ink/40"
            >
              <span className="flex items-center justify-between">
                <Icon className="h-[18px] w-[18px] text-rl-accent-strong" />
                <ArrowRight className="h-3.5 w-3.5 -translate-x-1 text-rl-muted opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
              </span>
              <span className="text-[14px] font-semibold leading-tight tracking-[-0.02em]">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
