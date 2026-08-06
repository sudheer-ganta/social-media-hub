import { Eye, MousePointerClick, Send, TrendingUp, Users } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import type { Post } from "@/types";

interface AnalyticsCardsProps {
  posts: Post[] | undefined;
  loading: boolean;
}

/**
 * Derived metrics from real workspace data. Engagement, reach and
 * clicks are deterministic projections from published-post volume
 * until platform APIs (Meta, LinkedIn) are connected.
 */
export function computeAnalytics(posts: Post[]) {
  const published = posts.filter((p) => p.status === "published");
  const platformSlots = published.reduce((sum, p) => sum + p.platforms.length, 0);

  const reach = platformSlots * 1240;
  const engagement = Math.round(reach * 0.062);
  const clicks = Math.round(reach * 0.031);
  const growth = Math.min(99, Math.round(published.length * 2.7));

  return { published: published.length, engagement, reach, clicks, growth };
}

export function AnalyticsCards({ posts, loading }: AnalyticsCardsProps) {
  const metrics = computeAnalytics(posts ?? []);

  const cards = [
    {
      label: "Posts Published",
      value: metrics.published,
      icon: Send,
      hint: "All time, across platforms",
      accent: "bg-primary/10 text-primary",
    },
    {
      label: "Engagement",
      value: metrics.engagement,
      icon: Users,
      hint: "Projected likes, comments & shares",
      accent: "bg-success/10 text-success",
    },
    {
      label: "Reach",
      value: metrics.reach,
      icon: Eye,
      hint: "Projected unique impressions",
      accent: "bg-accent text-accent-foreground",
    },
    {
      label: "Clicks",
      value: metrics.clicks,
      icon: MousePointerClick,
      hint: "Projected link clicks",
      accent: "bg-warning/10 text-warning",
    },
    {
      label: "Growth",
      value: metrics.growth,
      icon: TrendingUp,
      hint: "Publishing momentum score",
      accent: "bg-destructive/10 text-destructive",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card, index) => (
        <StatCard
          key={card.label}
          label={card.label}
          value={card.value}
          icon={card.icon}
          hint={card.hint}
          accentClassName={card.accent}
          loading={loading}
          index={index}
        />
      ))}
    </div>
  );
}
