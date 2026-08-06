import { motion } from "framer-motion";
import { Search, Tag, FileText, Link2, Image as ImageIcon, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SeoAnalysis, SeoKeyword } from "@/ai/types";

const INTENT_META: Record<SeoKeyword["intent"], { label: string; className: string }> = {
  informational: { label: "Info",     className: "bg-sky-500/10 text-sky-600 border-sky-500/25" },
  commercial:    { label: "Comm",     className: "bg-violet-500/10 text-violet-600 border-violet-500/25" },
  transactional: { label: "Trans",    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25" },
  navigational:  { label: "Nav",      className: "bg-amber-500/10 text-amber-600 border-amber-500/25" },
};

/** The model sometimes returns an intent outside the union — don't throw on it. */
function intentMeta(keyword: SeoKeyword) {
  return (
    INTENT_META[keyword.intent] ?? {
      label: keyword.intent || "—",
      className: "bg-muted text-muted-foreground border-border",
    }
  );
}

/** Difficulty reads inverted: low is good, so the colours flip vs. readability. */
function difficultyColor(score: number) {
  return score >= 70 ? "bg-rose-500" : score >= 40 ? "bg-amber-500" : "bg-emerald-500";
}

function formatVolume(volume: number | null) {
  if (volume === null) return "—";
  if (volume >= 1000) return `${(volume / 1000).toFixed(volume >= 10000 ? 0 : 1)}k`;
  return String(volume);
}

function CopyableField({
  icon: Icon,
  label,
  value,
  mono,
  limit,
}: {
  icon: typeof Tag;
  label: string;
  value: string;
  mono?: boolean;
  /** Recommended max length — over it, the counter turns amber. */
  limit?: number;
}) {
  const over = limit !== undefined && value.length > limit;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
        </div>
        {limit !== undefined && (
          <span
            className={cn(
              "text-[10px] font-mono",
              over ? "text-amber-600" : "text-muted-foreground",
            )}
          >
            {value.length}/{limit}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(value)}
        title="Copy"
        className="group flex w-full items-start gap-2 rounded-lg border bg-accent/30 p-3 text-left transition-colors hover:bg-accent/60"
      >
        <span className={cn("flex-1 text-sm leading-relaxed", mono && "font-mono text-xs")}>
          {value}
        </span>
        <Copy className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    </div>
  );
}

interface SeoPanelProps {
  seo: SeoAnalysis;
}

export function SeoPanel({ seo }: SeoPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">SEO</p>
          <p className="text-xs text-muted-foreground">
            Keywords, metadata and readability for this post.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Readability
          </p>
          <p className="text-lg font-bold leading-none">{seo.readabilityScore}</p>
        </div>
      </div>

      {/* Primary keyword */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Primary
        </span>
        <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
          {seo.primaryKeyword}
        </Badge>
      </div>

      {/* Keyword table */}
      {seo.keywords.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Keywords
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border">
            {seo.keywords.map((kw, index) => (
              <div
                key={kw.keyword}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5",
                  index > 0 && "border-t",
                )}
              >
                <span className="flex-1 truncate text-sm font-medium">{kw.keyword}</span>

                <Badge
                  variant="outline"
                  className={cn("shrink-0 border text-[10px]", intentMeta(kw).className)}
                >
                  {intentMeta(kw).label}
                </Badge>

                <span className="w-12 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                  {formatVolume(kw.searchVolume)}
                </span>

                <div className="flex w-20 shrink-0 items-center gap-1.5" title="Keyword difficulty">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className={cn("h-full rounded-full", difficultyColor(kw.difficultyScore))}
                      initial={{ width: 0 }}
                      animate={{ width: `${kw.difficultyScore}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                  <span className="w-5 text-right font-mono text-[9px] text-muted-foreground">
                    {kw.difficultyScore}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata — the limits are Google's display cutoffs */}
      <div className="space-y-4">
        <CopyableField icon={Tag} label="Meta Title" value={seo.metaTitle} limit={60} />
        <CopyableField
          icon={FileText}
          label="Meta Description"
          value={seo.metaDescription}
          limit={160}
        />
        <CopyableField icon={ImageIcon} label="Image Alt Text" value={seo.altText} limit={125} />
        <CopyableField icon={Link2} label="Slug" value={seo.slug} mono />
      </div>
    </motion.div>
  );
}
