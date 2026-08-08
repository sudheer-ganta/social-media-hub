import { useMemo, useState } from "react";
import dayjs from "dayjs";
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
import { AiStrategyPanel } from "./AiStrategyPanel";
import { AiCaptionPanel } from "./AiCaptionPanel";
import { ReachPanel } from "./ReachPanel";
import { PublishedSummary } from "./PublishedSummary";
import { PublishStatus } from "./PublishStatus";
import { MarketingStudio } from "@/components/marketing/MarketingStudio";
import {
  useCreatePost,
  useUpdatePost,
  useGenerateWithSettings,
} from "@/hooks/usePosts";
import { useAiCaption } from "@/hooks/useAiCaption";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useMarketingStudio } from "@/features/marketing-studio/useMarketingStudio";
import { PLATFORM_MAP } from "@/constants";
import { usePublishPostToProvider, usePublishState } from "@/hooks/usePublish";
import { postsService } from "@/services";
import { currentTime, today } from "@/utils/date";
import type { AudienceRegister } from "@/ai/caption";
import {
  postSchema,
  validateFutureSchedule,
  type PostFormValues,
} from "@/validators";
import type { AccountContext } from "@/constants/integrations";
import type {
  Brand,
  Platform,
  Post,
  PostPlatformState,
  PostStatus,
} from "@/types";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-destructive">{message}</p>;
}

/**
 * General per-network guidance for the "Suggested time" chip. Static on
 * purpose and labeled as a general recommendation in the UI — there are no
 * per-user analytics to derive a personal best time from yet, and the
 * assistant must not pretend otherwise.
 */
const SUGGESTED_TIMES: Partial<Record<Platform, string>> = {
  linkedin: "09:00",
  instagram: "19:30",
  facebook: "13:00",
  x: "12:00",
  threads: "20:00",
};

interface CreatePostFormProps {
  post?: Post;
  /** The publishing context this composer is working in. */
  context: AccountContext;
  /** The brand behind a brand context, when it has loaded. */
  brand?: Brand | null;
}

