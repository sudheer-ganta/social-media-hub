import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Wand2,
  Sparkles,
  Image as ImageIcon,
  ArrowLeft,
  Settings2,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/PageContainer";
import { ImageUploader } from "@/components/posts/ImageUploader";
import { MarketingGoalSelector } from "@/components/marketing/MarketingGoal";
import { FunnelStageSelector } from "@/components/marketing/FunnelStage";
import { BrandVoicePanel } from "@/components/marketing/BrandVoicePanel";
import { CompetitorInput } from "@/components/marketing/CompetitorInput";
import { StudioFeatures } from "@/components/marketing/StudioFeatures";
import { MarketingStudio } from "@/components/marketing/MarketingStudio";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePost, useCreatePost, useUpdatePost } from "@/hooks/usePosts";
import { useMarketingStudio } from "@/features/marketing-studio/useMarketingStudio";
import { today, currentTime } from "@/utils/date";


export default function AiStudio() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlImage = searchParams.get("image") ?? "";
  const urlPostId = searchParams.get("postId") ?? "";

  const [imageUrl, setImageUrl] = useState(urlImage);
  const [postId, setPostId] = useState(urlPostId);

  const { data: post } = usePost(postId || undefined);


  const createPost = useCreatePost();
  const updatePost = useUpdatePost();

  const studio = useMarketingStudio();

  // When a post is loaded from URL, sync image URL
  useEffect(() => {
    if (post?.image_url && !imageUrl) {
      setImageUrl(post.image_url);
    }
  }, [post, imageUrl]);

  const handleGenerate = async () => {
    if (!imageUrl) return;

    const baseInput = {
      title: `AI Studio — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      caption: "",
      image_url: imageUrl,
      platforms: [],
      status: "draft" as const,
      publish_date: today(),
      publish_time: currentTime(),
    };

    if (postId && post) {
      // Update existing post with new image (in case changed) then generate
      if (imageUrl !== post.image_url) {
        await updatePost.mutateAsync({ id: postId, input: { image_url: imageUrl } });
      }
      studio.triggerGeneration(postId);
    } else {
      // Create a new post then trigger generation
      const created = await createPost.mutateAsync(baseInput);
      setPostId(created.id);
      navigate(`/ai-studio?postId=${created.id}`, { replace: true });
      studio.triggerGeneration(created.id);
    }
  };

  const hasCompetitorDetails = Object.values(studio.competitor ?? {}).some((v) =>
    Boolean(v?.trim()),
  );

  // Clearing the competitor fields would otherwise leave the analysis toggle on
  // and send a request the generator can't fulfil.
  useEffect(() => {
    if (!hasCompetitorDetails && studio.features.competitorAnalysis) {
      studio.setFeature("competitorAnalysis", false);
    }
  }, [hasCompetitorDetails, studio.features.competitorAnalysis, studio.setFeature]);

  // Generation is synchronous now: the only thing that can be in flight is
  // this page's own request, which `studio.isGenerating` already reports.
  const generating = studio.isGenerating;
  const canGenerate = !!imageUrl && !generating && !studio.isGenerating;

  return (
    <PageContainer className="max-w-none px-0 py-0">
      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-64px)]">
        {/* ── Left Settings Panel ─────────────────────────────────────── */}
        <motion.aside
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full lg:w-[380px] lg:max-w-[380px] shrink-0 border-b lg:border-b-0 lg:border-r bg-card flex flex-col"
        >
          {/* Left header */}
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary shadow-glow">
                  <Wand2 className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
                <h1 className="text-sm font-bold">AI Marketing Studio</h1>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Configure → Generate → Review
              </p>
            </div>
          </div>

          {/* Scrollable settings */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
            {/* Image */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Image
                </p>
              </div>
              <ImageUploader value={imageUrl} onChange={setImageUrl} />
              {!imageUrl && (
                <p className="text-xs text-muted-foreground">
                  Upload an image to unlock AI generation.
                </p>
              )}
            </div>

            {/* Goal */}
            <MarketingGoalSelector
              value={studio.goal}
              onChange={studio.setGoal}
            />

            {/* Funnel Stage */}
            <FunnelStageSelector
              value={studio.funnelStage}
              onChange={studio.setFunnelStage}
            />

            {/* Brand Voice */}
            <BrandVoicePanel
              voice={studio.brandVoice}
              onChange={studio.setBrandVoice}
              profileNames={studio.profileNames}
              onSave={studio.saveCurrentProfile}
              onLoad={studio.loadProfile}
              onDelete={studio.deleteProfile}
            />

            {/* Output settings */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Output Settings
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Caption Length</p>
                  <Select
                    value={studio.captionLength}
                    onValueChange={(v) =>
                      studio.setCaptionLength(v as "Short" | "Medium" | "Long")
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Short", "Medium", "Long"].map((l) => (
                        <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Language</p>
                  <Select
                    value={studio.language}
                    onValueChange={studio.setLanguage}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["English", "Spanish", "French", "German", "Portuguese", "Arabic", "Hindi", "Japanese"].map((l) => (
                        <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Competitor */}
            <CompetitorInput
              value={studio.competitor}
              onChange={studio.setCompetitor}
            />

            {/* Optional extra outputs */}
            <StudioFeatures
              features={studio.features}
              onToggle={studio.setFeature}
              hasCompetitor={hasCompetitorDetails}
            />
          </div>

          {/* Generate button — sticky at bottom */}
          <div className="border-t p-4 bg-card/80 backdrop-blur-sm">
            {post && (
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <p className="text-[10px] text-muted-foreground">
                  Linked to post:{" "}
                  <span className="font-medium text-foreground truncate">
                    {post.title}
                  </span>
                </p>
              </div>
            )}
            <Button
              type="button"
              className="w-full shadow-glow gap-2"
              size="lg"
              disabled={!canGenerate}
              loading={studio.isGenerating || createPost.isPending || generating}
              onClick={handleGenerate}
            >
              <Sparkles className="h-4 w-4" />
              {generating
                ? "Generating…"
                : post
                  ? "Regenerate"
                  : "Generate Marketing Assets"}
            </Button>
            <p className="text-center text-[10px] text-muted-foreground mt-2">
              Powered by Gemini on the FlowPost backend · API key stays private
            </p>
          </div>
        </motion.aside>

        {/* ── Right Output Panel ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="p-6"
          >
            {post ? (
              <MarketingStudio
                post={post}
                onUseCaption={undefined}
              />
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center justify-center gap-6 min-h-[60vh] text-center">
                <div className="relative">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
                    <Wand2 className="h-10 w-10 text-primary" />
                  </div>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-2 rounded-2xl border border-dashed border-primary/20"
                  />
                </div>

                <div className="space-y-2 max-w-md">
                  <h2 className="text-2xl font-bold">AI Marketing Studio</h2>
                  <p className="text-muted-foreground">
                    Upload an image, configure your marketing goal and brand voice,
                    then click <strong>Generate</strong> to create complete marketing
                    assets powered by Gemini.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4 max-w-lg">
                  {[
                    { icon: Layers, label: "Image Analysis", desc: "Category, mood, colors, persona" },
                    { icon: FileIcon, label: "Content Variations", desc: "9 tones + CTAs + hashtags" },
                    { icon: Wand2, label: "Brand Voice", desc: "Saved across all posts" },
                  ].map(({ icon: Icon, label, desc }) => (
                    <div key={label} className="rounded-xl border bg-card p-4 space-y-2 text-left">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-xs font-semibold">{label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{desc}</p>
                    </div>
                  ))}
                </div>


              </div>
            )}
          </motion.div>
        </div>
      </div>
    </PageContainer>
  );
}

// Small inline icon component to avoid import issues
function FileIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}
