import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CalendarClock, ExternalLink, FileText, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ImageUploader } from "./ImageUploader";
import { CaptionEditor } from "./CaptionEditor";
import { PlatformSelector } from "./PlatformSelector";
import { SchedulePicker } from "./SchedulePicker";
import { AiPanel } from "./AiPanel";
import { AiCaptionPanel } from "./AiCaptionPanel";
import { useCreatePost, useUpdatePost } from "@/hooks/usePosts";
import { useAiCaption } from "@/hooks/useAiCaption";
import { postsService } from "@/services";
import { currentTime, today } from "@/utils/date";
import type { AudienceRegister } from "@/ai/caption";
import {
  postSchema,
  validateFutureSchedule,
  type PostFormValues,
} from "@/validators";
import type { Post, PostStatus } from "@/types";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-destructive">{message}</p>;
}

interface CreatePostFormProps {
  post?: Post;
}

export function CreatePostForm({ post }: CreatePostFormProps) {
  const navigate = useNavigate();
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const ai = useAiCaption();

  const defaultValues = useMemo<PostFormValues>(
    () => ({
      title: post?.title ?? "",
      caption: post?.caption ?? "",
      image_url: post?.image_url ?? "",
      platforms: post?.platforms ?? [],
      publish_date: post?.publish_date ?? today(),
      publish_time: post?.publish_time ?? currentTime(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    }),
    [post],
  );

  const {
    register,
    control,
    watch,
    setValue,
    setError,
    getValues,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues,
  });

  const title = watch("title");
  const imageUrl = watch("image_url");

  /**
   * The register the AI writes in. Form state rather than a saved setting: it
   * changes per post far more often than a brand voice does — the same brand
   * writes one way for a launch reel and another for a hiring post.
   */
  const [audience, setAudience] = useState<AudienceRegister>("gen_z_millennial");

  /**
   * Why generation can't run yet, or null when it can.
   *
   * Only the title is required. The old Make-based flow also demanded an
   * image, because the scenario's first step was analysing one — the caption
   * generator writes from the brief, so an image is context when it exists and
   * nothing more.
   */
  const blockedReason =
    (title ?? "").trim().length < 3
      ? "Add a title first — that's what the AI writes about."
      : null;

  /**
   * "Generate AI" now calls the backend and puts the result on screen. It
   * saves nothing: the post does not have to exist, no draft is created behind
   * the user's back, and abandoning a caption they don't like leaves no trace.
   */
  const handleGenerateAi = async () => {
    const values = getValues();

    if (blockedReason) {
      setError("title", { message: "Give your post a title first." });
      toast.error(blockedReason);
      return;
    }

    const generated = await ai.generate({
      title: values.title,
      caption: values.caption,
      image_url: values.image_url,
      platforms: values.platforms,
      audience,
    });

    // Drop the recommended option straight into an empty editor — with nothing
    // to overwrite there is no decision to make. A caption the user has
    // already written or chosen is left alone; the panel's "Use as caption"
    // buttons are how it gets replaced.
    if (generated && !values.caption.trim()) {
      setValue("caption", generated.caption, { shouldValidate: true });
    }
  };

  /** Appends the generated hashtags to whatever is in the editor. */
  const handleAppendHashtags = (hashtags: string[]) => {
    const current = getValues("caption").trimEnd();
    const tags = hashtags.map((tag) => `#${tag}`).join(" ");
    setValue("caption", current ? `${current}\n\n${tags}` : tags, {
      shouldValidate: true,
    });
  };

  const schedule = {
    publish_date: watch("publish_date"),
    publish_time: watch("publish_time"),
    timezone: watch("timezone"),
  };

  const submitWithStatus = (status: PostStatus) =>
    handleSubmit(async (values) => {
      if (status === "scheduled") {
        const scheduleError = validateFutureSchedule(values);
        if (scheduleError) {
          setError("publish_date", { message: scheduleError });
          toast.error(scheduleError);
          return;
        }
      }

      const input = {
        title: values.title,
        caption: values.caption,
        image_url: values.image_url,
        platforms: values.platforms,
        status,
        publish_date: values.publish_date,
        publish_time: values.publish_time,
      };

      const saved = post
        ? await updatePost.mutateAsync({ id: post.id, input })
        : await createPost.mutateAsync(input);

      // A generation from this session belongs to the row now that one exists.
      // Storing it keeps the AI panels populated on reload and preserves which
      // model wrote what — the caption itself is already in `input`, edits and
      // all, because the editor is the source of truth for that.
      if (ai.result) {
        try {
          await postsService.applyAiResult(saved.id, ai.result, saved);
        } catch (cause) {
          // The post is saved; only its AI provenance failed to attach. Worth
          // saying, not worth turning a successful save into an error.
          console.error("[ai] could not attach generation to post", cause);
        }
      }

      const messages: Partial<Record<PostStatus, string>> = {
        draft: "Draft saved",
        scheduled: "Post scheduled 🎉",
        published: "Post published 🚀",
      };
      toast.success(messages[status] ?? "Post saved");
      navigate(status === "scheduled" ? "/calendar" : "/posts");
    });

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Media</CardTitle>
            <CardDescription>
              A strong visual doubles engagement on most platforms.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Controller
              control={control}
              name="image_url"
              render={({ field }) => (
                <ImageUploader value={field.value} onChange={field.onChange} />
              )}
            />
            <FieldError message={errors.image_url?.message} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Content</CardTitle>
            <CardDescription>
              Title for your workspace, caption for your audience.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="post-title">Title</Label>
              <Input
                id="post-title"
                placeholder="Q3 product launch announcement"
                {...register("title")}
              />
              <FieldError message={errors.title?.message} />
            </div>
            <div className="space-y-2">
              <Label>Caption</Label>
              <Controller
                control={control}
                name="caption"
                render={({ field }) => (
                  <CaptionEditor value={field.value} onChange={field.onChange} />
                )}
              />
              <FieldError message={errors.caption?.message} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Platforms</CardTitle>
          <CardDescription>
            Choose where this post should be published.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Controller
            control={control}
            name="platforms"
            render={({ field }) => (
              <PlatformSelector value={field.value} onChange={field.onChange} />
            )}
          />
          <FieldError message={errors.platforms?.message} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>
            Pick the moment your audience is most active.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SchedulePicker
            value={schedule}
            onChange={(next) => {
              setValue("publish_date", next.publish_date, { shouldValidate: true });
              setValue("publish_time", next.publish_time, { shouldValidate: true });
              setValue("timezone", next.timezone, { shouldValidate: true });
            }}
          />
          <FieldError message={errors.publish_date?.message} />
          <FieldError message={errors.publish_time?.message} />
        </CardContent>
      </Card>

      <AiCaptionPanel
        result={ai.result}
        isGenerating={ai.isGenerating}
        error={ai.error}
        blockedReason={blockedReason}
        audience={audience}
        onAudienceChange={setAudience}
        hasImage={Boolean(imageUrl?.trim())}
        onGenerate={handleGenerateAi}
        onUseCaption={(caption) =>
          setValue("caption", caption, { shouldValidate: true })
        }
        onAppendHashtags={handleAppendHashtags}
      />

      {/* The saved post's own AI content and the approval gate. Only on an
          existing post — there is nothing stored to review before that. */}
      {post && (
        <AiPanel
          post={post}
          onUseCaption={(caption) =>
            setValue("caption", caption, { shouldValidate: true })
          }
        />
      )}

      <div className="sticky bottom-4 z-10">
        <div className="glass flex flex-wrap items-center justify-end gap-2 rounded-lg border p-3 shadow-elevated">
          {post?.image_url && (
            <Button
              type="button"
              variant="ghost"
              loading={false}
              onClick={() =>
                navigate(
                  `/ai-studio?image=${encodeURIComponent(post.image_url)}${post?.id ? `&postId=${post.id}` : ""}`,
                )
              }
              className="mr-auto text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in AI Studio
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            loading={isSubmitting}
            onClick={submitWithStatus("draft")}
          >
            <FileText />
            Save Draft
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={ai.isGenerating}
            disabled={Boolean(blockedReason)}
            title={blockedReason ?? undefined}
            onClick={handleGenerateAi}
          >
            <Sparkles />
            {ai.result ? "Regenerate" : "Generate AI"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={isSubmitting}
            onClick={submitWithStatus("scheduled")}
          >
            <CalendarClock />
            Schedule
          </Button>
          <Button
            type="button"
            loading={isSubmitting}
            onClick={submitWithStatus("published")}
            className="shadow-glow"
          >
            <Send />
            Publish
          </Button>
        </div>
      </div>
    </form>
  );
}