export function CreatePostForm({ post, context, brand }: CreatePostFormProps) {
  const navigate = useNavigate();
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const ai = useAiCaption();
  const studio = useMarketingStudio();
  const generateStrategy = useGenerateWithSettings();
  const publish = usePublishPostToProvider();
  const { data: publishState } = usePublishState(post?.id);
  // Context-scoped: the backend filters, so a Personal composer never even
  // receives a brand account. Everything below (the platform cards, the
  // publishable set) inherits the isolation from this one call.
  const { integrations } = useIntegrations(context);

  const isBrand = context.contextType === "brand";
  const contextLabel = isBrand ? (brand?.name ?? "this brand") : "Personal";

  const defaultValues = useMemo<PostFormValues>(
    () => ({
      title: post?.title ?? "",
      caption: post?.caption ?? "",
      image_url: post?.image_url ?? "",
      platforms: post?.platforms ?? [],
      context_type: post?.context_type ?? context.contextType,
      brand_id: post?.brand_id ?? context.brandId,
      music: post?.music ?? "",
      cta: post?.cta ?? "",
      link_url: post?.link_url ?? "",
      publish_date: post?.publish_date ?? today(),
      publish_time: post?.publish_time ?? currentTime(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    }),
    [post, context],
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
   * Which network a publish is currently in flight for, or null.
   *
   * Needed now that Publish can hit more than one: the status panel shows a
   * spinner against the network being contacted, and "LinkedIn" hardcoded there
   * was fine only while LinkedIn was the sole target.
   */
  const [publishingProvider, setPublishingProvider] = useState<Platform | null>(
    null,
  );

  /**
   * The outcome of a Personal publish, which swaps the composer for
   * {@link PublishedSummary}.
   *
   * Personal only, deliberately. Brand's post-publish behaviour is out of scope
   * for this sprint and is left exactly as it was — it keeps the composer and
   * its Marketing Studio on screen, which is what a campaign post is edited
   * from next.
   *
   * Held here rather than read back from `usePublishState` because a brand-new
   * post's route changes the moment it is saved, and the remount that follows
   * would take this state with it. The rows below are what the publisher
   * actually returned, network by network.
   */
  const [published, setPublished] = useState<{
    id: string;
    platforms: PostPlatformState[];
  } | null>(null);

  /**
   * The networks FlowPost can actually publish to, from the server's catalogue.
   *
   * Read rather than hardcoded — `available` is the same flag that decides
   * whether a network's Integrations card offers a Connect button, so a network
   * can never be publishable here and Coming Soon there. Bringing Facebook
   * Pages online is a backend change and nothing in this file.
   */
  const publishableProviders = useMemo(
    () =>
      new Set(
        integrations
          .filter((integration) => integration.available)
          .map((integration) => integration.provider as Platform),
      ),
    [integrations],
  );

  const publishableNames = [...publishableProviders]
    .map((id) => PLATFORM_MAP[id]?.name ?? id)
    .join(" or ");

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
   * The one AI button.
   *
   * There used to be two — a caption generator here and a "Generate Strategy"
   * inside the AI panel — and the split was never a choice worth making: the
   * strategy pipeline does everything the caption generator does and more, it
   * just needs an image to read. So the image decides, not the user:
   *
   *   image → the full pipeline (vision, hooks, platform versions, hashtags)
   *   no image → caption, hashtags and CTAs from the brief alone
   *
   * The strategy path saves first because the pipeline reads the stored row;
   * the caption path deliberately saves nothing, so abandoning a caption the
   * user doesn't like leaves no draft behind.
   */
  /** Either path counts: one button, so one in-flight and one "done" flag. */
  const generating = ai.isGenerating || generateStrategy.isPending;
  const hasGenerated = Boolean(ai.result) || post?.ai_status === "ready";

  const handleGenerate = () => {
    if (blockedReason) {
      setError("title", { message: "Give your post a title first." });
      toast.error(blockedReason);
      return;
    }

    // Personal never runs the marketing pipeline — the caption path already
    // reads the image and returns hooks, hashtags and platform captions, which
    // is the whole of the Personal AI Assistant. The strategy pipeline (goals,
    // funnel, campaign assets) is a Brand concept.
    return isBrand && getValues("image_url")?.trim()
      ? runStrategy()
      : runCaptionOnly();
  };

  /** Brand-context identity for the AI, or null in Personal mode. */
  const brandIdentity =
    isBrand && brand
      ? { name: brand.name, ...(brand.description && { description: brand.description }) }
      : null;

  /**
   * The studio settings, stamped with the active context. In Brand mode the
   * voice writes as the brand — its name and description override the saved
   * profile's, while the profile's tone rules still apply.
   */
  const buildContextSettings = () => {
    const settings = studio.buildRequest();
    return {
      ...settings,
      contextType: context.contextType,
      brandId: context.brandId,
      ...(brandIdentity && {
        brandVoice: { ...settings.brandVoice, ...brandIdentity },
      }),
    };
  };

  const runCaptionOnly = async () => {
    const values = getValues();

    const generated = await ai.generate({
      title: values.title,
      caption: values.caption,
      image_url: values.image_url,
      platforms: values.platforms,
      // Audio is a Personal concern only. Brand's brief is left byte-identical
      // to what it was before this panel existed — it neither sends the song
      // nor asks for suggestions, so a Brand generation reads exactly the
      // prompt it always did.
      //
      // Within Personal the rule is: a song the user already chose is context,
      // never a target. It steers the copy, and it suppresses the suggestions
      // entirely so nothing can offer to replace a decision already made.
      ...(!isBrand && {
        music: values.music,
        suggestSongs: !values.music.trim(),
      }),
      audience,
      brand: brandIdentity,
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

  // The first selected platform with a known slot drives the suggestion chip.
  const selectedPlatforms = watch("platforms");
  const suggestedFor = selectedPlatforms.find((p) => SUGGESTED_TIMES[p]);
  const suggestion = suggestedFor
    ? {
        name: PLATFORM_MAP[suggestedFor]?.name ?? suggestedFor,
        time: SUGGESTED_TIMES[suggestedFor]!,
      }
    : null;

  /**
   * Saves the form's current values and resolves with the stored post.
   *
   * Shared by Save Draft, Schedule and Publish so there is one definition of
   * what "the post as it stands" means. Publishing in particular *must* go
   * through here first: the backend sends what is stored on the row, not what
   * the browser puts in the request, so an unsaved caption edit would silently
   * publish the previous version.
   */
  const persist = async (values: PostFormValues, status: PostStatus) => {
    const input = {
      title: values.title,
      caption: values.caption,
      image_url: values.image_url,
      platforms: values.platforms,
      status,
      publish_date: values.publish_date,
      publish_time: values.publish_time,
      context_type: values.context_type,
      brand_id: values.context_type === "brand" ? values.brand_id : null,
      music: values.music.trim() || null,
      cta: values.cta.trim() || null,
      link_url: values.link_url.trim() || null,
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

    return saved;
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

      // Same reasoning as handlePublish: the save mutations toast their own
      // failures, so this only has to stop — not navigate away from a form
      // whose contents were never stored.
      try {
        await persist(values, status);
      } catch {
        return;
      }

      const messages: Partial<Record<PostStatus, string>> = {
        draft: "Draft saved",
        scheduled: "Post scheduled 🎉",
      };
      toast.success(messages[status] ?? "Post saved");
      navigate(status === "scheduled" ? "/calendar" : "/posts");
    });

  /**
   * The image-backed half of {@link handleGenerate} — the old AI Studio run.
   *
   * The pipeline reads the stored row, so the post has to exist before it can
   * run. Saving first is what makes that true, and it is the same `persist`
   * every other button uses, so the strategy is generated against exactly what
   * is on screen. A brand-new post moves to its own URL afterwards, or the
   * results would be lost on the next refresh.
   *
   * Settings come from the AI Strategy panel, read at click time — whether the
   * panel is open or shut. Shut means its defaults, which are a sane run.
   */
  const runStrategy = () =>
    handleSubmit(async (values) => {
      try {
        const saved = await persist(values, post?.status ?? "draft");
        await generateStrategy.mutateAsync({
          id: saved.id,
          settings: buildContextSettings(),
        });
        if (!post) navigate(`/posts/${saved.id}/edit`, { replace: true });
      } catch {
        // Both mutations toast their own failures; the draft is saved either
        // way, so the retry costs nothing but the click.
      }
    })();

  /**
   * Publish for real: save what is on screen, then ask the backend to send it
   * to LinkedIn.
   *
   * This replaces the old Publish button, which only wrote `status:
   * 'published'` to our own table — the post said "Published" and had never
   * left the app. The row's status is now set by the publisher on the strength
   * of what LinkedIn actually did, so it is saved as a draft here and moves on
   * its own.
   *
   * Deliberately does *not* navigate away. The whole point of the change is
   * that the member can see it land and click through to the live post, which
   * they cannot do from the posts list.
   */
  const handlePublish = handleSubmit(async (values) => {
    const targets = values.platforms.filter((p) => publishableProviders.has(p));

    if (targets.length === 0) {
      toast.error(
        publishableProviders.size > 0
          ? `Turn on ${publishableNames} under Platforms to publish.`
          : "No network is available to publish to yet.",
      );
      return;
    }

    // Never save as "published" — that is the publisher's word to say, and
    // saying it here is what made the old flow dishonest when LinkedIn failed.
    //
    // `mutateAsync` rejects on failure, and the rejection has to be caught
    // here. Both mutations already report failures through their own `onError`
    // toasts, so there is nothing left to *handle* — but an uncaught rejection
    // is still a console error and, worse, skips the navigate below by
    // unwinding rather than by decision. Catching makes the control flow say
    // what it means: on failure, stop, and leave the member on the form with
    // their work and the reason it did not go out.
    try {
      const saved = await persist(
        values,
        post?.status === "published" ? "published" : "draft",
      );

      // One request per network, in sequence, and a failure on one does not
      // stop the others: LinkedIn accepting a post is not a reason to skip
      // Instagram, and the reverse is just as true. Each attempt reports its
      // own outcome through the mutation's toasts, and `post_platforms` records
      // them separately — so "published to LinkedIn, failed on Instagram" is a
      // state the app can actually show rather than one it has to flatten.
      const outcomes: PostPlatformState[] = [];

      for (const provider of targets) {
        setPublishingProvider(provider);
        outcomes.push(
          await publish
            .mutateAsync({ postId: saved.id, provider })
            .then<PostPlatformState>((result) => ({
              provider,
              providerName: PLATFORM_MAP[provider]?.name ?? provider,
              status: "PUBLISHED",
              publishedId: result.publishedId,
              url: result.url,
              errorMessage: null,
            }))
            .catch<PostPlatformState>((cause) => ({
              provider,
              providerName: PLATFORM_MAP[provider]?.name ?? provider,
              status: "FAILED",
              publishedId: null,
              url: null,
              // Already written for a member by the backend — the mutation's
              // own toast renders the same string.
              errorMessage:
                cause instanceof Error ? cause.message : "Publishing failed.",
            })),
        );
      }

      // Personal, and something actually went out: the work is finished, so
      // the form gives way to the result rather than leaving someone staring
      // at fields they have no further use for.
      //
      // The `some` is load-bearing. A publish where *every* network failed has
      // not succeeded at anything, and swapping in a success screen would both
      // lie about it and take away the form the member needs to fix and retry
      // from. In that case this falls through and behaves exactly as it did
      // before: stay put, keep the values, let PublishStatus and the mutation's
      // toasts say what went wrong.
      if (!isBrand && outcomes.some((o) => o.status === "PUBLISHED")) {
        setPublished({ id: saved.id, platforms: outcomes });
        return;
      }

      // A brand-new post published from /posts/new has no route of its own
      // yet. Move to its edit URL so the publish state, and the link to the
      // live post, survive a refresh.
      if (!post) navigate(`/posts/${saved.id}/edit`, { replace: true });
    } catch {
      // The *save* failed — already surfaced by the mutation's onError, and
      // nothing was sent to any network. The post is on screen either way, so
      // retrying costs the member nothing but the click.
    } finally {
      setPublishingProvider(null);
    }
  });

  // Personal, published: the composer has done its job. Everything the creator
  // wants now — where it landed, what it looks like, how it performs — is in
  // the summary, and "Edit this post" comes back here.
  if (published) {
    return (
      <PublishedSummary
        imageUrl={getValues("image_url")}
        caption={getValues("caption")}
        music={getValues("music")}
        platforms={published.platforms}
        onEdit={() => {
          setPublished(null);
          if (!post) navigate(`/posts/${published.id}/edit`, { replace: true });
        }}
      />
    );
  }

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
            <div className="space-y-2">
              <Label htmlFor="post-music">Music / Song</Label>
              <Input
                id="post-music"
                placeholder="Add song / music (optional)"
                {...register("music")}
              />
              <FieldError message={errors.music?.message} />
            </div>
            {isBrand && (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Campaign options
                </summary>
                <div className="mt-3 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="post-cta">Call to action</Label>
                    <Input
                      id="post-cta"
                      placeholder={`Try ${contextLabel} today`}
                      {...register("cta")}
                    />
                    <FieldError message={errors.cta?.message} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="post-link">Link</Label>
                    <Input
                      id="post-link"
                      placeholder="https://…"
                      {...register("link_url")}
                    />
                    <FieldError message={errors.link_url?.message} />
                  </div>
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Platforms</CardTitle>
          <CardDescription>
            {isBrand
              ? `Accounts connected to ${contextLabel}.`
              : "Your personal connected accounts."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Controller
            control={control}
            name="platforms"
            render={({ field }) => (
              <PlatformSelector
                value={field.value}
                onChange={field.onChange}
                integrations={integrations}
                contextLabel={contextLabel}
              />
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
          {suggestion && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3">
              <p className="text-xs text-muted-foreground">
                Suggested:{" "}
                <span className="font-semibold text-foreground">
                  {dayjs(`2000-01-01T${suggestion.time}`).format("h:mm A")}
                </span>{" "}
                for {suggestion.name} — general recommendation, not yet based
                on your analytics.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setValue("publish_time", suggestion.time, {
                    shouldValidate: true,
                  })
                }
              >
                Use
              </Button>
            </div>
          )}
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

      {/* Brand-only: goals, funnel stages, brand voice and competitor context
          are marketing concepts. Personal gets the AI Assistant below instead. */}
      {isBrand && (
        <AiStrategyPanel studio={studio} hasImage={Boolean(imageUrl?.trim())} />
      )}

      <AiCaptionPanel
        result={ai.result}
        isGenerating={generating}
        error={ai.error}
        blockedReason={blockedReason}
        audience={audience}
        onAudienceChange={setAudience}
        hasImage={Boolean(imageUrl?.trim())}
        onGenerate={handleGenerate}
        onUseCaption={(caption) =>
          setValue("caption", caption, { shouldValidate: true })
        }
        onAppendHashtags={handleAppendHashtags}
        {...(!isBrand && {
          onUseSong: (song: string) =>
            setValue("music", song, { shouldValidate: true }),
        })}
      />

      {/* Personal's second, optional assistant. Brand reads the same analysis
          through the Marketing Studio below, so it is not repeated here. */}
      {!isBrand && (
        <ReachPanel
          caption={watch("caption")}
          platforms={selectedPlatforms}
          hasImage={Boolean(imageUrl?.trim())}
          {...(ai.result?.imageAnalysis && {
            imageAnalysis: ai.result.imageAnalysis,
          })}
        />
      )}

      {/* Where this post stands on each network. Hides itself entirely until
          there is something to report. */}
      <PublishStatus
        platforms={publishState?.platforms ?? []}
        publishingProvider={publish.isPending ? publishingProvider : null}
      />

      {/* Everything the pipeline produced, plus the approval gate. Only on an
          existing post — there is nothing stored to review before that. This is
          the whole of the old AI Studio's right-hand panel. */}
      {isBrand && post && (
        <MarketingStudio
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
          {/* Brand keeps AI in the primary workflow; Personal's only AI entry
              point is the optional AI Assistant panel above. */}
          {isBrand && (
            <Button
              type="button"
              variant="secondary"
              loading={generating}
              disabled={Boolean(blockedReason)}
              title={blockedReason ?? undefined}
              onClick={handleGenerate}
            >
              <Sparkles />
              {hasGenerated ? "Regenerate" : "Generate with AI"}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            loading={isSubmitting}
            onClick={submitWithStatus("scheduled")}
          >
            <CalendarClock />
            Schedule
          </Button>
          {/* The only button that leaves the app. `loading` covers the save
              *and* the LinkedIn round trip, and the Button component disables
              itself while loading — which is the first of the three duplicate
              guards. The other two are the mutation's own in-flight check and
              the backend's conditional claim; only the last one is a
              guarantee. See hooks/usePublish.ts. */}
          <Button
            type="button"
            loading={isSubmitting || publish.isPending}
            onClick={handlePublish}
            className="shadow-glow"
          >
            <Send />
            {publish.isPending ? "Publishing…" : "Publish"}
          </Button>
        </div>
      </div>
    </form>
  );
}
