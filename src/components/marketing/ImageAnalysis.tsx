import { motion } from "framer-motion";
import {
  Package,
  Building2,
  Users,
  Palette,
  Sparkles,
  Eye,
  Target,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ImageAnalysis } from "@/ai/types";

interface ImageAnalysisCardProps {
  analysis: ImageAnalysis;
}

function ConfidenceBar({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Confidence</span>
        <span className="text-xs font-semibold">{score}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", color)}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Package;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      </div>
      {children}
    </div>
  );
}

export function ImageAnalysisCard({ analysis }: ImageAnalysisCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Top row — category + mood */}
      <div className="flex flex-wrap gap-2">
        <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
          {analysis.productCategory}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {analysis.industry}
        </Badge>
        <Badge variant="secondary" className="text-xs italic">
          {analysis.mood}
        </Badge>
      </div>

      {/* Color palette */}
      {analysis.colorPalette.length > 0 && (
        <Section icon={Palette} label="Color Palette">
          <div className="flex items-center gap-2 flex-wrap">
            {analysis.colorPalette.map((hex) => (
              <div key={hex} className="flex items-center gap-1.5">
                <div
                  className="h-6 w-6 rounded-md border border-border/50 shadow-sm"
                  style={{ backgroundColor: hex }}
                  title={hex}
                />
                <span className="text-[10px] text-muted-foreground font-mono">{hex}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Two-column grid */}
      <div className="grid grid-cols-2 gap-4">
        <Section icon={Eye} label="Primary Subject">
          <p className="text-sm font-medium">{analysis.primarySubject}</p>
        </Section>

        <Section icon={Package} label="Brand Style">
          <p className="text-sm font-medium">{analysis.brandStyle}</p>
        </Section>

        <Section icon={Building2} label="Campaign Type">
          <p className="text-sm font-medium">{analysis.suggestedCampaignType}</p>
        </Section>

        <Section icon={Target} label="Marketing Objective">
          <p className="text-sm font-medium">{analysis.suggestedMarketingObjective}</p>
        </Section>
      </div>

      {/* Target audience */}
      <Section icon={Users} label="Target Audience">
        <p className="text-sm">{analysis.targetAudience}</p>
      </Section>

      {/* Buyer persona */}
      <Section icon={User} label="Suggested Buyer Persona">
        <div className="rounded-lg bg-accent/50 border border-accent p-3">
          <p className="text-sm leading-relaxed">{analysis.suggestedBuyerPersona}</p>
        </div>
      </Section>

      {/* Scene */}
      <Section icon={Sparkles} label="Scene">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {analysis.sceneDescription}
        </p>
      </Section>

      {/* Secondary subjects + objects */}
      {analysis.secondarySubjects.length > 0 && (
        <Section icon={Eye} label="Secondary Subjects">
          <div className="flex flex-wrap gap-1.5">
            {analysis.secondarySubjects.map((s) => (
              <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
            ))}
          </div>
        </Section>
      )}

      {analysis.objects.length > 0 && (
        <Section icon={Package} label="Detected Objects">
          <div className="flex flex-wrap gap-1.5">
            {analysis.objects.map((o) => (
              <Badge key={o} variant="outline" className="text-xs">{o}</Badge>
            ))}
          </div>
        </Section>
      )}

      {/* How it was shot. Optional: only the vision pipeline produces these,
          so an envelope written by the old Make scenario simply skips it. */}
      {(analysis.setting || analysis.lighting || analysis.composition) && (
        <div className="grid grid-cols-2 gap-4">
          {analysis.setting && (
            <Section icon={Building2} label="Setting">
              <p className="text-sm">{analysis.setting}</p>
            </Section>
          )}
          {analysis.lighting && (
            <Section icon={Sparkles} label="Light">
              <p className="text-sm">{analysis.lighting}</p>
            </Section>
          )}
          {analysis.composition && (
            <Section icon={Eye} label="Composition">
              <p className="text-sm">{analysis.composition}</p>
            </Section>
          )}
          {analysis.textInImage?.length ? (
            <Section icon={Package} label="Text In Image">
              <div className="flex flex-wrap gap-1.5">
                {analysis.textInImage.map((text) => (
                  <Badge key={text} variant="outline" className="text-xs">
                    {text}
                  </Badge>
                ))}
              </div>
            </Section>
          ) : null}
        </div>
      )}

      {/* What a marketer can do with it — the interpretation half of the
          analysis, and the material the captions are actually built from. */}
      {analysis.themes?.length ? (
        <Section icon={Target} label="Themes">
          <div className="flex flex-wrap gap-1.5">
            {analysis.themes.map((theme) => (
              <Badge key={theme} className="bg-primary/10 text-primary border-primary/20 text-xs">
                {theme}
              </Badge>
            ))}
          </div>
        </Section>
      ) : null}

      {analysis.emotions?.length ? (
        <Section icon={Users} label="Emotions It Triggers">
          <div className="flex flex-wrap gap-1.5">
            {analysis.emotions.map((emotion) => (
              <Badge key={emotion} variant="secondary" className="text-xs">
                {emotion}
              </Badge>
            ))}
          </div>
        </Section>
      ) : null}

      {analysis.symbolism?.length ? (
        <Section icon={Sparkles} label="Symbolism">
          <ul className="space-y-1">
            {analysis.symbolism.map((entry) => (
              <li key={entry} className="text-sm text-muted-foreground leading-relaxed">
                {entry}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {analysis.storyAngles?.length ? (
        <Section icon={Target} label="Storytelling Angles">
          <div className="space-y-2">
            {analysis.storyAngles.map((angle) => (
              <div
                key={angle}
                className="rounded-lg border border-accent bg-accent/50 p-3 text-sm leading-relaxed"
              >
                {angle}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Confidence score */}
      <ConfidenceBar score={analysis.confidenceScore} />
    </motion.div>
  );
}
