import { useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { AnalyticsCards } from "@/components/analytics/AnalyticsCards";
import { AnalyticsCharts } from "@/components/analytics/AnalyticsCharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAllPosts, type PostContextFilter } from "@/hooks/usePosts";
import { useBrands } from "@/hooks/useBrands";

/**
 * Analytics are per publishing context, never mixed: Personal numbers and a
 * brand's numbers answer different questions, and blending them is how both
 * become wrong. Defaults to Personal; every brand gets its own entry.
 */
export default function Analytics() {
  const { brands } = useBrands();
  const [selected, setSelected] = useState("personal");

  const filter: PostContextFilter = selected.startsWith("brand:")
    ? { context: "brand", brandId: selected.slice("brand:".length) }
    : { context: "personal", brandId: null };

  const { data: posts, isLoading } = useAllPosts(filter);

  const brandName = filter.brandId
    ? brands.find((b) => b.id === filter.brandId)?.name
    : null;

  return (
    <PageContainer
      title="Analytics"
      description={
        brandName
          ? `How ${brandName}'s content is performing.`
          : "How your personal content is performing."
      }
      actions={
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-44" aria-label="Analytics context">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="personal">Personal</SelectItem>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={`brand:${brand.id}`}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="space-y-6">
        <AnalyticsCards posts={posts} loading={isLoading} />
        <AnalyticsCharts posts={posts} loading={isLoading} />
      </div>
    </PageContainer>
  );
}
