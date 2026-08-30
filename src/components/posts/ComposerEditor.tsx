import { ContentSection } from "./ContentSection";
import { MessageSection } from "./MessageSection";
import { DestinationsSection } from "./DestinationsSection";
import { PublishSection } from "./PublishSection";
import { PublishStatus } from "./PublishStatus";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useComposerState } from "./ComposerStateContext";

export function ComposerEditor() {
  const { publishState, publish, publishingProvider, isPublished } = useComposerState();

  return (
    <div className="space-y-4">
      <fieldset disabled={isPublished} className="contents">
        {/* Post Content Details */}
        <Card className="border-border/80 shadow-soft">
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-base font-semibold">Post Content</CardTitle>
            <CardDescription className="text-xs">
              Create your post content by adding media, a title, caption, and optional music.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-0">
            <ContentSection />
            <MessageSection />
          </CardContent>
        </Card>

        {/* Platform Destinations & Publish scheduling */}
        <Card className="border-border/80 shadow-soft">
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-base font-semibold">Publish Settings</CardTitle>
            <CardDescription className="text-xs">
              Choose which platforms to publish to and when they should go live.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-0">
            <DestinationsSection />
            <PublishSection />
          </CardContent>
        </Card>
      </fieldset>

      <PublishStatus
        platforms={publishState?.platforms ?? []}
        publishingProvider={publish?.isPending ? publishingProvider : null}
      />
    </div>
  );
}
