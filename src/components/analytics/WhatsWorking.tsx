import { Flame, Images, Smartphone } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CONFIDENCE_COPY,
  whatsWorking,
  type Confidence,
  type Finding,
} from "./insights";
import type {
  MediaTypeBreakdownEntry,
  PlatformBreakdownEntry,
  PostPerformanceRow,
} from "@/services/analytics.service";

/**
 * FlowPost reading the member's data back to them.
 *
 * ─── The most important thing on the page ────────────────────────────────────
 *
 * Every other section shows numbers and leaves the conclusion to the reader.
 * This one draws the conclusion — best post, strongest format, strongest network
 * — because "which of my posts got a good response" is the question people
 * actually open analytics to answer, and making them derive it from a table is
 * making them do the work the product exists to do.
 *
 * ─── Which is exactly why it is the most dangerous ───────────────────────────
 *
 * A stated conclusion is trusted in a way a table is not. So:
 *
 *   • Every finding comes from `whatsWorking`, which is pure and tested. No
 *     sentence is assembled in this file.
 *   • Nothing is compared against an industry benchmark, because FlowPost has no
 *     benchmark data and will not invent one to make a headline land.
 *   • The sample size is on screen, always. "Early signal" from two measured
 *     posts and "Strong signal" from twenty are different claims and must not
 *     read alike.
 *   • Fewer findings rather than weaker ones — a page that always fills three
 *     slots will pad the third with something it cannot support, and that one
 *     sentence is what makes the other two untrustworthy.
 */
export function WhatsWorking({
  posts,
  mediaTypes,
  platforms,
  loading,
  onOpenPost,
}: {
  posts: PostPerformanceRow[] | undefined;
  mediaTypes: MediaTypeBreakdownEntry[] | undefined;
  platforms: PlatformBreakdownEntry[] | undefined;
  loading: boolean;
  onOpenPost: (postId: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const findings = whatsWorking(posts ?? [], mediaTypes ?? [], platforms ?? []);

  if (loading) {
    return (
      <section>
        <Heading />
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2.5 h-6 w-40" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (findings.length === 0) {
    return (
      <section>
        <Heading />
        <p className="max-w-prose border-t border-border pt-4 text-sm text-muted-foreground">
          Your first performance story is loading. Once a published post has been
          measured, FlowPost will tell you here what's working and what isn't —
          you won't have to look for it.
        </p>
      </section>
    );
  }

  return (
    <section>
      <Heading />
      <div
        className={cn(
          "grid gap-x-8 gap-y-6 border-t border-border pt-5",
          findings.length > 1 && "sm:grid-cols-2",
          findings.length > 2 && "lg:grid-cols-3",
        )}
      >
        {findings.map((finding, index) => (
          <motion.div
            key={finding.heading}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: reduceMotion ? 0 : index * 0.06,
              duration: 0.28,
              ease: [0.32, 0.72, 0, 1],
            }}
          >
            <FindingBlock finding={finding} onOpenPost={onOpenPost} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Heading() {
  return (
    <div className="mb-4">
      <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">
        What's working
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        From your own posts — not from anybody else's averages.
      </p>
    </div>
  );
}

const ICONS = {
  post: Flame,
  format: Images,
  platform: Smartphone,
} as const;

function FindingBlock({
  finding,
  onOpenPost,
}: {
  finding: Finding;
  onOpenPost: (postId: string) => void;
}) {
  const Icon = ICONS[finding.kind];

  const body = (
    <>
      <span className="text-meta flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {finding.heading}
      </span>

      <span className="mt-1.5 block font-display text-xl font-semibold leading-tight tracking-[-0.01em]">
        {finding.headline}
      </span>

      <span className="mt-1 block text-sm text-muted-foreground">
        {finding.detail}
      </span>

      <ConfidenceTag confidence={finding.confidence} />
    </>
  );

  // A post finding opens that post. A format or platform finding has nowhere
  // deeper to go, so it is not made to look as though it does.
  if (finding.postId) {
    return (
      <button
        type="button"
        onClick={() => onOpenPost(finding.postId!)}
        className="group -m-2 block w-full rounded-md p-2 text-left transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
        <span className="mt-2 block text-xs font-medium underline-offset-4 group-hover:underline">
          See how it performed
        </span>
      </button>
    );
  }

  return <div>{body}</div>;
}

/**
 * How far this finding can be trusted, in words rather than a colour.
 *
 * The wording is the safety rail: three measured posts and thirty produce the
 * same-looking headline, and only this line tells them apart. Rendered as text
 * because a coloured dot alone would carry the state — which is the thing the
 * design contract forbids and which nobody reads anyway.
 */
function ConfidenceTag({ confidence }: { confidence: Confidence }) {
  return (
    <span className="text-meta mt-2 flex items-center gap-1.5">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          confidence === "strong" && "bg-success",
          confidence === "emerging" && "bg-foreground/50",
          confidence === "early" && "bg-muted-foreground/40",
        )}
        aria-hidden="true"
      />
      {CONFIDENCE_COPY[confidence]}
    </span>
  );
}
