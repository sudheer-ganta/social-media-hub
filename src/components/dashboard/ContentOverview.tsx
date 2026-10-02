import dayjs from "dayjs";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, CalendarClock, FileText, Send, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PanelHeader } from "./parts";
import type { Post } from "@/types";

export const RANGES = [7, 14, 30] as const;
export type Range = (typeof RANGES)[number];

interface Counts {
  total: number;
  drafts: number;
  scheduled: number;
  published: number;
}

interface ContentOverviewProps {
  counts: Counts;
  countsLoading: boolean;
  posts: Post[] | undefined;
  postsLoading: boolean;
  range: Range;
  onRangeChange: (range: Range) => void;
}

/** Posts created per day, and posts scheduled to go out per day. */
function buildSeries(posts: Post[], days: number) {
  return Array.from({ length: days }, (_, i) => dayjs().subtract(days - 1 - i, "day")).map((day) => ({
    label: day.format("MMM D"),
    created: posts.filter((p) => dayjs(p.created_at).isSame(day, "day")).length,
    scheduled: posts.filter(
      (p) => p.status === "scheduled" && dayjs(p.publish_date).isSame(day, "day"),
    ).length,
  }));
}

const ACCENT = "rgb(var(--rl-accent))";
const MUTED = "rgb(var(--rl-muted))";

export function ContentOverview({
  counts,
  countsLoading,
  posts,
  postsLoading,
  range,
  onRangeChange,
}: ContentOverviewProps) {
  const data = useMemo(() => buildSeries(posts ?? [], range), [posts, range]);
  const quiet = !postsLoading && data.every((d) => d.created + d.scheduled === 0);

  const tiles: { label: string; value: number; icon: LucideIcon }[] = [
    { label: "Drafts", value: counts.drafts, icon: FileText },
    { label: "Scheduled", value: counts.scheduled, icon: CalendarClock },
    { label: "Published", value: counts.published, icon: Send },
    { label: "Total posts", value: counts.total, icon: BarChart3 },
  ];

  return (
    <section className="rd-panel p-6 sm:p-7" aria-label="Content overview">
      <PanelHeader
        title="Content overview"
        aside={
          <div
            role="group"
            aria-label="Date range"
            className="flex gap-0.5 rounded-[10px] border border-rl-line bg-rl-bg p-0.5"
          >
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => onRangeChange(r)}
                className={cn(
                  "h-8 rounded-[8px] px-3 text-[13px] font-medium transition-colors",
                  range === r
                    ? "bg-rl-surface text-rl-ink shadow-sm"
                    : "text-rl-muted hover:text-rl-ink",
                )}
              >
                {r}d
              </button>
            ))}
          </div>
        }
      />

      <dl className="mt-6 grid grid-cols-2 gap-y-5 sm:grid-cols-4 sm:divide-x sm:divide-rl-line">
        {tiles.map(({ label, value, icon: Icon }, i) => (
          <div key={label} className={cn("flex items-center gap-3.5", i > 0 && "sm:pl-6")}>
            <span className="rd-tile h-12 w-12 shrink-0">
              <Icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              {countsLoading ? (
                <Skeleton className="h-8 w-10 bg-rl-line/60" />
              ) : (
                <dd className="rd-numeral text-[32px]">{value.toLocaleString()}</dd>
              )}
              <dt className="mt-1 text-[13px] text-rl-muted">{label}</dt>
            </div>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex items-center justify-end gap-5 text-[12.5px] text-rl-muted">
        <span className="flex items-center gap-2">
          <span className="h-[3px] w-4 rounded-full" style={{ background: ACCENT }} />
          Created
        </span>
        <span className="flex items-center gap-2">
          <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: MUTED }} />
          Scheduled
        </span>
      </div>

      <div className="mt-2 h-[230px] min-w-0">
        {postsLoading ? (
          <Skeleton className="h-full w-full bg-rl-line/40" />
        ) : quiet ? (
          <div className="flex h-full flex-col items-start justify-center rounded-[14px] border border-dashed border-rl-line px-6">
            <p className="text-[16px] font-semibold tracking-[-0.025em]">Nothing in the last {range} days</p>
            <p className="mt-1 text-[13px] text-rl-muted">
              Posts you create or schedule will draw a line here.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="rdFillCreated" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="rgb(var(--rl-line))" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: MUTED }}
                minTickGap={28}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: MUTED }}
              />
              <Tooltip
                cursor={{ stroke: "rgb(var(--rl-line))" }}
                contentStyle={{
                  background: "rgb(var(--rl-surface))",
                  border: "1px solid rgb(var(--rl-line))",
                  borderRadius: 12,
                  fontSize: 12.5,
                  color: "rgb(var(--rl-ink))",
                  boxShadow: "0 12px 30px rgb(0 0 0 / 0.12)",
                }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Area
                type="monotone"
                dataKey="created"
                name="Created"
                stroke={ACCENT}
                strokeWidth={2.5}
                fill="url(#rdFillCreated)"
                dot={{ r: 3, strokeWidth: 0, fill: ACCENT }}
                activeDot={{ r: 5, strokeWidth: 0, fill: ACCENT }}
              />
              <Area
                type="monotone"
                dataKey="scheduled"
                name="Scheduled"
                stroke={MUTED}
                strokeWidth={1.75}
                strokeDasharray="5 5"
                fill="none"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: MUTED }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
