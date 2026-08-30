import { createContext, useContext } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { PostFormValues } from "@/validators";
import type {
  Brand,
  Platform,
  Post,
  PostMediaItem,
  PostPlatformState,
  PostStatus,
} from "@/types";
import type { AccountContext } from "@/constants/integrations";
import type { AudienceRegister, BrandStyle, CaptionResult } from "@/ai/caption";

export interface ComposerState {
  // Config props
  post?: Post;
  context: AccountContext;
  brand?: Brand | null;
  isPublished: boolean;
  editing: boolean;

  // React Hook Form instance
  form: UseFormReturn<PostFormValues>;
  isDirty: boolean;
  isSubmitting: boolean;

  // Integrations and brand details
  integrations: any[];
  isBrand: boolean;
  contextLabel: string;
  authorName: string;
  imageUrl: string;

  // Action hook states
  duplicatePost: any;
  schedule: any;
  publish: any;
  scheduleLabel: string;

  // Media states
  media: PostMediaItem[];
  setMedia: (media: PostMediaItem[]) => void;
  mediaDirty: boolean;
  setMediaDirty: (dirty: boolean) => void;
  selectedMedia: number;
  setSelectedMedia: (index: number) => void;
  maxMedia: number;
  mediaCapabilities: any;
  contentCapabilities: any;
  providerNames: any;

  // Content type selection state
  contentTypes: Partial<Record<Platform, any>>;
  setContentTypes: React.Dispatch<React.SetStateAction<Partial<Record<Platform, any>>>>;

  // AI & Brand voice states
  audience: AudienceRegister;
  setAudience: (aud: AudienceRegister) => void;
  styleOverride: BrandStyle | null;
  setStyleOverride: (style: BrandStyle | null) => void;
  generating: boolean;
  hasGenerated: boolean;
  blockedReason: string | null;
  aiResult: CaptionResult | null;
  ai: any;
  studio: any;
  hashtags: any;
  generateStrategy: any;

  // Publisher and statuses
  publishingProvider: Platform | null;
  setPublishingProvider: (provider: Platform | null) => void;
  published: { id: string; platforms: PostPlatformState[] } | null;
  setPublished: (pub: { id: string; platforms: PostPlatformState[] } | null) => void;
  lastSavedAt: Date | null;
  setLastSavedAt: (date: Date | null) => void;
  isSaved: boolean;
  setIsSaved: (val: boolean) => void;
  publishState: any;
  publishableProviders: Set<Platform>;
  publishableNames: string;
  bestTime: any;
  reachSuggestedTime: any;

  // Tab switching
  activeSidebarTab: "preview" | "analysis";
  setActiveSidebarTab: (tab: "preview" | "analysis") => void;
  activeMobileTab: "edit" | "preview";
  setActiveMobileTab: (tab: "edit" | "preview") => void;

  // Toggles for ambient panels
  isAiExpanded: boolean;
  setIsAiExpanded: (val: boolean) => void;
  isHashtagsExpanded: boolean;
  setIsHashtagsExpanded: (val: boolean) => void;

  // Shared Actions
  persist: (values: PostFormValues, status: PostStatus, generation?: CaptionResult | null) => Promise<Post>;
  submitWithStatus: (status: PostStatus) => (e?: React.BaseSyntheticEvent) => Promise<void>;
  handleSchedule: (e?: React.BaseSyntheticEvent) => Promise<void>;
  handlePublish: (e?: React.BaseSyntheticEvent) => Promise<void>;
  handleDiscard: () => void;
  runHashtags: () => void;
  handleAppendHashtags: (tags: string[]) => void;
  applyRecommendedTime: (localDateTime: string, timezone: string) => void;
  retryProvider: (provider: Platform) => Promise<void>;
  handleDuplicateClick: () => Promise<void>;
  runStrategy: () => Promise<void>;
  runCaptionOnly: () => Promise<void>;
  handleGenerate: () => void;
}

export const ComposerStateContext = createContext<ComposerState | null>(null);

export function useComposerState() {
  const ctx = useContext(ComposerStateContext);
  if (!ctx) {
    throw new Error("useComposerState must be used within a ComposerStateProvider");
  }
  return ctx;
}
