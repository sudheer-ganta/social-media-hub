import { PageContainer } from "@/components/layout/PageContainer";
import { AnalyticsCards } from "@/components/analytics/AnalyticsCards";
import { AnalyticsCharts } from "@/components/analytics/AnalyticsCharts";
import { useAllPosts } from "@/hooks/usePosts";

export default function Analytics() {
  const { data: posts, isLoading } = useAllPosts();

  return (
    <PageContainer
      title="Analytics"
      description="How your content is performing."
    >
      <div className="space-y-6">
        <AnalyticsCards posts={posts} loading={isLoading} />
        <AnalyticsCharts posts={posts} loading={isLoading} />
      </div>
    </PageContainer>
  );
}
