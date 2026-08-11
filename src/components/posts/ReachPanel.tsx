import { useState } from "react";
import { AlertTriangle, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { useCaptionAnalysis } from "@/hooks/useCaptionAnalysis";
// Read from the caption text, never from the last generation: the tags that
// matter are the ones that will be published, and those are whatever survived
// the member's editing.
import { hashtagsIn } from "@/utils/hashtags";
import { PLATFORM_MAP } from "@/constants";
import { scoreBand } from "@/ai/analysis";
import type { CaptionMode } from "@/ai/caption";
// Deterministic verification against the caption on screen. The panel holds no
// memory of what was applied — see `ai/reach-fixes.ts`.
import {
  applyFixes,
  fixFor,
  fixFromProposal,
  isActionable,
  isApplied,
  isVerified,
  outstanding,
  rowState,
  statusFor,
  type ReachFix,
  type RowState,
} from "@/ai/reach-fixes";
import { aiService } from "@/services/ai.service";
import { TARGET_ACTION_LABEL } from "@/ai/improve";
import { cn } from "@/lib/utils";
import type { CaptionAnalysis, ScoreDimension } from "@/ai/analysis";
import type { ImprovementTarget, TargetedImprovement } from "@/ai/improve";
import type { ImageAnalysis } from "@/ai/types";
import type { Platform } from "@/types";

/**
 * Reach & Visibility — the optional second half of the Personal assistant.
 *
 * Runs the existing `/api/ai/analyse` endpoint over whatever is in the editor
 * *now*, edits included, which is the whole reason analysis is a separate call
 * from generation (see `ai/analysis.ts`).
 *
 * ─── A coach, not a grader ───────────────────────────────────────────────────
 * The score is real and stays on screen, but it is not the headline. What a
 * member can act on is: which part of the post is weak, what specifically to
 * change, and a button that makes the change. Everything an Apply button does
 * goes through `withLine`/`withHashtags`, which can only *add* — so applying a
 * suggestion, or applying it twice, cannot cost anybody a word they wrote.
 *
 * ─── Why its own component ───────────────────────────────────────────────────
 * Brand reads the same analysis through `marketing/ReachScorePanel`, which
 * renders it off the saved post envelope and sits inside the Marketing Studio.
 * This one has no post to read from — a Personal creator should be able to ask
 * "will this land?" before anything is saved — so it holds its own hook state
 * and takes the caption as a prop.
 *
 * ─── What it will not say ────────────────────────────────────────────────────
 * No promises, and no invented data. The score comes from the copy, so it is
 * labelled as coming from the copy; the posting window is a general convention,
 * so it is labelled as one. Nothing here claims to know this account's
 * audience, because nothing in this app knows it yet — when per-account
 * analytics exist, `basis` below is the one string that changes.
 */

interface ReachPanelProps {
  caption: string;
  platforms: Platform[];
  hasImage: boolean;
  /** The song the member chose, if any. Read only — never replaced here. */
  music?: string;
  /** Vision's read from a generation this session, when there was one. */
  imageAnalysis?: ImageAnalysis;
  /** Writes a caption back to the composer. The only state this panel mutates. */
  onApplyCaption: (caption: string) => void;
  /**
   * The composer's existing suggested-time chip, passed in rather than
   * recomputed, so the panel and the Schedule card cannot drift — and so
   * "Schedule for 7:30 PM" feeds the one scheduling flow that already exists.
   */
  suggestedTime?: { name: string; time: string; label: string; use: () => void };
  /**
   * Which rubric to score against. Defaults to `personal`, because this panel
   * has only ever rendered in a personal context — Brand reviews its posts in
   * the Marketing Studio.
   *
   * That default is the fix for a real inversion: until Personal became its own
   * brain, this panel was scoring personal posts on hooks, CTAs and hashtags —
   * the marketing rubric, applied exclusively to the one mode it does not
   * describe.
   */
  mode?: CaptionMode;
}

/**
 * Where the guidance comes from, said plainly and in one place.
 *
 * This is the sentence to change the day per-account analytics land — it
 * becomes "Based on your last 30 posts" and nothing else in this file moves.
 */
const BASIS = "Based on your content — not on your account history.";

/** Kept alongside the band so the chip never reads as a verdict on its own. */
const SCORE_LABEL: Record<ReturnType<typeof scoreBand>, string> = {
  excellent: "excellent",
  strong: "strong",
  fair: "room to improve",
  weak: "needs work",
};

/**
 * A regeneration in progress, ready, or failed — per row.
 *
 * Held per dimension rather than one at a time, so regenerating the hook leaves
 * the engagement row usable, and a failure on one never blanks the others.
 */
type Proposal =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; improvement: TargetedImprovement };

