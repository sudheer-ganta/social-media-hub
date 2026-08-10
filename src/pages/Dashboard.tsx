import { CalendarClock, FileText, Send, StickyNote } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { StatCard } from "@/components/dashboard/StatCard";
import { UpcomingPosts } from "@/components/dashboard/UpcomingPosts";
import { RecentPosts } from "@/components/dashboard/RecentPosts";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import {
  useActivityPosts,
  useDashboardStats,
  useRecentPosts,
  useUpcomingPosts,
} from "@/hooks/useDashboard";

export default function Dashboard() {
  const stats = useDashboardStats();
  const recent = useRecentPosts();
  const upcoming = useUpcomingPosts();
  const activity = useActivityPosts();

  const counts = stats.data ?? {
    total: 0,
    drafts: 0,
    scheduled: 0,
    published: 0,
  };

  return (
    <PageContainer title="Dashboard" description="Your content at a glance.">
      <div className="grid gap-3 sm:gap-4 grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Posts"
          value={counts.total}
          icon={FileText}
          hint="Everything in your workspace"
          accentClassName="bg-primary/10 text-primary"
          loading={stats.isLoading}
          index={0}
        />
        <StatCard
          label="Scheduled"
          value={counts.scheduled}
          icon={CalendarClock}
          hint="Queued and ready to go"
          accentClassName="bg-warning/10 text-warning"
          loading={stats.isLoading}
          index={1}
        />
        <StatCard
          label="Published"
          value={counts.published}
          icon={Send}
          hint="Live across your platforms"
          accentClassName="bg-success/10 text-success"
          loading={stats.isLoading}
          index={2}
        />
        <StatCard
          label="Drafts"
          value={counts.drafts}
          icon={StickyNote}
          hint="Works in progress"
          accentClassName="bg-accent text-accent-foreground"
          loading={stats.isLoading}
          index={3}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <ActivityChart posts={activity.data} loading={activity.isLoading} />
          <RecentPosts posts={recent.data} loading={recent.isLoading} />
        </div>
        <div className="min-w-0 space-y-4">
          <QuickActions />
          <UpcomingPosts posts={upcoming.data} loading={upcoming.isLoading} />
        </div>
      </div>
    </PageContainer>
  );
}
