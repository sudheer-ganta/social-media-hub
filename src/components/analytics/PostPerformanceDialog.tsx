import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { AlertCircle, Clock, ExternalLink } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types";
import {
  engagementMetricsFor,
  formatCount,
  formatRate,
  METRIC_LABELS,
  metricCell,
  metricText,
} from "./metric-display";
import {
  formatRelative,
  mediaTypeSingular,
  platformColor,
  platformName,
  postLabel,
} from "./insights";
import type {
  MediaAssetSummary,
  PostDetail,
  PublicationPerformance,
  SyncStatusEntry,
} from "@/services/analytics.service";

/**
 * How one post performed, everywhere it went.
 *
 * ─── This is the only honest cross-platform comparison in the product ────────
 *
 * Every number here belongs to the *same content* — same caption, same media,
 * same moment. That is what makes "Instagram did better than LinkedIn" mean
 * something here and nowhere else on the page.
 *
 * Which does not make the metrics interchangeable. Instagram's headline figure
 * is Reach (unique accounts) and LinkedIn's is Impressions (appearances), and
 * they sit side by side under their own names, never summed into a cross-network
 * total. Adding 1,842 unique people to 7 appearances produces 1,849 of nothing.
 *
 * ─── Four different silences ─────────────────────────────────────────────────
 *
 * A platform section can be empty for four reasons and they get four sentences:
 * measured, still collecting, missing the analytics permission, or never
 * published to at all. Rendering any of them as 0 would put a fact about our
 * plumbing into the member's performance data.
 */
