import { useState } from "react";
import { CheckCircle2, Clock, RefreshCw, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AnalyticsCards } from "@/components/analytics/AnalyticsCards";
import { AnalyticsDrilldown } from "@/components/analytics/AnalyticsDrilldown";
import { AnalyticsCharts } from "@/components/analytics/AnalyticsCharts";
import { MediaPerformance } from "@/components/analytics/MediaPerformance";
import { PlatformPerformance } from "@/components/analytics/PlatformPerformance";
import { PostPerformanceDialog } from "@/components/analytics/PostPerformanceDialog";
import { TopPosts } from "@/components/analytics/TopPosts";
import { WhatsWorking } from "@/components/analytics/WhatsWorking";
import {
  attentionState,
  lastUpdatedAt,
  type CardKey,
} from "@/components/analytics/insights";
import { useAllPosts, type PostContextFilter } from "@/hooks/usePosts";
import {
  useAnalyticsRefresh,
  useAnalyticsSummary,
  usePostPerformance,
  useRelativeTime,
} from "@/hooks/useAnalyticsSummary";
import { useBrands } from "@/hooks/useBrands";
import { cn } from "@/lib/utils";
import type { ReportingDays } from "@/services/analytics.service";

/**
 * Analytics, answering the obvious question first.
 *
 * ─── The order of this page is the argument ──────────────────────────────────
 *
 * A member opens this page to find out how their content is doing, and the page
 * is arranged so that they know within five seconds and can go deeper only if
 * they want to:
 *
 *   1. Does anything need me?      one line, at the top, always
 *   2. The five figures            each one a door into its own breakdown
 *   3. What's working              FlowPost's own reading of their data
 *   4. Which posts                 ranked by a stated measure
 *   5. Which formats               with the sample size beside every claim
 *   6. Which networks, and volume  the reference tables, last
 *
 * The detail exists underneath rather than beside: nothing above needs to be
 * understood before the thing below it makes sense, and nothing on screen asks
 * the member to work out a percentage, compare two platforms by eye, or decide
 * whether a number is good.
 *
 * ─── Contexts never mix ──────────────────────────────────────────────────────
 *
 * Personal numbers and a brand's numbers answer different questions, and
 * blending them is how both become wrong. The selector switches the whole page,
 * and the scope is enforced server-side — the query string says what the page
 * means, not what it is trusted on.
 */
