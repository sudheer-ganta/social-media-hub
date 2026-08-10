import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  CalendarClock,
  CircleCheck,
  CircleDashed,
  FileText,
  Send,
  Sparkles,
} from "lucide-react";
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
import { MediaUploader } from "./MediaUploader";
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
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/app/AuthProvider";
import { useMarketingStudio } from "@/features/marketing-studio/useMarketingStudio";
import { PLATFORM_MAP } from "@/constants";
import { usePublishPostToProvider, usePublishState } from "@/hooks/usePublish";
import { postsService } from "@/services";
import { fromStudioOutput } from "@/ai/caption";
import { currentTime, today } from "@/utils/date";
import { withHashtags } from "@/utils/hashtags";
import { withCrop } from "@/utils/crop";
import { itemUrl, mediaFromImageUrl } from "@/utils/media";
import {
  DEFAULT_MEDIA_CAPABILITY,
  MEDIA_LIMIT_BEFORE_CAPABILITIES_LOAD,
} from "@/constants/integrations";
import { MediaFormatPanel } from "./MediaFormatPanel";
import { PlatformPreview } from "./PlatformPreview";
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
  PostMediaItem,
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
  const initialAiResult = useMemo(
    () => fromStudioOutput(post?.ai_studio_output),
    [post?.ai_studio_output],
  );
  const DRAFT_KEY = `flowpost_draft_${post?.id ?? "new"}_${context.contextType}_${context.brandId ?? "personal"}`;
  const AI_DRAFT_KEY = `flowpost_ai_draft_${post?.id ?? "new"}_${context.contextType}_${context.brandId ?? "personal"}`;
  const ai = useAiCaption(initialAiResult, AI_DRAFT_KEY);
  const studio = useMarketingStudio();
  const generateStrategy = useGenerateWithSettings();
  const publish = usePublishPostToProvider();
  const { data: publishState } = usePublishState(post?.id);
  const { integrations } = useIntegrations(context);
  const { user } = useAuth();
  const { settings } = useSettings();

  const isBrand = context.contextType === "brand";
  const contextLabel = isBrand ? (brand?.name ?? "this brand") : "Personal";
  const authorName = isBrand
    ? brand?.name ?? "Brand Account"
    : (user?.user_metadata?.full_name as string | undefined) ||
      settings.fullName ||
      "Your Profile";

  const defaultValues = useMemo<PostFormValues>(() => {
    let savedDraft: Partial<PostFormValues> = {};
    if (!post) {
      try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (raw) savedDraft = JSON.parse(raw);
      } catch (e) {
        console.error("Failed to load saved draft", e);
      }
    }

    return {
      title: post?.title ?? savedDraft.title ?? "",
      caption: post?.caption ?? savedDraft.caption ?? "",
      image_url: post?.image_url ?? savedDraft.image_url ?? "",
      platforms: post?.platforms ?? savedDraft.platforms ?? [],
      context_type: post?.context_type ?? context.contextType,
      brand_id: post?.brand_id ?? context.brandId,
      music: post?.music ?? savedDraft.music ?? "",
      cta: post?.cta ?? savedDraft.cta ?? "",
      link_url: post?.link_url ?? savedDraft.link_url ?? "",
      platform_media: post?.platform_media ?? savedDraft.platform_media ?? {},
      publish_date: post?.publish_date ?? savedDraft.publish_date ?? today(),
      publish_time: post?.publish_time ?? savedDraft.publish_time ?? currentTime(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    };
  }, [post, context, DRAFT_KEY]);

  const {
    register,
    control,
    watch,
    setValue,
    setError,
    getValues,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues,
  });

  const title = watch("title");
  const caption = watch("caption");
  const platforms = watch("platforms");
  const music = watch("music");

  // Save draft state to sessionStorage whenever key form inputs change
  useEffect(() => {
    if (post) return; // Editing existing database post; no need for temp draft
    try {
      const values = getValues();
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    } catch (e) {
      // Ignore quota errors
    }
  }, [title, caption, platforms, music, post, DRAFT_KEY, getValues]);
  const imageUrl = watch("image_url");

  /**
   * Every image on this post, in publish order.
   *
   * Ordinary state rather than a form field, deliberately. The list is
   * machine-written — the uploader builds each entry from a completed upload —
   * so there is nothing in it for a validator to reject, and keeping an array
   * that is reordered and spliced out of React Hook Form avoids relying on how
   * `setValue` reconciles arrays. `image_url` *is* a form field, mirrored from
   * the first item below: it is the only part of this a member can make invalid
   * (by attaching no images at all), and it is what the schema's message is
   * really about.
   *
   * A post written before this column existed is rebuilt from its one image, so
   * reopening it shows the picture it has always had rather than an empty
   * uploader.
   */
  const MEDIA_DRAFT_KEY = `flowpost_media_draft_${post?.id ?? "new"}_${context.contextType}_${context.brandId ?? "personal"}`;

  const [media, setMediaState] = useState<PostMediaItem[]>(() => {
    if (post?.media) return post.media;
    if (post?.image_url) return mediaFromImageUrl(post.image_url);
    try {
      const raw = sessionStorage.getItem(MEDIA_DRAFT_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      // ignore parse error
    }
    return [];
  });

  /** True once the list has been touched — see the action bar's save state. */
  const [mediaDirty, setMediaDirty] = useState(false);

  /**
   * Which image the composer is working on.
   *
   * One number for the whole composer: the thumbnail rail highlights it, the
   * crop editor edits it and the preview's carousel shows it. Two independent
   * "current image" states is how clicking thumbnail 3 ends up previewing
   * image 1.
   */
  const [selectedMedia, setSelectedMedia] = useState(0);

  /** When this post was last written to the database, for the action bar. */
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  /**
   * What each connected network will take, straight from the API.
   *
   * Never a table of literals here. The server derives these from the same
   * validator constants its publishers enforce, so the composer cannot offer a
   * carousel a publish would reject — and bringing a real carousel online on a
   * new network needs no change in this file.
   */
  const mediaCapabilities = useMemo(
    () =>
      Object.fromEntries(
        integrations.map((integration) => [
          integration.provider,
          integration.media ?? DEFAULT_MEDIA_CAPABILITY,
        ]),
      ) as Partial<Record<Platform, typeof DEFAULT_MEDIA_CAPABILITY>>,
    [integrations],
  );

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
      setValue("caption", applyCaption(generated.caption, generated.hashtags), {
        shouldValidate: true,
      });
    }

    // On a new post (/posts/new), save the draft automatically after generation
    // and route to /posts/:id/edit so refreshing preserves all generated state.
    if (!post && generated) {
      try {
        const saved = await persist({ ...values, caption: getValues("caption") }, "draft");
        navigate(`/posts/${saved.id}/edit`, { replace: true });
      } catch (cause) {
        console.error("[ai] auto-save on generation failed", cause);
      }
    }
  };

  /**
   * An AI caption as it should land in the editor.
   *
   * Personal gets the hashtags folded in; Brand gets the caption exactly as it
   * did before, because Brand's hashtags are reviewed in the Marketing Studio
   * and appended deliberately from there.
   *
   * This is the fix for hashtags never reaching Instagram. They were only ever
   * in `result.hashtags` — a metadata array beside the caption — and reached
   * the published post only if someone happened to press "Add to caption".
   * The publisher sends `post.caption` and nothing else, so an untouched
   * generation published with zero hashtags. The caption field is the single
   * source of truth, so that is where they have to be.
   */
  const applyCaption = (caption: string, hashtags: string[]) =>
    isBrand ? caption : withHashtags(caption, hashtags, watch("platforms"));

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

  /**
   * How many images the uploader will accept.
   *
   * The most generous of the selected networks, not the least: a post going to
   * Instagram and X should not be capped at four because X is, when the
   * Instagram carousel is the point of it. The per-network truth is in the
   * compatibility list beside the preview, where it can be stated rather than
   * silently enforced.
   *
   * With nothing selected yet it is the most generous network available, so an
   * empty composer never refuses an upload for a limit no platform has imposed.
   */
  const maxMedia = useMemo(() => {
    const relevant = selectedPlatforms.length
      ? selectedPlatforms.map((platform) => mediaCapabilities[platform])
      : Object.values(mediaCapabilities);
    const limits = relevant
      .filter(Boolean)
      .map((capability) => capability!.maxItems);
    // Nothing known yet — the integrations request has not answered, or no
    // account is connected. See the constant for why this is not 1.
    return limits.length
      ? Math.max(...limits)
      : MEDIA_LIMIT_BEFORE_CAPABILITIES_LOAD;
  }, [selectedPlatforms, mediaCapabilities]);

  /**
   * Writes the media list, keeping `image_url` on the first item.
   *
   * That column is what the post list, the dashboard, the AI pipeline and every
   * pre-multi-image read path use, and it is what the publish path falls back
   * to. Keeping it in step here — in the one function that changes the list —
   * is what makes "the composer grew a media array" invisible to all of them.
   */
  const setMedia = (next: PostMediaItem[]) => {
    setMediaState(next);
    setMediaDirty(true);
    if (!post) {
      try {
        sessionStorage.setItem(MEDIA_DRAFT_KEY, JSON.stringify(next));
      } catch (e) {
        // ignore
      }
    }
    setValue("image_url", next[0]?.url ?? "", {
      shouldValidate: true,
      shouldDirty: true,
    });
    // Selection can outlive the item it pointed at.
    setSelectedMedia((current) =>
      Math.min(current, Math.max(next.length - 1, 0)),
    );
  };
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
      // Stored on every save — draft, schedule and publish alike — so framing
      // survives a reload and is still there when the backend publishes a
      // scheduled post hours later.
      platform_media: Object.keys(values.platform_media ?? {}).length
        ? values.platform_media
        : null,
      // The ordered list, exactly as the composer arranged it — this array is
      // what the backend publishes, so a reorder here is a reorder on the
      // network. Null rather than `[]` for a post with no media, so it reads
      // the same as every post written before this column existed.
      media: media.length ? media : null,
    };

    const saved = post
      ? await updatePost.mutateAsync({ id: post.id, input })
      : await createPost.mutateAsync(input);

    // Only after the write succeeded — the indicator reports what happened,
    // not what was attempted.
    setLastSavedAt(new Date());
    // The values now on screen *are* what is stored, so nothing is unsaved.
    reset(values, { keepValues: true });
    setMediaDirty(false);

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
  /**
   * Sends one saved post to each network in turn and reports what happened.
   *
   * One request per network, in sequence, and a failure on one does not stop
   * the others: LinkedIn accepting a post is not a reason to skip Instagram,
   * and the reverse is just as true. Each attempt reports its own outcome
   * through the mutation's toasts, and `post_platforms` records them
   * separately — so "published to LinkedIn, failed on Instagram" is a state the
   * app can show rather than one it has to flatten.
   *
   * Extracted so retrying a single failed network is the same code path as the
   * first attempt, rather than a second implementation that can drift from it.
   */
  const sendTo = async (
    postId: string,
    providers: Platform[],
  ): Promise<PostPlatformState[]> => {
    const outcomes: PostPlatformState[] = [];

    for (const provider of providers) {
      setPublishingProvider(provider);
      outcomes.push(
        await publish
          .mutateAsync({ postId, provider })
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

    setPublishingProvider(null);
    return outcomes;
  };

  /**
   * Retries one network that failed, from the published summary.
   *
   * Only the named network is contacted — the ones that succeeded are already
   * live and must not be sent again, which is the whole reason this takes a
   * provider rather than re-running the publish.
   */
  const retryProvider = async (provider: Platform) => {
    if (!published) return;
    const [outcome] = await sendTo(published.id, [provider]);
    if (!outcome) return;
    setPublished({
      ...published,
      platforms: published.platforms.map((row) =>
        row.provider === provider ? outcome : row,
      ),
    });
  };

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
      const outcomes = await sendTo(saved.id, targets);

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
        // The first image as it was delivered — its own crop applied, derived
        // from the untouched original. A carousel has no single "published
        // image", and the first one is what a feed shows as the post.
        //
        // Falls back to the per-network framing of `image_url` for a post that
        // predates the media list, which is exactly what those posts published.
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
          setPublished(null);
          if (!post) navigate(`/posts/${published.id}/edit`, { replace: true });
        }}
      />
    );
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
      {/* Composer left, preview right. The preview column is fixed-width and
          sticky on desktop down the entire form length. */}
      <div className="grid gap-6 items-start xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Media</CardTitle>
              <CardDescription>
                Add images to your post — drag the thumbnails to set their order.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <MediaUploader
                items={media}
                onChange={setMedia}
                selected={selectedMedia}
                onSelect={setSelectedMedia}
                maxItems={maxMedia}
              />
              <FieldError message={errors.image_url?.message} />

              {media.length > 0 && (
                <MediaFormatPanel
                  items={media}
                  onChange={setMedia}
                  selected={selectedMedia}
                  onSelect={setSelectedMedia}
                />
              )}
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
            currentCaption={watch("caption")}
            onGenerate={handleGenerate}
            showPlatformVariations={isBrand}
            onUseCaption={(caption) =>
              setValue("caption", applyCaption(caption, ai.result?.hashtags ?? []), {
                shouldValidate: true,
              })
            }
            onAppendHashtags={handleAppendHashtags}
            {...(!isBrand && {
              onUseSong: (song: string) =>
                setValue("music", song, { shouldValidate: true }),
            })}
          />

          {!isBrand && (
            <ReachPanel
              caption={watch("caption")}
              platforms={selectedPlatforms}
              hasImage={Boolean(imageUrl?.trim())}
              music={watch("music")}
              onApplyCaption={(next) =>
                setValue("caption", next, { shouldValidate: true })
              }
              {...(ai.result?.imageAnalysis && {
                imageAnalysis: ai.result.imageAnalysis,
              })}
              {...(suggestion && {
                suggestedTime: {
                  name: suggestion.name,
                  time: suggestion.time,
                  label: dayjs(`2000-01-01T${suggestion.time}`).format("h:mm A"),
                  use: () =>
                    setValue("publish_time", suggestion.time, {
                      shouldValidate: true,
                    }),
                },
              })}
            />
          )}

          <PublishStatus
            platforms={publishState?.platforms ?? []}
            publishingProvider={publish.isPending ? publishingProvider : null}
          />

          {isBrand && post && (
            <MarketingStudio
              post={post}
              onUseCaption={(caption) =>
                setValue("caption", caption, { shouldValidate: true })
              }
            />
          )}
        </div>

        <div className="min-w-0 xl:sticky xl:top-6 self-start">
          <Card>
            <CardContent className="pt-6">
              <PlatformPreview
                platforms={selectedPlatforms}
                media={media}
                caption={watch("caption")}
                music={watch("music")}
                capabilities={mediaCapabilities}
                activeIndex={selectedMedia}
                authorName={authorName}
                accountMap={Object.fromEntries(
                  integrations
                    .filter((i) => i.connected && i.account)
                    .map((i) => [
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
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="sticky bottom-4 z-20">
        <div className="glass flex flex-wrap items-center justify-between sm:justify-end gap-2 rounded-lg border p-3 shadow-elevated">
          <p className="w-full sm:w-auto sm:mr-auto flex items-center gap-1.5 text-xs text-muted-foreground pb-1 sm:pb-0">
            {isDirty || mediaDirty ? (
              <>
                <CircleDashed className="h-3.5 w-3.5" />
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
              loading={isSubmitting}
              onClick={submitWithStatus("scheduled")}
              className="flex-1 sm:flex-initial"
            >
              <CalendarClock className="h-4 w-4" />
              Schedule
            </Button>
            <Button
              type="button"
              size="sm"
              loading={isSubmitting || publish.isPending}
              onClick={handlePublish}
              className="shadow-glow flex-1 sm:flex-initial"
            >
              <Send className="h-4 w-4" />
              {publish.isPending ? "Publishing…" : "Publish"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
