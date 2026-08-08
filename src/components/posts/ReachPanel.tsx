import {
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
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
import { PLATFORM_MAP } from "@/constants";
import { SCORE_BAND_LABEL, scoreBand } from "@/ai/analysis";
import { cn } from "@/lib/utils";
import type { ImageAnalysis } from "@/ai/types";
import type { Platform } from "@/types";

/**
 * Reach & Visibility — the optional second half of the Personal assistant.
 *
 * Runs the existing `/api/ai/analyse` endpoint over whatever is in the editor
 * *now*, edits included, which is the whole reason analysis is a separate call
 * from generation (see `ai/analysis.ts`). Nothing here writes to the post: it
 * reads the composer's current values and reports back.
 *
 * ─── Why its own component ───────────────────────────────────────────────────
 * Brand reads the same analysis through `marketing/ReachScorePanel`, which
 * renders it off the saved post envelope and sits inside the Marketing Studio.
 * This one has no post to read from — a Personal creator should be able to ask
 * "will this land?" before anything is saved — so it holds its own hook state
 * and takes the caption as a prop.
 *
 * ─── What it will not say ────────────────────────────────────────────────────
 * No promises. The backend returns a score, banded likelihoods and concrete
 * fixes, and every label here stays in that register: "potential strength",
 * "could improve", "may help visibility". Nothing in this app can know whether
 * a post will go viral, so nothing in this app says so.
 */

/**
 * The hashtags actually in the caption, without their `#`.
 *
 * Read from the text rather than taken from the last generation: the tags that
 * matter are the ones that will be published, and those are whatever survived
 * the user's editing. Handing the analyser a generated list the user never
 * applied — or deleted — scores a post nobody is going to post.
 */
function hashtagsIn(caption: string): string[] {
  return [...caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1]);
}

interface ReachPanelProps {
  caption: string;
  platforms: Platform[];
  hasImage: boolean;
  /** Vision's read from a generation this session, when there was one. */
  imageAnalysis?: ImageAnalysis;
}

/** Section heading with an icon, used three times below. */
function Heading({
  icon: Icon,
  children,
  tone,
}: {
  icon: typeof Lightbulb;
  children: string;
  tone?: string;
}) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className={cn("h-3.5 w-3.5", tone ?? "text-primary")} />
      {children}
    </p>
  );
}

export function ReachPanel({
  caption,
  platforms,
  hasImage,
  imageAnalysis,
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

  const blockers =
    analysis?.checklist.items.filter(
      (item) => !item.passed && item.severity !== "polish",
    ) ?? [];

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
            tooShort ? "Write a line or two first — there's nothing to read yet." : undefined
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
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-4">
                <div>
                  <p className="text-2xl font-semibold">
                    {analysis.reachScore}
                    <span className="text-sm font-normal text-muted-foreground">
                      /100
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {SCORE_BAND_LABEL[scoreBand(analysis.reachScore)]} · an
                    estimate from the copy itself, not from your account history.
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {analysis.checklist.readiness}% ready
                </Badge>
              </div>

              {stale && (
                <p className="rounded-md border border-dashed px-4 py-2 text-[11px] text-muted-foreground">
                  You have edited the caption since this ran — check again for a
                  reading of what is on screen now.
                </p>
              )}

              {analysis.explanation.strengths.length > 0 && (
                <div className="space-y-1.5">
                  <Heading icon={CheckCircle2} tone="text-emerald-500">
                    Potential strengths
                  </Heading>
                  <ul className="space-y-1">
                    {analysis.explanation.strengths.map((line) => (
                      <li
                        key={line}
                        className="text-sm leading-relaxed text-muted-foreground"
                      >
                        · {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.improvements.length > 0 && (
                <div className="space-y-1.5">
                  <Heading icon={Lightbulb}>Could improve</Heading>
                  <ul className="space-y-2">
                    {analysis.improvements.slice(0, 4).map((item) => (
                      <li key={`${item.dimension}-${item.issue}`}>
                        <p className="text-sm">{item.issue}</p>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          Recommended: {item.suggestion}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {blockers.length > 0 && (
                <div className="space-y-1.5">
                  <Heading icon={AlertTriangle} tone="text-destructive">
                    Fix before publishing
                  </Heading>
                  <ul className="space-y-1">
                    {blockers.map((item) => (
                      <li key={item.id} className="text-sm">
                        {item.label}
                        {item.fix && (
                          <span className="text-muted-foreground">
                            {" "}
                            — {item.fix}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Per-network advice, which is the point of choosing platforms
                  before running this — the same caption is judged against each
                  network's own rules rather than against one generic standard. */}
              {analysis.platforms.length > 0 && (
                <div className="grid gap-3 lg:grid-cols-2">
                  {analysis.platforms.map((fit) => (
                    <div key={fit.platform} className="rounded-md border p-3">
                      <p className="flex items-center gap-2 text-xs font-semibold">
                        <PlatformIcon
                          platform={fit.platform as Platform}
                          className="h-3.5 w-3.5"
                        />
                        {PLATFORM_MAP[fit.platform as Platform]?.name ??
                          fit.platform}
                        <span className="font-normal text-muted-foreground">
                          {fit.score}/10
                        </span>
                      </p>
                      {fit.recommendations.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {fit.recommendations.slice(0, 3).map((line) => (
                            <li
                              key={line}
                              className="text-[11px] leading-relaxed text-muted-foreground"
                            >
                              · {line}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                Guidance only — these are things that may help visibility, not a
                prediction of how the post will perform.
              </p>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
