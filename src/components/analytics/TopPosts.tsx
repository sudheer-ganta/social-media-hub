import dayjs from "dayjs";
import { ArrowRight, ImageOff } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types";
import { formatCount, formatRate } from "./metric-display";
import {
  mediaTypeSingular,
  platformColor,
  platformName,
  postLabel,
  topPosts,
  type TopPost,
} from "./insights";
import type { PostPerformanceRow } from "@/services/analytics.service";

/**
 * The member's content, ranked — and told what ranked it.
 *
 * ─── Why the ranking measure is on screen ────────────────────────────────────
 *
 * A leaderboard with no stated measure is a leaderboard the reader has to trust
 * blindly, and the temptation it creates is a single blended "performance score"
 * that ranks everything and means nothing — one number weighing a LinkedIn
 * impression against an Instagram reach, with the weighting hidden inside it.
 *
 * So posts are ranked by engagement rate where the network reported exposure and
 * by raw interactions where it did not, and each row says which. Two honest
 * measures, named, beat one invented one.
 *
 * ─── Unmeasured content sorts last, not lowest ───────────────────────────────
 *
 * A post nobody has read yet has no engagement — which is not zero engagement.
 * It sits at the end labelled "Collecting", where it reads as pending rather
 * than as a failure.
 */
export function TopPosts({
  posts,
  loading,
  onOpenPost,
  limit = 6,
}: {
  posts: PostPerformanceRow[] | undefined;
  loading: boolean;
  onOpenPost: (postId: string) => void;
  limit?: number;
}) {
  const reduceMotion = useReducedMotion();
  const rows = topPosts(posts ?? []).slice(0, limit);

  return (
    <section>
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">
          Top performing posts
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Ranked by what each network actually measured.
        </p>
      </div>

      {loading ? (
        <ul className="divide-y divide-border border-t border-border">
          {[0, 1, 2].map((index) => (
            <li key={index} className="flex items-center gap-4 py-4">
              <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="mt-2 h-3 w-32" />
              </div>
              <Skeleton className="h-8 w-16" />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="max-w-prose border-t border-border pt-4 text-sm text-muted-foreground">
          Nothing published in this period yet. Publish a post and FlowPost will
          start tracking it automatically — you don't have to do anything.
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((post, index) => (
            <motion.li
              key={post.postId}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: reduceMotion ? 0 : index * 0.04,
                duration: 0.26,
                ease: [0.32, 0.72, 0, 1],
              }}
            >
              <PostRow post={post} onOpen={() => onOpenPost(post.postId)} />
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}

const PLATFORM_IDS: Platform[] = [
  "linkedin",
  "instagram",
  "facebook",
  "x",
  "threads",
];

function PostRow({ post, onOpen }: { post: TopPost; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-start gap-4 py-4 text-left transition-colors hover:bg-secondary/50 focus-visible:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <Thumbnail post={post} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{postLabel(post)}</p>

        <p className="text-meta mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex items-center gap-1">
            {post.providers.map((provider) => (
              <Glyph key={provider} provider={provider} />
            ))}
          </span>
          <span>{post.providers.map(platformName).join(" · ")}</span>
          {post.mediaType && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {mediaTypeSingular(post.mediaType)}
                {/* The provenance the analytics layer tracks: a format the
                    network confirmed is a different claim from one we guessed
                    at publish time. */}
                {!post.mediaTypeConfirmed && " (expected)"}
              </span>
            </>
          )}
          {post.publishedAt && (
            <>
              <span aria-hidden="true">·</span>
              <span>{dayjs(post.publishedAt).format("MMM D")}</span>
            </>
          )}
        </p>

        {/* Each network's exposure under its own name, never merged into one
            figure. Reach and impressions measure different things. */}
        {post.exposures.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {post.exposures.map((exposure) => (
              <span key={`${exposure.provider}:${exposure.label}`}>
                <span className="font-semibold tnum text-foreground">
                  {formatCount(exposure.value)}
                </span>{" "}
                {exposure.label.toLowerCase()}
                {post.providers.length > 1 && (
                  <span> on {platformName(exposure.provider)}</span>
                )}
              </span>
            ))}
            {typeof post.engagement === "number" && (
              <span>
                <span className="font-semibold tnum text-foreground">
                  {formatCount(post.engagement)}
                </span>{" "}
                {post.engagement === 1 ? "interaction" : "interactions"}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="shrink-0 pt-0.5 text-right">
        <PrimaryMetric post={post} />
      </div>

      <ArrowRight
        className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * The one figure this post is ranked on, with the measure named underneath.
 *
 * Three genuinely different outcomes, three different renderings: a rate, a
 * count of interactions, or a statement that nothing has been read yet. The last
 * one is never "0".
 */
function PrimaryMetric({ post }: { post: TopPost }) {
  if (post.rankedBy === "rate" && post.bestRate) {
    return (
      <>
        <span className="block font-display text-lg font-semibold tnum leading-none">
          {formatRate(post.bestRate.rate)}
        </span>
        <span className="text-meta mt-1 block">
          engagement
          {post.providers.length > 1 && (
            <span className="block normal-case tracking-normal">
              on {platformName(post.bestRate.provider)}
            </span>
          )}
        </span>
      </>
    );
  }

  if (post.rankedBy === "interactions" && typeof post.engagement === "number") {
    return (
      <>
        <span className="block font-display text-lg font-semibold tnum leading-none">
          {formatCount(post.engagement)}
        </span>
        <span className="text-meta mt-1 block">
          {post.engagement === 1 ? "interaction" : "interactions"}
        </span>
      </>
    );
  }

  return (
    <span className="text-[11px] leading-tight text-muted-foreground">
      Collecting
      <br />
      performance data
    </span>
  );
}

/**
 * The post's own image.
 *
 * Small and square here because it is a locator in a ranked list, not the
 * presentation of the content — the media renders at its true aspect ratio in
 * the post detail, which is where somebody looks at it rather than for it.
 */
function Thumbnail({ post }: { post: TopPost }) {
  if (!post.thumbnailUrl) {
    return (
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary"
        aria-hidden="true"
      >
        <ImageOff className="h-4 w-4 text-muted-foreground" />
      </span>
    );
  }

  return (
    <img
      src={post.thumbnailUrl}
      alt=""
      loading="lazy"
      className={cn(
        "h-14 w-14 shrink-0 rounded-lg border border-border object-cover",
        "transition-shadow group-hover:shadow-soft",
      )}
    />
  );
}

function Glyph({ provider }: { provider: string }) {
  const known = PLATFORM_IDS.find((id) => id === provider);
  if (!known) {
    return (
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: platformColor(provider) }}
        aria-hidden="true"
      />
    );
  }
  return (
    <span style={{ color: platformColor(known) }} className="inline-flex">
      <PlatformIcon platform={known} className="h-3.5 w-3.5" />
    </span>
  );
}
