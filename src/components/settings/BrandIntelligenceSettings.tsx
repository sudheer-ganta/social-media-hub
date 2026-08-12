import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Brain, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { analyticsService } from "@/services/analytics.service";
import { useBrands } from "@/hooks/useBrands";
import { PERSONAL_CONTEXT, brandContext } from "@/constants/integrations";
import { cn } from "@/lib/utils";
import type { AccountContext } from "@/constants/integrations";
import type { BrandIntelligenceView } from "@/services/analytics.service";

/**
 * What FlowPost has worked out about how this context writes.
 *
 * ─── Informational, not a setup step ─────────────────────────────────────────
 * Nothing here is an input. The generator reads the same underlying profile
 * directly, so a member who never opens this screen gets exactly the same
 * captions — which is the point of the whole phase: the tool should not need
 * configuring before it works. This exists to answer "what do you think you know
 * about us", which is a fair question to be able to ask of something writing in
 * your voice, and to offer the one control that matters: forget it and start over.
 *
 * ─── Every number states its own basis ───────────────────────────────────────
 * "Playful 42%" on its own reads as a confidence score. It is not one — it is a
 * share of the weight of measured caption *shape*, so the panel says so, and every
 * performance finding carries the post count behind it. Where there is not enough
 * writing or not enough measured posts, the panel says that instead of rendering
 * zeroes.
 */

const REGISTER_LABEL: Record<string, string> = {
  professional: "Professional",
  playful: "Playful",
  gen_z: "Gen Z",
  educational: "Educational",
  premium: "Premium",
};

const STRENGTH_BADGE: Record<string, string> = {
  early: "bg-amber-500/10 text-amber-600 border-amber-500/25",
  emerging: "bg-sky-500/10 text-sky-600 border-sky-500/25",
  strong: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25",
};

const STRENGTH_LABEL: Record<string, string> = {
  early: "Early signal",
  emerging: "Emerging pattern",
  strong: "Strong signal",
};

/** The situations `ai/style/signals.ts` buckets posts into, in member's words. */
const THEME_LABEL: Record<string, string> = {
  gym: "Training",
  outfit: "Outfits",
  travel: "Travel",
  food: "Food & drink",
  work: "Work",
  night_out: "Nights out",
  pet: "Pets",
  selfie: "Portraits",
  art_media: "Film, games & art",
  other: "Everything else",
};

function ContextTabs({
  value,
  onChange,
  brands,
}: {
  value: AccountContext;
  onChange: (next: AccountContext) => void;
  brands: Array<{ id: string; name: string }>;
}) {
  const isPersonal = value.contextType === "personal";

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange(PERSONAL_CONTEXT)}
        className={cn(
          "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
          isPersonal
            ? "border-primary bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Personal
      </button>
      {brands.map((brand) => (
        <button
          key={brand.id}
          type="button"
          onClick={() => onChange(brandContext(brand.id))}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
            value.brandId === brand.id
              ? "border-primary bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {brand.name}
        </button>
      ))}
    </div>
  );
}

