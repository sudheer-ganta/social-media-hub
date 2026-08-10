import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useAllPosts } from "@/hooks/usePosts";
import { cn } from "@/lib/utils";
import type { Post, PostStatus } from "@/types";

/**
 * The four stages of the pipeline, in order. `failed` is deliberately not one
 * of them — a failure is an exception to the flow, not a place in it, so it
 * surfaces at the end of the rail as something to resolve.
 */
const STAGES: { key: string; label: string; matches: PostStatus[] }[] = [
  { key: "draft", label: "Draft", matches: ["draft"] },
  { key: "scheduled", label: "Scheduled", matches: ["scheduled", "queued"] },
  { key: "publishing", label: "Publishing", matches: ["publishing"] },
  { key: "published", label: "Published", matches: ["published"] },
];

function stageIndexOf(status: PostStatus): number {
  return STAGES.findIndex((s) => s.matches.includes(status));
}

/** Centre of each stage as a percentage of the rail, since stages are equal columns. */
function centreOf(index: number): string {
  return `${(index + 0.5) * (100 / STAGES.length)}%`;
}

function thumbOf(post: Post): string | null {
  return post.media?.[0]?.url ?? post.image_url ?? null;
}

interface Travel {
  id: string;
  from: number;
  to: number;
  thumb: string | null;
}

/**
 * The Flow Rail — FlowPost's signature interaction.
 *
 * A pipeline strip pinned under the masthead on every screen, so the pipeline
 * is a place you are always standing in rather than a report you go and read.
 * When a post changes stage anywhere in the product — scheduled from the
 * composer, published by the backend, retried after a failure — its thumbnail
 * travels the rail from the old stage to the new one and the counts tick.
 *
 * The rail itself is ink. The travelling thumbnail is the only thing on it
 * that carries a platform's colour.
 */
export function FlowRail() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { data: posts } = useAllPosts();

  // Last seen stage per post. Populated on first load without animating, so
  // arriving on the app does not fire a burst of travel for existing content.
  const seen = useRef<Map<string, number> | null>(null);
  const [travel, setTravel] = useState<Travel | null>(null);

  useEffect(() => {
    if (!posts) return;

    const next = new Map<string, number>();
    for (const post of posts) next.set(post.id, stageIndexOf(post.status));

    const previous = seen.current;
    seen.current = next;
    if (!previous || reduced) return;

    for (const post of posts) {
      const from = previous.get(post.id);
      const to = next.get(post.id);
      if (from === undefined || to === undefined) continue;
      if (from === to || from < 0 || to < 0) continue;
      // One item travels at a time; the next change starts its own trip.
      setTravel({ id: post.id, from, to, thumb: thumbOf(post) });
      break;
    }
  }, [posts, reduced]);

  const counts = STAGES.map(
    (stage) =>
      posts?.filter((p) => stage.matches.includes(p.status)).length ?? 0,
  );
  const failed = posts?.filter((p) => p.status === "failed").length ?? 0;

  return (
    <div className="sticky top-14 z-20 border-b bg-background/95 backdrop-blur-sm">
      <div className="relative mx-auto flex max-w-[1600px] items-stretch px-4 sm:px-6 lg:px-8">
        <div className="relative grid flex-1 grid-cols-4">
          {STAGES.map((stage, i) => (
            <button
              key={stage.key}
              onClick={() => navigate("/posts", { state: { status: stage.key } })}
              className="group flex items-center justify-center gap-2 py-2 transition-colors hover:bg-secondary/60"
            >
              <span
                className={cn(
                  "text-meta transition-colors group-hover:text-foreground",
                  stage.key === "publishing" &&
                    counts[i] > 0 &&
                    "text-foreground",
                )}
              >
                {stage.label}
              </span>
              <span className="tnum text-xs font-medium tabular-nums">
                {counts[i]}
              </span>
              {stage.key === "publishing" && counts[i] > 0 && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground" />
              )}
              {i < STAGES.length - 1 && (
                <span className="pointer-events-none absolute" aria-hidden="true" />
              )}
            </button>
          ))}

          {/* The travelling post. Platform colour lives here and nowhere else
              on the rail. */}
          <AnimatePresence>
            {travel && (
              <motion.span
                key={travel.id + travel.to}
                initial={{ left: centreOf(travel.from), opacity: 0, scale: 0.6 }}
                animate={{ left: centreOf(travel.to), opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
                onAnimationComplete={() => setTravel(null)}
                className="pointer-events-none absolute top-1/2 -ml-3 h-6 w-6 -translate-y-1/2 overflow-hidden rounded border bg-card shadow-soft"
              >
                {travel.thumb && (
                  <img
                    src={travel.thumb}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {failed > 0 && (
          <button
            onClick={() => navigate("/posts", { state: { status: "failed" } })}
            className="flex items-center gap-1.5 border-l pl-3 pr-1 text-destructive transition-colors hover:bg-destructive/5"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-meta text-destructive">
              {failed} failed
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