/** A row of the pre-publish checklist. */
interface Row {
  key: string;
  icon: string;
  label: string;
  state: RowState;
  /** One short line. Never a paragraph. */
  detail: string;
  /** Behind "Why?", when there is more worth reading. */
  why?: string;
  action?: { label: string; run: () => void };
  /** Present when AI can regenerate this part of the post. */
  regenerate?: { label: string; run: () => void };
  proposal?: Proposal;
  /** Accept the proposal on screen. Writes to the composer, then re-analyses. */
  onUseProposal?: () => void;
  onDismissProposal?: () => void;
}

const STATE_MARK: Record<RowState, string> = {
  pass: "✓",
  warn: "⚠",
  checking: "…",
};

const STATE_TONE: Record<RowState, string> = {
  pass: "text-emerald-500",
  warn: "text-amber-500",
  checking: "text-muted-foreground",
};

/**
 * What a proposal will do to the caption, in the member's own terms.
 *
 * Shown in full before anything is applied. A preview that hides the text is
 * just a differently worded "trust me".
 */
function ProposalPreview({
  proposal,
  onUse,
  onRegenerate,
  onDismiss,
}: {
  proposal: TargetedImprovement;
  onUse: () => void;
  onRegenerate: () => void;
  onDismiss: () => void;
}) {
  const body =
    proposal.kind === "hashtags"
      ? (proposal.hashtags ?? []).map((tag) => `#${tag}`).join(" ")
      : (proposal.line ?? proposal.caption ?? "");

  return (
    <div className="mt-2 space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
        Proposed{" "}
        {proposal.kind === "lead"
          ? "opening line"
          : proposal.kind === "line"
            ? "closing line"
            : proposal.kind === "hashtags"
              ? "hashtags to add"
              : "caption"}
      </p>
      <p className="whitespace-pre-line text-[12px] leading-relaxed">{body}</p>
      {proposal.note && (
        <p className="text-[10px] text-muted-foreground">{proposal.note}</p>
      )}
      <div className="flex flex-wrap gap-2 pt-0.5">
        <Button type="button" size="sm" className="h-7 text-[11px]" onClick={onUse}>
          Use this improvement
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={onRegenerate}
        >
          Regenerate again
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-[11px]"
          onClick={onDismiss}
        >
          Keep current
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Nothing changes until you choose. Your caption is untouched.
      </p>
    </div>
  );
}

