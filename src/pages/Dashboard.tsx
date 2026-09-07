import { useNavigate } from "react-router-dom";
import { Building2, CalendarClock, FileText, Send, StickyNote, Wand2 } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/StatCard";
import { UpcomingPosts } from "@/components/dashboard/UpcomingPosts";
import { RecentPosts } from "@/components/dashboard/RecentPosts";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { BrandProfileBanner } from "@/components/dashboard/BrandProfileBanner";
import { useBrands } from "@/hooks/useBrands";
import { useBrandVoices } from "@/hooks/useBrandVoices";
import {
  useActivityPosts,
  useDashboardStats,
  useRecentPosts,
  useUpcomingPosts,
} from "@/hooks/useDashboard";

export default function Dashboard() {
  const navigate = useNavigate();
  const { brands } = useBrands();
  const { profiles } = useBrandVoices();
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

  const primaryBrand = brands[0];
  const primaryVoice = primaryBrand ? profiles.find((p) => p.brand_id === primaryBrand.id) : null;
  const isProfileComplete = Boolean(
    primaryBrand &&
    primaryBrand.name.trim() &&
    primaryVoice &&
    primaryVoice.voice &&
    (primaryVoice.voice.tone?.trim() || primaryVoice.voice.description?.trim() || primaryVoice.name?.trim())
  );

  return (
    <PageContainer
      title="Dashboard"
      description="Your content at a glance."
      actions={
        primaryBrand ? (
          isProfileComplete ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/settings?tab=brands")}
              className="gap-2 border-border/80 text-xs font-medium"
              title="Manage your brands in Settings"
            >
              <Building2 className="h-3.5 w-3.5 text-primary" />
              <span>Brand: <strong className="text-foreground">{primaryBrand.name}</strong></span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/settings?tab=brand-voice&brandId=${primaryBrand.id}`)}
              className="gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 text-xs font-medium"
              title="Brand voice setup required before posting"
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span>Set Up Brand Voice</span>
            </Button>
          )
        ) : (
          <Button
            size="sm"
            onClick={() => navigate("/settings?tab=brands")}
            className="gap-1.5 text-xs font-medium"
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>Set Up Brand</span>
          </Button>
        )
      }
    >
      <BrandProfileBanner />

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
