import { useEffect, useMemo, useState } from "react";
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
  Copy,
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
import { ContentTypePicker } from "./ContentTypePicker";
import { CaptionEditor } from "./CaptionEditor";
import { PlatformSelector } from "./PlatformSelector";
import { SchedulePicker } from "./SchedulePicker";
import { AiStrategyPanel } from "./AiStrategyPanel";
import { AiCaptionPanel } from "./AiCaptionPanel";
import { BestTimePanel } from "./BestTimePanel";
import { HashtagPanel } from "./HashtagPanel";
import { ReachPanel } from "./ReachPanel";
import { PublishedSummary } from "./PublishedSummary";
import { PublishStatus } from "./PublishStatus";
import { MarketingStudio } from "@/components/marketing/MarketingStudio";
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
import { withCrop } from "@/utils/crop";
import { withHashtags } from "@/utils/hashtags";
import { itemUrl, mediaFromImageUrl } from "@/utils/media";
import { defaultContentType, optionsFor } from "@/utils/content-type";
import type { ContentType, ProviderCapabilities } from "@/types/capabilities";
import {
  DEFAULT_MEDIA_CAPABILITY,
} from "@/constants/integrations";
import { MediaFormatPanel } from "./MediaFormatPanel";
import { PlatformPreview } from "./PlatformPreview";
import type { AudienceRegister, BrandStyle, CaptionResult } from "@/ai/caption";
// `validateFutureSchedule` is deliberately no longer used here: whether a time
// is in the future depends on the timezone the member picked, not the
// browser's, and the server is the only place that knows both.
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

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-destructive">{message}</p>;
}

