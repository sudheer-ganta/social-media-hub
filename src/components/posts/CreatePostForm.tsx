import React, { useEffect, useMemo, useState, useCallback } from "react";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  useCreatePost,
  useUpdatePost,
  useGenerateWithSettings,
  useDuplicatePost,
} from "@/hooks/usePosts";
import { useAiCaption } from "@/hooks/useAiCaption";
import { useBestTime } from "@/hooks/useBestTime";
import { useHashtags } from "@/hooks/useHashtags";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/app/AuthProvider";
import { useMarketingStudio } from "@/features/marketing-studio/useMarketingStudio";
import { PLATFORM_MAP } from "@/constants";
import { usePublishPostToProvider, usePublishState } from "@/hooks/usePublish";
import { useSchedulePost } from "@/hooks/useScheduledPosts";
import { postsService, ScheduleApiError } from "@/services";
import { aiService } from "@/services/ai.service";
import { fromStudioOutput } from "@/ai/caption";
import { currentTime, today } from "@/utils/date";
import { withHashtags } from "@/utils/hashtags";
import { mediaFromImageUrl } from "@/utils/media";
import { defaultContentType, optionsFor } from "@/utils/content-type";
import type { ContentType, ProviderCapabilities } from "@/types/capabilities";
import {
  DEFAULT_MEDIA_CAPABILITY,
} from "@/constants/integrations";
import { postSchema, type PostFormValues } from "@/validators";
import type { AccountContext } from "@/constants/integrations";
import type {
  Brand,
  Platform,
  Post,
  PostMediaItem,
  PostPlatformState,
  PostStatus,
} from "@/types";
import type { AudienceRegister, BrandStyle, CaptionResult } from "@/ai/caption";
import { ComposerStateContext } from "./ComposerStateContext";
import { ComposerShell } from "./ComposerShell";

interface CreatePostFormProps {
  post?: Post;
  /** The publishing context this composer is working in. */
  context: AccountContext;
  /** The brand behind a brand context, when it has loaded. */
  brand?: Brand | null;
  onDirtyChange?: (dirty: boolean) => void;
  saveDraftRef?: React.RefObject<(() => Promise<any>) | null>;
}

