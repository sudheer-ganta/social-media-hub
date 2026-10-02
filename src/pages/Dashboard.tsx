import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import dayjs from "dayjs";
import "@fontsource-variable/geist";
import "@/components/dashboard/dashboard.css";
import { useAuth } from "@/app/AuthProvider";
import { AttentionCard } from "@/components/dashboard/AttentionCard";
import { BrandProfileBanner } from "@/components/dashboard/BrandProfileBanner";
import { ContentOverview, type Range } from "@/components/dashboard/ContentOverview";
import { Rise } from "@/components/dashboard/parts";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RecentPosts } from "@/components/dashboard/RecentPosts";
import { UpcomingPosts } from "@/components/dashboard/UpcomingPosts";
import { useBrands } from "@/hooks/useBrands";
import { useBrandVoices } from "@/hooks/useBrandVoices";
import { useAllPosts } from "@/hooks/usePosts";
import {
  useActivityPosts,
  useDashboardStats,
  useRecentPosts,
  useUpcomingPosts,
} from "@/hooks/useDashboard";
import { getWorkflowStatus } from "@/utils/workflow";

function greeting(): string {
  const hour = dayjs().hour();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** One plain sentence about where things stand, built only from real counts. */
function summarise(c: { total: number; drafts: number; scheduled: number }): string {
  if (c.total === 0) return "Write your first post and it will show up below.";
  if (c.drafts > 0)
    return `You have ${c.drafts} ${c.drafts === 1 ? "draft" : "drafts"} to finish. Let's create something great today.`;
  if (c.scheduled > 0) return `${c.scheduled} scheduled and ready to go. Let's line up the next one.`;
  return "Everything is published. Time for the next one.";
}

export default function Dashboard() {
  const { user } = useAuth();
  const { brands } = useBrands();
  const { profiles } = useBrandVoices();
  const [range, setRange] = useState<Range>(14);
  const [brandIndex, setBrandIndex] = useState(0);

  const stats = useDashboardStats();
  const recent = useRecentPosts();
  const upcoming = useUpcomingPosts();
  const activity = useActivityPosts(range);
  const all = useAllPosts();

  const counts = stats.data ?? { total: 0, drafts: 0, scheduled: 0, published: 0 };
  const failed = (all.data ?? []).filter((p) => getWorkflowStatus(p) === "failed").length;

  const brand = brands[brandIndex] ?? brands[0];
  const voice = brand ? profiles.find((p) => p.brand_id === brand.id) : null;
  const isProfileComplete = Boolean(
    brand &&
      brand.name.trim() &&
      voice?.voice &&
      (voice.voice.tone?.trim() || voice.voice.description?.trim() || voice.name?.trim()),
  );

  const fullName = (user?.user_metadata?.full_name as string | undefined)?.trim();
  const headline = brand?.name ?? fullName?.split(/\s+/)[0] ?? "Welcome";

  return (
    <div className="rd min-h-full w-full min-w-0 overflow-x-clip bg-rl-bg px-4 pb-12 pt-8 sm:px-8 lg:px-10 lg:pt-10">
      <div className="mx-auto w-full max-w-[1320px]">
        <Rise>
          <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
            <div className="min-w-0">
              <p className="flex items-center gap-2.5 text-[12.5px] font-medium uppercase tracking-[0.2em] text-rl-muted">
                <span className="h-2 w-2 rounded-full bg-rl-accent" />
                {greeting()}
              </p>
              <h1 className="mt-3 break-words text-[clamp(52px,7vw,96px)] font-extrabold leading-[0.95] tracking-[-0.06em]">
                {headline}
                <span className="text-rl-accent">.</span>
              </h1>
              <p className="mt-3 max-w-[56ch] text-[17px] leading-relaxed tracking-[-0.01em] text-rl-muted">
                {stats.isLoading ? "Checking your pipeline." : summarise(counts)}
              </p>
            </div>

            {isProfileComplete && brand && (
              <Link to={`/posts/new?context=brand&brand=${brand.id}`} className="rd-cta group">
                New post
                <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
            )}
          </header>
        </Rise>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-6">
            <Rise index={1}>
              <BrandProfileBanner selected={brandIndex} onSelect={setBrandIndex} />
            </Rise>
            <Rise index={2}>
              <ContentOverview
                counts={counts}
                countsLoading={stats.isLoading}
                posts={activity.data}
                postsLoading={activity.isLoading}
                range={range}
                onRangeChange={setRange}
              />
            </Rise>
            <Rise index={3}>
              <RecentPosts posts={recent.data} loading={recent.isLoading} />
            </Rise>
          </div>

          <div className="min-w-0 space-y-6">
            <Rise index={2}>
              <AttentionCard failed={failed} />
            </Rise>
            <Rise index={3}>
              <UpcomingPosts posts={upcoming.data} loading={upcoming.isLoading} />
            </Rise>
            <Rise index={4}>
              <QuickActions />
            </Rise>
          </div>
        </div>
      </div>
    </div>
  );
}