function VoiceMix({ view }: { view: BrandIntelligenceView }) {
  if (view.voice.entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Not enough writing yet. Publish a few more posts and FlowPost will start
        reading the voice from them.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {view.voice.entries.map((entry) => (
        <div key={entry.register} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              {REGISTER_LABEL[entry.register] ?? entry.register}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {entry.percent}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${entry.percent}%` }}
            />
          </div>
        </div>
      ))}

      {/*
        The basis line is not decoration. Without it these percentages read as
        "we are 42% sure", which is a different and unsupported claim.
      */}
      <p className="pt-1 text-[10px] text-muted-foreground">
        A reading of measured caption shape — length, casing, punctuation, emoji
        habit — across {view.voice.sampleCount}{" "}
        {view.voice.sampleCount === 1 ? "caption" : "captions"}. Not a confidence
        score.
      </p>
    </div>
  );
}

export function BrandIntelligenceSettings() {
  const { brands } = useBrands();
  const [context, setContext] = useState<AccountContext>(PERSONAL_CONTEXT);
  const queryClient = useQueryClient();

  const key = [
    "brand-intelligence",
    context.contextType,
    context.brandId ?? "personal",
  ];

  const { data: view, isLoading } = useQuery<BrandIntelligenceView>({
    queryKey: key,
    queryFn: () => analyticsService.fetchBrandIntelligence(context),
    retry: false,
  });

  const reset = useMutation({
    mutationFn: () => analyticsService.resetBrandLearning(context),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: key });
      toast.success(
        result.cleared ? "Learned voice cleared" : "There was nothing to clear",
        {
          description:
            "Your posts are untouched — FlowPost will learn again from them.",
        },
      );
    },
    onError: (cause) =>
      toast.error(
        cause instanceof Error ? cause.message : "Could not reset the learning.",
      ),
  });

  return (
    <div className="space-y-4">
      <ContextTabs
        value={context}
        onChange={setContext}
        brands={brands?.map((brand) => ({ id: brand.id, name: brand.name })) ?? []}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="h-4 w-4" />
                Brand Intelligence
              </CardTitle>
              <CardDescription>
                What FlowPost has learned from this context&rsquo;s own published
                posts. Nothing here needs setting up.
              </CardDescription>
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={reset.isPending || isLoading}
              onClick={() => reset.mutate()}
            >
              <RotateCcw className="mr-1.5 h-3 w-3" />
              Reset learning
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {isLoading && (
            <p className="text-xs text-muted-foreground">Reading the history…</p>
          )}

          {!isLoading && !view && (
            <p className="text-xs text-muted-foreground">
              This could not be loaded right now. It has no effect on writing or
              publishing.
            </p>
          )}

          {view && (
            <>
              <section className="space-y-2">
                <p className="text-sm font-semibold">Voice</p>
                <VoiceMix view={view} />
              </section>

              {view.style.themes.length > 0 && (
                <section className="space-y-2 border-t pt-4">
                  <p className="text-sm font-semibold">Recurring themes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {view.style.themes.map((theme) => (
                      <Badge
                        key={theme.situation}
                        variant="secondary"
                        className="text-xs"
                      >
                        {THEME_LABEL[theme.situation] ?? theme.situation}
                        <span className="ml-1 text-muted-foreground">
                          {theme.posts}
                        </span>
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              <section className="space-y-2 border-t pt-4">
                <p className="text-sm font-semibold">What has worked</p>

                {view.performance.platforms.every(
                  (platform) => platform.signals.length === 0,
                ) ? (
                  <p className="text-xs text-muted-foreground">
                    {view.sampleSize === 0
                      ? "No measured posts yet. Once analytics have collected, patterns show up here."
                      : `Nothing stands out yet across ${view.sampleSize} measured ${
                          view.sampleSize === 1 ? "post" : "posts"
                        }. FlowPost will not call a pattern early.`}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {view.performance.platforms
                      .filter((platform) => platform.signals.length > 0)
                      .map((platform) => (
                        <div key={platform.provider} className="space-y-1.5">
                          <p className="text-xs font-medium">{platform.label}</p>
                          {platform.signals.map((signal) => (
                            <div
                              key={signal.id}
                              className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                            >
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-semibold border",
                                  STRENGTH_BADGE[signal.strength],
                                )}
                              >
                                {STRENGTH_LABEL[signal.strength]}
                              </Badge>
                              <span>{signal.detail}</span>
                              <span className="text-[10px]">
                                ({signal.observations}{" "}
                                {signal.observations === 1 ? "post" : "posts"})
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                  </div>
                )}
              </section>

              {(view.hashtags.frequent.length > 0 ||
                view.hashtags.noDifference.length > 0) && (
                <section className="space-y-3 border-t pt-4">
                  <p className="text-sm font-semibold">Hashtags</p>

                  {view.hashtags.strongerPosts.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-muted-foreground">
                        Appear on stronger posts — a correlation, not a cause:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {view.hashtags.strongerPosts.map((tag) => (
                          <Badge key={tag.tag} variant="secondary" className="text-xs">
                            #{tag.tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {view.hashtags.noDifference.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-muted-foreground">
                        Used often with no measurable difference either way:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {view.hashtags.noDifference.map((tag) => (
                          <Badge key={tag.tag} variant="outline" className="text-xs">
                            #{tag.tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground">
                    Measured across {view.hashtags.sampleSize}{" "}
                    {view.hashtags.sampleSize === 1 ? "post" : "posts"}.
                  </p>
                </section>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
