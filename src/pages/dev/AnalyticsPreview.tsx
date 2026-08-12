import { useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { AnalyticsCards } from "@/components/analytics/AnalyticsCards";
import { AnalyticsDrilldown } from "@/components/analytics/AnalyticsDrilldown";
import { MediaPerformance } from "@/components/analytics/MediaPerformance";
import { PlatformPerformance } from "@/components/analytics/PlatformPerformance";
import { PostPerformanceDialog } from "@/components/analytics/PostPerformanceDialog";
import { BestTimePanel } from "@/components/posts/BestTimePanel";
import { HashtagPanel } from "@/components/posts/HashtagPanel";
import type { BestTimeResult, PostDetail } from "@/services/analytics.service";
import type { HashtagResult } from "@/ai/hashtags";
import { TopPosts } from "@/components/analytics/TopPosts";
import { WhatsWorking } from "@/components/analytics/WhatsWorking";
import type { CardKey } from "@/components/analytics/insights";
import {
  connection,
  mediaType,
  metric,
  overview,
  platform,
  post,
} from "@/components/analytics/fixtures";

/** Dev-only visual harness. Not shipped — stripped by the DEV guard in App. */
const OVERVIEW = overview({
  postsPublished: 2,
  publications: 6,
  coverage: { publications: 6, measured: 4 },
  totals: {
    engagement: metric(7, 4),
    likes: metric(3, 3),
    comments: metric(1, 1),
    clicks: metric(3, 1),
    reach: metric(19, 1),
    impressions: metric(112, 2),
    views: metric(52, 1),
  },
  audience: [
    {
      provider: "instagram",
      providerAccountId: "1",
      followers: 432,
      capturedAt: "2026-08-12T09:00:00.000Z",
      firstFollowers: 420,
      firstCapturedAt: "2026-08-01T09:00:00.000Z",
      change: 12,
      changeRate: 0.028,
    },
    {
      provider: "linkedin",
      providerAccountId: "2",
      followers: 88,
      capturedAt: "2026-08-12T09:00:00.000Z",
      firstFollowers: null,
      firstCapturedAt: null,
      change: null,
      changeRate: null,
    },
  ],
});

/**
 * A strong Instagram recommendation beside a network with nothing to say.
 *
 * The second entry is the important one: it proves the panel states "not enough
 * history yet" rather than falling back to a general time, which is the single
 * behaviour this feature must never get wrong.
 */
const BEST_TIME: BestTimeResult = {
  timezone: "Asia/Kolkata",
  timezoneSource: "history",
  gates: { early: 10, strong: 30 },
  platforms: [
    {
      provider: "instagram",
      label: "Instagram",
      confidence: "strong",
      basis: "platform",
      metric: "engagement_rate",
      evidence: "publish_history",
      timezone: "Asia/Kolkata",
      sampleSize: 42,
      recommendedTime: "20:30",
      window: { start: "20:00", end: "21:00" },
      slots: ["20:00", "20:30", "21:00"],
      alternatives: ["18:00", "21:00"],
      liftPercent: 31,
      weekdaysObserved: [1, 2, 3, 4, 5],
      reason:
        "Your Instagram posts published around 8:00 PM–9:00 PM have performed 31% above your median. Based on 42 measured posts. Drawn from all your Instagram posts — not enough reel history on its own yet.",
      today: "2026-08-12T20:30",
      tomorrow: "2026-08-13T20:30",
    },
    {
      provider: "linkedin",
      label: "LinkedIn",
      confidence: "none",
      basis: null,
      metric: null,
      evidence: "publish_history",
      timezone: "Asia/Kolkata",
      sampleSize: 6,
      recommendedTime: null,
      window: null,
      slots: [],
      alternatives: [],
      liftPercent: null,
      weekdaysObserved: [],
      reason: "Not enough history yet.",
      today: null,
      tomorrow: null,
    },
  ],
};

const HASHTAGS: HashtagResult = {
  primary: ["streetwearindia", "oversizedfits", "urbanstyle"],
  secondary: ["genzfashion", "everydaystreetwear"],
  note: "Leaning on the fit and the location rather than broad fashion tags.",
  platforms: ["instagram", "x"],
  budget: { min: 2, max: 3, conflict: true },
  meta: { provider: "gemini", model: "gemini-3.6-flash", durationMs: 1200, promptVersion: 1 },
};

/** The state a hashtag tool usually cannot express: none, and why. */
const NO_HASHTAGS: HashtagResult = {
  primary: [],
  secondary: [],
  note: "This one reads better without hashtags — it is a personal note, not a campaign.",
  platforms: ["instagram"],
  budget: { min: 3, max: 10, conflict: false },
  meta: { provider: "gemini", model: "gemini-3.6-flash", durationMs: 900, promptVersion: 1 },
};

const PLATFORMS = [
  platform({
    provider: "instagram",
    publications: 3,
    coverage: { publications: 3, measured: 2 },
    engagementRate: 0.077,
    exposureMetric: "reach",
    exposureLabel: "Reach",
    totals: {
      engagement: metric(4, 2),
      reach: metric(19, 1),
      views: metric(52, 1),
      likes: metric(3, 2),
      comments: metric(1, 1),
    },
  }),
  platform({
    provider: "linkedin",
    publications: 2,
    coverage: { publications: 2, measured: 2 },
    engagementRate: 0.027,
    exposureMetric: "impressions",
    exposureLabel: "Impressions",
    totals: {
      engagement: metric(3, 2),
      impressions: metric(112, 2),
      likes: metric(2, 2),
      clicks: metric(1, 1),
    },
  }),
  platform({
    provider: "facebook",
    publications: 1,
    coverage: { publications: 1, measured: 0 },
    exposureMetric: null,
  }),
];

const POSTS = [
  post({
    postId: "a",
    postPlatformId: "1",
    title: "fun",
    caption: "a small thing that worked",
    provider: "instagram",
    engagement: 4,
    engagementRate: 0.077,
    measured: true,
    mediaTypeConfirmed: true,
    exposure: { metric: "reach", label: "Reach", value: 19 },
    reportsMetrics: ["reach", "views", "likes", "comments"],
    metrics: { reach: 19, views: 52, likes: 3, comments: 1 },
    lastCapturedAt: "2026-08-12T09:00:00.000Z",
  }),
  post({
    postId: "a",
    postPlatformId: "2",
    title: "fun",
    provider: "linkedin",
    engagement: 3,
    engagementRate: 0.027,
    measured: true,
    exposure: { metric: "impressions", label: "Impressions", value: 112 },
  }),
  post({
    postId: "b",
    postPlatformId: "3",
    title: "game indian",
    caption: "a longer caption about a game",
    provider: "instagram",
    mediaType: "REEL",
    engagement: 0,
    measured: true,
    exposure: { metric: "reach", label: "Reach", value: 42 },
  }),
  post({
    postId: "c",
    postPlatformId: "4",
    title: "just published",
    provider: "facebook",
    mediaType: "CAROUSEL",
  }),
];

const MEDIA_TYPES = [
  mediaType({
    mediaType: "IMAGE",
    publications: 8,
    coverage: { publications: 8, measured: 6 },
    engagementRate: 0.054,
    strongSignal: true,
  }),
  mediaType({
    mediaType: "REEL",
    publications: 4,
    coverage: { publications: 4, measured: 2 },
    engagementRate: 0.081,
  }),
  mediaType({ mediaType: "STORY", publications: 3 }),
  mediaType({ mediaType: null, publications: 1 }),
];

const CONNECTIONS = [
  connection({
    provider: "instagram",
    lastSuccessAt: "2026-08-12T09:00:00.000Z",
  }),
  connection({ provider: "linkedin", lastSuccessAt: "2026-08-12T08:40:00.000Z" }),
  connection({ provider: "facebook", analyticsEnabled: false }),
];

const DETAIL: PostDetail = {
  postId: "a",
  title: "fun",
  caption: "a small thing that worked",
  status: "published",
  contextType: "personal",
  brandId: null,
  createdAt: "2026-08-12T05:00:00.000Z",
  publishedAt: "2026-08-12T06:00:00.000Z",
  mediaShape: "Image",
  media: [
    {
      id: "m1",
      position: 0,
      kind: "image",
      mimeType: "image/jpeg",
      width: 1080,
      height: 1350,
      aspectRatio: 0.8,
      aspectRatioLabel: "4:5",
      durationMs: null,
      byteLength: 240_000,
      posterUrl: null,
      url: null,
      cropped: false,
    },
  ],
  published: [
    {
      postPlatformId: "1",
      provider: "instagram",
      platformPostId: "ig1",
      permalink: "https://example.test/p/1",
      publishedAt: "2026-08-12T06:00:00.000Z",
      contentType: "IMAGE",
      mediaType: "IMAGE",
      mediaTypeConfirmed: true,
      exposure: { metric: "reach", label: "Reach", value: 19 },
      metrics: { reach: 19, views: 52, likes: 3, comments: 1, shares: 0 },
      engagement: 4,
      engagementRate: 0.077,
      reportsMetrics: ["reach", "views", "likes", "comments", "shares"],
      state: "measured",
      lastCapturedAt: "2026-08-12T09:00:00.000Z",
      notice: null,
      history: [
        {
          capturedAt: "2026-08-12T06:00:00.000Z",
          source: "PLATFORM_API",
          metrics: { reach: 4, views: 10, likes: 1, comments: 0 },
          engagement: 1,
        },
        {
          capturedAt: "2026-08-12T07:00:00.000Z",
          source: "PLATFORM_API",
          metrics: { reach: 12, views: 30, likes: 2, comments: 1 },
          engagement: 3,
        },
        {
          capturedAt: "2026-08-12T09:00:00.000Z",
          source: "PLATFORM_API",
          metrics: { reach: 19, views: 52, likes: 3, comments: 1 },
          engagement: 4,
        },
      ],
    },
    {
      postPlatformId: "2",
      provider: "linkedin",
      platformPostId: "li1",
      permalink: null,
      publishedAt: "2026-08-12T06:00:00.000Z",
      contentType: "IMAGE",
      mediaType: null,
      mediaTypeConfirmed: false,
      exposure: { metric: "impressions", label: "Impressions", value: null },
      metrics: {},
      engagement: null,
      engagementRate: null,
      reportsMetrics: ["impressions", "likes", "comments", "clicks"],
      state: "collecting",
      lastCapturedAt: null,
      notice: null,
      history: [],
    },
    {
      postPlatformId: "3",
      provider: "facebook",
      platformPostId: "fb1",
      permalink: null,
      publishedAt: "2026-08-12T06:00:00.000Z",
      contentType: "IMAGE",
      mediaType: null,
      mediaTypeConfirmed: false,
      exposure: { metric: null, label: null, value: null },
      metrics: {},
      engagement: null,
      engagementRate: null,
      reportsMetrics: ["likes", "comments", "clicks"],
      state: "unavailable",
      lastCapturedAt: null,
      notice: null,
      history: [],
    },
  ],
  notPublished: [{ provider: "x", status: "FAILED", errorMessage: null }],
  mediaLevel: [
    {
      provider: "instagram",
      available: false,
      note: "Instagram reports metrics for the whole post, including carousels — not per image.",
    },
  ],
};

export default function AnalyticsPreview() {
  const [openCard, setOpenCard] = useState<CardKey | null>("engagement");
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <PageContainer title="Analytics" description="Your content at a glance.">
      <div className="space-y-10">
        <div className="space-y-4">
          <AnalyticsCards
            overview={OVERVIEW}
            platforms={PLATFORMS}
            connections={CONNECTIONS}
            loading={false}
            active={openCard}
            onSelect={(key) =>
              setOpenCard((current) => (current === key ? null : key))
            }
          />
          <AnalyticsDrilldown
            open={openCard}
            overview={OVERVIEW}
            platforms={PLATFORMS}
            posts={POSTS}
            connections={CONNECTIONS}
            onClose={() => setOpenCard(null)}
            onOpenPost={() => {}}
          />
        </div>

        <WhatsWorking
          posts={POSTS}
          mediaTypes={MEDIA_TYPES}
          platforms={PLATFORMS}
          loading={false}
          onOpenPost={() => setDetailOpen(true)}
        />

        <TopPosts
          posts={POSTS}
          loading={false}
          onOpenPost={() => setDetailOpen(true)}
        />

        <MediaPerformance mediaTypes={MEDIA_TYPES} loading={false} />

        <PlatformPerformance platforms={PLATFORMS} loading={false} />

        {/*
          The two composer panels, previewed here because they otherwise only
          render behind auth and a database. Both are driven entirely by props, so
          a fixture exercises the same code path a real response does — including
          the states that matter most: a network with enough evidence, one without
          any, and a hashtag set the model declined to produce.
        */}
        <div className="grid gap-6 md:grid-cols-2">
          <BestTimePanel
            result={BEST_TIME}
            isLoading={false}
            onUse={() => {}}
          />

          <div className="space-y-4">
            <HashtagPanel
              result={HASHTAGS}
              isGenerating={false}
              canGenerate
              onGenerate={() => {}}
              onApply={() => {}}
            />
            <HashtagPanel
              result={NO_HASHTAGS}
              isGenerating={false}
              canGenerate
              onGenerate={() => {}}
              onApply={() => {}}
            />
          </div>
        </div>

        <PostPerformanceDialog
          detail={DETAIL}
          connections={CONNECTIONS}
          loading={false}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      </div>
    </PageContainer>
  );
}
