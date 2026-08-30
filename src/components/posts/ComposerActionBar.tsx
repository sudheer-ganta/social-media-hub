import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import {
  CalendarClock,
  CircleCheck,
  CircleDashed,
  FileText,
  Send,
  Sparkles,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useComposerState } from "./ComposerStateContext";

export function ComposerActionBar() {
  const navigate = useNavigate();
  const {
    post,
    isPublished,
    isDirty,
    mediaDirty,
    lastSavedAt,
    duplicatePost,
    isSubmitting,
    generating,
    blockedReason,
    schedule,
    publish,
    scheduleLabel,
    hasGenerated,
    isBrand,
    handleDuplicateClick,
    handleDiscard,
    submitWithStatus,
    handleSchedule,
    handlePublish,
    handleGenerate,
  } = useComposerState();

  return (
    <div className="sticky bottom-20 lg:bottom-4 z-20">
      <div className="glass flex flex-wrap items-center justify-between sm:justify-end gap-2 rounded-lg border border-border/80 p-3 shadow-elevated bg-background/95 backdrop-blur">
        <p className="w-full sm:w-auto sm:mr-auto flex items-center gap-1.5 text-xs text-muted-foreground pb-1 sm:pb-0">
          {isPublished ? (
            <span className="font-semibold text-emerald-500">
              Published to social networks
            </span>
          ) : isDirty || mediaDirty ? (
            <>
              <CircleDashed className="h-3.5 w-3.5 animate-spin text-amber-500" />
              Unsaved changes
            </>
          ) : lastSavedAt ? (
            <>
              <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
              Saved {dayjs(lastSavedAt).format("HH:mm")}
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
          {isPublished ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate("/posts")}
                className="flex-1 sm:flex-initial"
              >
                Go to Library
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleDuplicateClick}
                loading={duplicatePost?.isPending}
                className="shadow-glow flex-1 sm:flex-initial gap-1.5"
              >
                <Copy className="h-4 w-4" />
                Duplicate to new draft
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={post ? () => navigate("/posts") : handleDiscard}
                className="flex-1 sm:flex-initial text-muted-foreground hover:text-foreground"
              >
                {post ? "Cancel" : "Discard"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={isSubmitting}
                onClick={submitWithStatus("draft")}
                className="flex-1 sm:flex-initial"
              >
                <FileText className="h-4 w-4" />
                Save Draft
              </Button>
              {isBrand && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={generating}
                  disabled={Boolean(blockedReason)}
                  title={blockedReason ?? undefined}
                  onClick={handleGenerate}
                  className="flex-1 sm:flex-initial"
                >
                  <Sparkles className="h-4 w-4" />
                  {hasGenerated ? "Regenerate" : "Generate with AI"}
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={isSubmitting || schedule?.isPending}
                onClick={handleSchedule}
                className="flex-1 sm:flex-initial"
              >
                <CalendarClock className="h-4 w-4" />
                {schedule?.isPending
                  ? "Scheduling…"
                  : `Schedule ${scheduleLabel}`}
              </Button>
              <Button
                type="button"
                size="sm"
                loading={isSubmitting || publish?.isPending}
                onClick={handlePublish}
                className="shadow-glow flex-1 sm:flex-initial"
              >
                <Send className="h-4 w-4" />
                {publish?.isPending ? "Publishing…" : "Publish now"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