// The static SUGGESTED_TIMES table that used to live here is gone. It offered
// every member the same fixed slot per network — Instagram 19:30, LinkedIn 09:00
// — with a comment conceding there were no per-user analytics to derive a real
// one from. There are now: `useBestTime` reads this account's own measured
// publications, and when they are too few it says so rather than falling back to
// a general number dressed as a recommendation.

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

  /**
   * The generation the composer is showing.
   *
   * This session's run when there is one, otherwise whatever is stored on the
   * post row. The fallback is what makes two paths work: the Brand strategy
   * run, which writes to the row rather than to this hook, and the remount that
   * follows saving a new post, which lands on a different draft key and would
   * otherwise come back empty.
   */
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

  const [isSaved, setIsSaved] = useState(false);

  const title = watch("title");
  const caption = watch("caption");
  const platforms = watch("platforms");
  const music = watch("music");

  // Save draft state to sessionStorage whenever key form inputs change
  useEffect(() => {
    if (post || isSaved) return; // Editing existing database post; no need for temp draft
    try {
      const values = getValues();
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    } catch (e) {
      // Ignore quota errors
    }
  }, [title, caption, platforms, music, post, isSaved, DRAFT_KEY, getValues]);
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
   * Every format each connected network publishes, as the server declares them.
   *
   * The composer's whole source of truth for what may be offered. Not a table
   * of literals here and not a `contentTypes.ts` beside this file: these arrive
   * from `GET /api/integrations`, which serves the same declaration the publish
   * path validates against. A format that is absent is one the network cannot
   * publish, on both sides, from one place.
   */
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

  /** Display names, so the picker holds no network strings of its own. */
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

  /**
   * What the member chose to publish as, per network.
   *
   * Empty until they pick, and empty is a real state rather than a gap — it is
   * what every post written before this existed carries, and what a network
   * with only one format never needs to fill. The server resolves an unset
   * destination from the media count exactly as it always did.
   */
  const [contentTypes, setContentTypes] = useState<
    Partial<Record<Platform, ContentType>>
  >(() => ({}));

  /**
   * Keeps a choice honest as the media changes.
   *
   * Removing the video from a post selected as a Reel leaves a choice that
   * cannot publish. Rather than let the member reach a refusal, the selection
   * falls back to whatever the network *can* do with what is now attached —
   * and an unusable one is dropped rather than corrected to a guess.
   */
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

  /**
   * The register the AI writes in. Form state rather than a saved setting: it
   * changes per post far more often than a brand voice does — the same brand
   * writes one way for a launch reel and another for a hiring post.
   */
  const [audience, setAudience] = useState<AudienceRegister>("gen_z_millennial");

  /**
   * The forced register, or null for Smart.
   *
   * Null by default and expected to stay null. A brand does not have one voice —
   * the same account is playful announcing a drop and plain answering a complaint
   * — so the register is inferred per post unless somebody deliberately overrides
   * it for this one.
   */
  const [styleOverride, setStyleOverride] = useState<BrandStyle | null>(null);

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
   *
   * The second clause is a context guard, not a nicety. In a brand context the
   * generation writes *as* that brand, and the brand arrives one render after
   * the composer does; without this, a click landing in that window generated
   * against the personal voice and silently filed the result under the brand.
   */
  const blockedReason =
    (title ?? "").trim().length < 3
      ? "Add a title first — that's what the AI writes about."
      : isBrand && !brand
        ? "Loading this brand — generation writes as the brand, so it waits for it."
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
  const hasGenerated = Boolean(aiResult) || post?.ai_status === "ready";

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

    // A regenerate is the member saying "none of these". It is the clearest
    // negative signal style memory can get, and the only one that leaves no
    // trace in the post row — so it is recorded here, before the options it
    // refers to are replaced. Fire and forget.
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
      // The publishing context decides which brain writes it. Personal reaches
      // none of the marketing pipeline: no goal, no funnel, no audience
      // register, no hook, no hashtags.
      mode: context.contextType === "brand" ? "brand" : "personal",
      ...(context.brandId && { brandId: context.brandId }),
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
      // Brand-only. A register is a marketing decision about who the copy is
      // pitched at; Personal infers how to write from the member's own history
      // instead of asking them to pick a voice for their own account.
      ...(isBrand && { audience }),
      // Only sent when the member actually chose a register. Absent is not a
      // missing value — it is the instruction to work the register out from the
      // content, the learned voice, the platform and what has performed.
      ...(isBrand && styleOverride ? { styleOverride } : {}),
      brand: brandIdentity,
    });

    // Drop the recommended option straight into an empty editor — with nothing
    // to overwrite there is no decision to make. A caption the user has
    // already written or chosen is left alone; the panel's "Use as caption"
    // buttons are how it gets replaced.
    if (generated && !values.caption.trim()) {
      setValue("caption", generated.caption, { shouldValidate: true });
    }

    // On a new post (/posts/new), save the draft automatically after generation
    // and route to /posts/:id/edit so refreshing preserves all generated state.
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

  /**
   * An AI caption as it should land in the editor.
   *
   * The caption arrives exactly as written, in both modes.
   *
   * ─── Why Personal stopped folding hashtags in ────────────────────────────
   * It used to, and Brand did not — the condition was the wrong way round for
   * what each mode is. Brand's hashtags are a marketing asset: researched,
   * reviewed in the Marketing Studio and appended deliberately from there.
   * Personal's did not exist to begin with. A member posting a photo of their
   * own gym session is not running a tag strategy, and three tags stapled to
   * "unfortunately i ate" is the single loudest tell that a machine wrote it.
   *
   * The backend now returns no hashtags at all in personal mode — see
   * `hashtagCount` in `services/ai.service.ts` — so this had become a call to
   * append an empty array. Removing it keeps the two halves honest.
   *
   * The original reason for this function still holds for Brand: hashtags kept
   * only in `result.hashtags` never reach a network, because the publisher
   * sends `post.caption` and nothing else. That is what "Add to caption" is
   * for, and it is still there — see `handleAppendHashtags` below.
   */

  /**
   * Appends hashtags to whatever is in the editor.
   *
   * Goes through `withHashtags` rather than joining the array itself, which is
   * what this used to do. Hand-rolling it skipped both guarantees that helper
   * exists for: it re-appended tags the caption already carried (so pressing the
   * button twice doubled them) and it ignored the per-network ceiling, pushing
   * three tags onto a LinkedIn post that reads as spam past one or two.
   *
   * `withHashtags` is append-only and idempotent — it cannot reorder or delete a
   * character the member typed, and a caption already carrying every tag comes
   * back unchanged.
   */
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

  /**
   * "Aug 20, 9:30 AM" — the moment the button is about to commit to.
   *
   * On the button itself rather than only in the picker: the primary action
   * states the outcome, so nobody has to scroll back up to check what they
   * chose before pressing it.
   */
  const scheduleLabel = (() => {
    const moment = dayjs(
      `${scheduleValue.publish_date}T${scheduleValue.publish_time || "00:00"}`,
    );
    return moment.isValid() ? moment.format("MMM D, h:mm A") : "later";
  })();

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
  const maxMedia = 20;

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
    // Selection can outlive the item it pointed at.
    setSelectedMedia((current) =>
      Math.min(current, Math.max(next.length - 1, 0)),
    );
  };
  /**
   * When this account's own posts have actually performed best.
   *
   * Asked for the platforms currently ticked and the content type currently
   * chosen, because both change the answer — the same post has a different best
   * time on Instagram and LinkedIn, and a Reel's history is not an image's.
   *
   * The browser's zone goes along as a hint. It is not authoritative: the server
   * prefers the zone this member's own posts recorded, since that is the clock
   * they actually schedule on, and a laptop in a different timezone should not
   * silently move every recommendation.
   *
   * Nothing waits for this. It resolves after the composer has rendered, and if
   * it fails the panel is simply absent — the scheduler below is unaffected.
   */
  const bestTime = useBestTime(context, {
    platforms: selectedPlatforms,
    format: selectedPlatforms.length > 0
      ? (contentTypes[selectedPlatforms[0]] ?? null)
      : null,
    timezone: watch("timezone"),
    enabled: !isPublished,
  });

  /**
   * Applies a recommended time to the schedule fields.
   *
   * Splits the backend's `YYYY-MM-DDTHH:mm` into the two inputs the picker
   * already owns and sets the zone the recommendation was expressed in. It
   * deliberately stops there: the member reviews the picker and presses Schedule,
   * and the existing schedule API resolves the instant. There is no second
   * scheduling path — see the header of `BestTimePanel`.
   */
  /**
   * The Reach panel's one-line timing suggestion.
   *
   * Only ever built from a real recommendation — the first selected network that
   * has one. When no network has enough measured history the prop is absent and
   * the panel shows no timing row at all, which is the behaviour that replaced a
   * fixed per-network time shown to everybody.
   */
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

  /**
   * Hashtags for whatever is in the editor right now.
   *
   * Sends the caption as it stands rather than the one the model wrote, which is
   * the entire reason this is a separate call from generation — after two minutes
   * of editing they are not the same text. The image read is passed back when
   * generation produced one so tags can come from what is actually in the
   * picture, and the brand voice so a brand's tags can draw on its positioning.
   */
  const runHashtags = () =>
    hashtags.run({
      mode: isBrand ? "brand" : "personal",
      ...(context.brandId && { brandId: context.brandId }),
      platforms: selectedPlatforms,
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

  /**
   * Saves the form's current values and resolves with the stored post.
   *
   * Shared by Save Draft, Schedule and Publish so there is one definition of
   * what "the post as it stands" means. Publishing in particular *must* go
   * through here first: the backend sends what is stored on the row, not what
   * the browser puts in the request, so an unsaved caption edit would silently
   * publish the previous version.
   */
  const persist = async (
    values: PostFormValues,
    status: PostStatus,
    /**
     * The generation to attach. Defaults to whatever the panel is showing, but
     * the auto-save that follows a generation has to pass its own result: the
     * `ai.result` captured in this closure is the one from the render the click
     * came from, which is still null on the very first Generate.
     */
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
    setIsSaved(true);

    // Clear the pre-save scratch copies: they are keyed to the "new" post and
    // the row is the source of truth from here on. The *state* is deliberately
    // left alone — resetting it here is what used to make a generated result
    // vanish the moment the auto-save after generation ran.
    if (!post) {
      try {
        sessionStorage.removeItem(DRAFT_KEY);
        sessionStorage.removeItem(MEDIA_DRAFT_KEY);
        sessionStorage.removeItem(AI_DRAFT_KEY);
      } catch (e) {
        console.error("Failed to clear session drafts", e);
      }
    }

    // A generation from this session belongs to the row now that one exists.
    // Storing it keeps the AI panels populated on reload and preserves which
    // model wrote what — the caption itself is already in `input`, edits and
    // all, because the editor is the source of truth for that.
    if (generation) {
      try {
        await postsService.applyAiResult(saved.id, generation, saved);
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
      // Same reasoning as handlePublish: the save mutations toast their own
      // failures, so this only has to stop — not navigate away from a form
      // whose contents were never stored.
      try {
        await persist(values, status);
      } catch {
        return;
      }

      toast.success(status === "draft" ? "Draft saved" : "Post saved");
      navigate("/posts");
    });

  /**
   * Hands the post to the scheduler.
   *
   * Saved as a **draft**, never as `scheduled`. That column is the scheduler's
   * to write now, and writing it here is what the old flow did — it produced a
   * post that said "Scheduled" and had nothing armed behind it, exactly as the
   * pre-Sprint-4 Publish button produced posts that said "Published" and had
   * never left the app. `POST /api/scheduled-posts` is what makes it true, and
   * the row moves to `scheduled` on the strength of that.
   *
   * The date and the timezone are sent as the member typed them — a wall clock
   * and the zone it is in — and the backend resolves the pair into the instant
   * it fires on. Converting here would put DST arithmetic in the browser, in
   * whatever zone the laptop happens to be set to, which is the one place it
   * must not live.
   *
   * "Is this in the future?" is deliberately *not* checked here either. The
   * answer depends on the zone that was picked, not the browser's, and the
   * server already answers it authoritatively as SCHEDULE_TIME_IN_PAST — which
   * lands on the date field below.
   */
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
        // Recorded now, because now is when the member chose. The worker runs
        // hours later with no composer to ask.
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
        // The *save* failed and has already toasted. Nothing was scheduled.
        return;
      }

      // The code, not the prose. A reworded message must not silently stop
      // putting the error where the member has to fix it.
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
            // A publish that lost its media still succeeded, and says so here
            // as well as in the toast — the panel outlives the toast.
            notice: result.reason ?? null,
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
            notice: null,
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

  // Personal, published: the composer has done its job. Everything the creator
  // wants now — where it landed, what it looks like, how it performs — is in
  // the summary, and "Edit this post" comes back here.
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
          setPublished(null);
          if (!post) navigate(`/posts/${published.id}/edit`, { replace: true });
        }}
      />
    );
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      {/* Composer left, preview right. The preview column is fixed-width and
          sticky on desktop down the entire form length.

          No bottom padding: the action bar below is `sticky`, not `fixed`, so
          it takes up its own row in the flow and has nothing to be cleared of.
          The padding that used to be here was left over from a fixed bar and
          was the empty band at the foot of the composer. */}
      <div className="grid gap-4 items-start xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-4">
          <fieldset disabled={isPublished} className="contents">
            {/* Unified Post Content Card */}
            <Card>
              <CardHeader className="p-4 pb-3">
                <CardTitle className="text-base font-semibold">Post Content</CardTitle>
                <CardDescription className="text-xs">
                  Create your post content by adding media, a title, caption, and optional music.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-0">
                {/* Media Section */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Media</Label>
                  <MediaUploader
                    items={media}
                    onChange={setMedia}
                    selected={selectedMedia}
                    onSelect={setSelectedMedia}
                    maxItems={maxMedia}
                    disabled={isPublished}
                  />
                  <FieldError message={errors.image_url?.message} />

                  {/* What to publish it as. Renders only for destinations with
                      more than one format — a network with a single answer is
                      not a question worth asking. Every option, and every
                      reason an option is unavailable, comes from the server's
                      capability declaration. */}
                  <ContentTypePicker
                    platforms={selectedPlatforms.filter((platform) =>
                      publishableProviders.has(platform),
                    )}
                    capabilities={contentCapabilities}
                    displayNames={providerNames}
                    value={contentTypes}
                    onChange={(platform, contentType) =>
                      setContentTypes((current) => ({
                        ...current,
                        [platform]: contentType,
                      }))
                    }
                    media={media}
                    onKeepOnly={(keepIds) =>
                      setMedia(media.filter((item) => keepIds.includes(item.id)))
                    }
                    onCrop={(itemId) => {
                      // Opens the *existing* crop UI on that item rather than a
                      // second crop implementation. The format panel below owns
                      // framing; this only points at what needs it.
                      const at = media.findIndex((item) => item.id === itemId);
                      if (at !== -1) setSelectedMedia(at);
                    }}
                    disabled={isPublished}
                  />

                  {media.length > 0 && !isPublished && (
                    <MediaFormatPanel
                      items={media}
                      onChange={setMedia}
                      selected={selectedMedia}
                      onSelect={setSelectedMedia}
                    />
                  )}
                </div>

                {/* Title */}
                <div className="space-y-1.5 border-t pt-4">
                  <Label htmlFor="post-title">What are you feeling today?</Label>
                  <Input
                    id="post-title"
                    placeholder="Tell me about your post..."
                    {...register("title")}
                  />
                  <FieldError message={errors.title?.message} />
                </div>

                {/* Caption */}
                <div className="space-y-1.5">
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

                {/*
                  Hashtags, chosen against the caption above rather than as a
                  by-product of generation — so they fit the text that will
                  actually publish, edits included, and can be re-rolled without
                  rewriting the post.
                */}
                {!isPublished && (
                  <HashtagPanel
                    result={hashtags.result}
                    isGenerating={hashtags.isGenerating}
                    canGenerate={Boolean(
                      watch("caption").trim() || watch("title").trim(),
                    )}
                    onGenerate={runHashtags}
                    onApply={handleAppendHashtags}
                    disabled={isPublished}
                  />
                )}

                {/* Music & Campaign options */}
                <div className="grid gap-4 sm:grid-cols-2 border-t pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="post-music">Music / Song</Label>
                    <Input
                      id="post-music"
                      placeholder="Add song / music (optional)"
                      {...register("music")}
                    />
                    <FieldError message={errors.music?.message} />
                  </div>

                  {isBrand && (
                    <details className="rounded-lg border p-3 self-start">
                      <summary className="cursor-pointer text-sm font-medium">
                        Campaign options
                      </summary>
                      <div className="mt-3 space-y-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="post-cta">Call to action</Label>
                          <Input
                            id="post-cta"
                            placeholder={`Try ${contextLabel} today`}
                            {...register("cta")}
                          />
                          <FieldError message={errors.cta?.message} />
                        </div>
                        <div className="space-y-1.5">
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
                </div>
              </CardContent>
            </Card>

            {/* Unified Publish Settings Card */}
            <Card>
              <CardHeader className="p-4 pb-3">
                <CardTitle className="text-base font-semibold">Publish Settings</CardTitle>
                <CardDescription className="text-xs">
                  Choose which platforms to publish to and when they should go live.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-0">
                {/* Platforms */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Publish Platforms</Label>
                  <Controller
                    control={control}
                    name="platforms"
                    render={({ field }) => (
                      <PlatformSelector
                        value={field.value}
                        onChange={field.onChange}
                        integrations={integrations}
                        contextLabel={contextLabel}
                        disabled={isPublished}
                      />
                    )}
                  />
                  <FieldError message={errors.platforms?.message} />
                </div>

                {/* Schedule */}
                <div className="space-y-2 border-t pt-4">
                  <Label className="text-sm font-semibold">Schedule Time</Label>

                  {/*
                    Replaces the old static chip, which offered a fixed 7:30 PM
                    for Instagram to every member regardless of their own results.
                    This shows a time only when this account's own measured posts
                    support one, and says so; when they do not, it says that
                    instead of falling back to a general number.
                  */}
                  <div className="mb-2">
                    <BestTimePanel
                      result={bestTime.result}
                      isLoading={bestTime.isLoading}
                      onUse={applyRecommendedTime}
                      disabled={isPublished}
                    />
                  </div>

                  <SchedulePicker
                    value={scheduleValue}
                    onChange={(next) => {
                      setValue("publish_date", next.publish_date, { shouldValidate: true });
                      setValue("publish_time", next.publish_time, { shouldValidate: true });
                      setValue("timezone", next.timezone, { shouldValidate: true });
                    }}
                  />
                  <FieldError message={errors.publish_date?.message} />
                  <FieldError message={errors.publish_time?.message} />
                </div>
              </CardContent>
            </Card>
          </fieldset>

          {isBrand && !isPublished && (
            <AiStrategyPanel studio={studio} hasImage={Boolean(imageUrl?.trim())} />
          )}

          {!isPublished && (
            <AiCaptionPanel
              result={aiResult}
              isGenerating={generating}
              // Either path can fail, and the panel is where a failure has to
              // be readable — the strategy run's error used to exist only as a
              // toast that had already gone by the time anyone looked.
              error={ai.error ?? generateStrategy.error?.message ?? null}
              blockedReason={blockedReason}
              mode={isBrand ? "brand" : "personal"}
              audience={audience}
              onAudienceChange={setAudience}
              styleOverride={styleOverride}
              onStyleOverrideChange={setStyleOverride}
              hasImage={Boolean(imageUrl?.trim())}
              currentCaption={watch("caption")}
              onGenerate={handleGenerate}
              showPlatformVariations={isBrand}
              onUseCaption={(caption) =>
                setValue("caption", caption, { shouldValidate: true })
              }
              onCaptionChosen={(caption, variationIndex) =>
                aiService.recordCaptionFeedback({
                  action: "selected",
                  mode: isBrand ? "brand" : "personal",
                  caption,
                  ...(context.brandId && { brandId: context.brandId }),
                  ...(post?.id && { postId: post.id }),
                  ...(variationIndex !== undefined && { variationIndex }),
                })
              }
              onAppendHashtags={handleAppendHashtags}
              {...(!isBrand && {
                onUseSong: (song: string) =>
                  setValue("music", song, { shouldValidate: true }),
              })}
            />
          )}

          {!isBrand && !isPublished && (
            <ReachPanel
              mode="personal"
              caption={watch("caption")}
              platforms={selectedPlatforms}
              hasImage={Boolean(imageUrl?.trim())}
              music={watch("music")}
              onApplyCaption={(next) =>
                setValue("caption", next, { shouldValidate: true })
              }
              {...(aiResult?.imageAnalysis && {
                imageAnalysis: aiResult.imageAnalysis,
              })}
              {...(reachSuggestedTime && { suggestedTime: reachSuggestedTime })}
            />
          )}

          <PublishStatus
            platforms={publishState?.platforms ?? []}
            publishingProvider={publish.isPending ? publishingProvider : null}
          />

          {isBrand && post && !isPublished && (
            <MarketingStudio
              post={post}
              onUseCaption={(caption) =>
                setValue("caption", caption, { shouldValidate: true })
              }
            />
          )}
        </div>

        {/* Now that sticky actually works (see PageContainer), the pinned
            column has to be able to hold a preview taller than the viewport —
            otherwise its lower half is unreachable. It scrolls inside itself. */}
        <div className="min-w-0 self-start xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto scrollbar-thin">
          <Card className="overflow-hidden">
            <CardContent className="p-4">
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

      <div className="sticky bottom-20 lg:bottom-4 z-20">
        <div className="glass flex flex-wrap items-center justify-between sm:justify-end gap-2 rounded-lg border p-3 shadow-elevated">
          <p className="w-full sm:w-auto sm:mr-auto flex items-center gap-1.5 text-xs text-muted-foreground pb-1 sm:pb-0">
            {isPublished ? (
              <span className="font-semibold text-emerald-500">
                Published to social networks
              </span>
            ) : isDirty || mediaDirty ? (
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
                  loading={duplicatePost.isPending}
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
                {/* Both are kept. Scheduling and publishing now are different
                    intentions, not two spellings of one — and the label says
                    which moment it is committing to. */}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={isSubmitting || schedule.isPending}
                  onClick={handleSchedule}
                  className="flex-1 sm:flex-initial"
                >
                  <CalendarClock className="h-4 w-4" />
                  {schedule.isPending
                    ? "Scheduling…"
                    : `Schedule ${scheduleLabel}`}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  loading={isSubmitting || publish.isPending}
                  onClick={handlePublish}
                  className="shadow-glow flex-1 sm:flex-initial"
                >
                  <Send className="h-4 w-4" />
                  {publish.isPending ? "Publishing…" : "Publish now"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
