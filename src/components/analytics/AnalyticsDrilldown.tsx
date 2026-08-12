import dayjs from "dayjs";
import { X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types";
import { formatCount } from "./metric-display";
import {
  engagementByContentType,
  engagementByKind,
  engagementByPlatform,
  netFollowerChange,
  platformColor,
  platformName,
  postLabel,
  STATE_COPY,
  topPosts,
  visibilityByPlatform,
  type BreakdownRow,
  type CardKey,
} from "./insights";
import type {
  AnalyticsOverview,
  PlatformBreakdownEntry,
  PostPerformanceRow,
  SyncStatusEntry,
} from "@/services/analytics.service";

/**
 * The answer to "why?", opened from an overview figure.
 *
 * ─── The rule this exists to satisfy ─────────────────────────────────────────
 *
 * A clickable number must never open a blank page. Every one of the five cards
 * has a real breakdown behind it — where the interactions came from, which
 * network showed the content, which links were clicked, how the audience moved —
 * and all of it is data FlowPost already holds. What was missing was a way in.
 *
 * ─── Nothing is fabricated to fill a section ─────────────────────────────────
 *
 * A network that reports no clicks gets a sentence, not a zero row. A network
 * with nothing published gets "Nothing published here yet", not an empty bar.
 * The alternative — padding each breakdown to a uniform set of rows — makes
 * every section look complete and every number look comparable, which is the
 * failure this whole feature is built to avoid.
 */
export function AnalyticsDrilldown({
  open,
  overview,
  platforms,
  posts,
  connections,
  onClose,
  onOpenPost,
}: {
  open: CardKey | null;
  overview: AnalyticsOverview | undefined;
  platforms: PlatformBreakdownEntry[];
  posts: PostPerformanceRow[];
  connections: SyncStatusEntry[];
  onClose: () => void;
  onOpenPost: (postId: string) => void;
}) {
  const reduceMotion = useReducedMotion();

  if (open === null) return null;

  return (
    // No AnimatePresence, and no key on the panel. Two reasons, both practical:
    // an exit animation here left the outgoing panel mounted indefinitely under
    // framer-motion 12 + React 19, and keying by card would make every switch an
    // exit-then-enter — two answers stacked mid-transition. The panel is one
    // surface whose contents swap instantly, which is what a member clicking a
    // second card expects anyway. Closing needs no animation to be understood.
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      className="rounded-lg border border-border bg-card p-5 sm:p-6"
      aria-label={`${TITLES[open]} details`}
    >
      <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
        {/* min-w-0 or the subtitle refuses to wrap and pushes the close button
            off a narrow screen. */}
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold tracking-[-0.01em]">
            {TITLES[open]}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {SUBTITLES[open]}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close details"
          className="-mr-2 -mt-1 shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="pt-5">
        {open === "engagement" && (
          <EngagementBreakdown
            overview={overview}
            platforms={platforms}
            posts={posts}
            connections={connections}
          />
        )}
        {open === "reach" && (
          <VisibilityBreakdown platforms={platforms} connections={connections} />
        )}
        {open === "clicks" && (
          <ClickBreakdown platforms={platforms} connections={connections} />
        )}
        {open === "growth" && <GrowthBreakdown overview={overview} />}
        {open === "published" && (
          <PublicationList posts={posts} onOpenPost={onOpenPost} />
        )}
      </div>
    </motion.section>
  );
}

const TITLES: Record<CardKey, string> = {
  published: "What actually went live",
  engagement: "Your engagement",
  reach: "Where your content was seen",
  clicks: "Link clicks",
  growth: "Your audience",
};

const SUBTITLES: Record<CardKey, string> = {
  published: "Every publication that reached a network successfully.",
  engagement: "Every interaction FlowPost has measured, and where it came from.",
  reach: "Each network under the figure it actually reports.",
  clicks: "Only the networks that report clicks at all.",
  growth: "Followers per account, and how they have moved.",
};

// ─── Engagement ──────────────────────────────────────────────────────────────

function EngagementBreakdown({
  overview,
  platforms,
  posts,
  connections,
}: {
  overview: AnalyticsOverview | undefined;
  platforms: PlatformBreakdownEntry[];
  posts: PostPerformanceRow[];
  connections: SyncStatusEntry[];
}) {
  const byKind = engagementByKind(overview);
  const byPlatform = engagementByPlatform(platforms, connections);
  const byType = engagementByContentType(posts);
  const totalInteractions = overview?.totals?.engagement?.value ?? null;

  if (totalInteractions === null && byKind.length === 0) {
    return (
      <Blank>
        Nothing has been measured yet. FlowPost collects interactions
        automatically once a post is live.
      </Blank>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <Section title="By interaction">
        <Bars rows={byKind} />
      </Section>

      <Section title="By platform">
        <Bars rows={byPlatform} showIcons />
      </Section>

      {/* Only when there is more than one format to compare. One row saying
          "Image 4" is not a breakdown, it is the total again. */}
      {byType.length > 1 && (
        <Section title="By content type">
          <Bars rows={byType} />
        </Section>
      )}
    </div>
  );
}

// ─── Visibility ──────────────────────────────────────────────────────────────

function VisibilityBreakdown({
  platforms,
  connections,
}: {
  platforms: PlatformBreakdownEntry[];
  connections: SyncStatusEntry[];
}) {
  const rows = visibilityByPlatform(platforms, connections);
  const publishedTo = new Set(platforms.map((entry) => entry.provider));

  if (rows.length === 0) {
    return <Blank>Connect a network and FlowPost will track what it reports.</Blank>;
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li
            key={row.provider}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <PlatformGlyph provider={row.provider} />
              {row.label}
            </span>

            {row.value !== null ? (
              <span className="text-sm tnum">
                <span className="font-semibold">{formatCount(row.value)}</span>{" "}
                <span className="text-meta normal-case tracking-normal">
                  {/* Instagram's reach and LinkedIn's impressions never share a
                      heading — unique people and appearances are not the same
                      measurement, and one column would compare them as if they
                      were. */}
                  {row.metricLabel?.toLowerCase()}
                </span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {publishedTo.has(row.provider)
                  ? STATE_COPY[row.state] || "Not reported"
                  : "Nothing published here yet"}
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-muted-foreground">
        Reach counts the people who saw a post. Impressions count how many times
        it appeared. FlowPost keeps them apart because they aren't the same
        thing.
      </p>
    </>
  );
}

// ─── Clicks ──────────────────────────────────────────────────────────────────

function ClickBreakdown({
  platforms,
  connections,
}: {
  platforms: PlatformBreakdownEntry[];
  connections: SyncStatusEntry[];
}) {
  const reporting = platforms.filter(
    (entry) => (entry.totals?.clicks?.reported ?? 0) > 0,
  );

  if (reporting.length === 0) {
    const anyConnected = connections.length > 0;
    return (
      <Blank>
        {anyConnected
          ? "None of your connected platforms has reported a link click yet. FlowPost will show them here as soon as they do."
          : "Connect a network that reports link clicks and they will appear here."}
      </Blank>
    );
  }

  return (
    <Bars
      rows={reporting.map((entry) => ({
        label: platformName(entry.provider),
        value: entry.totals.clicks.value,
        color: platformColor(entry.provider),
        share: 0,
      }))}
      showIcons
      normalise
    />
  );
}

// ─── Growth ──────────────────────────────────────────────────────────────────

function GrowthBreakdown({
  overview,
}: {
  overview: AnalyticsOverview | undefined;
}) {
  const audience = overview?.audience ?? [];
  const net = netFollowerChange(audience);

  if (audience.length === 0) {
    return (
      <Blank>
        FlowPost hasn't recorded your follower count yet. It starts as soon as
        the first update comes in.
      </Blank>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {audience.map((point) => (
          <li
            key={`${point.provider}:${point.providerAccountId}`}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <PlatformGlyph provider={point.provider} />
              {platformName(point.provider)}
            </span>

            <span className="flex items-baseline gap-3">
              <span className="text-sm tnum">
                {point.followers === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <>
                    <span className="font-semibold">
                      {formatCount(point.followers)}
                    </span>{" "}
                    <span className="text-meta normal-case tracking-normal">
                      followers
                    </span>
                  </>
                )}
              </span>

              {/* A change needs both ends of a series. One observation is a
                  count, not growth — and rendering it as +0 would claim we
                  looked twice. */}
              {point.change === null ? (
                <span className="text-xs text-muted-foreground">
                  Not enough history yet
                </span>
              ) : (
                <span
                  className={cn(
                    "text-xs tnum font-medium",
                    point.change > 0 && "text-success",
                    point.change < 0 && "text-warning",
                    point.change === 0 && "text-muted-foreground",
                  )}
                >
                  {point.change > 0 ? "+" : ""}
                  {formatCount(point.change)}
                  {point.firstCapturedAt && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      since {dayjs(point.firstCapturedAt).format("MMM D")}
                    </span>
                  )}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {net !== null && audience.length > 1 && (
        <p className="mt-4 text-xs text-muted-foreground">
          {net > 0 ? "+" : ""}
          {formatCount(net)} new follows across {audience.length} accounts.
          Follower counts aren't added together — the same person can follow you
          on more than one network.
        </p>
      )}
    </>
  );
}

// ─── Publications ────────────────────────────────────────────────────────────

function PublicationList({
  posts,
  onOpenPost,
}: {
  posts: PostPerformanceRow[];
  onOpenPost: (postId: string) => void;
}) {
  const content = topPosts(posts);

  if (content.length === 0) {
    return (
      <Blank>
        Nothing has published yet. The moment a post reaches a network, it
        appears here.
      </Blank>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {content.map((item) => (
        <li key={item.postId}>
          <button
            type="button"
            onClick={() => onOpenPost(item.postId)}
            className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {postLabel(item)}
              </span>
              <span className="mt-0.5 flex items-center gap-2">
                {item.providers.map((provider) => (
                  <PlatformGlyph key={provider} provider={provider} />
                ))}
                <span className="text-meta">
                  {item.providers.map(platformName).join(" · ")}
                  {item.publishedAt &&
                    ` · ${dayjs(item.publishedAt).format("MMM D")}`}
                </span>
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-meta mb-3">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Labelled rows with a proportional bar.
 *
 * The bar is relative to the largest row, so the leader fills its track and
 * everything else is read against it. A row with no number gets no bar and a
 * sentence instead — a zero-width bar and a zero-value bar look identical, and
 * they mean opposite things.
 */
function Bars({
  rows,
  showIcons,
  normalise,
}: {
  rows: BreakdownRow[];
  showIcons?: boolean;
  /** Recompute shares here, for callers that built rows without them. */
  normalise?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const max = Math.max(
    0,
    ...rows.map((row) => (typeof row.value === "number" ? row.value : 0)),
  );

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing measured yet.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const share =
          normalise && typeof row.value === "number" && max > 0
            ? row.value / max
            : row.share;

        return (
          <li key={row.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5 text-sm">
                {showIcons && <PlatformGlyphByName label={row.label} />}
                <span className="truncate">{row.label}</span>
              </span>
              {typeof row.value === "number" ? (
                <span className="shrink-0 text-sm font-semibold tnum">
                  {formatCount(row.value)}
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {row.state ? STATE_COPY[row.state] || "—" : "—"}
                </span>
              )}
            </div>

            {typeof row.value === "number" && (
              <div
                className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary"
                role="presentation"
              >
                <motion.div
                  // Reduced motion is the *end state*, never a faster version:
                  // the bar is simply already the right length.
                  initial={reduceMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: Math.max(share, 0.02) }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.4,
                    ease: [0.32, 0.72, 0, 1],
                  }}
                  style={{
                    transformOrigin: "left",
                    backgroundColor: row.color ?? "hsl(var(--foreground))",
                  }}
                  className="h-full w-full"
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const PLATFORM_IDS: Platform[] = [
  "linkedin",
  "instagram",
  "facebook",
  "x",
  "threads",
];

function PlatformGlyph({ provider }: { provider: string }) {
  const known = PLATFORM_IDS.find((id) => id === provider);
  if (!known) {
    return (
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: platformColor(provider) }}
        aria-hidden="true"
      />
    );
  }
  // Platform colour is the only hue on this page, and it belongs to the network
  // rather than to FlowPost. `PlatformIcon` fills from the current text colour,
  // so it is set on the wrapper.
  return (
    <span style={{ color: platformColor(known) }} className="inline-flex">
      <PlatformIcon platform={known} className="h-3.5 w-3.5 shrink-0" />
    </span>
  );
}

/** Rows carry a display name rather than an id; map it back for the glyph. */
function PlatformGlyphByName({ label }: { label: string }) {
  const provider = PLATFORM_IDS.find(
    (id) => platformName(id).toLowerCase() === label.toLowerCase(),
  );
  return provider ? <PlatformGlyph provider={provider} /> : null;
}

function Blank({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-prose py-2 text-sm text-muted-foreground">{children}</p>
  );
}