export function PostPerformanceDialog({
  detail,
  connections,
  loading,
  open,
  onOpenChange,
}: {
  detail: PostDetail | undefined;
  connections: SyncStatusEntry[];
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Full-screen on a phone, a centred sheet on a desktop. A 640px dialog
          scaled down is not a mobile design; this is the same content in the
          shape each device can actually read. */}
      <DialogContent
        className={cn(
          "max-w-3xl gap-0 overflow-y-auto p-0",
          "h-[100dvh] max-h-[100dvh] w-full rounded-none",
          "sm:h-auto sm:max-h-[88vh] sm:rounded-lg",
        )}
      >
        <DialogHeader className="sticky top-0 z-10 border-b border-border bg-card px-5 py-4 text-left sm:px-6">
          <DialogTitle className="font-display text-base tracking-[-0.01em] sm:text-lg">
            How this post performed
          </DialogTitle>
          <DialogDescription>
            {detail
              ? [
                  detail.mediaShape,
                  detail.publishedAt
                    ? `published ${dayjs(detail.publishedAt).format("MMM D, YYYY")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "The same content, on each network it reached."}
          </DialogDescription>
        </DialogHeader>

        {loading || !detail ? (
          <div className="space-y-4 p-5 sm:p-6">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : (
          <div className="space-y-8 p-5 sm:p-6">
            <TheContent detail={detail} />

            {detail.published.length > 1 && (
              <Comparison detail={detail} connections={connections} />
            )}

            <section className="space-y-4">
              <h3 className="text-meta">Platform by platform</h3>

              {detail.published.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  This post hasn't published successfully anywhere yet, so there
                  is nothing to measure.
                </p>
              )}

              {detail.published.map((publication) => (
                <PublicationSection
                  key={publication.postPlatformId}
                  publication={publication}
                  connections={connections}
                />
              ))}

              {/* Destinations that produced no publication. Kept apart from the
                  performance sections so a failure never reads as a post that
                  simply did badly. */}
              {detail.notPublished.map((destination) => (
                <div
                  key={destination.provider}
                  className="rounded-lg border border-dashed border-border p-4"
                >
                  <div className="flex items-center gap-2">
                    <Glyph provider={destination.provider} />
                    <span className="text-sm font-medium">
                      {platformName(destination.provider)}
                    </span>
                  </div>
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Not published — this never reached the network, so there is
                      no performance to show.
                      {destination.errorMessage && (
                        <span className="mt-0.5 block">
                          {destination.errorMessage}
                        </span>
                      )}
                    </span>
                  </p>
                </div>
              ))}
            </section>

            <MediaSection detail={detail} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── The content itself ──────────────────────────────────────────────────────

/**
 * What was published, before any numbers.
 *
 * Media at its own aspect ratio rather than cropped to a tidy box: a 9:16 Reel
 * shown as a square is not the thing whose performance is being explained.
 */
function TheContent({ detail }: { detail: PostDetail }) {
  const first = detail.media[0];
  const poster = first?.posterUrl ?? first?.url ?? null;

  return (
    <section className="flex flex-col gap-4 sm:flex-row">
      {poster && (
        <img
          src={poster}
          alt=""
          className="w-full max-w-[220px] self-start rounded-lg border border-border object-contain"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-semibold tracking-[-0.01em]">
          {postLabel(detail)}
        </p>
        {detail.caption && (
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">
            {detail.caption.length > 400
              ? `${detail.caption.slice(0, 400)}…`
              : detail.caption}
          </p>
        )}
      </div>
    </section>
  );
}

// ─── Same post, different platforms ──────────────────────────────────────────

/**
 * The side-by-side, for the one question this view exists to answer:
 * where did this content work best?
 *
 * Columns rather than a shared table, because a table implies the rows line up
 * and they do not — each network contributes the figure it actually reports,
 * under its own name. There is no total row and there will not be one.
 */
function Comparison({
  detail,
  connections,
}: {
  detail: PostDetail;
  connections: SyncStatusEntry[];
}) {
  const idle = detail.notPublished;

  return (
    <section>
      <h3 className="text-meta mb-3">Same post, different platforms</h3>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {detail.published.map((publication) => (
          <div
            key={publication.postPlatformId}
            className="rounded-lg border border-border p-3"
          >
            <div className="flex items-center gap-2">
              <Glyph provider={publication.provider} />
              <span className="text-sm font-medium">
                {platformName(publication.provider)}
              </span>
            </div>

            {publication.state === "measured" ? (
              <dl className="mt-2 space-y-1">
                {publication.exposure.label && (
                  <Pair
                    term={publication.exposure.label}
                    value={
                      publication.exposure.value === null
                        ? "—"
                        : formatCount(publication.exposure.value)
                    }
                  />
                )}
                <Pair
                  term="Interactions"
                  value={
                    publication.engagement === null
                      ? "—"
                      : formatCount(publication.engagement)
                  }
                />
                {publication.engagementRate !== null && (
                  <Pair
                    term="Engagement"
                    value={formatRate(publication.engagementRate)}
                  />
                )}
              </dl>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {stateSentence(publication, connections)}
              </p>
            )}
          </div>
        ))}

        {idle.map((destination) => (
          <div
            key={destination.provider}
            className="rounded-lg border border-dashed border-border p-3"
          >
            <div className="flex items-center gap-2">
              <Glyph provider={destination.provider} />
              <span className="text-sm font-medium">
                {platformName(destination.provider)}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Not published</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Pair({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-meta normal-case tracking-normal">{term}</dt>
      <dd className="text-sm font-semibold tnum">{value}</dd>
    </div>
  );
}

// ─── One network's section ───────────────────────────────────────────────────

function PublicationSection({
  publication,
  connections,
}: {
  publication: PublicationPerformance;
  connections: SyncStatusEntry[];
}) {
  const metrics = engagementMetricsFor(publication);

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Glyph provider={publication.provider} />
          {platformName(publication.provider)}
        </span>

        <div className="flex items-center gap-3">
          {publication.mediaType && (
            <span className="text-meta">
              {mediaTypeSingular(publication.mediaType)}
              {!publication.mediaTypeConfirmed && " (expected)"}
            </span>
          )}
          {publication.permalink && (
            <a
              href={publication.permalink}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`View on ${platformName(publication.provider)}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Freshness grouped per platform rather than repeated beside every
          number — one timestamp is context, twenty is noise. */}
      <p className="text-meta mt-1">
        Published
        {publication.publishedAt &&
          ` ${dayjs(publication.publishedAt).format("MMM D")}`}
        {publication.lastCapturedAt &&
          ` · updated ${formatRelative(publication.lastCapturedAt)}`}
      </p>

      {publication.notice && (
        <p className="mt-2 text-xs text-warning">{publication.notice}</p>
      )}

      {publication.state !== "measured" ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {stateSentence(publication, connections)}
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
            {publication.exposure.label && (
              <Figure
                label={publication.exposure.label}
                text={
                  publication.exposure.value === null
                    ? "—"
                    : formatCount(publication.exposure.value)
                }
                emphasis
              />
            )}
            {metrics.map((metric) => (
              <Figure
                key={metric}
                label={METRIC_LABELS[metric] ?? metric}
                text={metricText(metricCell(publication, metric))}
              />
            ))}
            {publication.engagementRate !== null && (
              <Figure
                label="Engagement"
                text={formatRate(publication.engagementRate)}
                emphasis
              />
            )}
          </div>

          <History publication={publication} />
        </>
      )}
    </div>
  );
}

/**
 * Why this network shows nothing, in the member's words.
 *
 * `unavailable` splits in two and the split matters: a connection missing a
 * scope is something the member can fix in a minute, and a network with no
 * analytics API at all is something nobody can fix. Telling them apart is the
 * difference between an action and a dead end.
 */
function stateSentence(
  publication: PublicationPerformance,
  connections: SyncStatusEntry[],
): string {
  if (publication.state === "collecting") {
    return "Collecting performance data — this usually arrives within the hour.";
  }

  const connection = connections.find(
    (entry) => entry.provider === publication.provider,
  );

  if (connection && !connection.analyticsSupported) {
    return `${platformName(publication.provider)} doesn't report post performance yet.`;
  }
  return `Analytics permission required — reconnect ${platformName(
    publication.provider,
  )} to see how this did.`;
}

