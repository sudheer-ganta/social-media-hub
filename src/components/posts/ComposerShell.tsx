import { useComposerState } from "./ComposerStateContext";
import { ComposerLayout } from "./ComposerLayout";
import { ComposerEditor } from "./ComposerEditor";
import { ComposerSidebar } from "./ComposerSidebar";
import { ComposerActionBar } from "./ComposerActionBar";
import { PublishedSummary } from "./PublishedSummary";
import { cn } from "@/lib/utils";
import { itemUrl } from "@/utils/media";
import { withCrop } from "@/utils/crop";

export function ComposerShell() {
  const {
    published,
    media,
    form: { getValues },
    retryProvider,
    publish,
    publishingProvider,
    activeMobileTab,
    setActiveMobileTab,
  } = useComposerState();

  // If successfully published in Personal mode, show the summary view.
  if (published) {
    return (
      <PublishedSummary
        mediaItem={media[0]}
        imageUrl={
          media[0]
            ? itemUrl(media[0])
            : withCrop(
                getValues("image_url"),
                getValues("platform_media")?.[
                  published.platforms.find((p) => p.status === "PUBLISHED")
                    ?.provider ?? ""
                ],
              )
        }
        caption={getValues("caption")}
        music={getValues("music")}
        platforms={published.platforms}
        onRetry={retryProvider}
        retrying={publish.isPending ? publishingProvider : null}
        onEdit={() => {
          // In edit mode we just toggle the success view out, on new mode we redirect
          window.location.reload();
        }}
      />
    );
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      {/* Mobile workspace selector (Edit | Preview) - hidden on desktop */}
      <div className="flex border border-border/80 bg-muted/10 xl:hidden mb-2 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setActiveMobileTab("edit")}
          className={cn(
            "flex-1 py-2 text-xs font-semibold uppercase tracking-wider text-center transition-all focus:outline-none",
            activeMobileTab === "edit"
              ? "bg-background text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setActiveMobileTab("preview")}
          className={cn(
            "flex-1 py-2 text-xs font-semibold uppercase tracking-wider text-center transition-all border-b-2 focus:outline-none",
            activeMobileTab === "preview"
              ? "bg-background text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Preview
        </button>
      </div>

      <ComposerLayout>
        {/* Editor column */}
        <div
          className={cn(
            "min-w-0 space-y-4",
            activeMobileTab === "edit" ? "block" : "hidden xl:block"
          )}
        >
          <ComposerEditor />
        </div>

        {/* Sidebar column (preview, analysis) */}
        <div
          className={cn(
            "min-w-0 self-start xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto scrollbar-thin",
            activeMobileTab === "preview" ? "block" : "hidden xl:block"
          )}
        >
          <ComposerSidebar />
        </div>
      </ComposerLayout>

      <ComposerActionBar />
    </form>
  );
}
export default ComposerShell;
