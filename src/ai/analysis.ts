/**
 * The analysis API's contract — Marketing Intelligence, from the browser side.
 *
 * Mirrors `server/src/ai/types.ts` across the HTTP boundary the same way
 * `ai/caption.ts` does for generation: the two files are one contract written
 * from each end, and changing either means changing both.
 *
 * ─── Why analysis is a separate call ─────────────────────────────────────────
 * The caption worth scoring is rarely the one the model wrote. It is the one in
 * the editor after someone rewrote the opening line, cut a sentence and added a
 * link. An analyser bolted onto generation could only ever see the first
 * version — the one nobody publishes.
 *
 * So the flow is: generate → edit → analyse → fix → publish, and analysis can
 * run as many times as the user wants without paying for a regeneration.
 */

import {
  STUDIO_SCHEMA_VERSION,
  type AiStudioOutput,
  type BrandVoice,
  type FunnelStage,
  type ImageAnalysis,
  type MarketingGoal,
} from "@/ai/types";
import type { AudienceRegister } from "@/ai/caption";

// ─── Request ─────────────────────────────────────────────────────────────────

export interface AnalysisBrief {
  /** The caption as it stands right now, edits included. */
  caption: string;
  /** Hashtags as they will be published, with or without the leading `#`. */
  hashtags?: string[];
  platforms?: string[];
  goal?: MarketingGoal;
  funnelStage?: FunnelStage;
  audience?: AudienceRegister;
  language?: string;
  brand?: Partial<BrandVoice>;
  /**
   * Vision's read, when generation produced one and it is still on screen.
   *
   * Worth passing whenever it exists: without it the analyser knows only that
   * an image is attached, so it can tell you the copy leaves room for a visual
   * but not whether it actually uses the one you chose.
   */
  imageAnalysis?: ImageAnalysis;
  /**
   * Sent explicitly rather than inferred from `imageAnalysis`, because a post
   * can have an image whose analysis was never run. Treating that as "no
   * image" would drop the visual dimension the post should be judged on.
   */
  hasImage?: boolean;
}

// ─── Response ────────────────────────────────────────────────────────────────

export type Confidence = "High" | "Medium" | "Low";
export type Likelihood = "Low" | "Medium" | "High";

export type ScoreDimension =
  | "hook"
  | "visual"
  | "platformFit"
  | "audienceFit"
  | "cta"
  | "readability"
  | "hashtags";

/** Human labels, kept here so panels never build their own and drift apart. */
export const DIMENSION_LABELS: Record<ScoreDimension, string> = {
  hook: "Opening hook",
  visual: "Use of the image",
  platformFit: "Platform fit",
  audienceFit: "Audience fit",
  cta: "Call to action",
  readability: "Readability",
  hashtags: "Hashtags",
};

export interface DimensionScore {
  /** 0–10. */
  score: number;
  /**
   * How certain the judgement is. Rendered, not hidden: an 8 the model is
   * unsure about should not look identical to an 8 it is sure of.
   */
  confidence: Confidence;
  reason: string;
}

/** Counted on the server, never estimated by a model. */
export interface CaptionMetrics {
  characterCount: number;
  wordCount: number;
  sentenceCount: number;
  paragraphCount: number;
  lineCount: number;
  emojiCount: number;
  hashtagCount: number;
  mentionCount: number;
  linkCount: number;
  readingTimeSeconds: number;
  averageWordsPerSentence: number;
  longestParagraphWords: number;
  /** Flesch Reading Ease, 0–100. Higher is easier. English-calibrated. */
  readingEase: number;
  hookCharacterCount: number;
  endsWithQuestion: boolean;
}

export interface PlatformCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface PlatformFit {
  platform: string;
  /** 0–10, derived from the checks. */
  score: number;
  checks: PlatformCheck[];
  recommendations: string[];
}

/**
 * Bands rather than percentages, deliberately. Nothing here is calibrated
 * against this account's real engagement, so a decimal would be invented
 * precision — and "high saves, low comments" is what a marketer acts on anyway.
 */
export interface EngagementForecast {
  saves: Likelihood;
  shares: Likelihood;
  comments: Likelihood;
  clicks: Likelihood;
  rationale: string;
}

export interface ScoreExplanation {
  strengths: string[];
  weaknesses: string[];
}