export default function Analytics() {
  const { brands } = useBrands();
  const [selected, setSelected] = useState("personal");
  const [days, setDays] = useState<ReportingDays>(30);

  const filter: PostContextFilter = selected.startsWith("brand:")
    ? { context: "brand", brandId: selected.slice("brand:".length) }
    : { context: "personal", brandId: null };

  const analyticsContext = {
    contextType: (filter.context === "brand" ? "brand" : "personal") as
      | "brand"
      | "personal",
    brandId: filter.brandId,
  };

  // Two sources, two questions. `posts` answers "how much did I write" and is a
  // workspace count; the summary answers "what actually published" and is a
  // publishing count the backend owns. They are deliberately not merged — the
  // page used to derive the second from the first, which is what produced
  // "Posts Published: 0" beside a platform mix of nine.
  const { data: posts, isLoading: postsLoading } = useAllPosts(filter);
  const {
    data: summary,
    isLoading,
    isFetching,
    error,
  } = useAnalyticsSummary(analyticsContext, days);

  const { refresh, refreshing, disabled: refreshDisabled } =
    useAnalyticsRefresh(analyticsContext);

  // Null until a member opens a card or a post. Both are separate questions at
  // separate grains, and neither is fetched until it is asked for.
  const [openCard, setOpenCard] = useState<CardKey | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const { data: postDetail, isLoading: detailLoading } = usePostPerformance(
    analyticsContext,
    openPostId,
  );

  const connections = summary?.connections ?? [];
  const updatedAt = useRelativeTime(lastUpdatedAt(connections));
  const attention = attentionState(connections, summary?.overview);

  const brandName = filter.brandId
    ? brands.find((b) => b.id === filter.brandId)?.name
    : null;

  return (
    <PageContainer
      title="Analytics"
      description={
        brandName ? `${brandName} at a glance.` : "Your content at a glance."
      }
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-36" aria-label="Analytics context">
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

          <Select
            value={String(days ?? "all")}
            onValueChange={(value) =>
              setDays(value === "all" ? null : (Number(value) as ReportingDays))
            }
          >
            <SelectTrigger className="w-36" aria-label="Reporting period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>

          {/* Manual collection. The button asks FlowPost's backend to sync — the
              browser never calls a network itself — and then re-reads what was
              stored. Disabled through a cooldown so it cannot be used to hammer
              a metered provider API. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh()}
            disabled={refreshDisabled}
            aria-label="Refresh analytics"
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
              aria-hidden="true"
            />
            <span className="ml-2 hidden sm:inline">
              {refreshing ? "Refreshing…" : "Refresh"}
            </span>
          </Button>
        </div>
      }
    >
      <div className="space-y-10">
        {/* ── Freshness and the one line that says whether this needs you ── */}
        <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <AttentionLine tone={attention.tone} message={attention.message} />
          <span className="text-meta ml-auto">
            {refreshing || isFetching
              ? "Collecting fresh data…"
              : updatedAt
                ? `Updated ${updatedAt}`
                : "Collecting your first performance update"}
          </span>
        </div>

        {error ? (
          <ErrorPanel message={(error as Error).message} />
        ) : (
          <>
            {/* ── The five figures, each a door ── */}
            <div className="space-y-4">
              <AnalyticsCards
                overview={summary?.overview}
                platforms={summary?.platforms}
                connections={connections}
                loading={isLoading}
                active={openCard}
                onSelect={(key) =>
                  setOpenCard((current) => (current === key ? null : key))
                }
              />

              <AnalyticsDrilldown
                open={openCard}
                overview={summary?.overview}
                platforms={summary?.platforms ?? []}
                posts={summary?.posts ?? []}
                connections={connections}
                onClose={() => setOpenCard(null)}
                onOpenPost={setOpenPostId}
              />
            </div>

            {/* ── FlowPost's own reading ── */}
            <WhatsWorking
              posts={summary?.posts}
              mediaTypes={summary?.mediaTypes}
              platforms={summary?.platforms}
              loading={isLoading}
              onOpenPost={setOpenPostId}
            />

            <TopPosts
              posts={summary?.posts}
              loading={isLoading}
              onOpenPost={setOpenPostId}
            />

            <MediaPerformance
              mediaTypes={summary?.mediaTypes}
              loading={isLoading}
            />

            {/* ── Reference: the networks, and how much was published ── */}
            <div className="grid gap-6 lg:grid-cols-2">
              <PlatformPerformance
                platforms={summary?.platforms}
                loading={isLoading}
              />
              <PeriodNote days={days} onShowAll={() => setDays(null)} />
            </div>

            <AnalyticsCharts
              posts={posts}
              platforms={summary?.platforms}
              loading={postsLoading || isLoading}
            />
          </>
        )}

        <PostPerformanceDialog
          detail={postDetail}
          connections={connections}
          loading={detailLoading}
          open={openPostId !== null}
          onOpenChange={(next) => !next && setOpenPostId(null)}
        />
      </div>
    </PageContainer>
  );
}

/**
 * "Do I need to do anything?" — answered before anything else is read.
 *
 * The single most important line on the page. A member should never have to
 * diagnose FlowPost's plumbing from the absence of numbers, and "everything is
 * up to date" is only said when it is true of every connection.
 */
function AttentionLine({
  tone,
  message,
}: {
  tone: "ok" | "waiting" | "action";
  message: string;
}) {
  const Icon =
    tone === "action" ? TriangleAlert : tone === "waiting" ? Clock : CheckCircle2;

  return (
    <p
      className={cn(
        "flex items-center gap-2 text-sm",
        // Colour never carries the state on its own — the sentence always does.
        tone === "action" && "text-warning",
        tone !== "action" && "text-muted-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
      {tone === "action" && (
        <Link
          to="/integrations"
          className="font-medium underline underline-offset-4"
        >
          Open accounts
        </Link>
      )}
    </p>
  );
}

/**
 * The escape hatch for an empty period.
 *
 * A 30-day view is the useful default and it is also the one state that makes a
 * working page look broken — a member who published five weeks ago sees nothing,
 * truthfully and uselessly. This says why, and switches.
 */
function PeriodNote({
  days,
  onShowAll,
}: {
  days: ReportingDays;
  onShowAll: () => void;
}) {
  if (days === null) return null;

  return (
    <div className="flex flex-col justify-center rounded-lg border border-dashed border-border p-5">
      <h3 className="text-sm font-medium">Only seeing part of the picture?</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        These figures cover the last {days} days. Posts published before then
        aren't counted here.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-3 self-start"
        onClick={onShowAll}
      >
        Show all time
      </Button>
    </div>
  );
}

/** Errors are shown in place, with what happened and what to do. */
function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5">
      <p className="flex items-center gap-2 text-sm font-medium text-destructive">
        <TriangleAlert className="h-4 w-4" aria-hidden="true" />
        Analytics couldn't be loaded
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => window.location.reload()}
      >
        Try again
      </Button>
    </div>
  );
}