function ChecklistRow({ row }: { row: Row }) {
  const loading = row.proposal?.status === "loading";

  return (
    <div className="border-b py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <span aria-hidden className="w-5 text-center text-sm leading-6">
          {row.icon}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">{row.label}</p>
          <p
            className={cn("text-[11px] leading-relaxed", STATE_TONE[row.state])}
          >
            {STATE_MARK[row.state]}{" "}
            {row.state === "checking"
              ? "Re-checking your updated post…"
              : row.detail}
          </p>
          {row.why && row.state !== "checking" && (
            <details className="group">
              <summary className="cursor-pointer list-none text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                Why? <span className="inline-block group-open:rotate-180">▾</span>
              </summary>
              <p className="whitespace-pre-line pt-1 text-[11px] leading-relaxed text-muted-foreground">
                {row.why}
              </p>
            </details>
          )}
        </div>

        {/* Regenerate never appears on a row that has already passed — there is
            nothing to fix, and offering to change it would invite the member to
            break something that works. */}
        {row.regenerate && row.state === "warn" && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 text-[11px]"
                loading={loading}
                disabled={loading}
                onClick={row.regenerate.run}
              >
                {!loading && <Sparkles />}
                {loading ? "Regenerating…" : "Regenerate"}
              </Button>
              {row.action && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={row.action.run}
                >
                  {row.action.label}
                </Button>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {row.regenerate.label}
            </span>
          </div>
        )}

        {/* Rows with no AI repair path — Timing, chiefly — keep the plain
            action they always had, passing or not. */}
        {!row.regenerate && row.action && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 text-[11px]"
            onClick={row.action.run}
          >
            {row.action.label}
          </Button>
        )}
      </div>

      {row.proposal?.status === "error" && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            Couldn&apos;t generate an improvement. Your post hasn&apos;t been
            changed.
          </p>
          {row.regenerate && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={row.regenerate.run}
            >
              Try again
            </Button>
          )}
        </div>
      )}

      {row.proposal?.status === "ready" &&
        row.onUseProposal &&
        row.onDismissProposal &&
        row.regenerate && (
          <ProposalPreview
            proposal={row.proposal.improvement}
            onUse={row.onUseProposal}
            onRegenerate={row.regenerate.run}
            onDismiss={row.onDismissProposal}
          />
        )}
    </div>
  );
}