function Figure({
  label,
  text,
  emphasis,
}: {
  label: string;
  text: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div
        className={cn(
          "font-display font-semibold tnum leading-none",
          emphasis ? "text-xl" : "text-base",
        )}
      >
        {text}
      </div>
      <div className="text-meta mt-1">{label}</div>
    </div>
  );
}

// ─── Performance over time ───────────────────────────────────────────────────

/** Metrics worth plotting, in the order a member would look for them. */
const PLOTTABLE = [
  "views",
  "reach",
  "impressions",
  "likes",
  "comments",
  "shares",
  "clicks",
] as const;

/**
 * One publication's curve, for a metric the member picks.
 *
 * ─── Two observations is the floor ───────────────────────────────────────────
 *
 * A single point is not a trend, and an axis drawn through one value invites the
 * reader to see a flat line where there is no line at all. Below two
 * observations this says it is still collecting instead of drawing an empty
 * chart — which is a state, not an absence of one.
 *
 * The selector only offers metrics this network actually reports *and* has
 * values for. Offering "Saves" on LinkedIn produces an empty chart and the
 * impression that saves went to zero.
 */
function History({ publication }: { publication: PublicationPerformance }) {
  const available = useMemo(
    () =>
      PLOTTABLE.filter(
        (metric) =>
          publication.reportsMetrics.includes(metric) &&
          publication.history.some(
            (point) => typeof point.metrics[metric] === "number",
          ),
      ),
    [publication],
  );

  const [metric, setMetric] = useState<string | null>(null);
  const selected = metric && available.includes(metric as never)
    ? metric
    : (available[0] ?? null);

  const points = useMemo(() => {
    if (!selected) return [];
    return publication.history
      .filter((point) => typeof point.metrics[selected] === "number")
      .map((point) => ({
        label: dayjs(point.capturedAt).format("MMM D HH:mm"),
        value: point.metrics[selected] as number,
      }));
  }, [publication.history, selected]);

  if (!selected || points.length < 2) {
    return (
      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        Collecting performance data — the trend appears after the second update.
      </p>
    );
  }

  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-meta">Over time</span>
        <div className="flex flex-wrap gap-1">
          {available.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMetric(option)}
              aria-pressed={option === selected}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                option === selected
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              {METRIC_LABELS[option] ?? option}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 h-[160px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="hsl(var(--border))"
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
                color: "hsl(var(--foreground))",
              }}
              formatter={(value: number) => [
                formatCount(value),
                METRIC_LABELS[selected] ?? selected,
              ]}
            />
            <Line
              type="monotone"
              dataKey="value"
              // Ink, not a hue. The series is FlowPost's, and FlowPost has no
              // colour of its own.
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              dot={{ r: 2.5, strokeWidth: 0, fill: "hsl(var(--foreground))" }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Media ───────────────────────────────────────────────────────────────────

/**
 * The assets, described — and an explicit statement that per-asset numbers do
 * not exist.
 *
 * Saying it is the feature. Somebody looking at a three-image carousel with 126
 * interactions will assume a per-slide breakdown is somewhere; the honest answer
 * is that Instagram does not report one, and the alternative to saying so is
 * inventing three numbers that sum correctly and mean nothing.
 */
function MediaSection({ detail }: { detail: PostDetail }) {
  if (detail.media.length === 0) return null;

  return (
    <section>
      <h3 className="text-meta mb-2">Media</h3>

      <ul className="divide-y divide-border border-t border-border">
        {detail.media.map((asset) => (
          <li
            key={asset.id ?? asset.position}
            className="flex items-center gap-3 py-2.5"
          >
            <span className="text-meta w-4 shrink-0">{asset.position + 1}</span>
            <span className="text-sm capitalize">{asset.kind}</span>
            <span className="text-meta">{describeAsset(asset)}</span>
          </li>
        ))}
      </ul>

      {detail.mediaLevel.map((support) => (
        <p key={support.provider} className="mt-2 text-xs text-muted-foreground">
          {support.available
            ? `${platformName(support.provider)} reports metrics per image.`
            : support.note}
        </p>
      ))}
    </section>
  );
}

/** "1080 × 1920 · 9:16 · 0:18" — what is known, and nothing more. */
function describeAsset(asset: MediaAssetSummary): string {
  const parts: string[] = [];
  if (asset.width && asset.height) parts.push(`${asset.width} × ${asset.height}`);
  if (asset.aspectRatioLabel) parts.push(asset.aspectRatioLabel);
  if (asset.durationMs) {
    const seconds = Math.round(asset.durationMs / 1000);
    parts.push(
      `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
    );
  }
  if (asset.cropped) parts.push("cropped");
  return parts.join(" · ") || "No dimensions recorded";
}

const PLATFORM_IDS: Platform[] = [
  "linkedin",
  "instagram",
  "facebook",
  "x",
  "threads",
];

function Glyph({ provider }: { provider: string }) {
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
  return (
    <span style={{ color: platformColor(known) }} className="inline-flex">
      <PlatformIcon platform={known} className="h-4 w-4 shrink-0" />
    </span>
  );
}
