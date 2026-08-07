import { AlertTriangle, ArrowUpRight, Check, Info, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DIMENSION_LABELS,
  SCORE_BAND_LABEL,
  scoreBand,
  type CaptionAnalysis,
  type Confidence,
  type Likelihood,
  type ScoreBand,
  type ScoreDimension,
} from "@/ai/analysis";

/**
 * The reach score, and the answer to "why is it 74?".
 *
 * ─── What this panel refuses to do ───────────────────────────────────────────
 * Show a number on its own. Every score here is rendered next to the reason it
 * is that score, the weight it carried, and how sure the model was — because a
 * bare 74 is not actionable and, within about a week, is not trusted either.
 *
 * The bars are widened by *weight*, not by score, so the panel reads as a
 * budget: the hook is the widest row because it is 22% of the total, and its
 * fill shows how much of that 22% the caption actually earned. A user can see
 * at a glance where the missing points live rather than working it out from
 * seven unrelated /10s.
 */

const BAND_STYLES: Record<ScoreBand, { text: string; bg: string; ring: string }> = {
  excellent: {
    text: "text-emerald-600",
    bg: "bg-emerald-500",
    ring: "border-emerald-500/30 bg-emerald-500/10",
  },
  strong: {
    text: "text-sky-600",
    bg: "bg-sky-500",
    ring: "border-sky-500/30 bg-sky-500/10",
  },
  fair: {
    text: "text-amber-600",
    bg: "bg-amber-500",
    ring: "border-amber-500/30 bg-amber-500/10",
  },
  weak: {
    text: "text-red-600",
    bg: "bg-red-500",
    ring: "border-red-500/30 bg-red-500/10",
  },
};

/**
 * Confidence is shown as a muted label rather than a colour.
 *
 * It qualifies the score next to it; giving it its own colour would make it
 * compete with the score for attention, and a "Low" that shouts is worse than
 * a score with no caveat at all.
 */
const CONFIDENCE_LABEL: Record<Confidence, string> = {
  High: "confident",
  Medium: "fairly sure",
  Low: "uncertain",
};

const LIKELIHOOD_STYLES: Record<Likelihood, string> = {
  High: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25",
  Medium: "bg-amber-500/10 text-amber-600 border-amber-500/25",
  Low: "bg-muted text-muted-foreground border-border",
};

interface ReachScorePanelProps {
  analysis: CaptionAnalysis;
  /**
   * True when the caption has been edited since this ran. The panel dims
   * itself and says so rather than presenting a stale score as current.
   */
  stale?: boolean;
  onReanalyse?: () => void;
}