export function ReachPanel({
  caption,
  platforms,
  hasImage,
  music,
  imageAnalysis,
  onApplyCaption,
  suggestedTime,
  mode = "personal",
}: ReachPanelProps) {
  const { analysis, isAnalysing, error, analysedCaption, analyse } =
    useCaptionAnalysis();

  /**
   * Regenerations, per dimension. Cleared whenever a new analysis is requested:
   * a proposal is an answer to one reading of the post, and the reading it
   * answered is gone.
   */
  const [proposals, setProposals] = useState<
    Partial<Record<ScoreDimension, Proposal>>
  >({});

  const trimmed = caption.trim();
  // Matches the backend's `MIN_CAPTION_LENGTH_BY_MODE`. Twelve characters of
  // marketing copy is not yet a post; two characters of a personal one can be
  // the whole thing and entirely deliberate. A shared floor here disabled the
  // button on exactly the captions Personal exists to write.
  const tooShort = trimmed.length < (mode === "personal" ? 2 : 12);

  // A score run against copy that has since been rewritten still describes the
  // old copy. Saying so is better than quietly showing a number that no longer
  // matches what is on screen.
  const stale = Boolean(analysedCaption && analysedCaption !== trimmed);

  /**
   * Analyses a caption — by default whatever is on screen.
   *
   * `override` exists for the one case where the caption on screen is not yet
   * the caption in props: applying an improvement writes through
   * `onApplyCaption` and the re-render has not happened when the re-analysis is
   * queued. Passing the new text explicitly is what makes "verify the actual
   * modified post" true rather than nearly true.
   */
  const run = (override?: string) => {
    const target = (override ?? caption).trim();
    setProposals({});
    void analyse({
      mode,
      caption: target,
      hashtags: hashtagsIn(target),
      platforms,
      hasImage,
      ...(imageAnalysis && { imageAnalysis }),
    });
  };

  /**
   * Asks for a targeted improvement to one flagged part of the post.
   *
   * Only this row goes into a loading state, and a failure is recorded against
   * this row — the rest of the panel stays usable, which matters because a
   * member fixing four things should not be blocked by one that failed.
   */
  const regenerate = async (
    dimension: ScoreDimension,
    target: ImprovementTarget,
    issue?: string,
    recommendation?: string,
  ) => {
    setProposals((current) => ({ ...current, [dimension]: { status: "loading" } }));

    try {
      const improvement = await aiService.improveCaption({
        mode,
        target,
        caption,
        hashtags: hashtagsIn(caption),
        platforms,
        hasImage,
        ...(imageAnalysis && { imageAnalysis }),
        ...(music?.trim() && { music: music.trim() }),
        ...(issue && { issue }),
        ...(recommendation && { recommendation }),
      });
      setProposals((current) => ({
        ...current,
        [dimension]: { status: "ready", improvement },
      }));
    } catch (cause) {
      // The caption is deliberately untouched on this path. A failed
      // regeneration must cost the member nothing.
      setProposals((current) => ({
        ...current,
        [dimension]: {
          status: "error",
          message:
            cause instanceof Error
              ? cause.message
              : "Could not generate an improvement.",
        },
      }));
    }
  };

  /**
   * Applies one or more fixes and immediately re-checks the result.
   *
   * The re-analysis is the point. Applying tells us what the caption now says;
   * only the analysis tells us whether it now passes, and until it comes back
   * the affected rows sit at "checking" rather than green. See `rowState`.
   */
  const applyAndVerify = (fixes: ReachFix[]) => {
    const next = applyFixes(fixes, caption, platforms);
    if (next === caption) return;
    onApplyCaption(next);
    run(next);
  };

  return (
    <Card>
      <CardHeader className="flex-col sm:flex-row sm:items-start justify-between gap-3 space-y-0 p-4 pb-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
            Reach &amp; Visibility
          </CardTitle>
          <CardDescription className="text-xs">
            Optional. Ask what is working in this post and what could be
            stronger before you publish.
          </CardDescription>
        </div>

        <Button
          type="button"
          variant={analysis ? "outline" : "secondary"}
          size="sm"
          loading={isAnalysing}
          disabled={tooShort}
          title={
            tooShort
              ? "Write a line or two first — there's nothing to read yet."
              : undefined
          }
          onClick={() => run()}
          className="w-full sm:w-auto"
        >
          {analysis ? <RefreshCw /> : <TrendingUp />}
          {analysis ? "Check again" : "Check this post"}
        </Button>
      </CardHeader>

      {/* Never taller than what there is to show: one line before the first
          run, a short skeleton while it runs, the reading once it exists. */}
      <CardContent className="space-y-3 p-4 pt-0">
        {error && !isAnalysing && (
          <div
            role="alert"
            className="flex flex-wrap items-start gap-3 rounded-md border border-destructive/25 bg-destructive/5 p-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
              {error}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 text-[11px]"
              disabled={tooShort}
              onClick={() => run()}
            >
              Try again
            </Button>
          </div>
        )}

        {isAnalysing && !analysis && (
          <div className="space-y-2 rounded-md border p-3" aria-busy="true">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
              Reading your caption…
            </p>
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        )}

        {!analysis && !isAnalysing && !error && (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            {tooShort
              ? "Write a line or two first — there's nothing to read yet."
              : "Not checked yet. Press “Check this post” for a read of what you have written."}
          </p>
        )}

        {analysis && (
            <Report
              analysis={analysis}
              caption={caption}
              analysedCaption={analysedCaption ?? ""}
              rechecking={isAnalysing}
              platforms={platforms}
              hasImage={hasImage}
              music={music}
              stale={stale}
              proposals={proposals}
              onRegenerate={regenerate}
              onDismissProposal={(dimension) =>
                setProposals((current) => ({ ...current, [dimension]: undefined }))
              }
              onApply={applyAndVerify}
              {...(suggestedTime && { suggestedTime })}
            />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The reading itself.
 *
 * Split out so everything below works from a non-null analysis rather than
 * threading `analysis?.` through thirty lines of derivation.
 */
function Report({
  analysis,
  caption,
  analysedCaption,
  rechecking,
  platforms,
  hasImage,
  music,
  stale,
  proposals,
  onRegenerate,
  onDismissProposal,
  onApply,
  suggestedTime,
}: {
  analysis: CaptionAnalysis;
  caption: string;
  /** The caption this analysis was run against — the "before" of any fix. */
  analysedCaption: string;
  /** True while a fresh reading is in flight, which is a state of its own. */
  rechecking: boolean;
  platforms: Platform[];
  hasImage: boolean;
  music?: string;
  stale: boolean;
  proposals: Partial<Record<ScoreDimension, Proposal>>;
  onRegenerate: (
    dimension: ScoreDimension,
    target: ImprovementTarget,
    issue?: string,
    recommendation?: string,
  ) => void;
  onDismissProposal: (dimension: ScoreDimension) => void;
  onApply: (fixes: ReachFix[]) => void;
  suggestedTime?: { name: string; time: string; label: string; use: () => void };
}) {
  /**
   * Whether this analysis describes the caption on screen.
   *
   * The gate on every tick below. While it is false the post has moved on from
   * the reading, so a passing verdict is unproven rather than green.
   */
  const verified = isVerified(caption, analysedCaption);

  /**
   * The recommendations still missing from the caption on screen.
   *
   * Derived from the caption every render rather than remembered: a fix that
   * has been applied is one whose apply would now be a no-op, and a fix that
   * has been applied and then deleted is outstanding again. See
   * `ai/reach-fixes.ts`.
   */
  const actionable = outstanding(analysis, caption, platforms);

  /** One row per part of the post, built from whatever the analysis covered. */
  const rows: Row[] = [];

  /**
   * @param target the part of the post AI can regenerate for this row, when
   *   there is one. `visual` has none on purpose: no sentence fixes a crop, and
   *   a Regenerate button there would be offering a fix that cannot exist.
   * @param unscored what to say when this dimension was not scored — a caption
   *   with no tags is not graded on tags, but it is still the case worth
   *   flagging, and the backend can still recommend some.
   */
  const scoreRow = (
    key: string,
    icon: string,
    label: string,
    dimension: ScoreDimension,
    target?: ImprovementTarget,
    unscored?: string,
  ) => {
    const score = analysis.scores[dimension];
    const verdict = statusFor(analysis, dimension, caption, platforms);
    const state = rowState(verdict, verified, rechecking);
    const proposal = proposals[dimension];

    /** The Regenerate affordance, identical wherever this row ends up. */
    const regenerate = target
      ? {
          label: TARGET_ACTION_LABEL[target],
          run: () =>
            onRegenerate(
              dimension,
              target,
              verdict.improvement?.issue ?? score?.reason,
              verdict.improvement?.suggestion,
            ),
        }
      : undefined;

    const proposalHandlers = proposal?.status === "ready"
      ? {
          onUseProposal: () =>
            onApply([fixFromProposal(proposal.improvement)]),
          onDismissProposal: () => onDismissProposal(dimension),
        }
      : {};

    if (!score && verdict.source === "unscored" && !verdict.improvement) {
      if (unscored) {
        rows.push({
          key,
          icon,
          label,
          state,
          detail: unscored,
          ...(regenerate && { regenerate }),
          ...(proposal && { proposal }),
          ...proposalHandlers,
        });
      }
      return;
    }

    // A verified tick says so in as many words. "Strong hook" is the model's
    // opinion; "found in your caption" is a fact about the text on screen, and
    // the difference is the whole point of the loop.
    const verifiedFix =
      verdict.ok && verdict.source === "verified"
        ? analysis.improvements.find((item) => item.dimension === dimension)
        : undefined;

    const suggestion = verdict.improvement;
    const tags = suggestion?.suggestedHashtags ?? [];
    const line = suggestion?.suggestedLine;

    // What is behind "Why?": the suggestion itself, spelled out, so nobody has
    // to press a button to find out what it would do to their caption.
    const why = verdict.ok
      ? undefined
      : [
          tags.length > 0 &&
            hashtagsIn(caption).length > 0 &&
            `Current: ${hashtagsIn(caption).map((tag) => `#${tag}`).join(" ")}`,
          tags.length > 0 &&
            `Suggested: ${tags.map((tag) => `#${tag}`).join(" ")}`,
          line &&
            `Suggested ${suggestion?.dimension === "hook" ? "opening line" : "line"}: “${line}”`,
          suggestion?.suggestion ?? score?.reason,
        ]
          .filter(Boolean)
          .join("\n");

    const suggestionFix = suggestion ? fixFor(suggestion) : null;

    rows.push({
      key,
      icon,
      label,
      state,
      detail: verifiedFix
        ? `Fixed — found in your caption now.`
        : ((verdict.ok ? score?.reason : suggestion?.issue || score?.reason) ??
          unscored ??
          ""),
      ...(why && { why }),
      ...(regenerate && { regenerate }),
      ...(proposal && { proposal }),
      ...proposalHandlers,
      // The analysis's own ready-made fix, kept beside Regenerate: it is
      // instant and free where a regeneration is a model call, so a member who
      // is happy with the suggested tags should not have to wait for new ones.
      ...(suggestion &&
        isActionable(suggestion) &&
        suggestionFix && {
          action: {
            label:
              tags.length > 0
                ? "Apply"
                : line && dimension === "hook"
                  ? "Add opening line"
                  : "Add to caption",
            run: () => onApply([suggestionFix]),
          },
        }),
    });
  };

  scoreRow("hook", "🪝", "Hook", "hook", "hook");
  scoreRow("caption", "📝", "Caption", "readability", "readability");
  scoreRow("engagement", "💬", "Engagement", "cta", "cta");
  scoreRow(
    "hashtags",
    "#️⃣",
    "Discoverability",
    "hashtags",
    "hashtags",
    "No hashtags yet — they are how people who don't already follow you find this.",
  );
  // No `target`: a visual problem is a media problem. The row reports what the
  // analysis saw and leaves the fix to the image tools above, rather than
  // pretending a sentence can re-crop a photograph.
  if (hasImage) scoreRow("visual", "🖼", "Visual", "visual");

  // Audio is the member's decision, full stop. A chosen song is reported, never
  // judged against an alternative and never swapped — the AI Assistant above
  // only offers songs when the field is empty.
  rows.push({
    key: "audio",
    icon: "🎵",
    label: "Audio",
    // Never a warning. A post without a song is not a worse post, and counting
    // it as something to fix would be pressure to use a feature nobody asked
    // for — the row is here to report the choice, not to grade it. Read
    // straight from the composer, so it needs no re-analysis to be true.
    state: "pass",
    detail: music?.trim()
      ? `Your song: ${music.trim()}`
      : "No song chosen — optional.",
    ...(music?.trim() &&
      platforms.includes("instagram") && {
        why: "Instagram's API cannot attach audio to a photo post, so this travels with the post inside FlowPost but will not play on Instagram.",
      }),
  });

  if (suggestedTime) {
    rows.push({
      key: "timing",
      icon: "🕐",
      label: "Timing",
      state: "pass",
      detail: `Suggested ${suggestedTime.label} for ${suggestedTime.name}.`,
      why: "A general posting-window convention for this network. It is not based on when your own audience is active — we do not have that data yet.",
      action: { label: `Schedule ${suggestedTime.label}`, run: suggestedTime.use },
    });
  }

  const warnings = rows.filter((row) => row.state === "warn").length;
  const checking = rows.some((row) => row.state === "checking");

  /** The deterministic checks that failed and are worth stopping for. */
  const blockers = analysis.checklist.items.filter(
    (item) => !item.passed && item.severity !== "polish",
  );

  /**
   * The fixes that are in the caption now and were not in the one analysed.
   *
   * A difference between two captions rather than a memory of a click: it is
   * still right if the member typed the line themselves, and it goes back to
   * empty the moment they delete it.
   */
  const fixedSince = analysis.improvements.filter(
    (item) =>
      isApplied(item, caption, platforms) &&
      !isApplied(item, analysedCaption, platforms),
  );

  /**
   * What the score would be if the fixes now in the caption were credited,
   * using the model's own per-improvement estimate. An estimate from *this*
   * analysis and labelled as one — the honest number arrives when the member
   * presses "Check again", which is why the panel keeps asking them to.
   */
  const projected = Math.min(
    100,
    analysis.reachScore +
      fixedSince.reduce((total, item) => total + item.estimatedGain, 0),
  );

  const headline = checking
    ? "Checking your updated post"
    : warnings === 0
      ? "This post looks ready"
      : fixedSince.length > 0
        ? "Post improved"
        : "Your post is almost ready";

  return (
    <>
      <div className="space-y-1 rounded-md border bg-muted/30 p-3">
        <p className="text-base font-semibold">{headline}</p>
        <p className="text-sm text-muted-foreground">
          {checking
            ? "Re-reading what is in your editor now — nothing turns green until it passes."
            : warnings === 0
              ? "Nothing here is holding it back."
              : `${warnings} thing${warnings === 1 ? "" : "s"} could improve its reach.`}
        </p>
        <p className="pt-1 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">
            {projected !== analysis.reachScore
              ? `${analysis.reachScore} → ~${projected}/100`
              : `${analysis.reachScore}/100`}
          </span>{" "}
          · Reach potential ({SCORE_LABEL[scoreBand(analysis.reachScore)]}) ·{" "}
          {BASIS}
        </p>
      </div>

      {fixedSince.length > 0 ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
          {fixedSince.length} fix{fixedSince.length === 1 ? "" : "es"} found in
          your caption. The arrow above is this analysis's own estimate — check
          again to have your updated post read properly.
        </p>
      ) : (
        stale && (
          <p className="rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
            You have edited the caption since this ran — check again for a
            reading of what is on screen now.
          </p>
        )
      )}

      {actionable.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">
            {actionable.length} improvements can be applied for you, then
            re-checked. Your image, platforms, song and schedule are left as
            they are, and nothing you wrote is removed.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              onApply(
                actionable
                  .map(fixFor)
                  .filter((fix): fix is ReachFix => fix !== null),
              )
            }
          >
            <Sparkles />
            Apply all improvements
          </Button>
        </div>
      )}

      <div>
        <p className="pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          ✨ Before you publish
        </p>
        <div className="rounded-md border px-3">
          {rows.map((row) => (
            <ChecklistRow key={row.key} row={row} />
          ))}
        </div>
      </div>

      {/* The counted checks, straight from the backend's deterministic pass.
          Nothing here is a model's opinion — it is character limits, hashtag
          bands and whether there is an image — and every one of them is
          recomputed against the current caption on each run, which is what
          makes "check again" mean something. Only failures are listed: a wall
          of ticks is noise at the moment somebody is about to publish. */}
      {blockers.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Fix before publishing
          </p>
          <ul className="space-y-1 rounded-md border border-destructive/25 bg-destructive/5 p-3">
            {blockers.map((item) => (
              <li key={item.id} className="text-[11px] leading-relaxed">
                {item.severity === "blocker" ? "⛔" : "⚠"} {item.label}
                {item.fix && (
                  <span className="text-muted-foreground"> — {item.fix}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-network advice, which is the point of choosing platforms before
          running this — the same caption is judged against each network's own
          rules rather than against one generic standard. */}
      {analysis.platforms.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Platform fit
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {analysis.platforms.map((fit) => {
              const [first, ...rest] = fit.recommendations;
              return (
                <div key={fit.platform} className="rounded-md border p-3">
                  <p className="flex items-center gap-2 text-xs font-semibold">
                    <PlatformIcon
                      platform={fit.platform as Platform}
                      className="h-3.5 w-3.5"
                    />
                    {PLATFORM_MAP[fit.platform as Platform]?.name ?? fit.platform}
                    <span className="font-normal text-muted-foreground">
                      {fit.score}/10
                    </span>
                  </p>
                  <p
                    className={cn(
                      "mt-1.5 text-[11px] leading-relaxed",
                      first ? "text-amber-500" : "text-emerald-500",
                    )}
                  >
                    {first ? `⚠ ${first}` : "✓ Reads well for this network."}
                  </p>
                  {rest.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer list-none text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                        Why? ▾
                      </summary>
                      <ul className="space-y-1 pt-1">
                        {rest.slice(0, 2).map((line) => (
                          <li
                            key={line}
                            className="text-[11px] leading-relaxed text-muted-foreground"
                          >
                            · {line}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Guidance only — these are things that may help visibility, not a
          prediction of how the post will perform.
        </p>
        <Badge variant="outline" className="text-[10px]">
          {analysis.checklist.readiness}% ready
        </Badge>
      </div>
    </>
  );
}
