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
import type { PlatformBreakdownEntry } from "@/services/analytics.service";
import type { Post } from "@/types";

interface AnalyticsChartsProps {
  /** Content velocity is a workspace question and stays post-shaped. */
  posts: Post[] | undefined;
  /** Platform mix is a publishing question and comes from the API. */
  platforms: PlatformBreakdownEntry[] | undefined;
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

/**
 * The platform mix, from successful publications only.
 *
 * ─── The bug this replaced ───────────────────────────────────────────────────
 *
 * This used to be `posts.filter(p => p.platforms.includes(platform.id))`.
 * `post.platforms` is the list of destinations a member **ticked in the
 * composer** — it carries no status whatsoever — so every draft, every failed
 * attempt, every post still publishing and every AI-Ready destination counted
 * as a publication. A workspace with four posts, none of them fully published,
 * rendered "LinkedIn 3, Instagram 3, Facebook 2, X 1" beside a "Posts
 * Published: 0" card.
 *
 * The API now answers with `post_platforms` rows that actually reached a
 * network — `status = PUBLISHED` and a non-null `published_id` — which is the
 * same rule "Posts Published" is counted under. That is what makes the two
 * numbers incapable of disagreeing: there is one rule, and it is server-side.
 *
 * `PLATFORMS` is still the source of the label and the colour. It is a display
 * lookup, not a filter — a provider the API reports that has no entry here is
 * rendered under its own id rather than silently dropped, because a
 * publication we cannot draw a colour for is still a publication.
 */
export function buildPlatformSeries(platforms: PlatformBreakdownEntry[]) {
  return platforms
    .map((entry) => {
      const meta = PLATFORMS.find((platform) => platform.id === entry.provider);
      return {
        name: meta?.name ?? entry.provider,
        value: entry.publications,
        color: meta?.color ?? "hsl(var(--muted-foreground))",
      };
    })
    .filter((entry) => entry.value > 0);
}

export function AnalyticsCharts({
  posts,
  platforms,
  loading,
}: AnalyticsChartsProps) {
  const weekly = buildWeeklySeries(posts ?? []);
  const byPlatform = buildPlatformSeries(platforms ?? []);

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
          {/* "went", not "is going" — this counts what published, not what was
              aimed at. The old copy described the old, wrong query. */}
          <CardDescription>Where your content actually published</CardDescription>
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