export function ReachScorePanel({ analysis, stale, onReanalyse }: ReachScorePanelProps) {
  const band = scoreBand(analysis.reachScore);
  const styles = BAND_STYLES[band];

  // Widest weight first, so the rows that matter most are read first.
  const dimensions = (Object.keys(analysis.scores) as ScoreDimension[]).sort(
    (a, b) => (analysis.weights[b] ?? 0) - (analysis.weights[a] ?? 0),
  );

  return (
    <div className={cn("space-y-6", stale && "opacity-60")}>
      {stale && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p className="text-xs text-muted-foreground">
            The caption changed since this ran, so the score below describes an
            older version.{" "}
            {onReanalyse && (
              <button
                type="button"
                onClick={onReanalyse}
                className="font-medium text-primary underline underline-offset-2"
              >
                Analyse again
              </button>
            )}
          </p>
        </div>
      )}

      {/* ── The headline number ───────────────────────────────────────────── */}
      <div className="flex items-center gap-5">
        <div
          className={cn(
            "flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl border",
            styles.ring,
          )}
        >
          <span className={cn("text-2xl font-bold leading-none", styles.text)}>
            {analysis.reachScore}
          </span>
          <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            / 100
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <TrendingUp className={cn("h-4 w-4", styles.text)} />
            <p className="text-sm font-semibold">
              {SCORE_BAND_LABEL[band]} reach potential
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {analysis.explanation.strengths[0] ??
              analysis.explanation.weaknesses[0] ??
              "Scored across " + dimensions.length + " dimensions."}
          </p>
          {/* Provenance, small and out of the way. It only matters when someone
              is comparing two scores — and then it matters completely. */}
          <p className="mt-1.5 text-[10px] text-muted-foreground/70">
            Analyser v{analysis.meta.analysisVersion} · weights v
            {analysis.meta.weightsVersion} · {analysis.meta.model}
          </p>
        </div>
      </div>

      {/* ── Why it is that number ─────────────────────────────────────────── */}
      <div className="space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Why this score
        </p>

        {dimensions.map((dimension) => {
          const entry = analysis.scores[dimension];
          if (!entry) return null;

          const weight = analysis.weights[dimension] ?? 0;
          const dimensionBand = scoreBand(entry.score * 10);

          return (
            <div key={dimension} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-medium">
                  {DIMENSION_LABELS[dimension]}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {entry.score}/10
                  <span className="ml-1.5 opacity-70">
                    · {Math.round(weight * 100)}% of score ·{" "}
                    {CONFIDENCE_LABEL[entry.confidence]}
                  </span>
                </span>
              </div>

              {/* Track width ∝ weight; fill ∝ how much of that weight was earned. */}
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                style={{ width: `${Math.max(18, weight * 100 * 3)}%` }}
              >
                <div
                  className={cn("h-full rounded-full", BAND_STYLES[dimensionBand].bg)}
                  style={{ width: `${entry.score * 10}%` }}
                />
              </div>

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {entry.reason}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Strengths and weaknesses ──────────────────────────────────────── */}
      {(analysis.explanation.strengths.length > 0 ||
        analysis.explanation.weaknesses.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ExplanationList
            title="Working"
            tone="good"
            items={analysis.explanation.strengths}
          />
          <ExplanationList
            title="Costing reach"
            tone="bad"
            items={analysis.explanation.weaknesses}
          />
        </div>
      )}

      {/* ── Predicted engagement ──────────────────────────────────────────── */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Likely outcome
          </p>
          {/* Bands, not percentages — nothing here is calibrated against this
              account's real engagement, and a decimal would imply it was. */}
          <Info className="h-3 w-3 text-muted-foreground/60" />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["Saves", analysis.engagement.saves],
              ["Shares", analysis.engagement.shares],
              ["Comments", analysis.engagement.comments],
              ["Clicks", analysis.engagement.clicks],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-accent/30 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <Badge
                className={cn("mt-1 border text-[10px]", LIKELIHOOD_STYLES[value])}
              >
                {value}
              </Badge>
            </div>
          ))}
        </div>

        {analysis.engagement.rationale && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {analysis.engagement.rationale}
          </p>
        )}
      </div>

      {/* ── What to change ────────────────────────────────────────────────── */}
      {analysis.improvements.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Biggest wins
          </p>
          {analysis.improvements.map((improvement, index) => (
            <div
              key={`${improvement.dimension}-${index}`}
              className="flex gap-2.5 rounded-lg border bg-card p-3"
            >
              <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-medium">
                    {DIMENSION_LABELS[improvement.dimension]}
                  </p>
                  {improvement.estimatedGain > 0 && (
                    <span className="shrink-0 text-[10px] font-medium tabular-nums text-emerald-600">
                      +{improvement.estimatedGain} pts
                    </span>
                  )}
                </div>
                {improvement.issue && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {improvement.issue}
                  </p>
                )}
                <p className="mt-1 text-xs leading-relaxed">{improvement.suggestion}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Per-platform ──────────────────────────────────────────────────── */}
      {analysis.platforms.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Platform checks
          </p>
          {analysis.platforms.map((fit) => (
            <div key={fit.platform} className="rounded-lg border bg-card p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold capitalize">{fit.platform}</p>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {fit.score}/10
                </span>
              </div>

              <ul className="mt-2 space-y-1.5">
                {fit.checks.map((check) => (
                  <li key={check.id} className="flex gap-2 text-[11px]">
                    <span
                      className={cn(
                        "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                        check.status === "pass" && "bg-emerald-500",
                        check.status === "warn" && "bg-amber-500",
                        check.status === "fail" && "bg-red-500",
                      )}
                    />
                    <span
                      className={cn(
                        "leading-relaxed",
                        check.status === "pass"
                          ? "text-muted-foreground"
                          : "text-foreground",
                      )}
                    >
                      {check.detail}
                    </span>
                  </li>
                ))}
              </ul>

              {fit.recommendations.length > 0 && (
                <ul className="mt-2 space-y-1 border-t pt-2">
                  {fit.recommendations.map((advice) => (
                    <li
                      key={advice}
                      className="text-[11px] leading-relaxed text-muted-foreground"
                    >
                      → {advice}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── The counted facts ─────────────────────────────────────────────── */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Measured
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Characters", analysis.metrics.characterCount],
            ["Words", analysis.metrics.wordCount],
            ["Hashtags", analysis.metrics.hashtagCount],
            ["Emoji", analysis.metrics.emojiCount],
            ["Paragraphs", analysis.metrics.paragraphCount],
            ["Read time", `${analysis.metrics.readingTimeSeconds}s`],
            ["Words/sentence", analysis.metrics.averageWordsPerSentence],
            ["Reading ease", analysis.metrics.readingEase],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg bg-accent/50 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className="mt-0.5 text-sm font-medium tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExplanationList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "good" | "bad";
  items: string[];
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[11px] leading-relaxed">
            {tone === "good" ? (
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
            )}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
