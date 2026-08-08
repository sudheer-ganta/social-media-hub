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
import { PlatformIcon } from "@/components/shared/PlatformIcon";
import { useCaptionAnalysis } from "@/hooks/useCaptionAnalysis";
// Read from the caption text, never from the last generation: the tags that
// matter are the ones that will be published, and those are whatever survived
// the member's editing.
import { hashtagsIn } from "@/utils/hashtags";
import { PLATFORM_MAP } from "@/constants";
import { scoreBand } from "@/ai/analysis";
// Deterministic verification against the caption on screen. The panel holds no
// memory of what was applied — see `ai/reach-fixes.ts`.
import {
  applyAll,
  isActionable,
  isApplied,
  outstanding,
  statusFor,
} from "@/ai/reach-fixes";
import { cn } from "@/lib/utils";
import type { CaptionAnalysis, Improvement, ScoreDimension } from "@/ai/analysis";
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

/** A row of the pre-publish checklist. */
interface Row {
  key: string;
  icon: string;
  label: string;
  ok: boolean;
  /** One short line. Never a paragraph. */
  detail: string;
  /** Behind "Why?", when there is more worth reading. */
  why?: string;
  action?: { label: string; run: () => void };
}

function ChecklistRow({ row }: { row: Row }) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 border-b py-2.5 last:border-b-0">
      <span aria-hidden className="w-5 text-center text-sm leading-6">
        {row.icon}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{row.label}</p>
        <p
          className={cn(
            "text-[11px] leading-relaxed",
            row.ok ? "text-emerald-500" : "text-amber-500",
          )}
        >
          {row.ok ? "✓" : "⚠"} {row.detail}
        </p>
        {row.why && (
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
      {row.action && (
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
}: ReachPanelProps) {
  const { analysis, isAnalysing, error, analysedCaption, analyse } =
    useCaptionAnalysis();

  const trimmed = caption.trim();
  const tooShort = trimmed.length < 12;

  // A score run against copy that has since been rewritten still describes the
  // old copy. Saying so is better than quietly showing a number that no longer
  // matches what is on screen.
  const stale = Boolean(analysedCaption && analysedCaption !== trimmed);

  const run = () => {
    void analyse({
      caption: trimmed,
      hashtags: hashtagsIn(trimmed),
      platforms,
      hasImage,
      ...(imageAnalysis && { imageAnalysis }),
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Reach &amp; Visibility
          </CardTitle>
          <CardDescription>
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
          onClick={run}
        >
          {analysis ? <RefreshCw /> : <TrendingUp />}
          {analysis ? "Check again" : "Check this post"}
        </Button>
      </CardHeader>

      {(error || analysis) && (
        <CardContent className="space-y-4">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-md border border-destructive/25 bg-destructive/5 px-4 py-3"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {error}
              </p>
            </div>
          )}

          {analysis && (
            <Report
              analysis={analysis}
              caption={caption}
              analysedCaption={analysedCaption ?? ""}
              platforms={platforms}
              hasImage={hasImage}
              music={music}
              stale={stale}
              onApplyCaption={onApplyCaption}
              {...(suggestedTime && { suggestedTime })}
            />
          )}
        </CardContent>
      )}
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
  platforms,
  hasImage,
  music,
  stale,
  onApplyCaption,
  suggestedTime,
}: {
  analysis: CaptionAnalysis;
  caption: string;
  /** The caption this analysis was run against — the "before" of any fix. */
  analysedCaption: string;
  platforms: Platform[];
  hasImage: boolean;
  music?: string;
  stale: boolean;
  onApplyCaption: (caption: string) => void;
  suggestedTime?: { name: string; time: string; label: string; use: () => void };
}) {
  /**
   * The recommendations still missing from the caption on screen.
   *
   * Derived from the caption every render rather than remembered: a fix that
   * has been applied is one whose apply would now be a no-op, and a fix that
   * has been applied and then deleted is outstanding again. See
   * `ai/reach-fixes.ts`.
   */
  const actionable = outstanding(analysis, caption, platforms);

  const apply = (items: Improvement[]) =>
    onApplyCaption(applyAll(items, caption, platforms));

  /** One row per part of the post, built from whatever the analysis covered. */
  const rows: Row[] = [];

  /**
   * @param unscored what to say when this dimension was not scored — a caption
   *   with no tags is not graded on tags, but it is still the case worth
   *   flagging, and the backend can still recommend some.
   */
  const scoreRow = (
    key: string,
    icon: string,
    label: string,
    dimension: ScoreDimension,
    unscored?: string,
  ) => {
    const score = analysis.scores[dimension];
    const verdict = statusFor(analysis, dimension, caption, platforms);

    if (!score && verdict.source === "unscored" && !verdict.improvement) {
      if (unscored) {
        rows.push({ key, icon, label, ok: verdict.ok, detail: unscored });
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

    rows.push({
      key,
      icon,
      label,
      ok: verdict.ok,
      detail: verifiedFix
        ? `Fixed — found in your caption now.`
        : ((verdict.ok ? score?.reason : suggestion?.issue || score?.reason) ??
          unscored ??
          ""),
      ...(why && { why }),
      ...(suggestion &&
        isActionable(suggestion) && {
          action: {
            label: tags.length > 0 ? "Apply" : line && dimension === "hook" ? "Add opening line" : "Add to caption",
            run: () => apply([suggestion]),
          },
        }),
    });
  };

  scoreRow("hook", "🪝", "Hook", "hook");
  scoreRow("caption", "📝", "Caption", "readability");
  scoreRow("engagement", "💬", "Engagement", "cta");
  scoreRow(
    "hashtags",
    "#️⃣",
    "Discoverability",
    "hashtags",
    "No hashtags yet — they are how people who don't already follow you find this.",
  );
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
    // for — the row is here to report the choice, not to grade it.
    ok: true,
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
      ok: true,
      detail: `Suggested ${suggestedTime.label} for ${suggestedTime.name}.`,
      why: "A general posting-window convention for this network. It is not based on when your own audience is active — we do not have that data yet.",
      action: { label: `Schedule ${suggestedTime.label}`, run: suggestedTime.use },
    });
  }

  const warnings = rows.filter((row) => !row.ok).length;

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

  const headline =
    warnings === 0
      ? "This post looks ready"
      : fixedSince.length > 0
        ? "Post improved"
        : "Your post is almost ready";

  return (
    <>
      <div className="space-y-1 rounded-md border bg-muted/30 p-4">
        <p className="text-base font-semibold">{headline}</p>
        <p className="text-sm text-muted-foreground">
          {warnings === 0
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
        <p className="rounded-md border border-dashed px-4 py-2 text-[11px] text-muted-foreground">
          {fixedSince.length} fix{fixedSince.length === 1 ? "" : "es"} found in
          your caption. The arrow above is this analysis's own estimate — check
          again to have your updated post read properly.
        </p>
      ) : (
        stale && (
          <p className="rounded-md border border-dashed px-4 py-2 text-[11px] text-muted-foreground">
            You have edited the caption since this ran — check again for a
            reading of what is on screen now.
          </p>
        )
      )}

      {actionable.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">
            {actionable.length} improvements can be applied for you. Your
            caption, image, platforms, song and schedule are left as they are.
          </p>
          <Button type="button" size="sm" onClick={() => apply(actionable)}>
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