export function CreatePostForm({
  post,
  context,
  brand,
  onDirtyChange,
  saveDraftRef,
}: CreatePostFormProps) {
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

  const aiResult = ai.result ?? initialAiResult;
  const studio = useMarketingStudio();
  const hashtags = useHashtags();
  const generateStrategy = useGenerateWithSettings();
  const publish = usePublishPostToProvider();
  const schedule = useSchedulePost();
  const { data: publishState } = usePublishState(post?.id);
  const { user } = useAuth();
  const { settings } = useSettings();

  const isPublished = post?.status === "published";
  const editing = Boolean(post?.id);
  const duplicatePost = useDuplicatePost();

  const handleDuplicateClick = async () => {
    if (!post) return;
    try {
      const duplicated = await postsService.duplicate(post.id);
      toast.success("Post duplicated", { description: duplicated.title });
      navigate(`/posts/${duplicated.id}/edit`);
    } catch (e) {
      toast.error("Failed to duplicate post");
    }
  };

  const { integrations } = useIntegrations(context);
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

  const form = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues,
  });

  const {
    watch,
    setValue,
    setError,
    getValues,
    reset,
    handleSubmit,
    formState: { isSubmitting, isDirty },
  } = form;

  const [isSaved, setIsSaved] = useState(false);

  const title = watch("title");
  const caption = watch("caption");
  const platforms = watch("platforms");
  const music = watch("music");

  // Save draft state to sessionStorage whenever key form inputs change
  useEffect(() => {
    if (post || isSaved) return;
    try {
      const values = getValues();
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    } catch (e) {
      // Ignore quota errors
    }
  }, [title, caption, platforms, music, post, isSaved, DRAFT_KEY, getValues]);

  const imageUrl = watch("image_url");
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

  const [mediaDirty, setMediaDirty] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Report dirty state changes to parent context switcher
  useEffect(() => {
    onDirtyChange?.(isDirty || mediaDirty);
  }, [isDirty, mediaDirty, onDirtyChange]);

  // Expose the persist save function stably to the parent switcher
  const handleSaveDraftExternal = useCallback(async () => {
    return persist(getValues(), "draft");
  }, [getValues]);

  useEffect(() => {
    if (saveDraftRef) {
      saveDraftRef.current = handleSaveDraftExternal;
    }
    return () => {
      if (saveDraftRef) {
        saveDraftRef.current = null;
      }
    };
  }, [saveDraftRef, handleSaveDraftExternal]);

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

  const contentCapabilities = useMemo(
    () =>
      Object.fromEntries(
        integrations.map((integration) => [
          integration.provider,
          integration.contentTypes ?? {},
        ]),
      ) as Partial<Record<Platform, ProviderCapabilities>>,
    [integrations],
  );

  const providerNames = useMemo(
    () =>
      Object.fromEntries(
        integrations.map((integration) => [
          integration.provider,
          integration.displayName,
        ]),
      ) as Partial<Record<Platform, string>>,
    [integrations],
  );

  const [contentTypes, setContentTypes] = useState<
    Partial<Record<Platform, ContentType>>
  >(() => ({}));

  useEffect(() => {
    setContentTypes((current) => {
      let changed = false;
      const next: Partial<Record<Platform, ContentType>> = { ...current };

      const platformsToCheck = new Set([
        ...Object.keys(current),
        ...platforms,
      ]) as Set<Platform>;

      for (const platform of platformsToCheck) {
        const chosen = current[platform];
        const capabilities = contentCapabilities[platform] ?? {};

        if (chosen) {
          const option = optionsFor(capabilities, media).find(
            (entry) => entry.contentType === chosen,
          );
          if (option?.available) continue;
        }

        const hasVideo = media.some((m) => m.type === "video");
        if (hasVideo || chosen) {
          const fallback = defaultContentType(capabilities, media);
          if (fallback !== chosen) {
            changed = true;
            if (fallback) next[platform] = fallback;
            else delete next[platform];
          }
        }
      }

      return changed ? next : current;
    });
  }, [media, platforms.join(","), contentCapabilities]);

  const [audience, setAudience] = useState<AudienceRegister>("gen_z_millennial");
  const [styleOverride, setStyleOverride] = useState<BrandStyle | null>(null);
  const [publishingProvider, setPublishingProvider] = useState<Platform | null>(null);
  const [published, setPublished] = useState<{
    id: string;
    platforms: PostPlatformState[];
  } | null>(null);

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

  const blockedReason =
    (title ?? "").trim().length < 3
      ? "Add a title first — that's what the AI writes about."
      : isBrand && !brand
        ? "Loading this brand — generation writes as the brand, so it waits for it."
        : null;

  const generating = ai.isGenerating || generateStrategy.isPending;
  const hasGenerated = Boolean(aiResult) || post?.ai_status === "ready";

  const handleGenerate = () => {
    if (blockedReason) {
      setError("title", { message: "Give your post a title first." });
      toast.error(blockedReason);
      return;
    }

    return isBrand && getValues("image_url")?.trim()
      ? runStrategy()
      : runCaptionOnly();
  };

  const brandIdentity =
    isBrand && brand
      ? { name: brand.name, ...(brand.description && { description: brand.description }) }
      : null;

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

  const applyGeneratedCaption = (
    result: CaptionResult,
    selectedPlatforms?: string[],
    existingCaption?: string,
  ) => {
    const firstPlatform = selectedPlatforms?.[0];
    const platformSpecificCaption =
      firstPlatform && result.platformCaptions?.[firstPlatform];
    const generatedCaption =
      platformSpecificCaption || result.caption || result.variations?.[0]?.caption || "";

    console.info("[ai] generated", {
      captionLength: generatedCaption.length,
      hookCount: result.variations?.length ?? 0,
      hashtagCount: result.hashtags?.length ?? 0,
      platformVersionCount: Object.keys(result.platformCaptions ?? {}).length,
    });

    if (generatedCaption && !existingCaption?.trim()) {
      setValue("caption", generatedCaption, { shouldValidate: true });
    }
  };

  const runCaptionOnly = async () => {
    const values = getValues();

    if (aiResult?.caption) {
      aiService.recordCaptionFeedback({
        action: "regenerated",
        mode: isBrand ? "brand" : "personal",
        caption: aiResult.caption,
        ...(context.brandId && { brandId: context.brandId }),
        ...(post?.id && { postId: post.id }),
      });
    }

    const generated = await ai.generate({
      mode: context.contextType === "brand" ? "brand" : "personal",
      ...(context.brandId && { brandId: context.brandId }),
      title: values.title,
      caption: values.caption,
      image_url: values.image_url,
      platforms: values.platforms,
      ...(!isBrand && {
        music: values.music,
        suggestSongs: !values.music.trim(),
      }),
      ...(isBrand && { audience }),
      ...(isBrand && styleOverride ? { styleOverride } : {}),
      brand: brandIdentity,
    });

    if (generated) {
      applyGeneratedCaption(generated, values.platforms, values.caption);
    }

    if (!post && generated) {
      try {
        await persist(
          { ...values, caption: getValues("caption") },
          "draft",
          generated,
        );
      } catch (cause) {
        console.error("[ai] auto-save on generation failed", cause);
      }
    }
  };

  const handleAppendHashtags = (hashtags: string[]) => {
    const current = getValues("caption");
    const next = withHashtags(current, hashtags, getValues("platforms"));
    if (next === current) return;
    setValue("caption", next, { shouldValidate: true });
  };

  const scheduleValue = {
    publish_date: watch("publish_date"),
    publish_time: watch("publish_time"),
    timezone: watch("timezone"),
  };

  const scheduleLabel = (() => {
    const moment = dayjs(
      `${scheduleValue.publish_date}T${scheduleValue.publish_time || "00:00"}`,
    );
    return moment.isValid() ? moment.format("MMM D, h:mm A") : "later";
  })();

  const maxMedia = 20;

  const setMedia = (next: PostMediaItem[]) => {
    setMediaState(next);
    setMediaDirty(true);
    if (!post && !isSaved) {
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
    setSelectedMedia((current) =>
      Math.min(current, Math.max(next.length - 1, 0)),
    );
  };

  const bestTime = useBestTime(context, {
    platforms: platforms,
    format: platforms.length > 0
      ? (contentTypes[platforms[0]] ?? null)
      : null,
    timezone: watch("timezone"),
    enabled: !isPublished,
  });

  const reachSuggestedTime = (() => {
    const entry = bestTime.result?.platforms.find(
      (platform) => platform.recommendedTime !== null,
    );
    if (!entry?.recommendedTime) return null;

    const time = entry.recommendedTime;
    return {
      name: entry.label,
      time,
      label: dayjs(`2000-01-01T${time}`).format("h:mm A"),
      use: () => setValue("publish_time", time, { shouldValidate: true }),
    };
  })();

  const runHashtags = () =>
    hashtags.run({
      mode: isBrand ? "brand" : "personal",
      ...(context.brandId && { brandId: context.brandId }),
      platforms: platforms,
      caption: getValues("caption"),
      topic: getValues("title"),
      ...(aiResult?.imageAnalysis && { imageAnalysis: aiResult.imageAnalysis }),
      ...(isBrand && studio.brandVoice ? { brandVoice: studio.brandVoice } : {}),
      language: studio.language,
    });

  const applyRecommendedTime = (localDateTime: string, timezone: string) => {
    const [date, time] = localDateTime.split("T");
    if (!date || !time) return;
    setValue("publish_date", date, { shouldValidate: true });
    setValue("publish_time", time, { shouldValidate: true });
    if (timezone) setValue("timezone", timezone, { shouldValidate: true });
    toast.success(`Scheduled time set to ${dayjs(`2000-01-01T${time}`).format("h:mm A")}`, {
      description: "Review it below, then press Schedule.",
    });
  };

  const persist = async (
    values: PostFormValues,
    status: PostStatus,
    generation: CaptionResult | null = aiResult,
  ) => {
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
      platform_media: Object.keys(values.platform_media ?? {}).length
        ? values.platform_media
        : null,
      media: media.length ? media : null,
    };

    const saved = post
      ? await updatePost.mutateAsync({ id: post.id, input })
      : await createPost.mutateAsync(input);

    setLastSavedAt(new Date());
    reset(values, { keepValues: true });
    setMediaDirty(false);
    setIsSaved(true);

    if (!post) {
      try {
        sessionStorage.removeItem(DRAFT_KEY);
        sessionStorage.removeItem(MEDIA_DRAFT_KEY);
        sessionStorage.removeItem(AI_DRAFT_KEY);
      } catch (e) {
        console.error("Failed to clear session drafts", e);
      }
    }

    if (generation) {
      try {
        await postsService.applyAiResult(saved.id, generation, saved);
      } catch (cause) {
        console.error("[ai] could not attach generation to post", cause);
      }
    }

    return saved;
  };

  const submitWithStatus = (status: PostStatus) =>
    handleSubmit(async (values) => {
      try {
        await persist(values, status);
      } catch {
        return;
      }

      toast.success(status === "draft" ? "Draft saved" : "Post saved");
      navigate("/posts");
    });

  const handleSchedule = handleSubmit(async (values) => {
    const targets = values.platforms.filter((p) => publishableProviders.has(p));

    if (targets.length === 0) {
      toast.error(
        publishableProviders.size > 0
          ? `Turn on ${publishableNames} under Platforms to schedule.`
          : "Connect an account before scheduling a post.",
      );
      return;
    }

    try {
      const saved = await persist(values, "draft");

      await schedule.mutateAsync({
        postId: saved.id,
        scheduledAt: `${values.publish_date}T${values.publish_time}`,
        timezone: values.timezone,
        providers: targets,
        contentTypes: Object.fromEntries(
          targets
            .filter((provider) => contentTypes[provider])
            .map((provider) => [provider, contentTypes[provider]!]),
        ),
      });

      toast.success("Scheduled", {
        description: `${scheduleLabel} · ${values.timezone}`,
      });
      navigate("/scheduled");
    } catch (cause) {
      if (!(cause instanceof ScheduleApiError)) {
        return;
      }

      const field: Partial<Record<string, "publish_date" | "platforms">> = {
        SCHEDULE_TIME_IN_PAST: "publish_date",
        SCHEDULE_TIME_INVALID: "publish_date",
        TIMEZONE_INVALID: "publish_date",
        NO_DESTINATIONS: "platforms",
        ACCOUNT_NOT_CONNECTED: "platforms",
        PROVIDER_NOT_SUPPORTED: "platforms",
      };

      const target = field[cause.code];
      if (target) setError(target, { message: cause.message });

      toast.error("Couldn't schedule", { description: cause.message });
    }
  });

  const runStrategy = () =>
    handleSubmit(async (values) => {
      try {
        const saved = await persist(values, post?.status ?? "draft");
        const updatedPost = await generateStrategy.mutateAsync({
          id: saved.id,
          settings: buildContextSettings(),
        });
        if (updatedPost?.ai_studio_output) {
          const generatedResult = fromStudioOutput(updatedPost.ai_studio_output);
          if (generatedResult) {
            ai.applyResult(generatedResult);
            applyGeneratedCaption(generatedResult, values.platforms, values.caption);
          }
        }
      } catch {
        // mutations toast themselves
      }
    })();

  const sendTo = async (
    postId: string,
    providers: Platform[],
  ): Promise<PostPlatformState[]> => {
    const outcomes: PostPlatformState[] = [];

    for (const provider of providers) {
      setPublishingProvider(provider);

      const effectiveContentType =
        contentTypes[provider] ??
        (media.some((m) => m.type === "video")
          ? defaultContentType(contentCapabilities[provider] ?? {}, media) ?? undefined
          : undefined);

      console.log("[publish] CreatePostForm mutate input", {
        postId,
        provider,
        contentType: effectiveContentType ?? null,
      });

      outcomes.push(
        await publish
          .mutateAsync({
            postId,
            provider,
            ...(effectiveContentType && { contentType: effectiveContentType }),
          })
          .then<PostPlatformState>((result) => ({
            provider,
            providerName: PLATFORM_MAP[provider]?.name ?? provider,
            status: "PUBLISHED",
            publishedId: result.publishedId,
            url: result.url,
            errorMessage: null,
            notice: result.reason ?? null,
          }))
          .catch<PostPlatformState>((cause) => ({
            provider,
            providerName: PLATFORM_MAP[provider]?.name ?? provider,
            status: "FAILED",
            publishedId: null,
            url: null,
            errorMessage:
              cause instanceof Error ? cause.message : "Publishing failed.",
            notice: null,
          })),
      );
    }

    setPublishingProvider(null);
    return outcomes;
  };

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

    try {
      const saved = await persist(
        values,
        post?.status === "published" ? "published" : "draft",
      );

      const outcomes = await sendTo(saved.id, targets);

      if (!isBrand && outcomes.some((o) => o.status === "PUBLISHED")) {
        setPublished({ id: saved.id, platforms: outcomes });
        return;
      }

      if (!post) navigate(`/posts/${saved.id}/edit`, { replace: true });
    } catch {
      // persist toasts
    } finally {
      setPublishingProvider(null);
    }
  });

  const handleDiscard = () => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
      sessionStorage.removeItem(MEDIA_DRAFT_KEY);
      sessionStorage.removeItem(AI_DRAFT_KEY);
      ai.reset();
    } catch (e) {
      console.error("Failed to discard draft", e);
    }
    toast.success("Draft discarded");
    navigate("/posts");
  };

  // Shared UX Viewport tabs
  const [activeSidebarTab, setActiveSidebarTab] = useState<"preview" | "analysis">("preview");
  const [activeMobileTab, setActiveMobileTab] = useState<"edit" | "preview">("edit");

  // Ambient collapsible panel toggles
  const [isAiExpanded, setIsAiExpanded] = useState(false);
  const [isHashtagsExpanded, setIsHashtagsExpanded] = useState(false);

  // Pack variables into our small, robust context state
  const composerStateValue = useMemo(() => ({
    post,
    context,
    brand,
    isPublished,
    editing,

    form,
    isDirty,
    isSubmitting,
    integrations,
    isBrand,
    contextLabel,
    authorName,
    imageUrl,
    duplicatePost,
    schedule,
    publish,
    scheduleLabel,

    media,
    setMedia,
    mediaDirty,
    setMediaDirty,
    selectedMedia,
    setSelectedMedia,
    maxMedia,
    mediaCapabilities,
    contentCapabilities,
    providerNames,

    contentTypes,
    setContentTypes,

    audience,
    setAudience,
    styleOverride,
    setStyleOverride,
    generating,
    hasGenerated,
    blockedReason,
    aiResult,
    ai,
    studio,
    hashtags,
    generateStrategy,

    publishingProvider,
    setPublishingProvider,
    published,
    setPublished,
    lastSavedAt,
    setLastSavedAt,
    isSaved,
    setIsSaved,
    publishState,
    publishableProviders,
    publishableNames,
    bestTime,
    reachSuggestedTime,

    activeSidebarTab,
    setActiveSidebarTab,
    activeMobileTab,
    setActiveMobileTab,

    isAiExpanded,
    setIsAiExpanded,
    isHashtagsExpanded,
    setIsHashtagsExpanded,

    // Actions
    persist,
    submitWithStatus,
    handleSchedule,
    handlePublish,
    handleDiscard,
    runHashtags,
    handleAppendHashtags,
    applyRecommendedTime,
    retryProvider,
    handleDuplicateClick,
    runStrategy,
    runCaptionOnly,
    handleGenerate,
  }), [
    form,
    isDirty,
    isSubmitting,
    integrations,
    isBrand,
    contextLabel,
    authorName,
    imageUrl,
    duplicatePost,
    schedule,
    publish,
    scheduleLabel,
    post,
    context,
    brand,
    isPublished,
    editing,
    media,
    mediaDirty,
    selectedMedia,
    maxMedia,
    mediaCapabilities,
    contentCapabilities,
    providerNames,
    contentTypes,
    audience,
    styleOverride,
    generating,
    hasGenerated,
    blockedReason,
    aiResult,
    ai,
    studio,
    hashtags,
    generateStrategy,
    publishingProvider,
    published,
    lastSavedAt,
    isSaved,
    publishState,
    publishableProviders,
    publishableNames,
    bestTime,
    reachSuggestedTime,
    activeSidebarTab,
    activeMobileTab,
    isAiExpanded,
    isHashtagsExpanded,
    persist,
    submitWithStatus,
    handleSchedule,
    handlePublish,
    handleDiscard,
    runHashtags,
    handleAppendHashtags,
    applyRecommendedTime,
    retryProvider,
    handleDuplicateClick,
    runStrategy,
    runCaptionOnly,
    handleGenerate,
  ]);

  return (
    <ComposerStateContext.Provider value={composerStateValue}>
      <FormProvider {...form}>
        <ComposerShell />
      </FormProvider>
    </ComposerStateContext.Provider>
  );
}