export interface Improvement {
  dimension: ScoreDimension;
  issue: string;
  suggestion: string;
  /** Rough points on the 0–100 reach score if it were fixed. */
  estimatedGain: number;
  /**
   * The change itself, when the backend had a concrete one to offer. Both are
   * additions — tags to add, a sentence to append — never a rewrite, which is
   * what makes an Apply button safe to put next to them. Absent on most
   * improvements; the Brand panel ignores them entirely.
   */
  suggestedHashtags?: string[];
  suggestedLine?: string;
}

export type ChecklistSeverity = "blocker" | "important" | "polish";

export interface ChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  severity: ChecklistSeverity;
  /** Present only when the item did not pass. */
  fix?: string;
}

export interface PrePublishChecklist {
  items: ChecklistItem[];
  /** 0–100, weighted by severity rather than a raw pass count. */
  readiness: number;
}

/** What Brand Intelligence resolved, inferred fields included. */
export interface ResolvedBrand {
  name: string;
  description: string;
  mission: string;
  industry: string;
  audience: string;
  tone: string;
  writingStyle: string;
  personality: string;
  products: string[];
  usp: string;
  competitors: string[];
  ctaStyle: string;
  emojiStyle: string;
  wordsToUse: string[];
  wordsToAvoid: string[];
  brandColors: string[];
  /** 0–100: how much of the profile is filled in. */
  completeness: number;
  /** `image` marks a field the picture supplied rather than the user. */
  provenance: Record<string, "brand" | "image">;
}

/**
 * Three versions rather than one, because they move independently: re-tuning
 * the weights changes every score without a word of the prompt changing.
 */
export interface AnalysisMeta {
  analysisVersion: string;
  weightsVersion: string;
  promptVersion: number;
  provider: string;
  model: string;
  durationMs: number;
  analysedAt: string;
}

export interface CaptionAnalysis {
  /** 0–100. */
  reachScore: number;
  /** Only the dimensions that applied — a text-only post has no `visual`. */
  scores: Partial<Record<ScoreDimension, DimensionScore>>;
  /** The weights actually used after renormalisation. Sums to 1. */
  weights: Partial<Record<ScoreDimension, number>>;
  explanation: ScoreExplanation;
  metrics: CaptionMetrics;
  platforms: PlatformFit[];
  engagement: EngagementForecast;
  checklist: PrePublishChecklist;
  /** Highest estimated gain first. */
  improvements: Improvement[];
  brand?: ResolvedBrand;
  meta: AnalysisMeta;
}

// ─── Presentation helpers ────────────────────────────────────────────────────

/**
 * The band a reach score falls in.
 *
 * Thresholds live here rather than in a component so the score chip, the
 * progress ring and any future summary all agree about what "good" means. A
 * user who sees 68 called "Strong" in one place and "Fair" in another stops
 * believing either.
 */
export type ScoreBand = "excellent" | "strong" | "fair" | "weak";

export function scoreBand(score: number): ScoreBand {
  if (score >= 85) return "excellent";
  if (score >= 70) return "strong";
  if (score >= 50) return "fair";
  return "weak";
}

export const SCORE_BAND_LABEL: Record<ScoreBand, string> = {
  excellent: "Excellent",
  strong: "Strong",
  fair: "Needs work",
  weak: "Weak",
};

/** True when something in the checklist should stop a publish. */
export function hasBlockers(checklist: PrePublishChecklist): boolean {
  return checklist.items.some((item) => !item.passed && item.severity === "blocker");
}

// ─── Envelope mapping ────────────────────────────────────────────────────────

/**
 * Folds an analysis into the studio envelope stored on the post.
 *
 * Spreads `previous` first, exactly as `toStudioOutput` does: analysing a post
 * must never cost it the captions, hashtags or image analysis already there.
 * `meta.produced` gains `"analysis"` so `producedKeys` reports it like any
 * other section.
 */
export function withAnalysis(
  analysis: CaptionAnalysis,
  previous?: AiStudioOutput | null,
): AiStudioOutput {
  const produced = new Set([...(previous?.meta?.produced ?? []), "analysis"]);

  return {
    ...previous,
    schemaVersion: STUDIO_SCHEMA_VERSION,
    meta: {
      status: previous?.meta?.status ?? "complete",
      // Generation timestamps stay put. This did not generate anything, and
      // overwriting them would make a re-analysed post look freshly written.
      generatedAt: previous?.meta?.generatedAt ?? null,
      model: previous?.meta?.model ?? analysis.meta.model,
      durationMs: previous?.meta?.durationMs ?? null,
      error: previous?.meta?.error ?? null,
      produced: [...produced],
    },
    analysis,
  };
}
