import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CalendarClock, FileText, Send, Sparkles } from "lucide-react";
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
import {
  useCreatePost,
  useRequestAiGeneration,
  useUpdatePost,
} from "@/hooks/usePosts";
import { currentTime, today } from "@/utils/date";
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
  const requestAi = useRequestAiGeneration();

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

  /**
   * "Generate AI" saves the current draft (caption may still be empty —
   * the AI writes one) and flags it for the AI scenario. New posts are
   * created first, then we jump to their edit page to watch progress.
   */
  const handleGenerateAi = async () => {
    const values = getValues();
    if (values.title.trim().length < 3) {
      setError("title", { message: "Give your post a title first." });
      toast.error("Add a title before generating AI content.");
      return;
    }
    if (!values.image_url) {
      setError("image_url", { message: "AI generation needs an image." });
      toast.error("Upload an image before generating AI content.");
      return;
    }

    const input = {
      title: values.title.trim(),
      caption: values.caption,
      image_url: values.image_url,
      platforms: values.platforms,
      status: "draft" as const,
      publish_date: values.publish_date,
      publish_time: values.publish_time,
    };

    if (post) {
      await updatePost.mutateAsync({ id: post.id, input });
      await requestAi.mutateAsync(post.id);
    } else {
      const created = await createPost.mutateAsync(input);
      await requestAi.mutateAsync(created.id);
      navigate(`/posts/${created.id}/edit`, { replace: true });
    }
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

      if (post) {
        await updatePost.mutateAsync({ id: post.id, input });
      } else {
        await createPost.mutateAsync(input);
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
            loading={requestAi.isPending || createPost.isPending}
            onClick={handleGenerateAi}
          >
            <Sparkles />
            Generate AI
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
