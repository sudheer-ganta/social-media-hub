import dayjs from "dayjs";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PLATFORMS } from "@/utils/constants";
import type { Post } from "@/types";

interface AnalyticsChartsProps {
  posts: Post[] | undefined;
  loading: boolean;
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  fontSize: 12,
  color: "hsl(var(--foreground))",
};

function buildWeeklySeries(posts: Post[]) {
  return Array.from({ length: 8 }, (_, i) => {
    const week = dayjs().subtract(7 - i, "week");
    const start = week.startOf("week");
    const end = week.endOf("week");
    const count = posts.filter((p) => {
      const created = dayjs(p.created_at);
      return created.isAfter(start) && created.isBefore(end);
    }).length;
    return { label: start.format("MMM D"), posts: count };
  });
}

function buildPlatformSeries(posts: Post[]) {
  return PLATFORMS.map((platform) => ({
    name: platform.name,
    value: posts.filter((p) => p.platforms.includes(platform.id)).length,
    color: platform.color,
  })).filter((entry) => entry.value > 0);
}

export function AnalyticsCharts({ posts, loading }: AnalyticsChartsProps) {
  const weekly = buildWeeklySeries(posts ?? []);
  const byPlatform = buildPlatformSeries(posts ?? []);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Posts per week</CardTitle>
          <CardDescription>Content velocity over the last 8 weeks</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip cursor={{ fill: "hsl(var(--accent))" }} contentStyle={tooltipStyle} />
                  <Bar
                    dataKey="posts"
                    name="Posts"
                    fill="hsl(248 90% 66%)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Platform mix</CardTitle>
          <CardDescription>Where your content is going</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : byPlatform.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
              Publish posts to see the platform mix.
            </div>
          ) : (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Pie
                    data={byPlatform}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {byPlatform.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
                {byPlatform.map((entry) => (
                  <span
                    key={entry.name}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    {entry.name} · {entry.value}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
