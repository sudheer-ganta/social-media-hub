import { useFormContext } from "react-hook-form";
import { Card, CardContent } from "@/components/ui/card";
import { PlatformPreview } from "./PlatformPreview";
import { ReachPanel } from "./ReachPanel";
import { AdvancedInsights } from "./AdvancedInsights";
import { useComposerState } from "./ComposerStateContext";
import { cn } from "@/lib/utils";
import type { PostFormValues } from "@/validators";
import type { Platform } from "@/types";

export function ComposerSidebar() {
  const { watch, setValue } = useFormContext<PostFormValues>();
  const {
    activeSidebarTab,
    setActiveSidebarTab,
    media,
    selectedMedia,
    setSelectedMedia,
    authorName,
    integrations,
    mediaCapabilities,
    isBrand,
    isPublished,
    aiResult,
    reachSuggestedTime,
    post,
  } = useComposerState();

  const selectedPlatforms = watch("platforms") || [];
  const caption = watch("caption") || "";
  const music = watch("music") || "";
  const imageUrl = watch("image_url") || "";

  return (
    <Card className="overflow-hidden border-border/80 shadow-soft">
      {/* Tab headers */}
      <div className="flex border-b border-border/80 bg-muted/10">
        <button
          type="button"
          onClick={() => setActiveSidebarTab("preview")}
          className={cn(
            "flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider text-center transition-all border-b-2 focus:outline-none",
            activeSidebarTab === "preview"
              ? "border-primary text-foreground bg-background"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => setActiveSidebarTab("analysis")}
          className={cn(
            "flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider text-center transition-all border-b-2 focus:outline-none",
            activeSidebarTab === "analysis"
              ? "border-primary text-foreground bg-background"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Analysis
        </button>
      </div>

      <CardContent className="p-4">
        {activeSidebarTab === "preview" ? (
          <PlatformPreview
            platforms={selectedPlatforms}
            media={media}
            caption={caption}
            music={music}
            capabilities={mediaCapabilities}
            activeIndex={selectedMedia}
            authorName={authorName}
            accountMap={Object.fromEntries(
              integrations
                .filter((i: any) => i.connected && i.account)
                .map((i: any) => [
                  i.provider as Platform,
                  {
                    displayName: i.account?.displayName,
                    username: i.account?.username,
                    profileImage: i.account?.profileImage,
                  },
                ]),
            )}
            onActiveIndexChange={setSelectedMedia}
          />
        ) : (
          <div>
            {!isPublished ? (
              <div className="space-y-6">
                <ReachPanel
                  mode={isBrand ? "brand" : "personal"}
                  caption={caption}
                  platforms={selectedPlatforms}
                  hasImage={Boolean(imageUrl?.trim())}
                  music={music}
                  onApplyCaption={(next) =>
                    setValue("caption", next, { shouldValidate: true })
                  }
                  {...(aiResult?.imageAnalysis && {
                    imageAnalysis: aiResult.imageAnalysis,
                  })}
                  {...(reachSuggestedTime && { suggestedTime: reachSuggestedTime })}
                />
                {isBrand && (
                  <AdvancedInsights post={post} />
                )}
              </div>
            ) : (
              <div className="py-8 px-4 text-center text-xs text-muted-foreground">
                Post is already published. Reach analysis is only available for active editing.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
