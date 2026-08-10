import dayjs from "dayjs";
import {
  Area,
  AreaChart,
  CartesianGrid,
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
import type { Post } from "@/types";

interface ActivityChartProps {
  posts: Post[] | undefined;
  loading: boolean;
}

/** Posts created per day across the last 14 days. */
function buildSeries(posts: Post[]) {
  const days = Array.from({ length: 14 }, (_, i) =>
    dayjs().subtract(13 - i, "day"),
  );
  return days.map((day) => ({
    label: day.format("MMM D"),
    posts: posts.filter((p) => dayjs(p.created_at).isSame(day, "day")).length,
    scheduled: posts.filter(
      (p) => p.status === "scheduled" && dayjs(p.publish_date).isSame(day, "day"),
    ).length,
  }));
}

export function ActivityChart({ posts, loading }: ActivityChartProps) {
  const data = buildSeries(posts ?? []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Created vs scheduled — last 14 days</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillPosts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(248 90% 66%)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(248 90% 66%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fillScheduled" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(36 92% 52%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(36 92% 52%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--border))" }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 10,
                    fontSize: 12,
                    color: "hsl(var(--foreground))",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="posts"
                  name="Created"
                  stroke="hsl(248 90% 66%)"
                  strokeWidth={2}
                  fill="url(#fillPosts)"
                />
                <Area
                  type="monotone"
                  dataKey="scheduled"
                  name="Scheduled"
                  stroke="hsl(36 92% 52%)"
                  strokeWidth={2}
                  fill="url(#fillScheduled)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
